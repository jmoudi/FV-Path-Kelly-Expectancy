/**
 * Renderer-agnostic chart specification.
 *
 * Scenario view-models emit these. Backends (ECharts, Plotly, Vega-Lite, HTML table)
 * consume them. The authoring layer edits them. Nothing here imports a chart library.
 */

export type BackendId = "echarts" | "plotly" | "vega" | "table";

export type ColorRole =
  | "a"
  | "b"
  | "c"
  | "loss"
  | "good"
  | "ink"
  | "muted"
  | "ramp1"
  | "ramp2"
  | "ramp3"
  | "ramp4";

export type MarkType = "line" | "step" | "area" | "bar" | "scatter";
export type ScaleType = "linear" | "log";
export type NumberFormat = "pct" | "pct1" | "pct2" | "pct3" | "x" | "x2" | "int" | "num" | "sci" | "auto";
export type Emphasis = "strong" | "normal" | "muted";

export type Cell = number | string | null;
export type Row = Record<string, Cell>;

export interface Field {
  name: string;
  label: string;
  format?: NumberFormat;
}

export interface DataTable {
  fields: Field[];
  rows: Row[];
}

export interface AxisSpec {
  field: string;
  label?: string;
  scale?: ScaleType;
  /** [min, max]; null leaves one end automatic. */
  domain?: [number | null, number | null];
  format?: NumberFormat;
  grid?: boolean;
  /** Treat the field as categories (bars on names, heatmap axes). */
  categorical?: boolean;
}

export interface SeriesSpec {
  /** The y column. */
  field: string;
  label?: string;
  color: ColorRole;
  mark?: MarkType;
  emphasis?: Emphasis;
  dash?: boolean;
  /** Optional separate x column for this series. */
  xField?: string;
  /** Hide from legend (e.g. the 40 paths of a fan). */
  legend?: boolean;
  /** Line width hint in px. */
  width?: number;
}

export interface Annotation {
  kind: "vline" | "hline" | "point" | "label" | "xband" | "yband";
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: ColorRole;
  dash?: boolean;
  /** Where to put the text along the line. */
  at?: "start" | "end";
}

export interface HeatSpec {
  xField: string;
  yField: string;
  valueField: string;
  palette: "diverging" | "sequential" | "binary";
  center?: number;
  format?: NumberFormat;
  /** Label every cell. */
  cellLabels?: boolean;
}

export interface ColumnSpec {
  field: string;
  label?: string;
  format?: NumberFormat;
  emphasize?: boolean;
  /** Colour the cell text by role. */
  color?: ColorRole;
}

export interface Story {
  id: string;
  label: string;
  patch: SpecOverride;
}

export interface ChartSpec {
  id: string;
  title: string;
  subtitle?: string;
  kind: "xy" | "heatmap" | "table";
  data: DataTable;
  mark: MarkType;
  x: AxisSpec;
  y: AxisSpec;
  series: SeriesSpec[];
  annotations?: Annotation[];
  /** Plot height in px (the backend adds its own axis band). */
  height?: number;
  legend?: boolean;
  /** Bar width hint for numeric-x bars, in px. */
  barWidthPx?: number;
  stack?: boolean;
  heat?: HeatSpec;
  columns?: ColumnSpec[];
  caption?: string;
  /** Per-chart backend override. */
  backend?: BackendId;
  stories?: Story[];
  /** Highlight rows in a table where this field equals the value. */
  highlightRow?: { field: string; value: Cell };
}

/** What the authoring layer can change. Stored separately from the base spec. */
export interface SpecOverride {
  backend?: BackendId;
  mark?: MarkType;
  x?: Partial<Pick<AxisSpec, "scale" | "domain" | "label" | "grid" | "field">>;
  y?: Partial<Pick<AxisSpec, "scale" | "domain" | "label" | "grid">>;
  height?: number;
  legend?: boolean;
  hiddenSeries?: string[];
  seriesEmphasis?: Record<string, Emphasis>;
  seriesMark?: Record<string, MarkType>;
  hideAnnotations?: boolean;
  /** Add y columns from the data table as extra series. */
  extraSeries?: { field: string; color: ColorRole }[];
}

export function applyOverride(spec: ChartSpec, o?: SpecOverride): ChartSpec {
  if (!o) return spec;
  const hidden = new Set(o.hiddenSeries ?? []);
  let series: SeriesSpec[] = spec.series
    .filter((s) => !hidden.has(s.field))
    .map((s) => ({
      ...s,
      emphasis: o.seriesEmphasis?.[s.field] ?? s.emphasis,
      mark: o.seriesMark?.[s.field] ?? s.mark,
    }));
  if (o.extraSeries) {
    const have = new Set(series.map((s) => s.field));
    for (const e of o.extraSeries) {
      if (have.has(e.field) || hidden.has(e.field)) continue;
      const f = spec.data.fields.find((x) => x.name === e.field);
      if (f) series = [...series, { field: e.field, label: f.label, color: e.color }];
    }
  }
  return {
    ...spec,
    backend: o.backend ?? spec.backend,
    mark: o.mark ?? spec.mark,
    x: { ...spec.x, ...(o.x ?? {}) },
    y: { ...spec.y, ...(o.y ?? {}) },
    height: o.height ?? spec.height,
    legend: o.legend ?? spec.legend,
    series,
    annotations: o.hideAnnotations ? [] : spec.annotations,
  };
}

export function fieldLabel(data: DataTable, name: string): string {
  return data.fields.find((f) => f.name === name)?.label ?? name;
}

export function fieldFormat(data: DataTable, name: string): NumberFormat | undefined {
  return data.fields.find((f) => f.name === name)?.format;
}

/** Numeric columns of a table (for the authoring layer's field pickers). */
export function numericFields(data: DataTable): Field[] {
  return data.fields.filter((f) => data.rows.some((r) => typeof r[f.name] === "number"));
}

/** CSV export of a data table. */
export function toCsv(data: DataTable): string {
  const esc = (v: Cell) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = data.fields.map((f) => esc(f.label)).join(",");
  const body = data.rows.map((r) => data.fields.map((f) => esc(r[f.name])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Shorthand builders used by the view-models. */
export function table(fields: Field[], rows: Row[]): DataTable {
  return { fields, rows };
}
export const f = (name: string, label: string, format?: NumberFormat): Field => ({ name, label, format });
