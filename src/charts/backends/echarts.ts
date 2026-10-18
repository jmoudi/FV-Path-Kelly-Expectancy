import * as echarts from "echarts/core";
import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { BarAccumulator, exposeProbe, inRange, type AxisProbe, type RenderProbe, type SeriesProbe } from "../../kit/charts/probe";
import { formatNumber } from "../format";
import { LABEL_FONT_PX, LEGEND_ROW_PX, resolveChart, screenPx, type ResolvedAxis, type ResolvedChart, type ScreenAnnotation } from "../resolve";
import { fieldFormat, fieldLabel, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, heatPalette, roleColor, withAlpha } from "../theme";
import { BAND_ALPHA, bandPoints, barPoints, linePoints, markOf, numberOrNull, seriesName, type Backend, type RenderHandle } from "./types";

echarts.use([
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

type EOption = Record<string, unknown>;

const LABEL_BG = withAlpha(THEME.surface, 0.82);
/** The grid's insets in px; the plot box is what remains of the container. */
const GRID = { left: 66, right: 22, top: 18, legendTop: 14, bottom: 46 };
const ANNOTATIONS_ID = "__annotations";

function axisOption(ax: ResolvedAxis, which: "x" | "y"): EOption {
  const base: EOption = {
    type: ax.categorical ? "category" : ax.scale === "log" ? "log" : "value",
    name: ax.label,
    nameLocation: "middle",
    nameGap: which === "x" ? 30 : 50,
    nameTextStyle: { color: THEME.muted, fontSize: 11, fontFamily: THEME.fontUi },
    axisLabel: {
      color: THEME.muted,
      fontSize: 11,
      fontFamily: THEME.fontMono,
      formatter: ax.categorical ? (v: string) => v : (v: number) => ax.formatter(snapToTick(v, ax)),
      hideOverlap: true,
    },
    axisLine: { lineStyle: { color: THEME.hairline } },
    axisTick: { show: false },
    splitLine: { show: ax.grid && !ax.categorical, lineStyle: { color: THEME.grid } },
  };
  if (ax.categorical) {
    base.data = ax.labels;
    // Categories read top to bottom when they run up the side.
    if (which === "y") base.inverse = true;
  } else {
    base.min = ax.min;
    base.max = ax.max;
    // The resolved ticks, not ECharts' own: every backend labels the same values.
    // A tick on an axis end is nudged inside it, or ECharts' rounded extent drops it.
    const ticks = ax.ticks.map((t) => (Math.abs(t - ax.max) <= Math.abs(ax.max) * 1e-9 ? t - Math.abs(t) * 1e-11 : Math.abs(t - ax.min) <= Math.abs(ax.min) * 1e-9 ? t + Math.abs(t) * 1e-11 : t));
    (base.axisLabel as Record<string, unknown>).customValues = ticks;
    base.axisTick = { show: false, customValues: ticks };
  }
  return base;
}

/** The resolved tick a value stands for (custom tick values arrive nudged or rounded). */
function snapToTick(v: number, ax: ResolvedAxis): number {
  for (const t of ax.ticks) if (Math.abs(t - v) <= Math.abs(t) * 1e-8 + 1e-15) return t;
  return v;
}

/** A line, step, area or scatter series, in screen coordinates. */
function lineSeries(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): EOption {
  const mark = markOf(spec, s);
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, 2);
  const pts = linePoints(spec, rc, s);
  // A category axis takes one value per category, in category order.
  const data = rc.h.categorical || rc.v.categorical ? pts.map((p) => (rc.horizontal ? p[0] : p[1])) : pts;
  const common: EOption = { id: s.field, name: seriesName(spec, s), data, z: 3 };
  const lineStyle = { color, width, opacity: op, type: s.dash ? "dashed" : "solid" };
  // "middle" steps arrive as explicit vertices; "after" steps are the library's own.
  const step = mark === "step" && (spec.step ?? "after") === "after" ? (rc.horizontal ? "start" : "end") : false;
  switch (mark) {
    case "scatter":
      return { ...common, type: "scatter", symbolSize: 9, itemStyle: { color: withAlpha(color, op), borderColor: THEME.surface, borderWidth: 1.5 } };
    case "area":
      return { ...common, type: "line", showSymbol: false, lineStyle, areaStyle: { color: withAlpha(color, 0.16 * op) }, itemStyle: { color }, emphasis: { focus: "none" }, stack: spec.stack ? "total" : undefined };
    default:
      return { ...common, type: "line", step, showSymbol: false, connectNulls: false, lineStyle, itemStyle: { color }, emphasis: { focus: "none" } };
  }
}

/** Bars on a categorical axis: the library's own bars, grouped by the plan. */
function categoryBars(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): EOption {
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const pts = barPoints(spec, rc, s);
  const byCat = new Map(pts.map((p) => [String(p.pos), p]));
  const cats = (rc.horizontal ? rc.v : rc.h).categories;
  const data = cats.map((c, i) => {
    const p = byCat.get(String(c));
    const value = p ? p.value : null;
    const itemColor = s.colors ? roleColor(s.colors[i % s.colors.length]) : color;
    return { value, itemStyle: { color: withAlpha(itemColor, op) } };
  });
  const mode = rc.bars?.mode;
  return {
    id: s.field,
    name: seriesName(spec, s),
    type: "bar",
    data,
    itemStyle: { color: withAlpha(color, op), borderRadius: rc.horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0] },
    barCategoryGap: "25%",
    barGap: mode === "overlay" ? "-100%" : "0%",
    stack: mode === "stack" ? "total" : undefined,
    z: 2,
  };
}

/**
 * Bars on a numeric axis, drawn as rectangles at the planned position, thickness
 * and offset. The library's own bars would group series that never share a
 * position and push each bar off the value it stands for.
 */
function numericBars(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): EOption {
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const pts = barPoints(spec, rc, s);
  const thickness = rc.bars?.thicknessPx ?? 6;
  const horizontal = rc.horizontal;
  const radius = horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0];
  return {
    id: s.field,
    name: seriesName(spec, s),
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    z: 2,
    // The series colour, for the legend; each bar carries its own below.
    itemStyle: { color: withAlpha(color, op) },
    dimensions: ["pos", "top", "bottom", "value"],
    encode: horizontal ? { x: 1, y: 0, tooltip: [3] } : { x: 0, y: 1, tooltip: [3] },
    data: pts.map((p, i) => ({ value: [p.shifted, p.top, p.bottom, p.value], itemStyle: { color: withAlpha(s.colors ? roleColor(s.colors[i % s.colors.length]) : color, op) } })),
    renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[]; style: () => Record<string, unknown> }) => {
      const pos = api.value(0);
      const top = api.value(1);
      const bottom = api.value(2);
      if (![pos, top, bottom].every(Number.isFinite)) return null;
      const c0 = horizontal ? api.coord([bottom, pos]) : api.coord([pos, bottom]);
      const c1 = horizontal ? api.coord([top, pos]) : api.coord([pos, top]);
      const rect = horizontal
        ? { x: Math.min(c0[0], c1[0]), y: c0[1] - thickness / 2, width: Math.abs(c1[0] - c0[0]), height: thickness }
        : { x: c0[0] - thickness / 2, y: Math.min(c0[1], c1[1]), width: thickness, height: Math.abs(c1[1] - c0[1]) };
      const cs = params.coordSys;
      const shape = echarts.graphic.clipRectByRect(rect, { x: cs.x, y: cs.y, width: cs.width, height: cs.height });
      if (!shape) return null;
      return { type: "rect", shape: { ...shape, r: radius }, style: api.style() };
    },
  };
}

/** The fill between a band series and its lower edge, as one polygon per unbroken run. */
function bandSeries(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): EOption | null {
  const runs = bandPoints(spec, rc, s);
  if (!runs.length) return null;
  const fill = withAlpha(roleColor(s.color), BAND_ALPHA);
  return {
    id: `${s.field}~band`,
    name: `${seriesName(spec, s)} (band)`,
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    silent: true,
    z: 1,
    tooltip: { show: false },
    data: [[rc.h.categorical ? 0 : rc.h.min, rc.v.categorical ? 0 : rc.v.min]],
    encode: { x: 0, y: 1 },
    renderItem: (_params: unknown, api: { coord: (v: number[]) => number[] }) => ({
      type: "group",
      children: runs.map((run) => ({ type: "polygon", shape: { points: run.map((p) => api.coord(p)) }, style: { fill } })),
    }),
  };
}

/** Reference lines, dots and shaded bands, on an empty helper series. Labels are drawn separately. */
function annotationSeries(rc: ResolvedChart): EOption {
  const lines: EOption[] = [];
  const points: EOption[] = [];
  const areas: unknown[] = [];
  for (const a of rc.annotations) {
    const color = roleColor(a.color ?? "muted");
    const lineStyle = { color, type: a.dash === false ? "solid" : "dashed", width: 1.2 };
    if (a.kind === "vline") lines.push({ xAxis: a.x, lineStyle, label: { show: false } });
    else if (a.kind === "hline") lines.push({ yAxis: a.y, lineStyle, label: { show: false } });
    else if (a.kind === "point") points.push({ coord: [a.x, a.y], symbol: "circle", symbolSize: 11, itemStyle: { color: roleColor(a.color ?? "ink"), borderColor: THEME.surface, borderWidth: 2 }, label: { show: false } });
    else if (a.kind === "xband") areas.push([{ xAxis: a.x, itemStyle: { color: withAlpha(color, 0.1) } }, { xAxis: a.x2 }]);
    else if (a.kind === "yband") areas.push([{ yAxis: a.y, itemStyle: { color: withAlpha(color, 0.1) } }, { yAxis: a.y2 }]);
  }
  const out: EOption = { id: ANNOTATIONS_ID, name: ANNOTATIONS_ID, type: "line", data: [], silent: true, tooltip: { show: false }, z: 5 };
  // precision: ECharts rounds mark-line coordinates to 2 decimals by default, which
  // would put 2.94%, 3.38% and 2.52% all at 3.00%.
  if (lines.length) out.markLine = { silent: true, symbol: ["none", "none"], animation: false, precision: 12, data: lines };
  if (points.length) out.markPoint = { silent: true, animation: false, data: points };
  if (areas.length) out.markArea = { silent: true, animation: false, label: { show: false }, data: areas };
  return out;
}

/** Annotation labels as text at the placements the resolver chose, in container px. */
function labelGraphics(rc: ResolvedChart, grid: { left: number; top: number; width: number; height: number }): EOption[] {
  const out: EOption[] = [];
  const px = (a: ScreenAnnotation, which: "x" | "y") => (which === "x" ? screenPx(a.x, rc.h, grid.width, false) : screenPx(a.y, rc.v, grid.height, true));
  for (const a of rc.annotations) {
    const l = a.label;
    if (!l || !a.text) continue;
    let x: number;
    let y: number;
    if (a.kind === "xband") {
      const x0 = screenPx(Math.max(Math.min(a.x!, a.x2!), rc.h.min), rc.h, grid.width, false) ?? 0;
      const x1 = screenPx(Math.min(Math.max(a.x!, a.x2!), rc.h.max), rc.h, grid.width, false) ?? grid.width;
      x = (x0 + x1) / 2;
      y = 0;
    } else if (l.anchor === "top" || l.anchor === "bottom") {
      x = px(a, "x") ?? 0;
      y = l.anchor === "top" ? 0 : grid.height;
    } else if (l.anchor === "left" || l.anchor === "right") {
      x = l.anchor === "left" ? 0 : grid.width;
      y = px(a, "y") ?? 0;
    } else {
      x = px(a, "x") ?? 0;
      y = px(a, "y") ?? 0;
    }
    const color = a.kind === "xband" ? THEME.muted : roleColor(a.color ?? (a.kind === "point" || a.kind === "label" ? "ink" : "muted"));
    out.push({
      type: "text",
      silent: true,
      z: 100,
      x: grid.left + x + l.dx,
      y: grid.top + y + l.dy,
      style: {
        text: a.text,
        fill: color,
        font: `${LABEL_FONT_PX}px ${THEME.fontUi}`,
        align: l.align,
        verticalAlign: l.baseline,
        backgroundColor: a.kind === "xband" ? undefined : LABEL_BG,
        padding: [2, 4],
        borderRadius: 3,
      },
    });
  }
  return out;
}

function xyOption(spec: ChartSpec, width: number, height: number): EOption {
  const rc = resolveChart(spec, width);
  const legend = !!rc.legend;
  // The plot starts below however many rows the legend wraps into.
  const top = rc.legend ? GRID.legendTop + rc.legend.flowRows * LEGEND_ROW_PX : GRID.top;
  const grid = { left: GRID.left, top, width: Math.max(10, width - GRID.left - GRID.right), height: Math.max(10, height - top - GRID.bottom) };
  const series: EOption[] = [];
  for (const s of spec.series) {
    if (!s.band) continue;
    const b = bandSeries(spec, rc, s);
    if (b) series.push(b);
  }
  const categoryAxis = rc.h.categorical || rc.v.categorical;
  for (const s of spec.series) {
    if (markOf(spec, s) === "bar") series.push(categoryAxis ? categoryBars(spec, rc, s) : numericBars(spec, rc, s));
    else series.push(lineSeries(spec, rc, s));
  }
  series.push(annotationSeries(rc));
  const seriesFmt = new Map(spec.series.map((s) => [seriesName(spec, s), fieldFormat(spec.data, s.field)]));
  const posFmt = rc.axes.x.formatter;
  const valueOf = (p: { value: unknown; seriesType?: string }) => {
    const v = p.value as unknown;
    if (Array.isArray(v)) return (p.seriesType === "custom" ? v[3] : rc.horizontal ? v[0] : v[1]) as number | null;
    if (v && typeof v === "object" && "value" in (v as object)) return (v as { value: number | null }).value;
    return v as number | null;
  };
  const posOf = (p: { value: unknown; name?: string; seriesType?: string }) => {
    const v = p.value as unknown;
    if (Array.isArray(v)) return (p.seriesType === "custom" ? v[0] : rc.horizontal ? v[1] : v[0]) as number;
    return p.name;
  };
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: THEME.fontUi, color: THEME.ink2 },
    grid: { left: GRID.left, right: GRID.right, top, bottom: GRID.bottom },
    legend: {
      show: legend,
      top: 2,
      left: GRID.left,
      right: GRID.right,
      data: spec.series.filter((s) => s.legend !== false).map((s) => seriesName(spec, s)),
      textStyle: { color: THEME.ink2, fontSize: 11, fontFamily: THEME.fontUi },
      itemWidth: 18,
      itemHeight: 8,
      itemGap: 14,
    },
    tooltip: {
      trigger: spec.mark === "scatter" ? "item" : "axis",
      backgroundColor: THEME.raised,
      borderColor: THEME.hairline,
      borderWidth: 1,
      textStyle: { color: THEME.ink, fontSize: 12, fontFamily: THEME.fontUi },
      axisPointer: { type: "line", axis: rc.horizontal ? "y" : "x", lineStyle: { color: THEME.muted, width: 1 } },
      formatter: (params: unknown) => {
        const list = ((Array.isArray(params) ? params : [params]) as { seriesName: string; seriesId?: string; value: unknown; color: string; name?: string; seriesType?: string }[]).filter((p) => p.seriesId !== ANNOTATIONS_ID && !String(p.seriesId).endsWith("~band"));
        if (!list.length) return "";
        const xv = posOf(list[0]);
        const head = `<div style="color:${THEME.muted};font-size:11px;margin-bottom:4px">${typeof xv === "number" ? posFmt(xv) : (xv ?? "")}</div>`;
        const body = list
          .filter((p) => valueOf(p) != null)
          .slice(0, 8)
          .map((p) => {
            const y = valueOf(p) as number;
            const fmt = seriesFmt.get(p.seriesName);
            return `<div style="display:flex;gap:8px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="color:${THEME.ink2}">${p.seriesName}</span><span style="margin-left:auto;font-family:${THEME.fontMono}">${formatNumber(y, fmt ?? "auto")}</span></div>`;
          })
          .join("");
        return head + body;
      },
    },
    xAxis: axisOption(rc.h, "x"),
    yAxis: axisOption(rc.v, "y"),
    series,
    graphic: { elements: labelGraphics(rc, grid) },
  };
}

function heatOption(spec: ChartSpec): EOption {
  const h = spec.heat!;
  const xs = uniqueCats(spec, h.xField);
  const ys = uniqueCats(spec, h.yField);
  const xFmt = fieldFormat(spec.data, h.xField);
  const yFmt = fieldFormat(spec.data, h.yField);
  const catLabel = (c: string | number, fmt?: typeof xFmt) => (typeof c === "number" ? formatNumber(c, fmt ?? "auto") : c);
  const vf = h.format ?? fieldFormat(spec.data, h.valueField) ?? "auto";
  const data: unknown[] = [];
  let min = Infinity;
  let max = -Infinity;
  const same = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
  for (const r of spec.data.rows) {
    const v = numberOrNull(r[h.valueField]);
    const xi = xs.indexOf(r[h.xField] as string | number);
    const yi = ys.indexOf(r[h.yField] as string | number);
    const label = h.labelField ? r[h.labelField] : null;
    const hl = h.highlight && same(r[h.xField], h.highlight.x) && same(r[h.yField], h.highlight.y);
    const item: Record<string, unknown> = { value: [xi, yi, v, label ?? null] };
    if (hl) item.itemStyle = { borderColor: THEME.ink, borderWidth: 2.5 };
    if (v == null) item.itemStyle = { ...(item.itemStyle as object), color: THEME.raised };
    data.push(item);
    if (v != null) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  let vmin = min;
  let vmax = max;
  if (h.palette === "diverging") {
    const c = h.center ?? 0;
    const span = Math.max(Math.abs(max - c), Math.abs(min - c));
    vmin = c - span;
    vmax = c + span;
  } else if (h.palette === "binary") {
    vmin = 0;
    vmax = 1;
  }
  const labelOf = (p: { value: unknown[] }) => (p.value[3] != null ? String(p.value[3]) : p.value[2] == null ? "" : formatNumber(p.value[2] as number, vf));
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: THEME.fontUi, color: THEME.ink2 },
    grid: { left: 84, right: 22, top: 18, bottom: h.palette === "binary" ? 44 : 74 },
    tooltip: {
      backgroundColor: THEME.raised,
      borderColor: THEME.hairline,
      textStyle: { color: THEME.ink, fontSize: 12 },
      formatter: (p: { value: unknown[] }) =>
        `${fieldLabel(spec.data, h.xField)} ${catLabel(xs[p.value[0] as number], xFmt)}<br/>${fieldLabel(spec.data, h.yField)} ${catLabel(ys[p.value[1] as number], yFmt)}<br/><b style="font-family:${THEME.fontMono}">${labelOf(p)}</b>`,
    },
    xAxis: {
      type: "category",
      data: xs.map((c) => catLabel(c, xFmt)),
      name: spec.x.label ?? fieldLabel(spec.data, h.xField),
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: THEME.muted, fontSize: 11 },
      axisLabel: { color: THEME.muted, fontSize: 11, fontFamily: THEME.fontMono },
      axisLine: { lineStyle: { color: THEME.hairline } },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: ys.map((c) => catLabel(c, yFmt)),
      name: spec.y.label ?? fieldLabel(spec.data, h.yField),
      nameLocation: "middle",
      nameGap: 66,
      nameTextStyle: { color: THEME.muted, fontSize: 11 },
      axisLabel: { color: THEME.muted, fontSize: 11, fontFamily: THEME.fontMono },
      axisLine: { lineStyle: { color: THEME.hairline } },
      axisTick: { show: false },
    },
    visualMap: {
      show: h.palette !== "binary",
      dimension: 2,
      min: vmin,
      max: vmax,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      text: [formatNumber(vmax, vf), formatNumber(vmin, vf)],
      textStyle: { color: THEME.muted, fontSize: 10.5, fontFamily: THEME.fontMono },
      inRange: { color: heatPalette(h.palette) },
    },
    series: [
      {
        id: "heat",
        type: "heatmap",
        data,
        label: { show: h.cellLabels !== false, color: THEME.ink, fontSize: 11, fontFamily: THEME.fontMono, formatter: labelOf },
        itemStyle: { borderColor: THEME.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: THEME.ink } },
      },
    ],
  };
}

function uniqueCats(spec: ChartSpec, field: string): (string | number)[] {
  const seen = new Set<unknown>();
  const out: (string | number)[] = [];
  for (const r of spec.data.rows) {
    const v = r[field];
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** The ECharts option for a spec drawn in a container of this size. */
export function buildOption(spec: ChartSpec, width = 720, height = (spec.height ?? 300) + 70): EOption {
  return spec.kind === "heatmap" && spec.heat ? heatOption(spec) : xyOption(spec, width, height);
}

// ---------------------------------------------------------------------------
// Probe: what ECharts drew, read from its own model and graphic elements.
// ---------------------------------------------------------------------------

interface EAxis {
  type: string;
  dim: string;
  inverse: boolean;
  scale: { getExtent(): number[]; getOrdinalMeta?: () => { categories: string[] } };
}
interface EData {
  count(): number;
  get(dim: string, i: number): unknown;
  mapDimension(dim: string): string;
  getItemGraphicEl(i: number): { shape?: { x: number; y: number; width: number; height: number }; getBoundingRect?: () => { x: number; y: number; width: number; height: number } } | undefined;
}
interface ESeries {
  id: string;
  subType: string;
  getData(): EData;
}

function axisProbe(axis: EAxis | undefined): AxisProbe | undefined {
  if (!axis) return undefined;
  if (axis.type === "category") {
    const cats = [...(axis.scale.getOrdinalMeta?.().categories ?? [])].map(String);
    // Screen order: a y axis lists its first category at the bottom unless inverted.
    return { kind: "category", categories: axis.dim === "y" && !axis.inverse ? cats.reverse() : cats };
  }
  const [min, max] = axis.scale.getExtent();
  return { kind: axis.type === "log" ? "log" : "linear", min, max };
}

function probeChart(chart: echarts.ECharts, spec: ChartSpec): RenderProbe {
  const model = (chart as unknown as { getModel(): { getComponent(t: string, i?: number): { axis?: EAxis; coordinateSystem?: { getRect(): { x: number; y: number; width: number; height: number } } } | undefined; getSeries(): ESeries[] } }).getModel();
  const opt = chart.getOption() as { series?: { id?: string; markLine?: { data?: unknown[] }; markPoint?: { data?: unknown[] }; markArea?: { data?: unknown[] } }[]; graphic?: { elements?: unknown[] }[] };
  if (spec.kind === "heatmap") {
    const heat = model.getSeries().find((s) => s.subType === "heatmap");
    let cells = 0;
    if (heat) {
      const d = heat.getData();
      for (let i = 0; i < d.count(); i++) if (Number.isFinite(d.get(d.mapDimension("value") || "value", i) as number)) cells++;
    }
    return { backend: "echarts", kind: "heatmap", horizontal: false, height: spec.height, h: axisProbe(model.getComponent("xAxis", 0)?.axis), v: axisProbe(model.getComponent("yAxis", 0)?.axis), series: [], lines: 0, areas: 0, dots: 0, labels: 0, cells };
  }
  const rc = resolveChart(spec, chart.getWidth());
  const rect = model.getComponent("grid", 0)?.coordinateSystem?.getRect() ?? { x: 0, y: 0, width: 1, height: 1 };
  const hAx = model.getComponent("xAxis", 0)?.axis;
  const vAx = model.getComponent("yAxis", 0)?.axis;
  const h = axisProbe(hAx);
  const v = axisProbe(vAx);
  const posAxis = rc.horizontal ? v : h;
  const posInRange = (p: unknown) => posAxis?.kind === "category" || inRange(p, posAxis?.min ?? -Infinity, posAxis?.max ?? Infinity);
  const series: SeriesProbe[] = [];
  type Bounded = { getBoundingRect(): { x: number; y: number; width: number; height: number } };
  // A line view keeps its fill as `_polygon`; the group's own box also spans its clip rect.
  const views = chart as unknown as { getViewOfSeriesModel(s: ESeries): { group: { childCount(): number } & Bounded; _polygon?: Bounded } };
  const clipped = (b: { x: number; y: number; width: number; height: number } | undefined) =>
    b ? (Math.max(0, Math.min(b.x + b.width, rect.x + rect.width) - Math.max(b.x, rect.x)) * Math.max(0, Math.min(b.y + b.height, rect.y + rect.height) - Math.max(b.y, rect.y))) / (rect.width * rect.height) : 0;
  for (const sm of model.getSeries()) {
    if (sm.id === ANNOTATIONS_ID) continue;
    const data = sm.getData();
    if (sm.id.endsWith("~band")) {
      const share = clipped(data.getItemGraphicEl(0)?.getBoundingRect?.());
      series.push({ key: sm.id, kind: "band", count: share > 0 ? 1 : 0, extent: share });
      continue;
    }
    const s = spec.series.find((x) => x.field === sm.id);
    const mark = s ? markOf(spec, s) : "line";
    if (mark === "bar") {
      const acc = new BarAccumulator(rc.horizontal ? rect.width : rect.height, rc.horizontal ? rect.height : rect.width);
      let count = 0;
      const custom = sm.subType === "custom";
      const valueDim = custom ? "value" : data.mapDimension(rc.horizontal ? "x" : "y");
      const posDim = custom ? "pos" : data.mapDimension(rc.horizontal ? "y" : "x");
      for (let i = 0; i < data.count(); i++) {
        const val = data.get(valueDim, i) as number;
        const pos = data.get(posDim, i);
        if (Number.isFinite(val) && val !== 0 && (!custom || posInRange(pos))) count++;
        const shape = data.getItemGraphicEl(i)?.shape;
        if (!shape) continue;
        if (rc.horizontal) acc.add(shape.width, rect.y + rect.height - (shape.y + shape.height / 2), shape.height);
        else acc.add(shape.height, shape.x + shape.width / 2 - rect.x, shape.width);
      }
      series.push({ key: sm.id, kind: "bar", count, extent: acc.extent(), center: acc.center(), thickness: acc.thickness() });
      continue;
    }
    const xd = data.mapDimension("x");
    const yd = data.mapDimension("y");
    const categorical = rc.h.categorical || rc.v.categorical;
    let count = 0;
    for (let i = 0; i < data.count(); i++) {
      const hx = data.get(xd, i);
      const vy = data.get(yd, i);
      const pos = rc.horizontal ? vy : hx;
      const val = rc.horizontal ? hx : vy;
      if (Number.isFinite(val as number) && (categorical || posInRange(pos))) count++;
    }
    const view = views.getViewOfSeriesModel(sm);
    const drawn = view?.group.childCount() ?? 0;
    if (mark === "area") series.push({ key: sm.id, kind: "area", count: drawn > 0 ? count : 0, extent: clipped(view?._polygon?.getBoundingRect()) });
    else series.push({ key: sm.id, kind: mark === "scatter" ? "point" : "line", count: drawn > 0 ? count : 0 });
  }
  const ann = opt.series?.find((s) => s.id === ANNOTATIONS_ID);
  return {
    backend: "echarts",
    kind: "xy",
    horizontal: rc.horizontal,
    height: spec.height,
    h,
    v,
    series,
    lines: ann?.markLine?.data?.length ?? 0,
    areas: ann?.markArea?.data?.length ?? 0,
    dots: ann?.markPoint?.data?.length ?? 0,
    labels: opt.graphic?.[0]?.elements?.length ?? 0,
  };
}

export const backend: Backend = {
  id: "echarts",
  label: "ECharts",
  mount(el, spec): RenderHandle {
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    let current = spec;
    const draw = () => chart.setOption(buildOption(current, chart.getWidth(), chart.getHeight()), { notMerge: true });
    draw();
    const handle: RenderHandle = {
      update(next) {
        current = next;
        draw();
      },
      resize() {
        const w = chart.getWidth();
        const hgt = chart.getHeight();
        chart.resize();
        // Label positions are in px, so they follow the new size.
        if (chart.getWidth() !== w || chart.getHeight() !== hgt) draw();
      },
      dispose() {
        chart.dispose();
      },
      async probe() {
        return probeChart(chart, current);
      },
    };
    exposeProbe(el, () => handle.probe!());
    return handle;
  },
};
