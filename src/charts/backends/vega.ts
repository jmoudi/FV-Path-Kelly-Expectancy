import embed, { type Result } from "vega-embed";
import { BarAccumulator, exposeProbe, inRange, type AxisProbe, type RenderProbe, type SeriesProbe } from "../../kit/charts/probe";
import { formatNumber } from "../format";
import { resolveChart, type ResolvedAxis } from "../resolve";
import { fieldFormat, type ChartSpec } from "../spec";
import { markOf, type Backend, type RenderHandle } from "./types";
import { buildVegaSpec } from "./vegaSpec";

interface VItem {
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  datum?: Record<string, unknown>;
  items?: VMark[];
}
interface VMark {
  marktype: string;
  items: VItem[];
}
interface VScale {
  type: string;
  domain(): unknown[];
  range(): unknown[];
}
interface VView {
  width(): number;
  height(): number;
  scale(name: string): VScale | undefined;
  scenegraph(): { root: VMark };
}

/** Every mark in the scenegraph with its items, depth first. */
function marks(root: VMark): VMark[] {
  const out: VMark[] = [];
  const visit = (m: VMark) => {
    out.push(m);
    if (m.marktype === "group") for (const it of m.items ?? []) for (const child of it.items ?? []) visit(child);
  };
  visit(root);
  return out;
}

function axisProbe(scale: VScale | undefined, label: (c: unknown) => string): AxisProbe | undefined {
  if (!scale) return undefined;
  if (scale.type === "band" || scale.type === "point" || scale.type === "ordinal") {
    // Show categories by their labels, as the other backends do, in screen order.
    const labels = scale.domain().map(label);
    const [r0, r1] = scale.range() as number[];
    return { kind: "category", categories: r0 > r1 ? labels.reverse() : labels };
  }
  const [min, max] = scale.domain() as number[];
  return { kind: scale.type === "log" ? "log" : "linear", min, max };
}

function probeView(view: VView, spec: ChartSpec, containerWidth: number): RenderProbe {
  const all = marks(view.scenegraph().root);
  if (spec.kind === "heatmap") {
    let cells = 0;
    const field = spec.heat?.valueField ?? "";
    for (const m of all) if (m.marktype === "rect") for (const it of m.items) if (it.datum?.__cell && Number.isFinite(it.datum[field] as number)) cells++;
    const heat = spec.heat;
    const fmtOf = (f: string | undefined) => (c: unknown) => (typeof c === "number" ? formatNumber(c, (f && fieldFormat(spec.data, f)) || "auto") : String(c));
    return { backend: "vega", kind: "heatmap", horizontal: false, height: spec.height, h: axisProbe(view.scale("x"), fmtOf(heat?.xField)), v: axisProbe(view.scale("y"), fmtOf(heat?.yField)), series: [], lines: 0, areas: 0, dots: 0, labels: 0, cells };
  }
  const rc = resolveChart(spec, containerWidth);
  const W = view.width();
  const H = view.height();
  const catLabel = (ax: ResolvedAxis) => (c: unknown) => {
    const i = ax.categories.findIndex((k) => String(k) === String(c));
    return i >= 0 ? ax.labels[i] : String(c);
  };
  const h = axisProbe(view.scale("x"), catLabel(rc.h));
  const v = axisProbe(view.scale("y"), catLabel(rc.v));
  const posAxis = rc.horizontal ? v : h;
  const posOk = (p: unknown) => posAxis?.kind === "category" || inRange(p, posAxis?.min ?? -Infinity, posAxis?.max ?? Infinity);
  // One series may draw several marks (an area and its outline); count the primary one.
  const primary: Record<string, string> = { bar: "rect", line: "line", step: "line", area: "area", scatter: "symbol", band: "area" };
  const kindOf = (key: string) => (key.endsWith("~band") ? "band" : markOf(spec, spec.series.find((x) => x.field === key) ?? spec.series[0]));
  // Items per series key, and per mark node: a fill drawn as one path is one piece.
  const byKey = new Map<string, { marktype: string; items: VItem[]; pieces: VItem[][] }>();
  const ann = { line: 0, area: 0, dot: 0, label: 0 };
  for (const m of all) {
    if (m.marktype === "group") continue;
    const pieces = new Map<string, VItem[]>();
    for (const it of m.items ?? []) {
      const d = it.datum;
      if (!d) continue;
      if (typeof d.__ann === "string") ann[d.__ann as keyof typeof ann]++;
      else if (typeof d.__key === "string" && primary[kindOf(d.__key)] === m.marktype) {
        const e = byKey.get(d.__key) ?? { marktype: m.marktype, items: [], pieces: [] };
        e.items.push(it);
        byKey.set(d.__key, e);
        const piece = pieces.get(d.__key) ?? [];
        piece.push(it);
        pieces.set(d.__key, piece);
      }
    }
    for (const [k, piece] of pieces) byKey.get(k)!.pieces.push(piece);
  }
  /** Summed bounding-box area of the fill pieces, as a share of the plot. */
  const fillShare = (pieces: VItem[][]) => {
    let sum = 0;
    for (const piece of pieces) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const it of piece) {
        for (const x of [it.x, it.x2]) if (Number.isFinite(x)) (x0 = Math.min(x0, x!)), (x1 = Math.max(x1, x!));
        for (const y of [it.y, it.y2]) if (Number.isFinite(y)) (y0 = Math.min(y0, y!)), (y1 = Math.max(y1, y!));
      }
      if (Number.isFinite(x0)) sum += Math.max(0, Math.min(x1, W) - Math.max(x0, 0)) * Math.max(0, Math.min(y1, H) - Math.max(y0, 0));
    }
    return sum / (W * H);
  };
  const keys = [...spec.series.filter((s) => s.band).map((s) => `${s.field}~band`), ...spec.series.map((s) => s.field)];
  const series: SeriesProbe[] = [];
  for (const key of keys) {
    const e = byKey.get(key);
    if (key.endsWith("~band")) {
      if (!e) continue;
      const share = fillShare(e.pieces);
      series.push({ key, kind: "band", count: share > 0 ? 1 : 0, extent: share });
      continue;
    }
    const s = spec.series.find((x) => x.field === key)!;
    const mark = markOf(spec, s);
    const items = e?.items ?? [];
    if (mark === "bar") {
      const acc = new BarAccumulator(rc.horizontal ? W : H, rc.horizontal ? H : W);
      let count = 0;
      for (const it of items) {
        const d = it.datum!;
        if (Number.isFinite(d.value as number) && d.value !== 0 && posOk(d.pos)) count++;
        if (rc.horizontal) acc.add(it.width ?? 0, H - ((it.y ?? 0) + (it.height ?? 0) / 2), it.height);
        else acc.add(it.height ?? 0, (it.x ?? 0) + (it.width ?? 0) / 2, it.width);
      }
      series.push({ key, kind: "bar", count, extent: acc.extent(), center: acc.center(), thickness: acc.thickness() });
      continue;
    }
    let count = 0;
    for (const it of items) {
      const d = it.datum!;
      const val = rc.horizontal ? d.h : d.v;
      const pos = rc.horizontal ? d.v : d.h;
      if (typeof val === "number" && Number.isFinite(val) && posOk(pos)) count++;
    }
    if (mark === "area") series.push({ key, kind: "area", count, extent: fillShare(e?.pieces ?? []) });
    else series.push({ key, kind: mark === "scatter" ? "point" : "line", count });
  }
  return { backend: "vega", kind: "xy", horizontal: rc.horizontal, height: spec.height, h, v, series, lines: ann.line, areas: ann.area, dots: ann.dot, labels: ann.label };
}

export const backend: Backend = {
  id: "vega",
  label: "Vega-Lite",
  mount(el, spec): RenderHandle {
    let result: Result | null = null;
    let disposed = false;
    let current = spec;
    let ready: Promise<unknown> = Promise.resolve();
    let builtWidth = 0;
    const run = (s: ChartSpec) => {
      if (disposed) return;
      current = s;
      result?.finalize();
      result = null;
      builtWidth = el.clientWidth || 700;
      const { vl } = buildVegaSpec(s, builtWidth);
      ready = embed(el, vl as never, { actions: false, renderer: "svg", tooltip: { theme: "dark" } }).then((r) => {
        if (disposed) r.finalize();
        else result = r;
      });
    };
    run(spec);
    const handle: RenderHandle = {
      update(next) {
        run(next);
      },
      resize() {
        // Bar offsets and label placements depend on the width, so rebuild when it changes.
        if (Math.abs((el.clientWidth || 700) - builtWidth) > 1) run(current);
      },
      dispose() {
        disposed = true;
        result?.finalize();
        result = null;
      },
      async probe() {
        let seen: Promise<unknown>;
        do {
          seen = ready;
          await seen;
        } while (seen !== ready);
        if (!result) throw new Error("Vega-Lite has not rendered");
        await result.view.runAsync();
        return probeView(result.view as unknown as VView, current, builtWidth);
      },
    };
    exposeProbe(el, () => handle.probe!());
    return handle;
  },
};
