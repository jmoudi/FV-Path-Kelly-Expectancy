import { shiftByPx, stackBases, stepVertices, type PositionAxis } from "../bars";
import type { RenderProbe } from "../probe";
import type { ResolvedChart } from "../resolve";
import { fieldLabel, type BackendId, type ChartSpec, type MarkType, type NumberFormat, type Row, type SeriesSpec } from "../spec";

export interface RenderHandle {
  update(spec: ChartSpec): void;
  resize(): void;
  dispose(): void;
  /** What the library actually drew, read back from its own model or DOM (for the parity harness). */
  probe?(): Promise<RenderProbe>;
}

export interface Backend {
  id: BackendId;
  label: string;
  mount(el: HTMLElement, spec: ChartSpec): RenderHandle;
}

/** Opacity of a band's fill. */
export const BAND_ALPHA = 0.14;

/** d3-format strings used by Plotly and Vega-Lite tick formatting. */
export function d3Format(fmt?: NumberFormat): string | undefined {
  switch (fmt) {
    case "pct":
      return ".0%";
    case "pct1":
      return ".1%";
    case "pct2":
      return ".2%";
    case "pct3":
      return ".3%";
    case "x":
    case "x2":
      return ".2f";
    case "int":
      return ",d";
    case "sci":
      return ".1e";
    default:
      return undefined;
  }
}

export function numberOrNull(v: Row[string]): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Unique x values in first-seen order (for categorical axes). */
export function categories(rows: Row[], field: string): (string | number)[] {
  const seen = new Set<string | number>();
  const out: (string | number)[] = [];
  for (const r of rows) {
    const v = r[field];
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function legendSeries(spec: ChartSpec) {
  return spec.series.filter((s) => s.legend !== false);
}

export { showLegend } from "../resolve";

export function markOf(spec: ChartSpec, s: SeriesSpec): MarkType {
  return s.mark ?? spec.mark;
}

export function seriesName(spec: ChartSpec, s: SeriesSpec): string {
  return s.label ?? fieldLabel(spec.data, s.field);
}

type Pos = number | string;
/** A point in screen terms: [horizontal-axis value, vertical-axis value]; null breaks a line. */
export type ScreenPoint = [Pos | null, Pos | null];

function posAxisOf(rc: ResolvedChart): PositionAxis {
  const x = rc.axes.x;
  return { min: x.min, max: x.max, scale: x.scale, categorical: x.categorical };
}

/** The points of a line, step, area or scatter series, in screen terms. Every backend draws exactly these. */
export function linePoints(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): ScreenPoint[] {
  const xField = s.xField ?? spec.x.field;
  const pos = rc.axes.x;
  const logValue = rc.axes.y.scale === "log";
  const valueOf = (v: Row[string]) => {
    const n = numberOrNull(v);
    return n != null && (!logValue || n > 0) ? n : null;
  };
  let pts: [Pos, number | null][];
  if (pos.categorical) {
    const byCat = new Map<string, number | null>();
    for (const r of spec.data.rows) if (r[xField] != null) byCat.set(String(r[xField]), valueOf(r[s.field]));
    pts = pos.categories.map((c) => [c, byCat.get(String(c)) ?? null]);
  } else {
    const raw: [number, number | null][] = [];
    for (const r of spec.data.rows) {
      const x = numberOrNull(r[xField]);
      if (x == null || (pos.scale === "log" && x <= 0)) continue;
      raw.push([x, valueOf(r[s.field])]);
    }
    pts = markOf(spec, s) === "step" && spec.step === "middle" ? stepVertices(raw, "middle") : raw;
  }
  return pts.map(([p, v]) => (rc.horizontal ? [v, p] : [p, v]));
}

export interface BarPoint {
  /** The position as given (a number, or a category). */
  pos: Pos;
  /** The position moved by the series' group offset (numeric axes). */
  shifted: number;
  value: number;
  /** The bar's two ends along the value axis. */
  bottom: number;
  top: number;
}

/** The bars of a bar series, positioned by the resolved bar plan. Every backend draws exactly these. */
export function barPoints(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): BarPoint[] {
  const pos = rc.axes.x;
  const val = rc.axes.y;
  const plan = rc.bars;
  const posAxis = posAxisOf(rc);
  const axisPx = rc.horizontal ? rc.plot.height : rc.plot.width;
  const offset = plan?.offsetsPx[s.field] ?? 0;
  const baseline = val.scale === "log" ? val.min : Math.min(Math.max(0, val.min), val.max);
  const barSeries = spec.series.filter((x) => markOf(spec, x) === "bar");
  const idx = barSeries.findIndex((x) => x.field === s.field);
  const bases = plan?.mode === "stack" ? stackBases(barSeries.map((bs) => spec.data.rows.map((r) => numberOrNull(r[bs.field]))))[idx] : null;
  const xField = s.xField ?? spec.x.field;
  const out: BarPoint[] = [];
  spec.data.rows.forEach((r, i) => {
    const p = r[xField];
    const v = numberOrNull(r[s.field]);
    if (p == null || v == null) return;
    if (val.scale === "log" && v <= 0) return;
    if (!pos.categorical && (typeof p !== "number" || !Number.isFinite(p) || (pos.scale === "log" && p <= 0))) return;
    const base = bases ? (bases[i] ?? 0) : baseline;
    const top = bases ? base + v : v;
    out.push({ pos: p, shifted: typeof p === "number" ? shiftByPx(p, offset, posAxis, axisPx) : 0, value: v, bottom: base, top });
  });
  return out;
}

/**
 * The fill of a band series: one polygon per unbroken run of rows where both edges
 * are drawable, in screen terms (upper edge forward, lower edge back).
 */
export function bandPoints(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): [number, number][][] {
  if (!s.band || rc.axes.x.categorical) return [];
  const xField = s.xField ?? spec.x.field;
  const logPos = rc.axes.x.scale === "log";
  const logVal = rc.axes.y.scale === "log";
  const ok = (v: number | null) => v != null && (!logVal || v > 0);
  const runs: [number, number, number][][] = [];
  let run: [number, number, number][] = [];
  for (const r of spec.data.rows) {
    const x = numberOrNull(r[xField]);
    if (x == null || (logPos && x <= 0)) continue;
    const hi = numberOrNull(r[s.field]);
    const lo = numberOrNull(r[s.band]);
    if (ok(hi) && ok(lo)) run.push([x, hi as number, lo as number]);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const step = markOf(spec, s) === "step" ? (spec.step ?? "after") : null;
  return runs
    .filter((rn) => rn.length >= 1)
    .map((rn) => {
      const upper: [number, number | null][] = rn.map(([x, hi]) => [x, hi]);
      const lower: [number, number | null][] = rn.map(([x, , lo]) => [x, lo]);
      const up = step ? stepVertices(upper, step) : upper;
      const dn = step ? stepVertices(lower, step) : lower;
      const poly = [...up, ...dn.reverse()].filter((p): p is [number, number] => p[1] != null);
      return poly.map(([p, v]) => (rc.horizontal ? [v, p] : [p, v]) as [number, number]);
    })
    .filter((poly) => poly.length >= 3);
}
