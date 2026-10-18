/**
 * Resolve an xy spec once, before any backend sees it: concrete domains, tick
 * positions and tick labels, which axis is drawn where (bars can run horizontally),
 * where every annotation label goes so that no two collide, and how bars are laid
 * out. Every backend then draws the same ranges, the same reference-line positions,
 * the same label placements and the same bars.
 */
import { planBars, toPx, type BarPlan, type PositionAxis } from "./bars";
import { estimateTextWidth, placeLabels, type Box, type Candidate } from "./collide";
import { tickFormatter } from "./format";
import { fieldFormat, fieldLabel, type Annotation, type Cell, type ChartSpec, type ColorRole, type NumberFormat, type Row, type ScaleType } from "./spec";

export interface ResolvedAxis {
  field: string;
  label: string;
  scale: ScaleType;
  categorical: boolean;
  min: number;
  max: number;
  ticks: number[];
  labels: string[];
  /** On a categorical axis: the categories in first-seen order (labels holds their text). */
  categories: (string | number)[];
  format: NumberFormat | undefined;
  formatter: (v: number) => string;
  grid: boolean;
}

export interface ResolvedAxes {
  x: ResolvedAxis;
  y: ResolvedAxis;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** d3-style nice step for about `count` ticks. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  const m = r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1;
  return m * p;
}

export function linearTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

export function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(min) + 1e-9);
  const hi = Math.ceil(Math.log10(max) - 1e-9);
  const decades = hi - lo;
  const out: number[] = [];
  for (let e = lo; e <= hi; e++) {
    const base = Math.pow(10, e);
    out.push(base);
    if (decades <= 2 && e < hi) out.push(2 * base, 5 * base);
  }
  return out.filter((v) => v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9));
}

/** Unique values of a column in first-seen order. */
export function uniqueValues(rows: Row[], field: string): (string | number)[] {
  const seen = new Set<Cell>();
  const out: (string | number)[] = [];
  for (const r of rows) {
    const v = r[field];
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function isHorizontal(spec: ChartSpec): boolean {
  return spec.kind === "xy" && spec.orientation === "horizontal";
}

/** Ticks for an axis drawn up the side: about one per 40 px, three to six. */
function verticalTickCount(heightPx: number): number {
  return Math.max(3, Math.min(6, Math.round(heightPx / 40)));
}

function dataExtent(spec: ChartSpec, which: "x" | "y", log: boolean): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const consider = (v: unknown) => {
    if (!isNum(v)) return;
    if (log && v <= 0) return;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  };
  if (which === "x") {
    const fields = new Set(spec.series.map((s) => s.xField ?? spec.x.field));
    if (!fields.size) fields.add(spec.x.field);
    for (const r of spec.data.rows) for (const fld of fields) consider(r[fld]);
    for (const a of spec.annotations ?? []) {
      if (a.kind === "vline" || a.kind === "point" || a.kind === "label" || a.kind === "xband") {
        consider(a.x);
        consider(a.x2);
      }
    }
  } else {
    for (const r of spec.data.rows) for (const s of spec.series) consider(r[s.field]);
    for (const a of spec.annotations ?? []) {
      if (a.kind === "hline" || a.kind === "point" || a.kind === "label" || a.kind === "yband") {
        consider(a.y);
        consider(a.y2);
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [lo, hi];
}

function resolveOne(spec: ChartSpec, which: "x" | "y", tickCount: number): ResolvedAxis {
  const ax = spec[which];
  const scale: ScaleType = ax.scale === "log" ? "log" : "linear";
  const format = ax.format ?? fieldFormat(spec.data, ax.field);
  const formatter = tickFormatter(format);
  const categorical = which === "x" && !!ax.categorical;
  const label = ax.label ?? fieldLabel(spec.data, ax.field);
  if (categorical) {
    const categories = uniqueValues(spec.data.rows, ax.field);
    return { field: ax.field, label, scale: "linear", categorical: true, min: 0, max: Math.max(1, categories.length), ticks: [], labels: categories.map((c) => (typeof c === "number" ? formatter(c) : c)), categories, format, formatter, grid: ax.grid !== false };
  }
  const ext = dataExtent(spec, which, scale === "log") ?? (scale === "log" ? [0.01, 1] : [0, 1]);
  let [lo, hi] = ext;
  const d0 = ax.domain?.[0];
  const d1 = ax.domain?.[1];
  let min: number;
  let max: number;
  if (scale === "log") {
    if (lo <= 0) lo = 1e-6;
    if (hi <= lo) hi = lo * 10;
    min = d0 != null && d0 > 0 ? d0 : Math.pow(10, Math.floor(Math.log10(lo) + 1e-9));
    max = d1 != null && d1 > 0 ? d1 : Math.pow(10, Math.ceil(Math.log10(hi) - 1e-9));
    if (max <= min) max = min * 10;
  } else {
    if (hi <= lo) {
      hi = lo + (Math.abs(lo) || 1);
    }
    const zeroBase = which === "y" && ax.zero !== false && lo >= 0;
    if (zeroBase) lo = 0;
    const step = niceStep(hi - lo, tickCount);
    min = d0 != null ? d0 : Math.floor(lo / step + 1e-9) * step;
    max = d1 != null ? d1 : Math.ceil(hi / step - 1e-9) * step;
    if (max <= min) max = min + step;
    // Keep headroom above the data on a value axis, so the top labels do not collide with the frame.
    if (which === "y" && d1 == null && hi > min && max - hi < step * 0.15) max += step;
  }
  const ticks = scale === "log" ? logTicks(min, max) : linearTicks(min, max, tickCount);
  const labels = ticks.map(formatter);
  return { field: ax.field, label, scale, categorical: false, min, max, ticks, labels, categories: [], format, formatter, grid: ax.grid !== false };
}

/** The spec's axes in its own terms: x is the position (or category) axis, y the value axis. */
export function resolveAxes(spec: ChartSpec): ResolvedAxes {
  const horizontal = isHorizontal(spec);
  const side = verticalTickCount(spec.height ?? 300);
  return { x: resolveOne(spec, "x", horizontal ? side : 7), y: resolveOne(spec, "y", horizontal ? 7 : side) };
}

// ---------------------------------------------------------------------------
// The resolved chart: screen axes, annotation label placement, bar layout.
// ---------------------------------------------------------------------------

/** Horizontal px the axes take beside the plot: one estimate shared by every backend. */
export const AXIS_INSET_PX = 88;
/** Height of an annotation label box, and the step between two stacked labels. */
export const LABEL_HEIGHT_PX = 16;
export const LABEL_ROW_PX = LABEL_HEIGHT_PX + 2;
/** Annotation label font size in px. */
export const LABEL_FONT_PX = 10.5;
/** Two vertical-line labels closer than this are always put at opposite ends. */
export const MIN_LABEL_SEPARATION_PX = 14;

export interface PlotBox {
  width: number;
  height: number;
}

/** The plot box a container of this width gives the spec, as every backend estimates it. */
export function plotBox(spec: ChartSpec, containerWidth: number): PlotBox {
  return { width: Math.max(120, Math.round(containerWidth - AXIS_INSET_PX)), height: Math.max(60, spec.height ?? 300) };
}

/**
 * Where a label sits: an anchor on the plot (the top or bottom end of a vertical
 * line, the left or right end of a horizontal one, or the annotated point), a px
 * offset from it (+y is down), and the text's alignment at that spot.
 */
export interface LabelPlacement {
  anchor: "top" | "bottom" | "left" | "right" | "point";
  dx: number;
  dy: number;
  align: "left" | "right" | "center";
  baseline: "top" | "bottom" | "middle";
  /** The label's box in plot px (origin top left). */
  box: Box;
}

/** An annotation in screen terms: x is on the horizontal axis, y on the vertical one. */
export interface ScreenAnnotation {
  kind: Annotation["kind"];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: ColorRole;
  dash?: boolean;
  label?: LabelPlacement;
}

export interface ResolvedChart {
  /** In the spec's terms (x = position axis, y = value axis). */
  axes: ResolvedAxes;
  horizontal: boolean;
  /** The axis drawn along the bottom and the one drawn up the left side. */
  h: ResolvedAxis;
  v: ResolvedAxis;
  plot: PlotBox;
  /** Annotations inside the axis ranges, in screen terms, labels placed. */
  annotations: ScreenAnnotation[];
  bars: BarPlan | null;
  /** The legend above the plot, or null when there is none. */
  legend: LegendLayout | null;
  /**
   * Legend rows kept free above the plot: the chart's own, or more when the chart beside
   * it (spec.legendPeer) wraps its legend into more rows. 0 when neither has a legend.
   */
  legendRows: { flow: number; grid: number };
}

/** Height of one legend row, and the legend's font size, in px. */
export const LEGEND_ROW_PX = 20;
export const LEGEND_FONT_PX = 11;

/**
 * Libraries wrap legends in two ways: entries flowing left to right (ECharts), or a
 * grid of equal columns as wide as the widest entry (Plotly, and Vega-Lite when told
 * the column count). Both are planned here so each backend reserves the rows it uses.
 */
export interface LegendLayout {
  /** Rows when entries flow left to right. */
  flowRows: number;
  /** Columns of the equal-width grid that fits, and its rows. */
  columns: number;
  gridRows: number;
}

/** Whether a spec shows a legend: two or more named series, unless switched off. */
export function showLegend(spec: ChartSpec): boolean {
  if (spec.legend === false) return false;
  return spec.series.filter((s) => s.legend !== false).length >= 2;
}

/** The legend's entries, in order: every named series that is not kept out of it. */
export function legendNames(spec: ChartSpec): string[] {
  return spec.series.filter((s) => s.legend !== false).map((s) => s.label ?? fieldLabel(spec.data, s.field));
}

/**
 * How legend entries wrap above a plot of this width, so the plot moves down by the
 * legend's height instead of the legend printing over the data on a narrow screen.
 */
export function legendLayout(names: string[], widthPx: number): LegendLayout {
  if (!names.length) return { flowRows: 0, columns: 0, gridRows: 0 };
  const widths = names.map((n) => 18 + 6 + estimateTextWidth(n, LEGEND_FONT_PX) + 14);
  let flowRows = 1;
  let x = 0;
  for (const w of widths) {
    if (x > 0 && x + w > widthPx) {
      flowRows++;
      x = 0;
    }
    x += w;
  }
  const total = widths.reduce((s, w) => s + w, 0);
  // One row when everything fits; otherwise equal columns as wide as the widest entry.
  const columns = total <= widthPx ? names.length : Math.max(1, Math.min(names.length, Math.floor(widthPx / Math.max(...widths))));
  return { flowRows, columns, gridRows: Math.ceil(names.length / columns) };
}

/** An annotation with its coordinates moved to screen terms. */
function toScreen(a: Annotation, horizontal: boolean): Annotation {
  if (!horizontal) return a;
  const swap: Record<Annotation["kind"], Annotation["kind"]> = { vline: "hline", hline: "vline", point: "point", label: "label", xband: "yband", yband: "xband" };
  return { ...a, kind: swap[a.kind], x: a.y, y: a.x, x2: a.y2, y2: a.x2 };
}

function sameCell(a: unknown, b: unknown): boolean {
  return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b;
}

/** px from the start of a screen axis (left edge, or top edge for the vertical one). */
export function screenPx(v: number | undefined, ax: ResolvedAxis, len: number, vertical: boolean): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (ax.categorical) {
    let i = ax.categories.findIndex((c) => sameCell(c, v));
    if (i < 0 && Number.isInteger(v) && v >= 0 && v < ax.categories.length) i = v;
    if (i < 0) return null;
    // Categories run left to right, and top to bottom when drawn up the side.
    return ((i + 0.5) / ax.categories.length) * len;
  }
  if (ax.scale === "log" && v <= 0) return null;
  const slack = 1e-9 * Math.abs(ax.max - ax.min);
  if (v < ax.min - slack || v > ax.max + slack) return null;
  const px = toPx(v, ax, len);
  return vertical ? len - px : px;
}

function labelCandidates(a: ScreenAnnotation, at: Annotation["at"], X: number | null, Y: number | null, plot: PlotBox): Candidate<LabelPlacement>[] {
  const text = a.text ?? "";
  const w = estimateTextWidth(text, LABEL_FONT_PX) + 8;
  const H = LABEL_HEIGHT_PX;
  const { width: W, height: PH } = plot;
  const make = (anchor: LabelPlacement["anchor"], dx: number, dy: number, align: LabelPlacement["align"], baseline: LabelPlacement["baseline"], ax: number, ay: number): Candidate<LabelPlacement> => {
    const x0 = align === "left" ? ax + dx : align === "right" ? ax + dx - w : ax + dx - w / 2;
    const y0 = baseline === "top" ? ay + dy : baseline === "middle" ? ay + dy - H / 2 : ay + dy - H;
    const box = { x0, y0, x1: x0 + w, y1: y0 + H };
    return { box, value: { anchor, dx, dy, align, baseline, box } };
  };
  const out: Candidate<LabelPlacement>[] = [];
  if (a.kind === "vline" && X != null) {
    const ends: ("top" | "bottom")[] = at === "start" ? ["bottom", "top"] : ["top", "bottom"];
    const sides: ("right" | "left")[] = X + 4 + w > W ? ["left", "right"] : ["right", "left"];
    const order: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 0, 2],
      [0, 1, 2],
    ];
    for (const [si, ei, row] of order) {
      const side = sides[si];
      const end = ends[ei];
      const dx = side === "right" ? 4 : -4;
      const dy = end === "top" ? 4 + row * LABEL_ROW_PX : -(4 + row * LABEL_ROW_PX);
      out.push(make(end, dx, dy, side === "right" ? "left" : "right", end === "top" ? "top" : "bottom", X, end === "top" ? 0 : PH));
    }
  } else if (a.kind === "hline" && Y != null) {
    const ends: ("left" | "right")[] = at === "start" ? ["left", "right"] : ["right", "left"];
    const order: [number, boolean, number][] = [
      [0, true, 0],
      [0, false, 0],
      [0, true, 1],
      [0, false, 1],
      [0, true, 2],
      [0, false, 2],
      [1, true, 0],
      [1, false, 0],
    ];
    for (const [ei, above, k] of order) {
      const end = ends[ei];
      const dx = end === "left" ? 4 : -4;
      const dy = above ? -(3 + k * LABEL_ROW_PX) : 3 + k * LABEL_ROW_PX;
      out.push(make(end, dx, dy, end === "left" ? "left" : "right", above ? "bottom" : "top", end === "left" ? 0 : W, Y));
    }
  } else if ((a.kind === "point" || a.kind === "label") && X != null && Y != null) {
    // Centred over the point is the last resort for a side label too long for either side.
    const pref: ("right" | "left" | "center")[] = at === "end" ? ["right", "left", "center"] : at === "start" ? ["left", "right", "center"] : ["center", "right", "left"];
    const off = a.kind === "point" ? 8 : 4;
    // A text-only label (a bar-end value, say) first tries the spot level with its anchor.
    if (a.kind === "label")
      for (const side of pref.filter((p) => p !== "center")) {
        const dx = side === "right" ? off : -off;
        out.push(make("point", dx, 0, side === "right" ? "left" : "right", "middle", X, Y));
      }
    const order: [number, boolean, number][] = [];
    for (const k of [0, 1, 2]) for (let s = 0; s < pref.length; s++) for (const above of [true, false]) if (k === 0 || s === 0) order.push([s, above, k]);
    for (const [si, above, k] of order) {
      const side = pref[si];
      const dx = side === "right" ? off : side === "left" ? -off : 0;
      const dy = above ? -(off - 1 + k * LABEL_ROW_PX) : off - 1 + k * LABEL_ROW_PX;
      out.push(make("point", dx, dy, side === "right" ? "left" : side === "left" ? "right" : "center", above ? "bottom" : "top", X, Y));
    }
  }
  // Last resort on a narrow plot: the same spots slid sideways until the box sits inside
  // [0, plot width], so a long label stays over the plot instead of printing over the
  // axis labels beside it. A label estimated wider than the plot starts at its left edge
  // (the estimate errs wide). Only tried after every unshifted spot collides or leaves the plot.
  const clamped: Candidate<LabelPlacement>[] = [];
  for (const c of out) {
    const { x0, x1 } = c.box;
    const shift = x1 - x0 > W || x0 < 0 ? -x0 : x1 > W ? W - x1 : 0;
    if (shift === 0) continue;
    const box = { ...c.box, x0: x0 + shift, x1: x1 + shift };
    clamped.push({ box, value: { ...c.value, dx: c.value.dx + shift, box } });
  }
  return [...out, ...clamped];
}

/**
 * Resolve everything a backend needs to draw an xy spec in a container of the
 * given width. Labels are placed on an estimate of the plot box that every backend
 * shares, so they all make the same choices.
 */
export function resolveChart(spec: ChartSpec, containerWidth = 720): ResolvedChart {
  const axes = resolveAxes(spec);
  const horizontal = isHorizontal(spec);
  const plot = plotBox(spec, containerWidth);

  // Bars first: a bar at either end of a numeric position axis widens the axis by
  // the px it would otherwise lose, so every backend shows it whole.
  const barSeries = spec.series.filter((s) => (s.mark ?? spec.mark) === "bar");
  let bars: BarPlan | null = null;
  if (barSeries.length) {
    const lenPx = horizontal ? plot.height : plot.width;
    const posAxis: PositionAxis = { min: axes.x.min, max: axes.x.max, scale: axes.x.scale, categorical: axes.x.categorical };
    const positions = (field: string, xField: string) =>
      spec.data.rows
        .filter((r) => {
          const y = r[field];
          const x = r[xField];
          return isNum(y) && y !== 0 && x != null && (axes.x.categorical || (isNum(x) && (axes.x.scale !== "log" || x > 0)));
        })
        .map((r) => r[xField] as number | string);
    const input = barSeries.map((s) => ({ key: s.field, positions: positions(s.field, s.xField ?? spec.x.field) }));
    bars = planBars(input, { axis: posAxis, axisPx: lenPx, stack: spec.stack, thicknessPx: spec.barWidthPx });
    if (!axes.x.categorical && bars.thicknessPx) {
      const half = bars.thicknessPx / 2;
      let padLo = 0;
      let padHi = 0;
      for (const s of input)
        for (const p of s.positions) {
          if (typeof p !== "number" || p < axes.x.min || p > axes.x.max) continue;
          const c = toPx(p, posAxis, lenPx) + (bars.offsetsPx[s.key] ?? 0);
          padLo = Math.max(padLo, half - c);
          padHi = Math.max(padHi, c + half - lenPx);
        }
      if ((padLo > 0.5 || padHi > 0.5) && padLo + padHi < lenPx / 2) {
        const t = (v: number) => (axes.x.scale === "log" ? Math.log10(v) : v);
        const u = (v: number) => (axes.x.scale === "log" ? Math.pow(10, v) : v);
        const span = t(axes.x.max) - t(axes.x.min);
        const per = span / (lenPx - padLo - padHi);
        axes.x = { ...axes.x, min: u(t(axes.x.min) - padLo * per), max: u(t(axes.x.max) + padHi * per) };
      }
    }
  }
  const h = horizontal ? axes.y : axes.x;
  const v = horizontal ? axes.x : axes.y;

  // Annotations in screen terms, dropped when they sit outside the axis ranges.
  const kept: { a: ScreenAnnotation; at: Annotation["at"]; X: number | null; Y: number | null }[] = [];
  for (const raw of spec.annotations ?? []) {
    const s = toScreen(raw, horizontal);
    const a: ScreenAnnotation = { kind: s.kind, x: s.x, y: s.y, x2: s.x2, y2: s.y2, text: s.text, color: s.color, dash: s.dash };
    const X = screenPx(a.x, h, plot.width, false);
    const Y = screenPx(a.y, v, plot.height, true);
    if (a.kind === "vline" && X == null) continue;
    if (a.kind === "hline" && Y == null) continue;
    if ((a.kind === "point" || a.kind === "label") && (X == null || Y == null)) continue;
    if (a.kind === "xband" && (a.x == null || a.x2 == null || (h.scale === "log" && (a.x <= 0 || a.x2 <= 0)))) continue;
    if (a.kind === "yband" && (a.y == null || a.y2 == null || (v.scale === "log" && (a.y <= 0 || a.y2 <= 0)))) continue;
    kept.push({ a, at: s.at, X, Y });
  }
  // Band titles are fixed obstacles at the top centre of their band.
  const fixed: Box[] = [];
  for (const k of kept) {
    if (k.a.kind !== "xband" || !k.a.text) continue;
    const x0 = screenPx(Math.max(Math.min(k.a.x!, k.a.x2!), h.min), h, plot.width, false) ?? 0;
    const x1 = screenPx(Math.min(Math.max(k.a.x!, k.a.x2!), h.max), h, plot.width, false) ?? plot.width;
    const mid = (x0 + x1) / 2;
    const w = estimateTextWidth(k.a.text, LABEL_FONT_PX) + 8;
    const box = { x0: mid - w / 2, y0: 4, x1: mid + w / 2, y1: 4 + LABEL_HEIGHT_PX };
    fixed.push(box);
    k.a.label = { anchor: "top", dx: 0, dy: 4, align: "center", baseline: "top", box };
  }
  const labelled = kept.filter((k) => k.a.text && k.a.kind !== "xband" && k.a.kind !== "yband");
  // Vertical lines closer than MIN_LABEL_SEPARATION_PX put their labels at opposite
  // ends, alternating along the axis; the placement below resolves the rest.
  const vlines = labelled.filter((k) => k.a.kind === "vline").sort((p, q) => (p.X ?? 0) - (q.X ?? 0));
  for (let i = 1; i < vlines.length; i++) {
    const prev = vlines[i - 1];
    if ((vlines[i].X ?? 0) - (prev.X ?? 0) < MIN_LABEL_SEPARATION_PX) vlines[i].at = prev.at === "start" ? "end" : "start";
  }
  const placed = placeLabels(
    labelled.map((k) => labelCandidates(k.a, k.at, k.X, k.Y, plot)),
    { x0: 0, y0: 0, x1: plot.width, y1: plot.height },
    fixed,
  );
  for (const p of placed) labelled[p.item].a.label = p.value;
  const legend = showLegend(spec) ? legendLayout(legendNames(spec), plot.width) : null;
  const peer = spec.legendPeer && spec.legendPeer.length >= 2 ? legendLayout(spec.legendPeer, plot.width) : null;
  const legendRows = { flow: Math.max(legend?.flowRows ?? 0, peer?.flowRows ?? 0), grid: Math.max(legend?.gridRows ?? 0, peer?.gridRows ?? 0) };
  return { axes, horizontal, h, v, plot, annotations: kept.map((k) => k.a), bars, legend, legendRows };
}
