/**
 * The Plotly figure (traces and layout) for a spec. Pure: no Plotly import, so it
 * can be built and inspected without a DOM.
 */
import { spanOfPx } from "../bars";
import { formatNumber } from "../format";
import { LABEL_FONT_PX, LEGEND_ROW_PX, resolveChart, type ResolvedAxis, type ResolvedChart } from "../resolve";
import { fieldFormat, fieldLabel, type ChartSpec, type SeriesSpec } from "../spec";
import { THEME, barFill, emphasisOpacity, emphasisWidth, heatPalette, roleColor, withAlpha } from "../theme";
import { BAND_ALPHA, bandPoints, barPoints, categories, d3Format, linePoints, markOf, numberOrNull, seriesName, showLegend } from "./types";

export type PTrace = Record<string, unknown>;
export type PLayout = Record<string, unknown>;

export const MARGIN = { l: 60, r: 20, t: 14, b: 44 };

/** Grid lines run across the value axis only (no plaid); `valueAxis` says whether this is it. */
function axisLayout(ax: ResolvedAxis, vertical: boolean, valueAxis: boolean): PLayout {
  const out: PLayout = {
    title: { text: ax.label, font: { size: 11, color: THEME.muted, family: THEME.fontUi }, standoff: 10 },
    type: ax.categorical ? "category" : ax.scale === "log" ? "log" : "linear",
    gridcolor: valueAxis && ax.grid && !ax.categorical ? THEME.grid : "transparent",
    zerolinecolor: THEME.hairline,
    linecolor: THEME.hairline,
    tickfont: { size: 11, color: THEME.muted, family: THEME.fontMono },
    automargin: true,
    showline: true,
    fixedrange: true,
  };
  if (ax.categorical) {
    out.categoryorder = "array";
    out.categoryarray = ax.labels;
    // Categories read top to bottom when they run up the side.
    if (vertical) out.autorange = "reversed";
  } else {
    out.range = ax.scale === "log" ? [Math.log10(ax.min), Math.log10(ax.max)] : [ax.min, ax.max];
    out.tickmode = "array";
    out.tickvals = ax.ticks;
    out.ticktext = ax.labels;
  }
  return out;
}

/** A category value as Plotly sees it on a category axis: the label text. */
function catText(rc: ResolvedChart, c: unknown): unknown {
  const ax = rc.axes.x;
  if (!ax.categorical) return c;
  const i = ax.categories.findIndex((k) => String(k) === String(c));
  return i >= 0 ? ax.labels[i] : String(c);
}

function lineTrace(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): PTrace {
  const mark = markOf(spec, s);
  const color = roleColor(s.color);
  const op = emphasisOpacity(s.emphasis);
  const width = s.width ?? emphasisWidth(s.emphasis, 2);
  const name = seriesName(spec, s);
  const fmt = fieldFormat(spec.data, s.field);
  const pts = linePoints(spec, rc, s);
  const x = pts.map((p) => (rc.horizontal ? p[0] : catText(rc, p[0])));
  const y = pts.map((p) => (rc.horizontal ? catText(rc, p[1]) : p[1]));
  const values = pts.map((p) => (rc.horizontal ? p[0] : p[1]));
  const base: PTrace = {
    name,
    meta: s.field,
    x,
    y,
    showlegend: s.legend !== false,
    customdata: values.map((v) => (typeof v === "number" ? formatNumber(v, fmt ?? "auto") : "")),
    hovertemplate: `%{customdata}<extra>${name}</extra>`,
    ...(s.tooltip === false ? { hoverinfo: "skip" } : {}),
  };
  const dash = s.dash === "dot" ? "dot" : s.dash ? "dash" : "solid";
  const shape = mark === "step" && (spec.step ?? "after") === "after" ? (rc.horizontal ? "vh" : "hv") : "linear";
  switch (mark) {
    case "scatter":
      return { ...base, type: "scatter", mode: "markers", marker: { color: withAlpha(color, op), size: 9, line: { color: THEME.surface, width: 1.5 } } };
    case "area":
      return { ...base, type: "scatter", mode: "lines", fill: rc.horizontal ? "tozerox" : "tozeroy", fillcolor: withAlpha(color, 0.16 * op), line: { color: withAlpha(color, op), width, dash }, stackgroup: spec.stack ? "one" : undefined };
    default:
      return { ...base, type: "scatter", mode: "lines", connectgaps: false, line: { color: withAlpha(color, op), width, dash, shape } };
  }
}

function barTrace(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): PTrace {
  const op = emphasisOpacity(s.emphasis);
  const name = seriesName(spec, s);
  const fmt = fieldFormat(spec.data, s.field);
  const pts = barPoints(spec, rc, s);
  const categorical = rc.axes.x.categorical;
  const pos = pts.map((p) => (categorical ? catText(rc, p.pos) : p.shifted));
  const len = pts.map((p) => p.top - p.bottom);
  const base = pts.map((p) => p.bottom);
  const colors = s.colors ? pts.map((p) => barFill(s.colors![Math.max(0, rc.axes.x.categories.findIndex((c) => String(c) === String(p.pos))) % s.colors!.length], op)) : barFill(s.color, op);
  const trace: PTrace = {
    name,
    meta: s.field,
    type: "bar",
    orientation: rc.horizontal ? "h" : "v",
    x: rc.horizontal ? len : pos,
    y: rc.horizontal ? pos : len,
    base,
    showlegend: s.legend !== false,
    marker: { color: colors, line: { width: 0 } },
    customdata: pts.map((p) => formatNumber(p.value, fmt ?? "auto")),
    hovertemplate: `%{customdata}<extra>${name}</extra>`,
  };
  // On a numeric axis the plan fixes thickness and position; Plotly takes the width in axis units.
  if (!categorical && rc.bars?.thicknessPx) {
    const axisPx = rc.horizontal ? rc.plot.height : rc.plot.width;
    const ax = rc.axes.x;
    if (ax.scale === "log") {
      // Plotly takes bar widths in data units even on a log axis, so a fixed px
      // thickness is a different width (and an offset from the centre) per bar.
      const half = (rc.bars.thicknessPx / 2) * ((Math.log10(ax.max) - Math.log10(ax.min)) / Math.max(1, axisPx));
      const lo = pts.map((p) => p.shifted * Math.pow(10, -half));
      const hi = pts.map((p) => p.shifted * Math.pow(10, half));
      trace.width = pts.map((_, i) => hi[i] - lo[i]);
      trace.offset = pts.map((p, i) => lo[i] - p.shifted);
    } else trace.width = spanOfPx(rc.bars.thicknessPx, { min: ax.min, max: ax.max, scale: "linear", categorical: false }, axisPx);
  }
  return trace;
}

/** The fill of a band series: each unbroken run as one closed polygon. */
function bandTraces(spec: ChartSpec, rc: ResolvedChart, s: SeriesSpec): PTrace[] {
  const runs = bandPoints(spec, rc, s);
  if (!runs.length) return [];
  const fill = withAlpha(roleColor(s.color), BAND_ALPHA);
  // Draw each run as one closed polygon: upper edge forward, lower edge back.
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  runs.forEach((run, i) => {
    if (i) {
      x.push(null);
      y.push(null);
    }
    for (const [px, py] of run) {
      x.push(px);
      y.push(py);
    }
    x.push(run[0][0]);
    y.push(run[0][1]);
  });
  return [{ type: "scatter", mode: "lines", meta: `${s.field}~band`, name: `${seriesName(spec, s)} (band)`, x, y, fill: "toself", fillcolor: fill, line: { width: 0, color: fill }, hoverinfo: "skip", showlegend: false, connectgaps: false }];
}

function annotationLayout(rc: ResolvedChart): { shapes: PLayout[]; annotations: PLayout[] } {
  const shapes: PLayout[] = [];
  const annotations: PLayout[] = [];
  const { h, v } = rc;
  // Annotations (unlike shapes) take log10 coordinates on a log axis.
  const ax = (val: number) => (h.scale === "log" ? Math.log10(val) : val);
  const ay = (val: number) => (v.scale === "log" ? Math.log10(val) : val);
  for (const a of rc.annotations) {
    const color = roleColor(a.color ?? "muted");
    const dash = a.dash === false ? "solid" : "dot";
    if (a.kind === "vline") shapes.push({ type: "line", xref: "x", yref: "paper", x0: a.x, x1: a.x, y0: 0, y1: 1, line: { color, width: 1, dash } });
    else if (a.kind === "hline") shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y, line: { color, width: 1, dash } });
    else if (a.kind === "point")
      shapes.push({ type: "circle", xref: "x", yref: "y", xsizemode: "pixel", ysizemode: "pixel", xanchor: ax(a.x!), yanchor: ay(a.y!), x0: -5, x1: 5, y0: -5, y1: 5, line: { color: THEME.surface, width: 2 }, fillcolor: roleColor(a.color ?? "ink") });
    else if (a.kind === "xband") shapes.push({ type: "rect", xref: "x", yref: "paper", x0: a.x, x1: a.x2, y0: 0, y1: 1, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
    else if (a.kind === "yband") shapes.push({ type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: a.y, y1: a.y2, fillcolor: withAlpha(color, 0.1), line: { width: 0 } });
    const l = a.label;
    if (!l || !a.text) continue;
    const textColor = a.kind === "xband" ? THEME.muted : roleColor(a.color ?? (a.kind === "point" || a.kind === "label" ? "ink" : "muted"));
    const common = {
      text: a.text,
      showarrow: false,
      font: { size: LABEL_FONT_PX, color: textColor, family: THEME.fontUi },
      xanchor: l.align,
      yanchor: l.baseline,
      xshift: l.dx,
      yshift: -l.dy,
      bgcolor: withAlpha(THEME.page, 0.85),
      borderpad: 1,
    };
    if (a.kind === "xband") {
      const lo = Math.max(Math.min(a.x!, a.x2!), h.min);
      const hi = Math.min(Math.max(a.x!, a.x2!), h.max);
      annotations.push({ ...common, x: h.scale === "log" ? (Math.log10(lo) + Math.log10(hi)) / 2 : (lo + hi) / 2, y: 1, xref: "x", yref: "paper" });
    } else if (l.anchor === "top" || l.anchor === "bottom") annotations.push({ ...common, x: ax(a.x!), xref: "x", y: l.anchor === "top" ? 1 : 0, yref: "paper" });
    else if (l.anchor === "left" || l.anchor === "right") annotations.push({ ...common, x: l.anchor === "left" ? 0 : 1, xref: "paper", y: ay(a.y!), yref: "y" });
    else annotations.push({ ...common, x: ax(a.x!), y: ay(a.y!), xref: "x", yref: "y" });
  }
  return { shapes, annotations };
}

function heatFigure(spec: ChartSpec, base: PLayout): { data: PTrace[]; layout: PLayout } {
  const h = spec.heat!;
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
        meta: "heat",
        x: xLabels,
        y: yLabels,
        z,
        text,
        zmin,
        zmax,
        colorscale,
        xgap: 1,
        ygap: 1,
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

/** Traces and layout for a spec in a container of this width. */
export function buildFigure(spec: ChartSpec, width = 720): { data: PTrace[]; layout: PLayout; resolved: ResolvedChart | null } {
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
  if (spec.kind === "heatmap" && spec.heat) return { ...heatFigure(spec, base), resolved: null };
  const rc = resolveChart(spec, width);
  if (rc.legend) {
    // Entries wrap left to right above the plot; the plot moves down by the legend's rows.
    base.margin = { ...MARGIN, t: MARGIN.t + rc.legend.gridRows * LEGEND_ROW_PX + 4 };
    base.legend = { ...(base.legend as PLayout), x: 0, xanchor: "left", y: 1, yanchor: "bottom", traceorder: "normal" };
  }
  const data: PTrace[] = [];
  // Bands first, so the lines draw over their fill.
  for (const s of spec.series) if (s.band) data.push(...bandTraces(spec, rc, s));
  for (const s of spec.series) data.push(markOf(spec, s) === "bar" ? barTrace(spec, rc, s) : lineTrace(spec, rc, s));
  const { shapes, annotations } = annotationLayout(rc);
  const many = spec.series.length > 8;
  const mode = rc.bars?.mode;
  return {
    data,
    layout: {
      ...base,
      xaxis: axisLayout(rc.h, false, rc.h === rc.axes.y),
      yaxis: axisLayout(rc.v, true, rc.v === rc.axes.y),
      shapes,
      annotations,
      // On a numeric axis the bars arrive already placed, so they overlay; on a
      // category axis Plotly groups them in the same proportions as the others.
      barmode: rc.axes.x.categorical && mode === "group" ? "group" : "overlay",
      bargap: 1 - 0.75,
      bargroupgap: 0,
      hovermode: spec.mark === "scatter" || many ? "closest" : rc.horizontal ? "y unified" : "x unified",
    },
    resolved: rc,
  };
}
