/**
 * Sweep presets: a saved way of driving an input automatically, so you can watch a
 * payoff change instead of dragging a slider up and down. A preset is generic (it
 * speaks in fractions of whatever range it is linked to) and is linked to inputs
 * separately, so one preset can later drive several inputs at once.
 */

export type SweepKind = "loop" | "pingpong" | "scenarios";

export interface SweepRange {
  /** full: the input's whole range. fraction: a sub-range as fractions of it. absolute: values in the input's own units. */
  mode: "full" | "fraction" | "absolute";
  lo?: number;
  hi?: number;
}

export interface SweepScenario {
  /** Where the input sits, as a fraction of the resolved range (0..1), or absolute when the range is absolute. */
  at: number;
  /** How long it holds there. */
  holdMs: number;
}

export interface SweepPreset {
  id: string;
  name: string;
  kind: SweepKind;
  range: SweepRange;
  /** loop / pingpong: the change per interval, as a fraction of the resolved range. */
  stepFraction: number;
  /** loop / pingpong: how often it changes. */
  intervalMs: number;
  /** loop / pingpong: glide between steps instead of jumping. */
  smooth: boolean;
  /** scenarios: the spots and their hold times. */
  scenarios: SweepScenario[];
}

export interface SweepRun {
  key: string;
  presetId: string;
  /** Milliseconds of sweep time already elapsed when (re)started. */
  elapsedMs: number;
  /** performance.now() at the last start; null while paused. */
  startedAt: number | null;
}

export const DEFAULT_PRESETS: SweepPreset[] = [
  { id: "loop-full", name: "Loop the whole range", kind: "loop", range: { mode: "full" }, stepFraction: 0.02, intervalMs: 300, smooth: true, scenarios: [] },
  { id: "bounce-mid", name: "Oscillate in the middle band", kind: "pingpong", range: { mode: "fraction", lo: 0.3, hi: 0.7 }, stepFraction: 0.02, intervalMs: 250, smooth: true, scenarios: [] },
  {
    id: "three-spots",
    name: "Three spots, two seconds each",
    kind: "scenarios",
    range: { mode: "full" },
    stepFraction: 0.1,
    intervalMs: 1000,
    smooth: false,
    scenarios: [
      { at: 0.25, holdMs: 2000 },
      { at: 0.5, holdMs: 2000 },
      { at: 0.75, holdMs: 2000 },
    ],
  },
];
