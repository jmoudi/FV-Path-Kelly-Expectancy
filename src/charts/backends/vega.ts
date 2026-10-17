import embed, { type Result } from "vega-embed";
import { fieldFormat, fieldLabel, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, roleColor } from "../theme";
import { categories, d3Format, numberOrNull, showLegend, type Backend, type RenderHandle } from "./types";

type VL = Record<string, unknown>;

function axis(spec: ChartSpec, which: "x" | "y", cat: boolean): VL {
  const ax = spec[which];
  const fmt = d3Format(ax.format ?? fieldFormat(spec.data, ax.field));
  const enc: VL = {
    field: ax.field,
    type: cat ? "ordinal" : "quantitative",
    title: ax.label ?? fieldLabel(spec.data, ax.field),
    axis: { format: fmt, grid: ax.grid !== false, labelFlush: false },
  };
  const scale: VL = {};
  if (ax.scale === "log") scale.type = "log";
  if (ax.domain && ax.domain[0] != null && ax.domain[1] != null) scale.domain = ax.domain;
  else if (!cat) scale.zero = which === "y" ? ax.scale !== "log" : false;
  if (ax.scale !== "log") scale.nice = true;
  if (Object.keys(scale).length) enc.scale = scale;
  return enc;
}

function seriesLayer(spec: ChartSpec, s: SeriesSpec, cat: boolean, domain: string[], range: string[]): VL {
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
      m = { type: "bar", color, opacity: op, cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 };
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
  const xEnc: VL = { ...axis(spec, "x", cat), field: xField };
  const layer: VL = {
    mark: m,
    transform: [{ filter: `isValid(datum["${s.field}"]) && isValid(datum["${xField}"])${spec.y.scale === "log" ? ` && datum["${s.field}"] > 0` : ""}` }],
    encoding: {
      x: xEnc,
      y: { ...axis(spec, "y", false), field: s.field },
      tooltip: [
        { field: xField, type: cat ? "ordinal" : "quantitative", title: xEnc.title, format: xfmt },
        { field: s.field, type: "quantitative", title: name, format: yfmt },
      ],
    },
  };
  if (s.legend !== false && domain.length >= 2) {
    (layer.encoding as VL).color = { datum: name, scale: { domain, range }, legend: { title: null, orient: "top-right", direction: "horizontal", symbolType: "stroke" } };
    (layer.mark as VL).color = undefined;
  }
  if (spec.stack && (mark === "bar" || mark === "area")) (layer.encoding as VL).y = { ...((layer.encoding as VL).y as VL), stack: "zero" };
  return layer;
}

function annotationLayers(spec: ChartSpec): VL[] {
  const out: VL[] = [];
  for (const a of spec.annotations ?? []) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? undefined : [4, 4];
    if (a.kind === "vline" && a.x != null) {
      out.push({ mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1.2 }, encoding: { x: { datum: a.x } } });
      if (a.text) out.push({ mark: { type: "text", color, align: "left", baseline: "top", dx: 4, dy: 4, fontSize: 10.5 }, encoding: { x: { datum: a.x }, y: { value: a.at === "start" ? spec.height ?? 300 : 0 }, text: { value: a.text } } });
    } else if (a.kind === "hline" && a.y != null) {
      out.push({ mark: { type: "rule", color, strokeDash: dash, strokeWidth: 1.2 }, encoding: { y: { datum: a.y } } });
      if (a.text) out.push({ mark: { type: "text", color, align: a.at === "start" ? "left" : "right", baseline: "bottom", dy: -3, fontSize: 10.5 }, encoding: { y: { datum: a.y }, x: { value: a.at === "start" ? 4 : "width" }, text: { value: a.text } } });
    } else if ((a.kind === "point" || a.kind === "label") && a.x != null && a.y != null) {
      if (a.kind === "point") out.push({ mark: { type: "point", filled: true, color, size: 90, stroke: THEME.surface, strokeWidth: 2 }, encoding: { x: { datum: a.x }, y: { datum: a.y } } });
      if (a.text) out.push({ mark: { type: "text", color: roleColor(a.color ?? "ink"), dy: -12, fontSize: 10.5 }, encoding: { x: { datum: a.x }, y: { datum: a.y }, text: { value: a.text } } });
    } else if (a.kind === "xband" && a.x != null && a.x2 != null) {
      out.push({ mark: { type: "rect", color, opacity: 0.1 }, encoding: { x: { datum: a.x }, x2: { datum: a.x2 } } });
    } else if (a.kind === "yband" && a.y != null && a.y2 != null) {
      out.push({ mark: { type: "rect", color, opacity: 0.1 }, encoding: { y: { datum: a.y }, y2: { datum: a.y2 } } });
    }
  }
  return out;
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

function build(spec: ChartSpec): VL {
  const height = spec.height ?? 300;
  if (spec.kind === "heatmap" && spec.heat) {
    const h = spec.heat;
    const vf = d3Format(h.format ?? fieldFormat(spec.data, h.valueField)) ?? ".3~g";
    const xf = d3Format(fieldFormat(spec.data, h.xField));
    const yf = d3Format(fieldFormat(spec.data, h.yField));
    const vals = spec.data.rows.map((r) => numberOrNull(r[h.valueField])).filter((v): v is number => v != null);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    let domain: number[];
    let range: string[];
    if (h.palette === "diverging") {
      const c = h.center ?? 0;
      const span = Math.max(Math.abs(max - c), Math.abs(min - c));
      domain = [c - span, c, c + span];
      range = [THEME.diverging[0], THEME.diverging[2], THEME.diverging[4]];
    } else if (h.palette === "binary") {
      domain = [0, 1];
      range = THEME.binary;
    } else {
      domain = [min, max];
      range = [THEME.sequential[0], THEME.sequential[THEME.sequential.length - 1]];
    }
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      height,
      data: { values: spec.data.rows },
      config: CONFIG,
      layer: [
        {
          mark: { type: "rect", stroke: THEME.surface, strokeWidth: 2, cornerRadius: 3 },
          encoding: {
            x: { field: h.xField, type: "ordinal", title: spec.x.label ?? fieldLabel(spec.data, h.xField), axis: { format: xf, labelAngle: 0 } },
            y: { field: h.yField, type: "ordinal", title: spec.y.label ?? fieldLabel(spec.data, h.yField), axis: { format: yf }, sort: "descending" },
            color: { field: h.valueField, type: "quantitative", scale: { domain, range }, legend: h.palette === "binary" ? null : { title: null, format: vf, orient: "bottom", direction: "horizontal", gradientLength: 140, gradientThickness: 8, labelFontSize: 10.5 } },
            tooltip: [
              { field: h.xField, title: fieldLabel(spec.data, h.xField), format: xf },
              { field: h.yField, title: fieldLabel(spec.data, h.yField), format: yf },
              { field: h.valueField, title: fieldLabel(spec.data, h.valueField), format: vf },
            ],
          },
        },
        ...(h.cellLabels !== false
          ? [
              {
                mark: { type: "text", color: THEME.ink, fontSize: 11, font: THEME.fontMono },
                encoding: {
                  x: { field: h.xField, type: "ordinal" },
                  y: { field: h.yField, type: "ordinal", sort: "descending" },
                  text: { field: h.valueField, type: "quantitative", format: vf },
                },
              },
            ]
          : []),
      ],
    };
  }
  const cat = !!spec.x.categorical;
  const legendOn = showLegend(spec);
  const legendSeries = spec.series.filter((s) => s.legend !== false);
  const domain = legendOn ? legendSeries.map((s) => s.label ?? fieldLabel(spec.data, s.field)) : [];
  const range = legendOn ? legendSeries.map((s) => roleColor(s.color)) : [];
  const layers = [...spec.series.map((s) => seriesLayer(spec, s, cat, domain, range)), ...annotationLayers(spec)];
  const out: VL = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height,
    data: { values: spec.data.rows },
    config: CONFIG,
    layer: layers,
  };
  if (cat) {
    const cats = categories(spec.data.rows, spec.x.field).map(String);
    for (const l of layers) {
      const enc = (l as VL).encoding as VL | undefined;
      if (enc?.x && (enc.x as VL).field) (enc.x as VL).sort = cats;
    }
  }
  return out;
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
