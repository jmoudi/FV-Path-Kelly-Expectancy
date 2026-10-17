import Plotly from "plotly.js-dist-min";
import { tickFormatter } from "../format";
import { fieldFormat, fieldLabel, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, heatPalette, roleColor, withAlpha } from "../theme";
import { categories, d3Format, numberOrNull, showLegend, type Backend, type RenderHandle } from "./types";

type PTrace = Record<string, unknown>;
type PLayout = Record<string, unknown>;

function axisLayout(spec: ChartSpec, which: "x" | "y", cat: boolean): PLayout {
  const ax = spec[which];
  const fmt = d3Format(ax.format ?? fieldFormat(spec.data, ax.field));
  const out: PLayout = {
    title: { text: ax.label ?? fieldLabel(spec.data, ax.field), font: { size: 11, color: THEME.muted, family: THEME.fontUi }, standoff: 10 },
    type: cat ? "category" : ax.scale === "log" ? "log" : "linear",
    gridcolor: ax.grid === false ? "transparent" : THEME.grid,
    zerolinecolor: THEME.hairline,
    linecolor: THEME.hairline,
    tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono },
    tickformat: fmt,
    automargin: true,
    showline: true,
    fixedrange: true,
  };
  if (ax.domain && (ax.domain[0] != null || ax.domain[1] != null)) {
    const lo = ax.domain[0];
    const hi = ax.domain[1];
    if (lo != null && hi != null) out.range = ax.scale === "log" ? [Math.log10(lo), Math.log10(hi)] : [lo, hi];
    else if (lo != null) out.rangemode = lo === 0 ? "tozero" : "normal";
  }
  return out;
}

function trace(spec: ChartSpec, s: SeriesSpec, cats?: (string | number)[]): PTrace {
  const mark = s.mark ?? spec.mark;
  const color = roleColor(s.color);
  const xField = s.xField ?? spec.x.field;
  const rows = spec.data.rows;
  const name = s.label ?? fieldLabel(spec.data, s.field);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, 2);
  const yfmt = d3Format(fieldFormat(spec.data, s.field)) ?? ".4~g";
  const x: (string | number)[] = [];
  const y: (number | null)[] = [];
  if (cats) {
    const byCat = new Map<string | number, number | null>();
    for (const r of rows) if (r[xField] != null) byCat.set(r[xField] as string | number, numberOrNull(r[s.field]));
    for (const c of cats) {
      x.push(String(c));
      y.push(byCat.get(c) ?? null);
    }
  } else {
    for (const r of rows) {
      const xv = numberOrNull(r[xField]);
      if (xv == null) continue;
      x.push(xv);
      y.push(numberOrNull(r[s.field]));
    }
  }
  const base: PTrace = {
    name,
    x,
    y,
    showlegend: s.legend !== false,
    hovertemplate: `%{y:${yfmt}}<extra>${name}</extra>`,
  };
  switch (mark) {
    case "bar":
      return { ...base, type: "bar", marker: { color: withAlpha(color, op), line: { width: 0 } }, width: spec.barWidthPx ? undefined : undefined };
    case "scatter":
      return { ...base, type: "scatter", mode: "markers", marker: { color: withAlpha(color, op), size: 9, line: { color: THEME.surface, width: 1.5 } } };
    case "area":
      return {
        ...base,
        type: "scatter",
        mode: "lines",
        fill: "tozeroy",
        fillcolor: withAlpha(color, 0.16 * op),
        line: { color: withAlpha(color, op), width, dash: s.dash ? "dash" : "solid" },
        stackgroup: spec.stack ? "one" : undefined,
      };
    case "step":
      return { ...base, type: "scatter", mode: "lines", line: { color: withAlpha(color, op), width, shape: "hv", dash: s.dash ? "dash" : "solid" } };
    default:
      return { ...base, type: "scatter", mode: "lines", line: { color: withAlpha(color, op), width, dash: s.dash ? "dash" : "solid" } };
  }
}

function annotationLayout(spec: ChartSpec): { shapes: PLayout[]; annotations: PLayout[] } {
  const shapes: PLayout[] = [];
  const annotations: PLayout[] = [];
  for (const a of spec.annotations ?? []) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? "solid" : "dot";
    const font = { size: 10.5, color, family: THEME.fontUi };
    if (a.kind === "vline" && a.x != null) {
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: a.x, x1: a.x, y0: 0, y1: 1, line: { color, width: 1.2, dash } });
      if (a.text) annotations.push({ x: a.x, y: a.at === "start" ? 0.02 : 0.98, xref: "x", yref: "paper", text: a.text, showarrow: false, font, xanchor: "left", yanchor: a.at === "start" ? "bottom" : "top", xshift: 4, bgcolor: withAlpha(THEME.surface, 0.8) });
    } else if (a.kind === "hline" && a.y != null) {
      shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y, line: { color, width: 1.2, dash } });
      if (a.text) annotations.push({ x: a.at === "start" ? 0.02 : 0.98, y: a.y, xref: "paper", yref: "y", text: a.text, showarrow: false, font, xanchor: a.at === "start" ? "left" : "right", yanchor: "bottom", yshift: 3, bgcolor: withAlpha(THEME.surface, 0.8) });
    } else if ((a.kind === "point" || a.kind === "label") && a.x != null && a.y != null) {
      if (a.kind === "point") shapes.push({ type: "circle", xref: "x", yref: "y", x0: a.x, x1: a.x, y0: a.y, y1: a.y, xsizemode: "pixel", ysizemode: "pixel", xanchor: a.x, yanchor: a.y, line: { color: THEME.surface, width: 2 }, fillcolor: color });
      if (a.text) annotations.push({ x: a.x, y: a.y, text: a.text, showarrow: a.kind === "point", arrowcolor: color, arrowhead: 0, ax: 0, ay: -24, font: { ...font, color: roleColor(a.color ?? "ink") }, bgcolor: withAlpha(THEME.surface, 0.8) });
    } else if (a.kind === "xband" && a.x != null && a.x2 != null) {
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: a.x, x1: a.x2, y0: 0, y1: 1, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
      if (a.text) annotations.push({ x: (a.x + a.x2) / 2, y: 0.98, xref: "x", yref: "paper", text: a.text, showarrow: false, font: { ...font, color: THEME.muted }, yanchor: "top" });
    } else if (a.kind === "yband" && a.y != null && a.y2 != null) {
      shapes.push({ type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y2, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
    }
  }
  return { shapes, annotations };
}

function build(spec: ChartSpec): { data: PTrace[]; layout: PLayout } {
  const legend = showLegend(spec);
  const base: PLayout = {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: THEME.fontUi, color: THEME.ink2, size: 11 },
    margin: { l: 56, r: 20, t: legend ? 34 : 14, b: 44 },
    showlegend: legend,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", font: { size: 11, color: THEME.ink2 }, bgcolor: "transparent" },
    hoverlabel: { bgcolor: THEME.raised, bordercolor: THEME.hairline, font: { color: THEME.ink, size: 12, family: THEME.fontUi } },
    autosize: true,
  };
  if (spec.kind === "heatmap" && spec.heat) {
    const h = spec.heat;
    const xs = categories(spec.data.rows, h.xField);
    const ys = categories(spec.data.rows, h.yField);
    const z: (number | null)[][] = ys.map(() => xs.map(() => null));
    let min = Infinity;
    let max = -Infinity;
    for (const r of spec.data.rows) {
      const v = numberOrNull(r[h.valueField]);
      if (v == null) continue;
      z[ys.indexOf(r[h.yField] as string | number)][xs.indexOf(r[h.xField] as string | number)] = v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const vf = d3Format(h.format ?? fieldFormat(spec.data, h.valueField)) ?? ".3~g";
    const xf = tickFormatter(fieldFormat(spec.data, h.xField));
    const yf = tickFormatter(fieldFormat(spec.data, h.yField));
    const xLabels = xs.map((c) => (typeof c === "number" ? xf(c) : String(c)));
    const yLabels = ys.map((c) => (typeof c === "number" ? yf(c) : String(c)));
    let zmin = min;
    let zmax = max;
    if (h.palette === "diverging") {
      const c = h.center ?? 0;
      const span = Math.max(Math.abs(max - c), Math.abs(min - c));
      zmin = c - span;
      zmax = c + span;
    }
    const palette = heatPalette(h.palette);
    const colorscale = palette.map((c, i) => [i / (palette.length - 1), c]);
    return {
      data: [
        {
          type: "heatmap",
          x: xLabels,
          y: yLabels,
          z,
          zmin,
          zmax,
          colorscale,
          xgap: 2,
          ygap: 2,
          hovertemplate: `%{x}, %{y}<br><b>%{z:${vf}}</b><extra></extra>`,
          showscale: h.palette !== "binary",
          colorbar: { thickness: 8, len: 0.8, tickfont: { size: 10.5, color: THEME.muted, family: THEME.fontMono }, tickformat: vf, outlinewidth: 0 },
          texttemplate: h.cellLabels !== false ? `%{z:${vf}}` : undefined,
          textfont: { size: 11, color: THEME.ink, family: THEME.fontMono },
        },
      ],
      layout: {
        ...base,
        margin: { l: 56, r: 20, t: 14, b: 44 },
        xaxis: { title: { text: spec.x.label ?? fieldLabel(spec.data, h.xField), font: { size: 11, color: THEME.muted } }, type: "category", tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono }, fixedrange: true },
        yaxis: { title: { text: spec.y.label ?? fieldLabel(spec.data, h.yField), font: { size: 11, color: THEME.muted } }, type: "category", tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono }, fixedrange: true },
      },
    };
  }
  const cats = spec.x.categorical ? categories(spec.data.rows, spec.x.field) : undefined;
  const data = spec.series.map((s) => trace(spec, s, cats));
  const { shapes, annotations } = annotationLayout(spec);
  return {
    data,
    layout: {
      ...base,
      xaxis: axisLayout(spec, "x", !!cats),
      yaxis: axisLayout(spec, "y", false),
      shapes,
      annotations,
      barmode: spec.stack ? "stack" : "group",
      bargap: 0.25,
      hovermode: spec.mark === "scatter" ? "closest" : "x unified",
    },
  };
}

const CONFIG = { displayModeBar: false, responsive: false, staticPlot: false } as const;

export const backend: Backend = {
  id: "plotly",
  label: "Plotly",
  mount(el, spec): RenderHandle {
    const { data, layout } = build(spec);
    void Plotly.newPlot(el, data, layout, CONFIG);
    return {
      update(next) {
        const b = build(next);
        void Plotly.react(el, b.data, b.layout, CONFIG);
      },
      resize() {
        void Plotly.Plots.resize(el);
      },
      dispose() {
        Plotly.purge(el);
      },
    };
  },
};
