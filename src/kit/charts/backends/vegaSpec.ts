/**
 * The Vega-Lite spec for a chart spec. Pure: no Vega import, so it can be built and
 * inspected without a DOM. Every layer carries its own rows (the exact points,
 * bars and bands the resolver planned), tagged with `__key` (a series) or `__ann`
 * (an annotation) so the probe can find what each layer drew.
 */
import { stepVertices } from "../bars";
import { formatNumber } from "../format";
import { LABEL_FONT_PX, LEGEND_ROW_PX, resolveChart, type ResolvedAxis, type ResolvedChart } from "../resolve";
import { fieldFormat, fieldLabel, type ChartSpec, type Row, type SeriesSpec } from "../spec";
import { THEME, barFill, barStroke, emphasisOpacity, emphasisWidth, heatPalette, roleColor } from "../theme";
import { BAND_ALPHA, barPoints, categories, d3Format, linePoints, markOf, numberOrNull, seriesName } from "./types";

export type VL = Record<string, unknown>;

/** Band scale padding that leaves the same 25% gap between categories as the other backends. */
const BAND_PADDING = { paddingInner: 0.25, paddingOuter: 0.125 };

/** A Vega expression mapping values to the labels every backend shares. */
function labelExpr(values: (number | string)[], labels: string[], fallbackFormat?: string): string {
  const entries = values.map((t, i) => `${JSON.stringify(String(t))}: ${JSON.stringify(labels[i])}`).join(", ");
  const fallback = fallbackFormat ? `format(datum.value, ${JSON.stringify(fallbackFormat)})` : "datum.label";
  return `({${entries}})[toString(datum.value)] || ${fallback}`;
}

/** `valueAxis`: grid lines run across the value axis only (no plaid). */
function axisEnc(ax: ResolvedAxis, field: string, withBands: boolean, valueAxis = false): VL {
  if (ax.categorical)
    return {
      field,
      type: "ordinal",
      title: ax.label,
      sort: null,
      scale: { domain: ax.categories, ...(withBands ? BAND_PADDING : {}) },
      axis: { labelAngle: 0, grid: false, labelExpr: labelExpr(ax.categories, ax.labels) },
    };
  const fmt = d3Format(ax.format);
  return {
    field,
    type: "quantitative",
    title: ax.label,
    // padding 0: Vega-Lite pads continuous scales under bars, which would widen the shared range.
    scale: { type: ax.scale === "log" ? "log" : "linear", domain: [ax.min, ax.max], nice: false, zero: false, clamp: false, padding: 0 },
    axis: { grid: valueAxis && ax.grid, values: ax.ticks, labelExpr: labelExpr(ax.ticks, ax.labels, fmt), labelOverlap: true, labelFlush: false },
  };
}

interface LegendInfo {
  domain: string[];
  range: string[];
  symbol: "square" | "stroke";
  /** Entries per row, from the shared legend layout. */
  columns: number;
}

function legendColor(spec: ChartSpec, s: SeriesSpec, legend: LegendInfo | null): VL | null {
  if (!legend || s.legend === false) return null;
  return {
    datum: seriesName(spec, s),
    scale: { domain: legend.domain, range: legend.range },
    // The legend sits above the plot, as in the other backends, never over the data,
    // and wraps into the rows the shared layout planned.
    legend: { title: null, orient: "top", direction: "horizontal", columns: legend.columns, symbolType: legend.symbol, symbolOpacity: 1, labelLimit: 320, offset: 6 },
  };
}

function lineLayer(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec, legend: LegendInfo | null): VL {
  const mark = markOf(spec, s);
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, 2);
  const fmt = fieldFormat(spec.data, s.field) ?? "auto";
  const pts = linePoints(spec, rc, s);
  const posFmt = rc.axes.x.formatter;
  const values: Row[] = pts.map(([h, v], i) => {
    const val = rc.horizontal ? h : v;
    const pos = rc.horizontal ? v : h;
    return { __key: s.field, __i: i, h, v, __t: typeof val === "number" ? formatNumber(val, fmt) : "", __p: typeof pos === "number" ? posFmt(pos) : String(pos ?? "") };
  });
  const dash = s.dash === "dot" ? [1.5, 3] : s.dash ? [6, 4] : undefined;
  // Steps hold the value along the position axis: horizontal first, or vertical first when bars run sideways.
  const interpolate = mark === "step" && (spec.step ?? "after") === "after" ? (rc.horizontal ? "step-before" : "step-after") : "linear";
  let m: VL;
  if (mark === "scatter") m = { type: "point", filled: true, color, opacity: op, size: 70, stroke: THEME.surface, strokeWidth: 1.5 };
  else if (mark === "area") m = { type: "area", color, opacity: 0.16 * op, orient: rc.horizontal ? "horizontal" : "vertical", line: { color, strokeWidth: width, opacity: op, strokeDash: dash } };
  else m = { type: "line", color, opacity: op, strokeWidth: width, interpolate, strokeDash: dash };
  const enc: VL = {
    x: axisEnc(rc.h, "h", rc.bars != null, rc.h === rc.axes.y),
    y: axisEnc(rc.v, "v", rc.bars != null, rc.v === rc.axes.y),
  };
  if (s.tooltip !== false)
    enc.tooltip = [
      { field: "__p", title: rc.axes.x.label },
      { field: "__t", title: seriesName(spec, s) },
    ];
  // A line follows the data order. (On an area, `order` would split the fill into one group per row.)
  if (mark === "line" || mark === "step") enc.order = { field: "__i", type: "quantitative" };
  // An area fills down to the value axis' baseline: zero, or the axis start on a log scale.
  if (mark === "area") {
    const val = rc.axes.y;
    const base = val.scale === "log" ? val.min : Math.min(Math.max(0, val.min), val.max);
    enc[rc.horizontal ? "x2" : "y2"] = { datum: base };
  }
  const c = legendColor(spec, s, legend);
  if (c) {
    enc.color = c;
    delete m.color;
  }
  // invalid: null breaks the line at a missing value instead of joining across it.
  return { data: { values }, mark: { ...m, clip: true, invalid: null }, encoding: enc };
}

function barLayer(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec, legend: LegendInfo | null): VL {
  const op = emphasisOpacity(s.emphasis);
  const fmt = fieldFormat(spec.data, s.field) ?? "auto";
  const pts = barPoints(spec, rc, s);
  const categorical = rc.axes.x.categorical;
  const cats = rc.axes.x.categories;
  const posFmt = rc.axes.x.formatter;
  const values: Row[] = pts.map((p) => {
    const ci = categorical ? cats.findIndex((c) => String(c) === String(p.pos)) : -1;
    const role = s.colors ? s.colors[Math.max(0, ci) % s.colors.length] : s.color;
    return {
      __key: s.field,
      pos: categorical ? p.pos : p.shifted,
      top: p.top,
      bottom: p.bottom,
      value: p.value,
      // The fill carries its own alpha (status bars 0.7, ink bars in ink2, references half); the mark adds the emphasis.
      __color: barFill(role, 1),
      // Status bars carry a 1px edge in the full colour.
      __stroke: barStroke(role, 1) ?? "transparent",
      __t: formatNumber(p.value, fmt),
      __p: categorical ? (rc.axes.x.labels[ci] ?? String(p.pos)) : posFmt(p.pos as number),
    };
  });
  const horizontal = rc.horizontal;
  const thickness = rc.bars?.thicknessPx;
  const radius = horizontal ? { cornerRadiusTopRight: 2, cornerRadiusBottomRight: 2 } : { cornerRadiusTopLeft: 2, cornerRadiusTopRight: 2 };
  const m: VL = { type: "bar", orient: horizontal ? "horizontal" : "vertical", opacity: op, ...radius, ...(thickness && !categorical ? (horizontal ? { height: thickness } : { width: thickness }) : {}) };
  const posEnc = axisEnc(rc.axes.x, "pos", true);
  const valEnc = axisEnc(rc.axes.y, "top", false, true);
  const enc: VL = horizontal ? { y: posEnc, x: valEnc, x2: { field: "bottom" } } : { x: posEnc, y: valEnc, y2: { field: "bottom" } };
  if (categorical && rc.bars?.mode === "group") {
    const names = (rc.bars.keys ?? []).map((k) => seriesName(spec, spec.series.find((x) => x.field === k)!));
    enc[horizontal ? "yOffset" : "xOffset"] = { datum: seriesName(spec, s), scale: { domain: names, paddingInner: 0, paddingOuter: 0 } };
  }
  enc.tooltip = [
    { field: "__p", title: rc.axes.x.label },
    { field: "__t", title: seriesName(spec, s) },
  ];
  const c = s.colors ? null : legendColor(spec, s, legend);
  if (c) enc.color = c;
  else enc.color = { field: "__color", type: "nominal", scale: null, legend: null };
  if (values.some((v) => v.__stroke !== "transparent")) {
    enc.stroke = { field: "__stroke", type: "nominal", scale: null, legend: null };
    enc.strokeWidth = { value: 1 };
  }
  return { data: { values }, mark: { ...m, clip: true }, encoding: enc };
}

/** The fill between a band series and its lower edge. */
function bandLayer(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): VL | null {
  if (!s.band || rc.axes.x.categorical) return null;
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
  if (!runs.length) return null;
  const mode = markOf(spec, s) === "step" ? (spec.step ?? "after") : null;
  const values: Row[] = [];
  runs.forEach((rn, k) => {
    // "middle" steps arrive as explicit vertices; "after" steps use Vega's own interpolation.
    const up = mode === "middle" ? stepVertices(rn.map(([x, hi]) => [x, hi]), "middle") : rn.map(([x, hi]) => [x, hi] as [number, number]);
    const dn = mode === "middle" ? stepVertices(rn.map(([x, , lo]) => [x, lo]), "middle") : rn.map(([x, , lo]) => [x, lo] as [number, number]);
    up.forEach(([x, hi], i) => values.push({ __key: `${s.field}~band`, __run: k, __i: i, pos: x, hi, lo: dn[i][1] }));
  });
  const interpolate = mode === "after" ? (rc.horizontal ? "step-before" : "step-after") : "linear";
  const posEnc = axisEnc(rc.axes.x, "pos", false);
  const enc: VL = rc.horizontal
    ? { y: posEnc, x: axisEnc(rc.axes.y, "hi", false, true), x2: { field: "lo" }, detail: { field: "__run" } }
    : { x: posEnc, y: axisEnc(rc.axes.y, "hi", false, true), y2: { field: "lo" }, detail: { field: "__run" } };
  return { data: { values }, mark: { type: "area", color: roleColor(s.color), opacity: BAND_ALPHA, interpolate, orient: rc.horizontal ? "horizontal" : "vertical", clip: true }, encoding: enc };
}

function annotationLayers(rc: ResolvedChart): VL[] {
  const layers: VL[] = [];
  const one = (ann: string) => ({ values: [{ __ann: ann }] });
  for (const a of rc.annotations) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? undefined : [4, 4];
    if (a.kind === "vline") layers.push({ data: one("line"), mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1, clip: true }, encoding: { x: { datum: a.x } } });
    else if (a.kind === "hline") layers.push({ data: one("line"), mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1, clip: true }, encoding: { y: { datum: a.y } } });
    else if (a.kind === "point") layers.push({ data: one("dot"), mark: { type: "point", filled: true, color: roleColor(a.color ?? "ink"), opacity: 1, size: 90, stroke: THEME.surface, strokeWidth: 2, clip: true }, encoding: { x: { datum: a.x }, y: { datum: a.y } } });
    else if (a.kind === "xband") layers.push({ data: one("area"), mark: { type: "rect", color, opacity: 0.1, clip: true }, encoding: { x: { datum: a.x }, x2: { datum: a.x2 } } });
    else if (a.kind === "yband") layers.push({ data: one("area"), mark: { type: "rect", color, opacity: 0.1, clip: true }, encoding: { y: { datum: a.y }, y2: { datum: a.y2 } } });
    const l = a.label;
    if (!l || !a.text) continue;
    const textColor = a.kind === "xband" ? THEME.muted : roleColor(a.color ?? (a.kind === "point" || a.kind === "label" ? "ink" : "muted"));
    let x: VL;
    let y: VL;
    if (a.kind === "xband") {
      const lo = Math.max(Math.min(a.x!, a.x2!), rc.h.min);
      const hi = Math.min(Math.max(a.x!, a.x2!), rc.h.max);
      x = { datum: rc.h.scale === "log" ? Math.sqrt(lo * hi) : (lo + hi) / 2 };
      y = { value: 0 };
    } else if (l.anchor === "top" || l.anchor === "bottom") {
      x = { datum: a.x };
      y = { value: l.anchor === "top" ? 0 : "height" };
    } else if (l.anchor === "left" || l.anchor === "right") {
      x = { value: l.anchor === "left" ? 0 : "width" };
      y = { datum: a.y };
    } else {
      x = { datum: a.x };
      y = { datum: a.y };
    }
    layers.push({ data: one("label"), mark: { type: "text", color: textColor, align: l.align, baseline: l.baseline, dx: l.dx, dy: l.dy, fontSize: LABEL_FONT_PX }, encoding: { x, y, text: { value: a.text } } });
  }
  return layers;
}

export const CONFIG: VL = {
  font: THEME.fontUi,
  background: "transparent",
  axis: {
    labelColor: THEME.muted,
    titleColor: THEME.muted,
    gridColor: THEME.grid,
    domainColor: THEME.hairline,
    tickColor: THEME.hairline,
    labelFontSize: 11,
    titleFontSize: 11,
    titleFontWeight: "normal",
    labelFont: THEME.fontMono,
    titlePadding: 8,
  },
  legend: { labelColor: THEME.ink2, titleColor: THEME.muted, labelFontSize: 11, symbolStrokeWidth: 3, symbolSize: 60, symbolOpacity: 1 },
  view: { stroke: null },
  text: { font: THEME.fontUi },
};

function heatSpec(spec: ChartSpec, height: number): VL {
  const h = spec.heat!;
  const xFmt = fieldFormat(spec.data, h.xField);
  const yFmt = fieldFormat(spec.data, h.yField);
  const vf = h.format ?? fieldFormat(spec.data, h.valueField) ?? "auto";
  const xs = categories(spec.data.rows, h.xField);
  const ys = categories(spec.data.rows, h.yField);
  const catExpr = (cats: (string | number)[], fmt?: typeof xFmt) =>
    `({${cats.map((c) => `${JSON.stringify(String(c))}: ${JSON.stringify(typeof c === "number" ? formatNumber(c, fmt ?? "auto") : String(c))}`).join(", ")}})[toString(datum.value)] || datum.label`;
  const rows: Row[] = spec.data.rows.map((r) => {
    const v = numberOrNull(r[h.valueField]);
    const custom = h.labelField ? r[h.labelField] : null;
    return { ...r, __cell: 1, __label: custom != null ? String(custom) : v == null ? "" : formatNumber(v, vf) };
  });
  const vals = rows.map((r) => numberOrNull(r[h.valueField])).filter((v): v is number => v != null);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const palette = heatPalette(h.palette);
  let domain: number[];
  if (h.palette === "diverging") {
    const c = h.center ?? 0;
    const span = Math.max(Math.abs(max - c), Math.abs(min - c));
    domain = palette.map((_, i) => c - span + (2 * span * i) / (palette.length - 1));
  } else if (h.palette === "binary") domain = [0, 1];
  else domain = palette.map((_, i) => min + ((max - min) * i) / (palette.length - 1));
  // Sort orders must carry the field's own value type; strings would not match numeric cells.
  const xEnc = { field: h.xField, type: "ordinal", title: spec.x.label ?? fieldLabel(spec.data, h.xField), axis: { labelAngle: 0, labelExpr: catExpr(xs, xFmt) }, sort: [...xs] };
  const yEnc = { field: h.yField, type: "ordinal", title: spec.y.label ?? fieldLabel(spec.data, h.yField), axis: { labelExpr: catExpr(ys, yFmt) }, sort: [...ys].reverse() };
  const layers: VL[] = [
    {
      mark: { type: "rect", stroke: THEME.page, strokeWidth: 1, cornerRadius: 0 },
      encoding: {
        x: xEnc,
        y: yEnc,
        color: {
          field: h.valueField,
          type: "quantitative",
          // RGB, as the other backends blend: Vega's default (HCL) swings red-to-graphite through violet.
          scale: { domain, range: palette, interpolate: "rgb" },
          legend: h.palette === "binary" ? null : { title: null, format: d3Format(vf), orient: "bottom", direction: "horizontal", gradientLength: 140, gradientThickness: 8, labelFontSize: 10.5 },
        },
        tooltip: [
          { field: h.xField, title: fieldLabel(spec.data, h.xField) },
          { field: h.yField, title: fieldLabel(spec.data, h.yField) },
          { field: "__label", title: fieldLabel(spec.data, h.valueField) },
        ],
      },
    },
  ];
  if (h.cellLabels !== false) layers.push({ mark: { type: "text", color: THEME.ink, fontSize: 11, font: THEME.fontMono }, encoding: { x: xEnc, y: yEnc, text: { field: "__label" } } });
  if (h.highlight) {
    layers.push({
      transform: [{ filter: `toString(datum["${h.xField}"]) === ${JSON.stringify(String(h.highlight.x))} && toString(datum["${h.yField}"]) === ${JSON.stringify(String(h.highlight.y))}` }, { calculate: "0", as: "__cell" }],
      mark: { type: "rect", fill: null, stroke: THEME.ink, strokeWidth: 2.5, cornerRadius: 0 },
      encoding: { x: xEnc, y: yEnc },
    });
  }
  return { $schema: "https://vega.github.io/schema/vega-lite/v5.json", width: "container", height, data: { values: rows }, config: CONFIG, layer: layers };
}

/** The Vega-Lite spec for a chart spec in a container of this width. */
export function buildVegaSpec(spec: ChartSpec, width = 720): { vl: VL; resolved: ResolvedChart | null } {
  const height = spec.height ?? 300;
  if (spec.kind === "heatmap" && spec.heat) return { vl: heatSpec(spec, height), resolved: null };
  const rc = resolveChart(spec, width);
  const legendList = spec.series.filter((s) => s.legend !== false);
  const legend: LegendInfo | null = rc.legend
    ? { domain: legendList.map((s) => seriesName(spec, s)), range: legendList.map((s) => (markOf(spec, s) === "bar" ? barFill(s.color, 1) : roleColor(s.color))), symbol: legendList.every((s) => markOf(spec, s) === "bar") ? "square" : "stroke", columns: rc.legend.columns }
    : null;
  // The box is fixed by the spec: legend rows beyond the first come out of the plot. Rows
  // kept free for the legend of the chart beside this one pad the top.
  const reserved = Math.max(rc.legendRows.grid, 1);
  const plotHeight = Math.max(60, height - (reserved - 1) * LEGEND_ROW_PX);
  const extraTop = (rc.legendRows.grid - (rc.legend?.gridRows ?? 0)) * LEGEND_ROW_PX;
  const layers: VL[] = [];
  for (const s of spec.series) {
    const b = s.band ? bandLayer(spec, rc, s) : null;
    if (b) layers.push(b);
  }
  for (const s of spec.series) layers.push(markOf(spec, s) === "bar" ? barLayer(spec, rc, s, legend) : lineLayer(spec, rc, s, legend));
  layers.push(...annotationLayers(rc));
  return {
    vl: { $schema: "https://vega.github.io/schema/vega-lite/v5.json", width: "container", height: plotHeight, config: CONFIG, layer: layers, ...(extraTop > 0 ? { padding: { top: 5 + extraTop, right: 5, bottom: 5, left: 5 } } : {}) },
    resolved: rc,
  };
}
