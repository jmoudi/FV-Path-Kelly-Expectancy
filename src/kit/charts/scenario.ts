/**
 * A scenario: one section of an explainer. A builder in the app turns parameters into
 * one ScenarioView: the question, the claim, the headline figures, the charts (as
 * renderer-agnostic ChartSpecs), tables, notes, actions and quoted-vs-recomputed rows,
 * plus the views (pages) that split it by responsibility.
 *
 * Generic over the app's parameter object P only for the keys and patches it names.
 * No React, no DOM: builders run in the build worker.
 */
import type { ChartSpec, ColorRole } from "./spec";

/** The erased parameter type kit frames see. `any` (not Record<string, any>) because `keyof P` makes these types contravariant in P. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;

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

export interface Action<P extends object = AnyParams> {
  label: string;
  /** Shown next to the button; say what the click asserts. */
  hint?: string;
  patch: Partial<P>;
  /** A warning the reader should see before clicking. */
  warning?: string;
}

/**
 * One figure the source quotes, next to what the app computes for it. Every quoted
 * figure of a section is listed, including the ones the app does not reproduce;
 * `why` says in one line what the difference is.
 */
export interface SourceFigure {
  label: string;
  quoted: string;
  computed: string;
  /** Whether the recomputed figure matches the quoted one to its rounding. */
  agrees: boolean;
  /** One line on why it does not, when it does not. */
  why?: string;
}

export function quoted(label: string, quotedText: string, computed: string, agrees: boolean, why?: string): SourceFigure {
  return agrees || !why ? { label, quoted: quotedText, computed, agrees } : { label, quoted: quotedText, computed, agrees, why };
}

/** Whether a recomputed figure agrees with a quoted one, within a tolerance. */
export function near(quotedValue: number, computed: number, absTol: number, relTol = 0.05): boolean {
  if (!Number.isFinite(quotedValue) || !Number.isFinite(computed)) return false;
  const diff = Math.abs(quotedValue - computed);
  return diff <= absTol || diff <= relTol * Math.abs(quotedValue);
}

/** The badge of a story that moves the deck: "moves deck: q 2.94% → 2.52%". */
export function movesDeck(label: string, from: string, to: string): string {
  return `moves deck: ${label} ${from} → ${to}`;
}

/**
 * A responsibility: one chart with its context, or a group of charts read together.
 * Each has its own page. The title is the reader's question the page answers.
 */
export interface ResponsibilityView<P extends object = AnyParams> {
  id: string;
  title: string;
  blurb: string;
  /** Chart ids from this section, in reading order. */
  charts: string[];
  /** Indices into the section's kpis. */
  kpis?: number[];
  params?: Extract<keyof P, string>[];
}

export interface ScenarioView<P extends object = AnyParams> {
  id: string;
  number: number;
  /** Functional name: what the section is about. Goes with the number in the eyebrow. */
  title: string;
  /** The one statement the section defends, shown in an aside. */
  claim: string;
  /** The one question the section answers. */
  lede: string;
  /** The first ones are the answer strip; the rest sit behind "more figures". */
  kpis: KPI[];
  /** Full-width charts, stacked. The first is the one the eye should land on. */
  primary: ChartSpec[];
  /** Two-column grid; an odd last chart spans both columns. */
  secondary: ChartSpec[];
  tables: ChartSpec[];
  notes: Note[];
  localParams: Extract<keyof P, string>[];
  actions?: Action<P>[];
  sourceFigures?: SourceFigure[];
  views: ResponsibilityView<P>[];
}

export function allCharts(s: ScenarioView<any>): ChartSpec[] {
  return [...s.primary, ...s.secondary, ...s.tables];
}

export function viewOfChart<P extends object>(s: ScenarioView<P>, chartId: string): ResponsibilityView<P> | undefined {
  return s.views.find((v) => v.charts.includes(chartId));
}
