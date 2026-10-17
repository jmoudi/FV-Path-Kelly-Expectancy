/**
 * Renderer-agnostic chart specification.
 *
 * Scenario view-models emit these. Backends (ECharts, Plotly, Vega-Lite, HTML table)
 * consume them. The authoring layer edits them. Nothing here imports a chart library
 * or the model.
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
  /** [min, max]; null leaves one end to the data. */
  domain?: [number | null, number | null];
  format?: NumberFormat;
  grid?: boolean;
  /** Treat the field as categories (bars on names, heatmap axes). */
  categorical?: boolean;
  /** Linear y axes start at zero unless told otherwise. */
  zero?: boolean;
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
  /** Per-row colours for bar marks on a categorical axis (one per category). */
  colors?: ColorRole[];
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
  /** Optional column with a custom label per cell (overrides the formatted value). */
  labelField?: string;
  /** Outline one cell. */
  highlight?: { x: Cell; y: Cell; text?: string };
}

export interface ColumnSpec {
  field: string;
  label?: string;
  format?: NumberFormat;
  emphasize?: boolean;
  /** Colour the cell text by role. */
  color?: ColorRole;
}

/**
 * A user story: one click re-defines the chart (and may move deck parameters).
 * A story's patch REPLACES the chart's edits rather than merging into them, so
 * stories never stack into a broken state.
 */
export interface Story {
  id: string;
  label: string;
  /** One sentence on what the reader is asking. */
  narrative?: string;
  patch?: SpecOverride;
  /** Deck parameters the story sets, by key. */
  params?: Record<string, number | string>;
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
  /** Replace the chart's annotations. */
  annotations?: Annotation[];
  /** Add y columns from the data table as extra series. */
  extraSeries?: { field: string; color: ColorRole }[];
  /** The story that produced this override, if any. */
  story?: string;
}

const BACKENDS: BackendId[] = ["echarts", "plotly", "vega", "table"];
const MARKS: MarkType[] = ["line", "step", "area", "bar", "scatter"];
const EMPHASES: Emphasis[] = ["strong", "normal", "muted"];
const ROLES: ColorRole[] = ["a", "b", "c", "loss", "good", "ink", "muted", "ramp1", "ramp2", "ramp3", "ramp4"];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sanitizeAxis(v: unknown, allowField: boolean): SpecOverride["x"] | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: NonNullable<SpecOverride["x"]> = {};
  if (o.scale === "linear" || o.scale === "log") out.scale = o.scale;
  if (Array.isArray(o.domain) && o.domain.length === 2) out.domain = [num(o.domain[0]), num(o.domain[1])];
  if (typeof o.label === "string") out.label = o.label;
  if (typeof o.grid === "boolean") out.grid = o.grid;
  if (allowField && typeof o.field === "string") out.field = o.field;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeAnnotation(v: unknown): Annotation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kinds: Annotation["kind"][] = ["vline", "hline", "point", "label", "xband", "yband"];
  if (!kinds.includes(o.kind as Annotation["kind"])) return null;
  const a: Annotation = { kind: o.kind as Annotation["kind"] };
  for (const k of ["x", "y", "x2", "y2"] as const) {
    const n = num(o[k]);
    if (n != null) a[k] = n;
  }
  if (typeof o.text === "string") a.text = o.text;
  if (ROLES.includes(o.color as ColorRole)) a.color = o.color as ColorRole;
  if (typeof o.dash === "boolean") a.dash = o.dash;
  if (o.at === "start" || o.at === "end") a.at = o.at;
  return a;
}

/** Validate an override coming from storage or an import. Drops anything malformed. */
export function sanitizeOverride(input: unknown): SpecOverride | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const out: SpecOverride = {};
  if (BACKENDS.includes(o.backend as BackendId)) out.backend = o.backend as BackendId;
  if (MARKS.includes(o.mark as MarkType)) out.mark = o.mark as MarkType;
  const x = sanitizeAxis(o.x, true);
  if (x) out.x = x;
  const y = sanitizeAxis(o.y, false);
  if (y) out.y = y as SpecOverride["y"];
  const h = num(o.height);
  if (h != null && h >= 80 && h <= 1200) out.height = h;
  if (typeof o.legend === "boolean") out.legend = o.legend;
  if (Array.isArray(o.hiddenSeries)) out.hiddenSeries = o.hiddenSeries.filter((s): s is string => typeof s === "string");
  if (o.seriesEmphasis && typeof o.seriesEmphasis === "object") {
    const m: Record<string, Emphasis> = {};
    for (const [k, v] of Object.entries(o.seriesEmphasis as Record<string, unknown>)) if (EMPHASES.includes(v as Emphasis)) m[k] = v as Emphasis;
    if (Object.keys(m).length) out.seriesEmphasis = m;
  }
  if (o.seriesMark && typeof o.seriesMark === "object") {
    const m: Record<string, MarkType> = {};
    for (const [k, v] of Object.entries(o.seriesMark as Record<string, unknown>)) if (MARKS.includes(v as MarkType)) m[k] = v as MarkType;
    if (Object.keys(m).length) out.seriesMark = m;
  }
  if (typeof o.hideAnnotations === "boolean") out.hideAnnotations = o.hideAnnotations;
  if (Array.isArray(o.annotations)) out.annotations = o.annotations.map(sanitizeAnnotation).filter((a): a is Annotation => !!a);
  if (Array.isArray(o.extraSeries)) {
    out.extraSeries = o.extraSeries
      .filter((e): e is { field: string; color: ColorRole } => !!e && typeof e === "object" && typeof (e as { field?: unknown }).field === "string" && ROLES.includes((e as { color?: ColorRole }).color as ColorRole))
      .map((e) => ({ field: e.field, color: e.color }));
  }
  if (typeof o.story === "string") out.story = o.story;
  return Object.keys(out).length ? out : null;
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
  const x = { ...spec.x, ...(o.x ?? {}) };
  if (o.x?.field && o.x.field !== spec.x.field && !o.x.label) x.label = undefined;
  const y = { ...spec.y, ...(o.y ?? {}) };
  // A log scale cannot start at or below zero.
  for (const ax of [x, y]) {
    if (ax.scale === "log" && ax.domain && ax.domain[0] != null && ax.domain[0] <= 0) ax.domain = [null, ax.domain[1]];
  }
  return {
    ...spec,
    backend: o.backend ?? spec.backend,
    mark: o.mark ?? spec.mark,
    x,
    y,
    height: o.height ?? spec.height,
    legend: o.legend ?? spec.legend,
    series,
    annotations: o.hideAnnotations ? [] : (o.annotations ?? spec.annotations),
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

/** A table spec: the xy fields are not used but the type wants them. */
export function tableSpec(init: Pick<ChartSpec, "id" | "title" | "data" | "columns"> & Partial<Pick<ChartSpec, "caption" | "highlightRow" | "subtitle">>): ChartSpec {
  const first = init.data.fields[0]?.name ?? "";
  return { kind: "table", mark: "line", x: { field: first }, y: { field: first }, series: [], ...init };
}
