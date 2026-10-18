import Plotly from "plotly.js-dist-min";
import { BarAccumulator, exposeProbe, inRange, type AxisProbe, type RenderProbe, type SeriesProbe } from "../../kit/charts/probe";
import type { ChartSpec } from "../spec";
import { buildFigure } from "./plotlyFigure";
import { markOf, type Backend, type RenderHandle } from "./types";

const CONFIG = { displayModeBar: false, responsive: false, staticPlot: false } as const;

interface PAxis {
  type: string;
  range: number[];
  _categories?: string[];
}
interface PGraph extends HTMLElement {
  _fullLayout: { _size: { l: number; t: number; w: number; h: number }; xaxis: PAxis; yaxis: PAxis; shapes: { type: string; xref?: string; yref?: string }[]; annotations: { visible?: boolean }[] };
  _fullData: { meta?: unknown; type: string; x?: unknown[]; y?: unknown[]; z?: unknown[][]; visible?: unknown }[];
  calcdata: { s?: number; p?: number }[][];
}

function axisProbe(ax: PAxis, vertical: boolean): AxisProbe {
  if (ax.type === "category") {
    const cats = [...(ax._categories ?? [])].map(String);
    // Screen order: up the side the first category is at the bottom unless the range is reversed.
    const reversed = ax.range[0] > ax.range[1];
    return { kind: "category", categories: vertical && !reversed ? cats.reverse() : cats };
  }
  const [a, b] = ax.range;
  return ax.type === "log" ? { kind: "log", min: Math.pow(10, a), max: Math.pow(10, b) } : { kind: "linear", min: a, max: b };
}

/** The trace key of a Plotly trace group in the DOM (Plotly binds its calcdata to the element). */
function keyOf(el: Element): string | undefined {
  const d = (el as unknown as { __data__?: { trace?: { meta?: unknown } }[] }).__data__;
  const meta = d?.[0]?.trace?.meta;
  return typeof meta === "string" ? meta : undefined;
}

function probeGraph(gd: PGraph, spec: ChartSpec): RenderProbe {
  const fl = gd._fullLayout;
  const size = fl._size;
  if (spec.kind === "heatmap") {
    const z = gd._fullData[0]?.z ?? [];
    let cells = 0;
    for (const row of z) for (const v of row ?? []) if (typeof v === "number" && Number.isFinite(v)) cells++;
    return { backend: "plotly", kind: "heatmap", horizontal: false, height: spec.height, h: axisProbe(fl.xaxis, false), v: axisProbe(fl.yaxis, true), series: [], lines: 0, areas: 0, dots: 0, labels: 0, cells };
  }
  const horizontal = spec.orientation === "horizontal";
  const h = axisProbe(fl.xaxis, false);
  const v = axisProbe(fl.yaxis, true);
  const posAxis = horizontal ? v : h;
  const posOk = (p: unknown) => posAxis.kind === "category" || inRange(p, posAxis.min!, posAxis.max!);
  const domTraces = new Map<string, Element>();
  for (const el of gd.querySelectorAll(".barlayer .trace, .scatterlayer .trace")) {
    const k = keyOf(el);
    if (k) domTraces.set(k, el);
  }
  const series: SeriesProbe[] = [];
  gd._fullData.forEach((t, i) => {
    const key = typeof t.meta === "string" ? t.meta : undefined;
    if (!key) return;
    const dom = domTraces.get(key);
    /** The fill's bounding box inside the plot, as a share of the plot. */
    const fillShare = () => {
      let sum = 0;
      for (const fill of dom?.querySelectorAll("path.js-fill") ?? []) {
        const b = (fill as SVGGraphicsElement).getBBox();
        sum += Math.max(0, Math.min(b.x + b.width, size.w) - Math.max(b.x, 0)) * Math.max(0, Math.min(b.y + b.height, size.h) - Math.max(b.y, 0));
      }
      return sum / (size.w * size.h);
    };
    if (key.endsWith("~band")) {
      const share = fillShare();
      series.push({ key, kind: "band", count: share > 0 ? 1 : 0, extent: share });
      return;
    }
    const s = spec.series.find((x) => x.field === key);
    const mark = s ? markOf(spec, s) : "line";
    if (t.type === "bar") {
      const cd = gd.calcdata[i] ?? [];
      let count = 0;
      for (const c of cd) if (typeof c.s === "number" && Number.isFinite(c.s) && c.s !== 0 && (posAxis.kind === "category" || posOk(c.p))) count++;
      const acc = new BarAccumulator(horizontal ? size.w : size.h, horizontal ? size.h : size.w);
      for (const p of dom?.querySelectorAll(".point path") ?? []) {
        const b = (p as SVGGraphicsElement).getBBox();
        if (horizontal) acc.add(b.width, size.h - (b.y + b.height / 2), b.height);
        else acc.add(b.height, b.x + b.width / 2, b.width);
      }
      series.push({ key, kind: "bar", count, extent: acc.extent(), center: acc.center(), thickness: acc.thickness() });
      return;
    }
    const xs = t.x ?? [];
    const ys = t.y ?? [];
    let count = 0;
    for (let j = 0; j < Math.max(xs.length, ys.length); j++) {
      const pos = horizontal ? ys[j] : xs[j];
      const val = horizontal ? xs[j] : ys[j];
      if (typeof val === "number" && Number.isFinite(val) && posOk(pos)) count++;
    }
    const drawn = !!dom && (mark === "scatter" ? dom.querySelectorAll(".points path").length > 0 : !!dom.querySelector("path.js-line")?.getAttribute("d"));
    if (mark === "area") series.push({ key, kind: "area", count: drawn ? count : 0, extent: fillShare() });
    else series.push({ key, kind: mark === "scatter" ? "point" : "line", count: drawn ? count : 0 });
  });
  const shapes = fl.shapes ?? [];
  return {
    backend: "plotly",
    kind: "xy",
    horizontal,
    height: spec.height,
    h,
    v,
    series,
    lines: shapes.filter((s) => s.type === "line").length,
    areas: shapes.filter((s) => s.type === "rect").length,
    dots: shapes.filter((s) => s.type === "circle").length,
    labels: (fl.annotations ?? []).filter((a) => a.visible !== false).length,
  };
}

export const backend: Backend = {
  id: "plotly",
  label: "Plotly",
  mount(el, spec): RenderHandle {
    let current = spec;
    let builtWidth = el.clientWidth || 700;
    const fig = buildFigure(spec, builtWidth);
    let ready: Promise<unknown> = Plotly.newPlot(el, fig.data, fig.layout, CONFIG);
    const handle: RenderHandle = {
      update(next) {
        current = next;
        builtWidth = el.clientWidth || 700;
        const b = buildFigure(next, builtWidth);
        ready = ready.then(() => Plotly.react(el, b.data, b.layout, CONFIG));
      },
      resize() {
        // Bar widths and label placements depend on the width, so redraw rather than stretch.
        const w = el.clientWidth || 700;
        if (Math.abs(w - builtWidth) <= 1) {
          ready = ready.then(() => Plotly.Plots.resize(el));
          return;
        }
        builtWidth = w;
        const b = buildFigure(current, w);
        ready = ready.then(() => Plotly.react(el, b.data, b.layout, CONFIG)).then(() => Plotly.Plots.resize(el));
      },
      dispose() {
        Plotly.purge(el);
      },
      async probe() {
        let seen: Promise<unknown>;
        do {
          seen = ready;
          await seen;
        } while (seen !== ready);
        return probeGraph(el as PGraph, current);
      },
    };
    exposeProbe(el, () => handle.probe!());
    return handle;
  },
};
