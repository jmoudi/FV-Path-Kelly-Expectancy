/**
 * Pure sweep arithmetic: resolve a preset for one input (its bounds, its anchors,
 * the value it had when the run started) into a plan of values and hold times, and
 * describe a preset in the input's own units. No timers and no DOM; the frame-locked
 * clock lives in src/kit/sweeps/runner.ts and the app owns the loop.
 */
import { BUILTIN_ANCHORS, isBuiltinAnchor, type AnchorDef, type AnchorRef, type BuiltinAnchor, type SweepPlan, type SweepPreset, type SweepRange } from "./types";

/** At most this many values in one cycle, whatever the step. */
export const MAX_VALUES = 1000;
/** The shortest hold a value can have, ms. */
export const MIN_HOLD_MS = 50;

export interface SweepContext {
  min: number;
  max: number;
  /** The input's grid step (its arrow-key step). */
  step: number;
  /** Whole numbers only. */
  integer?: boolean;
  /** The schema default (the "default" anchor). */
  default?: number;
  /** The value the input had before the run: the "current" anchor and the centre of "around". */
  origin: number;
  /** Where the input sits now: the phase offset. Defaults to origin. */
  current?: number;
  /** The named anchors the input declares. */
  anchors?: AnchorDef[];
  /** The value of a declared anchor now; undefined when it cannot be computed. */
  resolve?: (id: string) => number | undefined;
}

function eps(ctx: SweepContext): number {
  return 1e-9 * Math.max(1, Math.abs(ctx.max - ctx.min));
}

function clamp(v: number, ctx: SweepContext): number {
  return Math.min(ctx.max, Math.max(ctx.min, v));
}

/**
 * A computed lattice value: whole numbers for integer inputs, twelve significant
 * digits otherwise (no float dust from lo + i·s).
 */
export function roundValue(v: number, ctx: SweepContext): number {
  const r = ctx.integer ? Math.round(v) : Number(v.toPrecision(12));
  return clamp(r, ctx);
}

/** A given value (an anchor, a range end): exact, only clamped (and whole for integer inputs). */
function exactValue(v: number, ctx: SweepContext): number {
  return clamp(ctx.integer ? Math.round(v) : v, ctx);
}

function builtinValue(id: BuiltinAnchor, ctx: SweepContext): number {
  switch (id) {
    case "min":
      return ctx.min;
    case "max":
      return ctx.max;
    case "default":
      return clamp(ctx.default ?? ctx.origin, ctx);
    default:
      return clamp(ctx.origin, ctx);
  }
}

function builtinLabel(id: BuiltinAnchor): string {
  return BUILTIN_ANCHORS.find((a) => a.id === id)?.label ?? id;
}

/** The value of an anchor on this input, or undefined when the input does not declare it (or it cannot be computed now). */
export function anchorValue(id: string, ctx: SweepContext): number | undefined {
  if (isBuiltinAnchor(id)) return builtinValue(id, ctx);
  if (!ctx.anchors?.some((a) => a.id === id)) return undefined;
  const v = ctx.resolve?.(id);
  return v != null && Number.isFinite(v) ? clamp(v, ctx) : undefined;
}

export function anchorLabel(id: string, ctx: Pick<SweepContext, "anchors">): string {
  if (isBuiltinAnchor(id)) return builtinLabel(id);
  return ctx.anchors?.find((a) => a.id === id)?.label ?? id;
}

/** Resolve a reference: the named anchor where the input has it, its fallback elsewhere. */
export function resolveRef(ref: AnchorRef, ctx: SweepContext): { value: number; label: string; found: boolean } {
  const v = anchorValue(ref.id, ctx);
  if (v != null) return { value: v, label: anchorLabel(ref.id, ctx), found: true };
  return { value: builtinValue(ref.fallback, ctx), label: builtinLabel(ref.fallback), found: false };
}

export interface ResolvedRange {
  lo: number;
  hi: number;
  /** Anchor labels of the ends, for "anchors" ranges. */
  loLabel?: string;
  hiLabel?: string;
}

/** The range a preset sweeps on this input, in the input's units, inside its bounds. */
export function resolveRange(range: SweepRange, ctx: SweepContext): ResolvedRange {
  const span = ctx.max - ctx.min;
  let lo = ctx.min;
  let hi = ctx.max;
  let loLabel: string | undefined;
  let hiLabel: string | undefined;
  switch (range.mode) {
    case "fraction":
      lo = ctx.min + span * clamp01(range.lo);
      hi = ctx.min + span * clamp01(range.hi);
      break;
    case "absolute":
      lo = range.lo;
      hi = range.hi;
      break;
    case "around": {
      const half = Math.abs(range.unit === "share" ? range.half * span : range.half);
      lo = ctx.origin - half;
      hi = ctx.origin + half;
      break;
    }
    case "anchors": {
      const a = resolveRef(range.lo, ctx);
      const b = resolveRef(range.hi, ctx);
      lo = a.value;
      hi = b.value;
      loLabel = a.label;
      hiLabel = b.label;
      break;
    }
    default:
      break;
  }
  lo = clamp(lo, ctx);
  hi = clamp(hi, ctx);
  if (hi < lo) {
    [lo, hi] = [hi, lo];
    [loLabel, hiLabel] = [hiLabel, loLabel];
  }
  if (ctx.integer) {
    lo = Math.round(lo);
    hi = Math.round(hi);
  }
  return { lo, hi, loLabel, hiLabel };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

/** The step a loop or ping-pong takes on this input, in the input's units. */
export function stepSize(p: SweepPreset, ctx: SweepContext, lo: number, hi: number): number {
  const span = hi - lo;
  if (span <= eps(ctx)) return 0;
  let s = Math.abs(p.step.unit === "share" ? p.step.size * span : p.step.size);
  if (!Number.isFinite(s) || s <= 0) s = span / 20;
  if (ctx.integer) return Math.max(1, Math.round(s));
  return Math.max(s, span / MAX_VALUES);
}

/** lo, lo + s, lo + 2s, … and hi exactly; the last step lies between s/2 and 1.5 s so both ends are always shown. */
function lattice(lo: number, hi: number, s: number, ctx: SweepContext): number[] {
  if (s <= 0 || hi - lo <= eps(ctx)) return [exactValue(lo, ctx)];
  const out: number[] = [exactValue(lo, ctx)];
  for (let i = 1; out.length < MAX_VALUES - 1; i++) {
    const v = lo + i * s;
    if (v >= hi - s / 2 - eps(ctx)) break;
    out.push(roundValue(v, ctx));
  }
  out.push(exactValue(hi, ctx));
  // Integer rounding can merge neighbours; keep each value once.
  return out.filter((v, i) => i === 0 || v !== out[i - 1]);
}

/** Resolve a preset for one input into the values one cycle visits. */
export function planSweep(p: SweepPreset, ctx: SweepContext): SweepPlan {
  const current = ctx.current ?? ctx.origin;
  const e = eps(ctx);
  if (p.kind === "scenarios") {
    const { lo: rlo, hi: rhi } = resolveRange(p.range, ctx);
    const spots = p.scenarios.length ? p.scenarios : [{ at: 0.5, holdMs: 2000 }];
    const values = spots.map((s) => {
      if (s.anchor) return exactValue(resolveRef(s.anchor, ctx).value, ctx);
      if (p.range.mode === "absolute") return exactValue(s.at, ctx);
      return roundValue(rlo + (rhi - rlo) * clamp01(s.at), ctx);
    });
    const holds = spots.map((s) => Math.max(MIN_HOLD_MS, Number.isFinite(s.holdMs) ? s.holdMs : 2000));
    let start = 0;
    for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - current) < Math.abs(values[start] - current) - e) start = i;
    return {
      kind: p.kind,
      values,
      holds,
      ranks: values.map((_, i) => i + 1),
      count: values.length,
      lo: Math.min(...values),
      hi: Math.max(...values),
      marks: values.slice(),
      step: 0,
      start,
      jumpTo: Math.abs(values[start] - current) > e ? values[start] : null,
    };
  }
  const { lo, hi } = resolveRange(p.range, ctx);
  const s = stepSize(p, ctx, lo, hi);
  const up = lattice(lo, hi, s, ctx);
  const hold = Math.max(MIN_HOLD_MS, Number.isFinite(p.intervalMs) ? p.intervalMs : 400);
  const values = p.kind === "pingpong" && up.length > 1 ? [...up, ...up.slice(1, -1).reverse()] : up;
  const ranks = p.kind === "pingpong" && up.length > 1 ? [...up.map((_, i) => i + 1), ...up.slice(1, -1).map((_, i) => up.length - 1 - i)] : up.map((_, i) => i + 1);
  // Phase offset: count the starting value as the highest lattice value at or below it,
  // so the first change moves on from where the input already is.
  let j = -1;
  for (let i = 0; i < up.length; i++) if (up[i] <= current + e) j = i;
  return { kind: p.kind, values, holds: values.map(() => hold), ranks, count: up.length, lo, hi, marks: [], step: s, start: j, jumpTo: null };
}

/** The index after `index` in a plan's cycle. */
export function nextIndex(plan: SweepPlan, index: number): number {
  if (!plan.values.length) return -1;
  return (index + 1) % plan.values.length;
}

/** One full cycle of a plan, ms. */
export function periodMs(plan: SweepPlan): number {
  return Math.max(1, plan.holds.reduce((a, h) => a + h, 0));
}

/**
 * The value on screen after `elapsedMs` if every value holds exactly its time and
 * builds were instant: the ideal timeline the frame-locked runner follows. At 0 it
 * is the starting value (or the spot a spot run jumps to).
 */
export function valueAt(p: SweepPreset, ctx: SweepContext, elapsedMs: number): number {
  const plan = planSweep(p, ctx);
  const current = ctx.current ?? ctx.origin;
  if (!plan.values.length) return current;
  let index = plan.start;
  let value = plan.jumpTo ?? current;
  let left = Math.max(0, elapsedMs);
  // Skip whole cycles once the run is on its lattice.
  for (let guard = 0; guard < 4 * MAX_VALUES + 8; guard++) {
    const hold = plan.holds[Math.max(0, index)] ?? plan.holds[0];
    if (left < hold) return value;
    left -= hold;
    index = nextIndex(plan, index);
    value = plan.values[index];
    if (index === 0 && guard > 0) left %= periodMs(plan);
  }
  return value;
}

/** How numbers read in a description: values and deltas in the input's units, times in ms or s. */
export interface SweepFormat {
  value: (v: number) => string;
  delta: (d: number) => string;
  ms: (ms: number) => string;
}

/** The range part of a description: "from optimistic 2.52% to break-even 3.38%". */
export function describeRange(range: SweepRange, ctx: SweepContext, fmt: SweepFormat): string {
  const r = resolveRange(range, ctx);
  switch (range.mode) {
    case "full":
      return `over the whole range, ${fmt.value(r.lo)} to ${fmt.value(r.hi)}`;
    case "around": {
      const span = ctx.max - ctx.min;
      const half = Math.abs(range.unit === "share" ? range.half * span : range.half);
      return `± ${fmt.delta(half)} around ${fmt.value(ctx.origin)} (${fmt.value(r.lo)} to ${fmt.value(r.hi)})`;
    }
    case "anchors":
      return `from ${r.loLabel} ${fmt.value(r.lo)} to ${r.hiLabel} ${fmt.value(r.hi)}`;
    default:
      return `from ${fmt.value(r.lo)} to ${fmt.value(r.hi)}`;
  }
}

/**
 * A one-line description in the input's own units, e.g.
 * "loops from optimistic 2.52% to break-even 3.38%, step 0.05 pp every 400 ms (18 values)".
 */
export function describePreset(p: SweepPreset, ctx: SweepContext, fmt: SweepFormat): string {
  const plan = planSweep(p, ctx);
  if (p.kind === "scenarios") {
    const labels = p.scenarios.map((s) => (s.anchor ? resolveRef(s.anchor, ctx).label : null));
    const spots = plan.values.map((v, i) => (labels[i] ? `${labels[i]} ${fmt.value(v)}` : fmt.value(v)));
    const same = plan.holds.every((h) => h === plan.holds[0]);
    if (same) return `holds ${spots.join(", ")}, ${fmt.ms(plan.holds[0])} each`;
    return `holds ${spots.map((s, i) => `${s} for ${fmt.ms(plan.holds[i])}`).join(", ")}`;
  }
  const how = p.kind === "loop" ? "loops" : "ping-pongs";
  const range = describeRange(p.range, ctx, fmt);
  if (plan.count <= 1) return `${how} ${range}: one value, nothing moves`;
  return `${how} ${range}, step ${fmt.delta(plan.step)} every ${fmt.ms(plan.holds[0])} (${plan.count} values)`;
}
