/**
 * Sweep presets: a saved way of driving an input automatically, so you can watch a
 * payoff change instead of dragging a slider up and down.
 *
 * Generic: nothing here knows the app's parameters. A preset speaks the input's own
 * units (a step is a delta in the input's units, or a share of the range it sweeps;
 * a range is absolute values, a share of the schema range, ± around the value the
 * input had when the run started, or the span between two named anchors), and it is
 * linked to inputs separately, so one preset drives any input.
 */

export type SweepKind = "loop" | "pingpong" | "scenarios";

/** Anchors every input has: its schema bounds, its default, and the value it had when the run started. */
export type BuiltinAnchor = "min" | "current" | "max" | "default";

export const BUILTIN_ANCHORS: { id: BuiltinAnchor; label: string }[] = [
  { id: "min", label: "min" },
  { id: "current", label: "current" },
  { id: "max", label: "max" },
  { id: "default", label: "default" },
];

export function isBuiltinAnchor(id: string): id is BuiltinAnchor {
  return id === "min" || id === "current" || id === "max" || id === "default";
}

/**
 * A named point an input's schema declares ("break-even", "robust"). The schema
 * carries the definition as data; the app computes the value.
 */
export interface AnchorDef {
  id: string;
  label: string;
  help?: string;
}

/** A reference to an anchor, with the built-in anchor used on inputs that do not declare it. */
export interface AnchorRef {
  id: string;
  fallback: BuiltinAnchor;
}

export type SweepRange =
  /** The input's whole schema range. */
  | { mode: "full" }
  /** A sub-range as shares of the schema range (0..1). */
  | { mode: "fraction"; lo: number; hi: number }
  /** Values in the input's own units. */
  | { mode: "absolute"; lo: number; hi: number }
  /** ± `half` around the value the input had when the run started; `half` is a share of the schema range or a value in the input's units. */
  | { mode: "around"; half: number; unit: "share" | "units" }
  /** Between two named anchors. */
  | { mode: "anchors"; lo: AnchorRef; hi: AnchorRef };

export type SweepRangeMode = SweepRange["mode"];

/** loop / pingpong: the change per step, a delta in the input's units or a share of the resolved range. */
export interface SweepStep {
  size: number;
  unit: "units" | "share";
}

export interface SweepSpot {
  /** A named anchor; when set it wins over `at`. */
  anchor?: AnchorRef;
  /** A value in the input's units when the range is absolute, otherwise a share of the resolved range (0..1). */
  at: number;
  /** How long the spot stays on screen. */
  holdMs: number;
}

export interface SweepPreset {
  id: string;
  name: string;
  kind: SweepKind;
  range: SweepRange;
  /** loop / pingpong: the change per step. */
  step: SweepStep;
  /** loop / pingpong: the least time each value stays on screen. */
  intervalMs: number;
  /** scenarios: the spots and how long each holds. */
  scenarios: SweepSpot[];
}

/**
 * A preset resolved for one input when a run starts: the values one cycle visits,
 * in order, and how long each holds. Frozen for the run, so anchors that move with
 * the swept input (the "current" value) do not move the plan under it.
 */
export interface SweepPlan {
  kind: SweepKind;
  /** loop: lo → hi. pingpong: lo → hi → back, without repeating the ends. scenarios: the spots. */
  values: number[];
  /** Hold time of each value, ms. */
  holds: number[];
  /** "step 7 / 18": the 1-based rank of each value among the distinct values, and how many there are. */
  ranks: number[];
  count: number;
  /** The resolved range: the band on the slider track. */
  lo: number;
  hi: number;
  /** scenarios: the spot values, drawn as marks on the band. */
  marks: number[];
  /** The step in the input's units (loop / pingpong); 0 for scenarios. */
  step: number;
  /**
   * Phase offset: the index the starting value counts as. A loop or ping-pong that
   * starts between two values counts as the lower one and moves on from the value it
   * found; −1 when it starts below the range. A spot run starts at the nearest spot.
   */
  start: number;
  /** The value to commit when the run starts, when the start index is not where the input already sits (scenarios only). */
  jumpTo: number | null;
}

export interface SweepRun {
  key: string;
  presetId: string;
  /** The input's value before the run started: what "↺ before sweep", Ctrl+Z and a reload put back. */
  origin: number;
  /** performance.now() when the run last started or resumed; null while paused. */
  startedAt: number | null;
  /** The plan, frozen when the run started; null when the input could not be planned. */
  plan: SweepPlan | null;
  /** Index into plan.values of the value on screen (−1 before the first). */
  index: number;
}

/** The part of a run that is saved, so a reload mid-run puts the input back where it was. */
export interface PersistedRun {
  key: string;
  presetId: string;
  origin: number;
}

/** The three presets a fresh state starts with. */
export const DEFAULT_PRESETS: SweepPreset[] = [
  {
    id: "optimistic-to-break-even",
    name: "Optimistic to break-even",
    kind: "loop",
    range: { mode: "anchors", lo: { id: "optimistic", fallback: "min" }, hi: { id: "break-even", fallback: "max" } },
    step: { size: 0.0005, unit: "units" },
    intervalMs: 400,
    scenarios: [],
  },
  {
    id: "around-current",
    name: "Around the current value",
    kind: "pingpong",
    range: { mode: "around", half: 0.2, unit: "share" },
    step: { size: 0.05, unit: "share" },
    intervalMs: 300,
    scenarios: [],
  },
  {
    id: "three-spots",
    name: "Three spots",
    kind: "scenarios",
    range: { mode: "full" },
    step: { size: 0.1, unit: "share" },
    intervalMs: 1000,
    scenarios: [
      { anchor: { id: "optimistic", fallback: "min" }, at: 0, holdMs: 2000 },
      { anchor: { id: "deck", fallback: "current" }, at: 0.5, holdMs: 2000 },
      { anchor: { id: "break-even", fallback: "max" }, at: 1, holdMs: 2000 },
    ],
  },
];

/** Ids the presets had before they spoke the input's units, and the preset that replaces each. */
export const LEGACY_PRESET_IDS: Record<string, string> = {
  "loop-full": "optimistic-to-break-even",
  "bounce-mid": "around-current",
  "three-spots": "three-spots",
};

export function clonePreset(p: SweepPreset): SweepPreset {
  return {
    ...p,
    range: p.range.mode === "anchors" ? { ...p.range, lo: { ...p.range.lo }, hi: { ...p.range.hi } } : { ...p.range },
    step: { ...p.step },
    scenarios: p.scenarios.map((s) => ({ ...s, ...(s.anchor ? { anchor: { ...s.anchor } } : {}) })),
  };
}

export function defaultPresets(): SweepPreset[] {
  return DEFAULT_PRESETS.map(clonePreset);
}
