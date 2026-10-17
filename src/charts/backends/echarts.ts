import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatNumber, tickFormatter } from "../format";
import { fieldFormat, fieldLabel, type Annotation, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, heatPalette, roleColor, withAlpha } from "../theme";
import { categories, numberOrNull, showLegend, type Backend, type RenderHandle } from "./types";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
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

function axisOption(spec: ChartSpec, which: "x" | "y", cats?: (string | number)[]): EOption {
  const ax = spec[which];
  const fmt = ax.format ?? fieldFormat(spec.data, ax.field);
  const tick = tickFormatter(fmt);
  const isCat = !!cats;
  const base: EOption = {
    type: isCat ? "category" : ax.scale === "log" ? "log" : "value",
    name: ax.label ?? fieldLabel(spec.data, ax.field),
    nameLocation: "middle",
    nameGap: which === "x" ? 30 : 48,
    nameTextStyle: { color: THEME.muted, fontSize: 11, fontFamily: THEME.fontUi },
    axisLabel: {
      color: THEME.muted,
      fontSize: 11,
      fontFamily: THEME.fontMono,
      formatter: isCat ? (v: string) => v : (v: number) => tick(v),
      hideOverlap: true,
    },
    axisLine: { lineStyle: { color: THEME.hairline } },
    axisTick: { show: false },
    splitLine: { show: ax.grid !== false, lineStyle: { color: THEME.grid } },
  };
  if (isCat) base.data = cats!.map((c) => (typeof c === "number" ? tick(c) : c));
  if (ax.domain) {
    if (ax.domain[0] != null) base.min = ax.domain[0];
    if (ax.domain[1] != null) base.max = ax.domain[1];
  }
  if (!isCat && ax.scale !== "log" && !ax.domain) base.scale = which === "y" ? false : true;
  return base;
}

function seriesOption(spec: ChartSpec, s: SeriesSpec, cats?: (string | number)[], withMarks?: EOption): EOption {
  const mark = s.mark ?? spec.mark;
  const color = roleColor(s.color);
  const xField = s.xField ?? spec.x.field;
  const logX = spec.x.scale === "log";
  const logY = spec.y.scale === "log";
  const rows = spec.data.rows;
  const name = s.label ?? fieldLabel(spec.data, s.field);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, mark === "scatter" ? 0 : 2);
  let data: unknown[];
  if (cats) {
    const byCat = new Map<string | number, number | null>();
    for (const r of rows) {
      const x = r[xField];
      if (x == null) continue;
      byCat.set(x, numberOrNull(r[s.field]));
    }
    data = cats.map((c) => {
      const v = byCat.get(c) ?? null;
      return v != null && (!logY || v > 0) ? v : null;
    });
  } else {
    data = [];
    for (const r of rows) {
      const x = numberOrNull(r[xField]);
      const y = numberOrNull(r[s.field]);
      if (x == null || (logX && x <= 0)) continue;
      data.push([x, y != null && (!logY || y > 0) ? y : null]);
    }
  }
  const common: EOption = { name, data, ...(withMarks ?? {}) };
  switch (mark) {
    case "bar":
      return {
        ...common,
        type: "bar",
        itemStyle: { color: withAlpha(color, op), borderRadius: [3, 3, 0, 0] },
        barWidth: spec.barWidthPx ?? undefined,
        barGap: "8%",
        barCategoryGap: "25%",
        stack: spec.stack ? "total" : undefined,
        large: true,
      };
    case "scatter":
      return { ...common, type: "scatter", symbolSize: 9, itemStyle: { color: withAlpha(color, op), borderColor: THEME.surface, borderWidth: 1.5 } };
    case "area":
      return {
        ...common,
        type: "line",
        showSymbol: false,
        smooth: false,
        lineStyle: { color, width, opacity: op, type: s.dash ? "dashed" : "solid" },
        areaStyle: { color: withAlpha(color, 0.16 * op) },
        itemStyle: { color },
        emphasis: { focus: "none" },
        stack: spec.stack ? "total" : undefined,
      };
    case "step":
      return {
        ...common,
        type: "line",
        step: "end",
        showSymbol: false,
        lineStyle: { color, width, opacity: op, type: s.dash ? "dashed" : "solid" },
        itemStyle: { color },
        emphasis: { focus: "none" },
      };
    default:
      return {
        ...common,
        type: "line",
        showSymbol: false,
        lineStyle: { color, width, opacity: op, type: s.dash ? "dashed" : "solid" },
        itemStyle: { color },
        emphasis: { focus: "none" },
      };
  }
}

function markOptions(spec: ChartSpec): EOption {
  const anns = spec.annotations ?? [];
  if (!anns.length) return {};
  const lines: EOption[] = [];
  const points: EOption[] = [];
  const areas: unknown[] = [];
  const xf = tickFormatter(spec.x.format ?? fieldFormat(spec.data, spec.x.field));
  const yf = tickFormatter(spec.y.format ?? fieldFormat(spec.data, spec.y.field));
  const lineOf = (a: Annotation) => {
    const color = roleColor(a.color ?? "muted");
    const label = {
      show: !!a.text,
      formatter: a.text ?? "",
      color,
      fontSize: 10.5,
      fontFamily: THEME.fontUi,
      position: a.kind === "vline" ? (a.at === "start" ? "insideStartTop" : "insideEndTop") : a.at === "start" ? "insideStartTop" : "insideEndTop",
      distance: 6,
      backgroundColor: withAlpha(THEME.surface, 0.8),
      padding: [2, 4],
      borderRadius: 3,
    };
    return { lineStyle: { color, type: a.dash === false ? "solid" : "dashed", width: 1.2 }, label };
  };
  for (const a of anns) {
    if (a.kind === "vline" && a.x != null) lines.push({ xAxis: a.x, ...lineOf(a) });
    else if (a.kind === "hline" && a.y != null) lines.push({ yAxis: a.y, ...lineOf(a) });
    else if ((a.kind === "point" || a.kind === "label") && a.x != null && a.y != null) {
      const color = roleColor(a.color ?? "ink");
      points.push({
        coord: [a.x, a.y],
        symbol: "circle",
        symbolSize: a.kind === "point" ? 11 : 0,
        itemStyle: { color, borderColor: THEME.surface, borderWidth: 2 },
        label: {
          show: !!a.text,
          formatter: a.text ?? "",
          color,
          position: a.at === "start" ? "left" : a.at === "end" ? "right" : "top",
          fontSize: 10.5,
          fontFamily: THEME.fontUi,
          backgroundColor: withAlpha(THEME.surface, 0.8),
          padding: [2, 4],
          borderRadius: 3,
          distance: 8,
        },
        value: a.kind === "point" ? `${xf(a.x)}, ${yf(a.y)}` : "",
      });
    } else if (a.kind === "xband" && a.x != null && a.x2 != null) {
      areas.push([
        { xAxis: a.x, itemStyle: { color: withAlpha(roleColor(a.color ?? "muted"), 0.1) }, name: a.text ?? "" },
        { xAxis: a.x2 },
      ]);
    } else if (a.kind === "yband" && a.y != null && a.y2 != null) {
      areas.push([{ yAxis: a.y, itemStyle: { color: withAlpha(roleColor(a.color ?? "muted"), 0.1) }, name: a.text ?? "" }, { yAxis: a.y2 }]);
    }
  }
  const out: EOption = {};
  if (lines.length) out.markLine = { silent: true, symbol: ["none", "none"], animation: false, data: lines };
  if (points.length) out.markPoint = { silent: true, animation: false, data: points };
  if (areas.length)
    out.markArea = {
      silent: true,
      animation: false,
      label: { show: true, color: THEME.muted, fontSize: 10.5, position: "insideTop" },
      data: areas,
    };
  return out;
}

function xyOption(spec: ChartSpec): EOption {
  const cats = spec.x.categorical ? categories(spec.data.rows, spec.x.field) : undefined;
  const marks = markOptions(spec);
  const series = spec.series.map((s, i) => seriesOption(spec, s, cats, i === 0 ? marks : undefined));
  const legend = showLegend(spec);
  const xFmt = tickFormatter(spec.x.format ?? fieldFormat(spec.data, spec.x.field));
  const seriesFmt = new Map(spec.series.map((s) => [s.label ?? fieldLabel(spec.data, s.field), fieldFormat(spec.data, s.field)]));
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: THEME.fontUi, color: THEME.ink2 },
    grid: { left: 64, right: 22, top: legend ? 34 : 18, bottom: 46 },
    legend: {
      show: legend,
      top: 0,
      right: 0,
      data: spec.series.filter((s) => s.legend !== false).map((s) => s.label ?? fieldLabel(spec.data, s.field)),
      textStyle: { color: THEME.ink2, fontSize: 11, fontFamily: THEME.fontUi },
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 4,
      itemGap: 14,
    },
    tooltip: {
      trigger: spec.mark === "scatter" ? "item" : "axis",
      backgroundColor: THEME.raised,
      borderColor: THEME.hairline,
      borderWidth: 1,
      textStyle: { color: THEME.ink, fontSize: 12, fontFamily: THEME.fontUi },
      axisPointer: { type: "line", lineStyle: { color: THEME.muted, width: 1 } },
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as { seriesName: string; value: unknown; color: string; name?: string }[];
        if (!list.length) return "";
        const first = list[0];
        const xv = Array.isArray(first.value) ? (first.value[0] as number) : first.name;
        const head = `<div style="color:${THEME.muted};font-size:11px;margin-bottom:4px">${typeof xv === "number" ? xFmt(xv) : xv}</div>`;
        const body = list
          .filter((p) => {
            const y = Array.isArray(p.value) ? p.value[1] : p.value;
            return y != null;
          })
          .slice(0, 8)
          .map((p) => {
            const y = (Array.isArray(p.value) ? p.value[1] : p.value) as number;
            const fmt = seriesFmt.get(p.seriesName);
            return `<div style="display:flex;gap:8px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="color:${THEME.ink2}">${p.seriesName}</span><span style="margin-left:auto;font-family:${THEME.fontMono}">${formatNumber(y, fmt ?? "auto")}</span></div>`;
          })
          .join("");
        return head + body;
      },
    },
    xAxis: axisOption(spec, "x", cats),
    yAxis: axisOption(spec, "y"),
    series,
  };
}

function heatOption(spec: ChartSpec): EOption {
  const h = spec.heat!;
  const xs = categories(spec.data.rows, h.xField);
  const ys = categories(spec.data.rows, h.yField);
  const xf = tickFormatter(fieldFormat(spec.data, h.xField));
  const yf = tickFormatter(fieldFormat(spec.data, h.yField));
  const vf = h.format ?? fieldFormat(spec.data, h.valueField) ?? "auto";
  const data: [number, number, number][] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const r of spec.data.rows) {
    const v = numberOrNull(r[h.valueField]);
    if (v == null) continue;
    const xi = xs.indexOf(r[h.xField] as string | number);
    const yi = ys.indexOf(r[h.yField] as string | number);
    data.push([xi, yi, v]);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  let vmin = min;
  let vmax = max;
  if (h.palette === "diverging") {
    const c = h.center ?? 0;
    const span = Math.max(Math.abs(max - c), Math.abs(min - c));
    vmin = c - span;
    vmax = c + span;
  }
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: THEME.fontUi, color: THEME.ink2 },
    grid: { left: 84, right: 22, top: 18, bottom: h.palette === "binary" ? 44 : 70 },
    tooltip: {
      backgroundColor: THEME.raised,
      borderColor: THEME.hairline,
      textStyle: { color: THEME.ink, fontSize: 12 },
      formatter: (p: { value: [number, number, number] }) =>
        `${fieldLabel(spec.data, h.xField)} ${typeof xs[p.value[0]] === "number" ? xf(xs[p.value[0]] as number) : xs[p.value[0]]}<br/>${fieldLabel(spec.data, h.yField)} ${
          typeof ys[p.value[1]] === "number" ? yf(ys[p.value[1]] as number) : ys[p.value[1]]
        }<br/><b style="font-family:${THEME.fontMono}">${formatNumber(p.value[2], vf)}</b>`,
    },
    xAxis: {
      type: "category",
      data: xs.map((c) => (typeof c === "number" ? xf(c) : c)),
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
      data: ys.map((c) => (typeof c === "number" ? yf(c) : c)),
      name: spec.y.label ?? fieldLabel(spec.data, h.yField),
      nameLocation: "middle",
      nameGap: 66,
      nameTextStyle: { color: THEME.muted, fontSize: 11 },
      axisLabel: { color: THEME.muted, fontSize: 11, fontFamily: THEME.fontMono },
      axisLine: { lineStyle: { color: THEME.hairline } },
      axisTick: { show: false },
    },
    visualMap: {
      min: vmin,
      max: vmax,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      textStyle: { color: THEME.muted, fontSize: 10.5, fontFamily: THEME.fontMono },
      formatter: (v: number) => formatNumber(v, vf),
      inRange: { color: heatPalette(h.palette) },
      show: h.palette !== "binary",
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: h.cellLabels !== false,
          color: THEME.ink,
          fontSize: 11,
          fontFamily: THEME.fontMono,
          formatter: (p: { value: [number, number, number] }) => formatNumber(p.value[2], vf),
        },
        itemStyle: { borderColor: THEME.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: THEME.ink } },
      },
    ],
  };
}

export function buildOption(spec: ChartSpec): EOption {
  return spec.kind === "heatmap" && spec.heat ? heatOption(spec) : xyOption(spec);
}

export const backend: Backend = {
  id: "echarts",
  label: "ECharts",
  mount(el, spec): RenderHandle {
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chart.setOption(buildOption(spec), { notMerge: true });
    return {
      update(next) {
        chart.setOption(buildOption(next), { notMerge: true });
      },
      resize() {
        chart.resize();
      },
      dispose() {
        chart.dispose();
      },
    };
  },
};
