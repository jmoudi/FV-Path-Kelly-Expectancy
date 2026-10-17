import embed, { type Result } from "vega-embed";
import { formatNumber } from "../format";
import { resolveAxes, type ResolvedAxis } from "../resolve";
import { fieldFormat, fieldLabel, type ChartSpec, type Row, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, heatPalette, roleColor } from "../theme";
import { categories, d3Format, numberOrNull, showLegend, type Backend, type RenderHandle } from "./types";

type VL = Record<string, unknown>;

/** A Vega expression mapping tick values to the labels every backend shares. */
function labelExpr(ticks: number[], labels: string[], fallbackFormat?: string): string {
  const entries = ticks.map((t, i) => `${JSON.stringify(String(t))}: ${JSON.stringify(labels[i])}`).join(", ");
  const fallback = fallbackFormat ? `format(datum.value, ${JSON.stringify(fallbackFormat)})` : "datum.label";
  return `({${entries}})[toString(datum.value)] || ${fallback}`;
}

function axisEnc(ax: ResolvedAxis, field: string, cat: boolean): VL {
  if (cat) return { field, type: "ordinal", title: ax.label, axis: { labelAngle: 0, grid: false } };
  const fmt = d3Format(ax.format);
  const enc: VL = {
    field,
    type: "quantitative",
    title: ax.label,
    scale: { type: ax.scale === "log" ? "log" : "linear", domain: [ax.min, ax.max], nice: false, zero: false, clamp: false },
    axis: { grid: ax.grid, values: ax.ticks, labelExpr: labelExpr(ax.ticks, ax.labels, fmt), labelOverlap: true, labelFlush: false },
  };
  return enc;
}

function seriesLayer(spec: ChartSpec, s: SeriesSpec, xAx: ResolvedAxis, yAx: ResolvedAxis, cat: boolean, domain: string[], range: string[]): VL {
  const mark = s.mark ?? spec.mark;
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, 2);
  const name = s.label ?? fieldLabel(spec.data, s.field);
  const xField = s.xField ?? spec.x.field;
  const xfmt = d3Format(spec.x.format ?? fieldFormat(spec.data, xField));
  const yfmt = d3Format(fieldFormat(spec.data, s.field));
  let m: VL;
  switch (mark) {
    case "bar":
      m = { type: "bar", color, opacity: op, cornerRadiusTopLeft: 2, cornerRadiusTopRight: 2, ...(spec.barWidthPx && !cat ? { width: spec.barWidthPx } : {}) };
      break;
    case "scatter":
      m = { type: "point", filled: true, color, opacity: op, size: 70, stroke: THEME.surface, strokeWidth: 1.5 };
      break;
    case "area":
      m = { type: "area", color, opacity: 0.16 * op, line: { color, strokeWidth: width, opacity: op, strokeDash: s.dash ? [6, 4] : undefined } };
      break;
    case "step":
      m = { type: "line", color, opacity: op, strokeWidth: width, interpolate: "step-after", strokeDash: s.dash ? [6, 4] : undefined };
      break;
    default:
      m = { type: "line", color, opacity: op, strokeWidth: width, strokeDash: s.dash ? [6, 4] : undefined };
  }
  const filters = [`isValid(datum["${s.field}"])`, `isValid(datum["${xField}"])`];
  if (yAx.scale === "log") filters.push(`datum["${s.field}"] > 0`);
  if (xAx.scale === "log") filters.push(`datum["${xField}"] > 0`);
  // Keep values inside the resolved domain so a clipped y does not draw outside the frame.
  if (!cat) filters.push(`datum["${xField}"] >= ${xAx.min} && datum["${xField}"] <= ${xAx.max}`);
  // clip: a story or edit that narrows the domain must not draw outside the frame.
  const layer: VL = {
    mark: { ...m, clip: true },
    transform: [{ filter: filters.join(" && ") }],
    encoding: {
      x: axisEnc(xAx, xField, cat),
      y: axisEnc(yAx, s.field, false),
      tooltip: [
        { field: xField, type: cat ? "ordinal" : "quantitative", title: xAx.label, format: xfmt },
        { field: s.field, type: "quantitative", title: name, format: yfmt },
      ],
    },
  };
  if (s.colors && cat && mark === "bar") {
    const cats = categories(spec.data.rows, xField);
    (layer.encoding as VL).color = { field: xField, type: "nominal", scale: { domain: cats.map(String), range: cats.map((_, i) => roleColor(s.colors![i % s.colors!.length])) }, legend: null };
    (layer.mark as VL).color = undefined;
  } else if (s.legend !== false && domain.length >= 2) {
    // The legend sits above the plot, as in the other backends, never over the data.
    (layer.encoding as VL).color = { datum: name, scale: { domain, range }, legend: { title: null, orient: "top", direction: "horizontal", symbolType: "stroke", offset: 6 } };
    (layer.mark as VL).color = undefined;
  }
  if (spec.stack && (mark === "bar" || mark === "area")) (layer.encoding as VL).y = { ...((layer.encoding as VL).y as VL), stack: "zero" };
  return layer;
}

function annotationLayers(spec: ChartSpec, height: number): VL[] {
  const layers: VL[] = [];
  // Each annotation is one mark. Without its own single-row data source a layer
  // inherits the chart's rows and draws the mark once per row.
  const out = { push: (l: VL) => layers.push({ data: { values: [{}] }, ...l, mark: { ...(l.mark as VL), clip: true } }) };
  for (const a of spec.annotations ?? []) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? undefined : [4, 4];
    if (a.kind === "vline" && a.x != null) {
      out.push({ mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1.2 }, encoding: { x: { datum: a.x } } });
      if (a.text) out.push({ mark: { type: "text", color, align: "left", baseline: a.at === "start" ? "bottom" : "top", dx: 4, dy: a.at === "start" ? -4 : 4, fontSize: 10.5 }, encoding: { x: { datum: a.x }, y: { value: a.at === "start" ? height : 0 }, text: { value: a.text } } });
    } else if (a.kind === "hline" && a.y != null) {
      out.push({ mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1.2 }, encoding: { y: { datum: a.y } } });
      if (a.text) out.push({ mark: { type: "text", color, align: a.at === "start" ? "left" : "right", baseline: "bottom", dy: -3, fontSize: 10.5 }, encoding: { y: { datum: a.y }, x: { value: a.at === "start" ? 4 : "width" }, text: { value: a.text } } });
    } else if ((a.kind === "point" || a.kind === "label") && a.x != null && a.y != null) {
      if (a.kind === "point") out.push({ mark: { type: "point", filled: true, color, size: 90, stroke: THEME.surface, strokeWidth: 2 }, encoding: { x: { datum: a.x }, y: { datum: a.y } } });
      if (a.text) out.push({ mark: { type: "text", color: roleColor(a.color ?? "ink"), dy: -12, fontSize: 10.5, align: a.at === "start" ? "right" : a.at === "end" ? "left" : "center", dx: a.at === "start" ? -8 : a.at === "end" ? 8 : 0 }, encoding: { x: { datum: a.x }, y: { datum: a.y }, text: { value: a.text } } });
    } else if (a.kind === "xband" && a.x != null && a.x2 != null) {
      out.push({ mark: { type: "rect", color, opacity: 0.1 }, encoding: { x: { datum: a.x }, x2: { datum: a.x2 } } });
      if (a.text) out.push({ mark: { type: "text", color: THEME.muted, baseline: "top", dy: 4, fontSize: 10.5 }, encoding: { x: { datum: (a.x + a.x2) / 2 }, y: { value: 0 }, text: { value: a.text } } });
    } else if (a.kind === "yband" && a.y != null && a.y2 != null) {
      out.push({ mark: { type: "rect", color, opacity: 0.1 }, encoding: { y: { datum: a.y }, y2: { datum: a.y2 } } });
    }
  }
  return layers;
}

const CONFIG: VL = {
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
  legend: { labelColor: THEME.ink2, titleColor: THEME.muted, labelFontSize: 11, symbolStrokeWidth: 3, symbolSize: 60 },
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
    return { ...r, __label: custom != null ? String(custom) : v == null ? "" : formatNumber(v, vf) };
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
      mark: { type: "rect", stroke: THEME.surface, strokeWidth: 2, cornerRadius: 3 },
      encoding: {
        x: xEnc,
        y: yEnc,
        color: {
          field: h.valueField,
          type: "quantitative",
          scale: { domain, range: palette },
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
      transform: [{ filter: `toString(datum["${h.xField}"]) === ${JSON.stringify(String(h.highlight.x))} && toString(datum["${h.yField}"]) === ${JSON.stringify(String(h.highlight.y))}` }],
      mark: { type: "rect", fill: null, stroke: THEME.ink, strokeWidth: 2.5, cornerRadius: 3 },
      encoding: { x: xEnc, y: yEnc },
    });
  }
  return { $schema: "https://vega.github.io/schema/vega-lite/v5.json", width: "container", height, data: { values: rows }, config: CONFIG, layer: layers };
}

function build(spec: ChartSpec): VL {
  const height = spec.height ?? 300;
  if (spec.kind === "heatmap" && spec.heat) return heatSpec(spec, height);
  const axes = resolveAxes(spec);
  const cat = axes.x.categorical;
  const legendOn = showLegend(spec);
  const legendSeries = spec.series.filter((s) => s.legend !== false);
  const domain = legendOn ? legendSeries.map((s) => s.label ?? fieldLabel(spec.data, s.field)) : [];
  const range = legendOn ? legendSeries.map((s) => roleColor(s.color)) : [];
  const layers = [...spec.series.map((s) => seriesLayer(spec, s, axes.x, axes.y, cat, domain, range)), ...annotationLayers(spec, height)];
  if (cat) {
    const cats = categories(spec.data.rows, spec.x.field).map(String);
    for (const l of layers) {
      const enc = (l as VL).encoding as VL | undefined;
      if (enc?.x && (enc.x as VL).field) (enc.x as VL).sort = cats;
    }
  }
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height,
    data: { values: spec.data.rows },
    config: CONFIG,
    layer: layers,
  };
}

export const backend: Backend = {
  id: "vega",
  label: "Vega-Lite",
  mount(el, spec): RenderHandle {
    let result: Result | null = null;
    let disposed = false;
    const run = (s: ChartSpec) => {
      if (disposed) return;
      result?.finalize();
      result = null;
      void embed(el, build(s) as never, { actions: false, renderer: "svg", tooltip: { theme: "dark" } }).then((r) => {
        if (disposed) r.finalize();
        else result = r;
      });
    };
    run(spec);
    return {
      update(next) {
        run(next);
      },
      resize() {
        result?.view.resize().runAsync();
      },
      dispose() {
        disposed = true;
        result?.finalize();
        result = null;
      },
    };
  },
};
