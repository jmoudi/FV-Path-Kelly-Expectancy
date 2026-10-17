import type { ChartSpec, ColorRole } from "../charts/spec";
import type { Params } from "../model/params";

export interface KPI {
  label: string;
  value: string;
  sub?: string;
  color?: ColorRole;
  help?: string;
}

export interface Note {
  title: string;
  /** Paragraphs separated by blank lines. A line starting with "- " is a bullet. */
  body: string;
}

export interface Action {
  label: string;
  /** Shown next to the button; say what the click asserts. */
  hint?: string;
  patch: Partial<Params>;
  /** A warning the reader should see before clicking. */
  warning?: string;
}

export interface SourceFigure {
  label: string;
  quoted: string;
  computed: string;
}

/**
 * A responsibility: one chart with its context, or a group of charts a finance
 * desk would read together. Each has its own page.
 */
export interface ResponsibilityView {
  id: string;
  title: string;
  blurb: string;
  /** Chart ids from this section, in reading order. */
  charts: string[];
  /** Indices into the section's kpis. */
  kpis?: number[];
  params?: (keyof Params)[];
}

export interface ScenarioView {
  id: string;
  number: number;
  /** Functional name: what the section is about. */
  title: string;
  /** The one statement the section defends, shown in an inline box. */
  claim: string;
  /** One sentence on what the section shows. */
  lede: string;
  /** The first two are shown; the rest sit behind "more figures". */
  kpis: KPI[];
  /** Full-width charts, stacked. The first is the one the eye should land on. */
  primary: ChartSpec[];
  /** Two-column grid; an odd last chart spans both columns. */
  secondary: ChartSpec[];
  tables: ChartSpec[];
  notes: Note[];
  localParams: (keyof Params)[];
  actions?: Action[];
  sourceFigures?: SourceFigure[];
  views: ResponsibilityView[];
}

export function allCharts(s: ScenarioView): ChartSpec[] {
  return [...s.primary, ...s.secondary, ...s.tables];
}

export function viewOfChart(s: ScenarioView, chartId: string): ResponsibilityView | undefined {
  return s.views.find((v) => v.charts.includes(chartId));
}
