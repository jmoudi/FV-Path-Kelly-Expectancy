import Plotly from "plotly.js-dist-min";
import { formatNumber } from "../format";
import { resolveAxes, type ResolvedAxis } from "../resolve";
import { fieldFormat, fieldLabel, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, emphasisOpacity, emphasisWidth, heatPalette, roleColor, withAlpha } from "../theme";
import { categories, d3Format, numberOrNull, showLegend, type Backend, type RenderHandle } from "./types";

type PTrace = Record<string, unknown>;
type PLayout = Record<string, unknown>;

const MARGIN = { l: 60, r: 20, t: 14, b: 44 };

function axisLayout(ax: ResolvedAxis, cat: boolean): PLayout {
  const out: PLayout = {
    title: { text: ax.label, font: { size: 11, color: THEME.muted, family: THEME.fontUi }, standoff: 10 },
    type: cat ? "category" : ax.scale === "log" ? "log" : "linear",
    gridcolor: ax.grid ? THEME.grid : "transparent",
    zerolinecolor: THEME.hairline,
    linecolor: THEME.hairline,
    tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono },
    automargin: true,
    showline: true,
    fixedrange: true,
  };
  if (!cat) {
    out.range = ax.scale === "log" ? [Math.log10(ax.min), Math.log10(ax.max)] : [ax.min, ax.max];
    out.tickmode = "array";
    out.tickvals = ax.ticks;
    out.ticktext = ax.labels;
  }
  return out;
}

function trace(spec: ChartSpec, s: SeriesSpec, barWidth: number | undefined, cats?: (string | number)[]): PTrace {
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
      return {
        ...base,
        type: "bar",
        marker: { color: s.colors && cats ? cats.map((_, i) => withAlpha(roleColor(s.colors![i % s.colors!.length]), op)) : withAlpha(color, op), line: { width: 0 } },
        width: cats ? undefined : barWidth,
      };
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

function annotationLayout(spec: ChartSpec, x: ResolvedAxis, y: ResolvedAxis): { shapes: PLayout[]; annotations: PLayout[] } {
  const shapes: PLayout[] = [];
  const annotations: PLayout[] = [];
  const xLog = x.scale === "log";
  const yLog = y.scale === "log";
  // Plotly annotations (unlike shapes) take log10 coordinates on a log axis; a value
  // at or below zero has no place there and sits at the axis start instead.
  const ax = (v: number) => (xLog ? Math.log10(Math.max(v, x.min)) : v);
  const ay = (v: number) => (yLog ? Math.log10(Math.max(v, y.min)) : v);
  for (const a of spec.annotations ?? []) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? "solid" : "dot";
    const font = { size: 10.5, color, family: THEME.fontUi };
    if (a.kind === "vline" && a.x != null) {
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: a.x, x1: a.x, y0: 0, y1: 1, line: { color, width: 1.2, dash } });
      if (a.text)
        annotations.push({
          x: ax(a.x),
          y: a.at === "start" ? 0.02 : 0.98,
          xref: "x",
          yref: "paper",
          text: a.text,
          showarrow: false,
          font,
          xanchor: "left",
          yanchor: a.at === "start" ? "bottom" : "top",
          xshift: 4,
          bgcolor: withAlpha(THEME.surface, 0.82),
        });
    } else if (a.kind === "hline" && a.y != null) {
      shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y, line: { color, width: 1.2, dash } });
      if (a.text)
        annotations.push({
          x: a.at === "start" ? 0.02 : 0.98,
          y: ay(a.y),
          xref: "paper",
          yref: "y",
          text: a.text,
          showarrow: false,
          font,
          xanchor: a.at === "start" ? "left" : "right",
          yanchor: "bottom",
          yshift: 3,
          bgcolor: withAlpha(THEME.surface, 0.82),
        });
    } else if ((a.kind === "point" || a.kind === "label") && a.x != null && a.y != null) {
      if (a.kind === "point")
        shapes.push({
          type: "circle",
          xref: "x",
          yref: "y",
          xsizemode: "pixel",
          ysizemode: "pixel",
          xanchor: ax(a.x),
          yanchor: ay(a.y),
          x0: -5,
          x1: 5,
          y0: -5,
          y1: 5,
          line: { color: THEME.surface, width: 2 },
          fillcolor: color,
        });
      if (a.text)
        annotations.push({
          x: ax(a.x),
          y: ay(a.y),
          text: a.text,
          showarrow: a.kind === "point",
          arrowcolor: color,
          arrowhead: 0,
          ax: a.at === "start" ? -40 : 40,
          ay: -22,
          font: { ...font, color: roleColor(a.color ?? "ink") },
          bgcolor: withAlpha(THEME.surface, 0.82),
        });
    } else if (a.kind === "xband" && a.x != null && a.x2 != null) {
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: a.x, x1: a.x2, y0: 0, y1: 1, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
      if (a.text) annotations.push({ x: xLog ? (Math.log10(a.x) + Math.log10(a.x2)) / 2 : (a.x + a.x2) / 2, y: 0.98, xref: "x", yref: "paper", text: a.text, showarrow: false, font: { ...font, color: THEME.muted }, yanchor: "top" });
    } else if (a.kind === "yband" && a.y != null && a.y2 != null) {
      shapes.push({ type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y2, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
    }
  }
  return { shapes, annotations };
}

function build(spec: ChartSpec, widthPx: number): { data: PTrace[]; layout: PLayout } {
  const legend = showLegend(spec);
  const base: PLayout = {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: THEME.fontUi, color: THEME.ink2, size: 11 },
    margin: { ...MARGIN, t: legend ? 34 : MARGIN.t },
    showlegend: legend,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", font: { size: 11, color: THEME.ink2 }, bgcolor: "transparent" },
    hoverlabel: { bgcolor: THEME.raised, bordercolor: THEME.hairline, font: { color: THEME.ink, size: 12, family: THEME.fontUi } },
    autosize: true,
  };
  if (spec.kind === "heatmap" && spec.heat) {
    const h = spec.heat;
    const xs = categories(spec.data.rows, h.xField);
    const ys = categories(spec.data.rows, h.yField);
    const xFmt = fieldFormat(spec.data, h.xField);
    const yFmt = fieldFormat(spec.data, h.yField);
    const catLabel = (c: string | number, fmt?: typeof xFmt) => (typeof c === "number" ? formatNumber(c, fmt ?? "auto") : String(c));
    const xLabels = xs.map((c) => catLabel(c, xFmt));
    const yLabels = ys.map((c) => catLabel(c, yFmt));
    const z: (number | null)[][] = ys.map(() => xs.map(() => null));
    const text: string[][] = ys.map(() => xs.map(() => ""));
    const vf = h.format ?? fieldFormat(spec.data, h.valueField) ?? "auto";
    let min = Infinity;
    let max = -Infinity;
    let hl: { xi: number; yi: number } | null = null;
    const same = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
    for (const r of spec.data.rows) {
      const v = numberOrNull(r[h.valueField]);
      const yi = ys.indexOf(r[h.yField] as string | number);
      const xi = xs.indexOf(r[h.xField] as string | number);
      z[yi][xi] = v;
      const custom = h.labelField ? r[h.labelField] : null;
      text[yi][xi] = custom != null ? String(custom) : v == null ? "" : formatNumber(v, vf);
      if (h.highlight && same(r[h.xField], h.highlight.x) && same(r[h.yField], h.highlight.y)) hl = { xi, yi };
      if (v != null) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    let zmin = min;
    let zmax = max;
    if (h.palette === "diverging") {
      const c = h.center ?? 0;
      const span = Math.max(Math.abs(max - c), Math.abs(min - c));
      zmin = c - span;
      zmax = c + span;
    } else if (h.palette === "binary") {
      zmin = 0;
      zmax = 1;
    }
    const palette = heatPalette(h.palette);
    const colorscale = palette.map((c, i) => [i / (palette.length - 1), c]);
    const shapes: PLayout[] = [];
    if (hl) {
      const { xi, yi } = hl;
      shapes.push({ type: "rect", xref: "x", yref: "y", x0: xi - 0.5, x1: xi + 0.5, y0: yi - 0.5, y1: yi + 0.5, line: { color: THEME.ink, width: 2.5 }, fillcolor: "transparent" });
    }
    return {
      data: [
        {
          type: "heatmap",
          x: xLabels,
          y: yLabels,
          z,
          text,
          zmin,
          zmax,
          colorscale,
          xgap: 2,
          ygap: 2,
          hovertemplate: `%{x}, %{y}<br><b>%{text}</b><extra></extra>`,
          showscale: h.palette !== "binary",
          colorbar: { thickness: 8, len: 0.8, tickfont: { size: 10.5, color: THEME.muted, family: THEME.fontMono }, tickformat: d3Format(vf) ?? ".3~g", outlinewidth: 0 },
          texttemplate: h.cellLabels !== false ? "%{text}" : undefined,
          textfont: { size: 11, color: THEME.ink, family: THEME.fontMono },
        },
      ],
      layout: {
        ...base,
        margin: MARGIN,
        shapes,
        xaxis: { title: { text: spec.x.label ?? fieldLabel(spec.data, h.xField), font: { size: 11, color: THEME.muted } }, type: "category", tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono }, fixedrange: true },
        yaxis: { title: { text: spec.y.label ?? fieldLabel(spec.data, h.yField), font: { size: 11, color: THEME.muted } }, type: "category", tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono }, fixedrange: true },
      },
    };
  }
  const axes = resolveAxes(spec);
  const cats = axes.x.categorical ? categories(spec.data.rows, spec.x.field) : undefined;
  // Bar width hint is in px; Plotly wants data units.
  const plotPx = Math.max(200, widthPx - MARGIN.l - MARGIN.r);
  const barWidth = spec.barWidthPx && !cats && axes.x.scale === "linear" ? ((axes.x.max - axes.x.min) * spec.barWidthPx) / plotPx : undefined;
  const data = spec.series.map((s) => trace(spec, s, barWidth, cats));
  const { shapes, annotations } = annotationLayout(spec, axes.x, axes.y);
  const many = spec.series.length > 8;
  return {
    data,
    layout: {
      ...base,
      xaxis: axisLayout(axes.x, !!cats),
      yaxis: axisLayout(axes.y, false),
      shapes,
      annotations,
      barmode: spec.stack ? "stack" : "group",
      bargap: 0.25,
      hovermode: spec.mark === "scatter" || many ? "closest" : "x unified",
    },
  };
}

const CONFIG = { displayModeBar: false, responsive: false, staticPlot: false } as const;

export const backend: Backend = {
  id: "plotly",
  label: "Plotly",
  mount(el, spec): RenderHandle {
    const { data, layout } = build(spec, el.clientWidth || 700);
    void Plotly.newPlot(el, data, layout, CONFIG);
    return {
      update(next) {
        const b = build(next, el.clientWidth || 700);
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
