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

export interface ScenarioView {
  id: string;
  number: number;
  eyebrow: string;
  title: string;
  question: string;
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
}
