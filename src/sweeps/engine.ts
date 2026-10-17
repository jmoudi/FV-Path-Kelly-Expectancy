/**
 * Pure sweep arithmetic: given a preset, an input's bounds and the elapsed sweep
 * time, where should the input be? No timers here; the UI owns the clock.
 */
import type { SweepPreset, SweepRange } from "./types";

export interface Bounds {
  min: number;
  max: number;
  step: number;
}

export function resolveRange(range: SweepRange, b: Bounds): [number, number] {
  let lo = b.min;
  let hi = b.max;
  if (range.mode === "fraction") {
    const span = b.max - b.min;
    lo = b.min + span * clamp01(range.lo ?? 0);
    hi = b.min + span * clamp01(range.hi ?? 1);
  } else if (range.mode === "absolute") {
    lo = Math.max(b.min, Math.min(b.max, range.lo ?? b.min));
    hi = Math.max(b.min, Math.min(b.max, range.hi ?? b.max));
  }
  if (hi < lo) [lo, hi] = [hi, lo];
  return [lo, hi];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Snap to the input's step grid. */
export function snap(v: number, b: Bounds): number {
  const s = b.step > 0 ? b.step : 1;
  const snapped = b.min + Math.round((v - b.min) / s) * s;
  return Math.max(b.min, Math.min(b.max, Number(snapped.toPrecision(12))));
}

/** Total length of one cycle in ms. */
export function periodMs(p: SweepPreset): number {
  if (p.kind === "scenarios") return Math.max(1, p.scenarios.reduce((s, x) => s + Math.max(0, x.holdMs), 0));
  const steps = Math.max(1, Math.round(1 / Math.max(1e-6, p.stepFraction)));
  const one = steps * Math.max(10, p.intervalMs);
  return p.kind === "pingpong" ? 2 * one : one;
}

/** The input's value after `elapsedMs` of sweep time, snapped to its grid. */
export function valueAt(p: SweepPreset, b: Bounds, elapsedMs: number): number {
  const [lo, hi] = resolveRange(p.range, b);
  const span = hi - lo;
  const t = Math.max(0, elapsedMs);
  if (p.kind === "scenarios") {
    if (!p.scenarios.length) return snap(lo, b);
    const total = periodMs(p);
    let pos = t % total;
    for (const sc of p.scenarios) {
      const hold = Math.max(0, sc.holdMs);
      if (pos < hold || hold === 0) {
        const v = p.range.mode === "absolute" ? sc.at : lo + span * clamp01(sc.at);
        return snap(v, b);
      }
      pos -= hold;
    }
    const last = p.scenarios[p.scenarios.length - 1];
    return snap(p.range.mode === "absolute" ? last.at : lo + span * clamp01(last.at), b);
  }
  const steps = Math.max(1, Math.round(1 / Math.max(1e-6, p.stepFraction)));
  const interval = Math.max(10, p.intervalMs);
  const one = steps * interval;
  let phase: number;
  if (p.kind === "pingpong") {
    const pos = t % (2 * one);
    phase = pos < one ? pos / one : 2 - pos / one;
  } else {
    phase = (t % one) / one;
  }
  if (!p.smooth) phase = Math.floor(phase * steps + 1e-9) / steps;
  return snap(lo + span * Math.min(1, phase), b);
}

/** A readable one-line description, in the input's units via `fmt`. */
export function describePreset(p: SweepPreset, b: Bounds, fmt: (v: number) => string): string {
  const [lo, hi] = resolveRange(p.range, b);
  const range = p.range.mode === "full" ? "whole range" : `${fmt(lo)} to ${fmt(hi)}`;
  if (p.kind === "scenarios") return `${p.scenarios.length} spot${p.scenarios.length === 1 ? "" : "s"} in ${range}: ${p.scenarios.map((s) => fmt(p.range.mode === "absolute" ? s.at : lo + (hi - lo) * s.at)).join(", ")}`;
  const stepAbs = (hi - lo) * p.stepFraction;
  const how = p.kind === "loop" ? "loops" : "bounces";
  return `${how} over ${range}, ${fmt(lo + stepAbs).replace(/^.*?(?=[\d-])/, "")} per ${(p.intervalMs / 1000).toFixed(p.intervalMs % 1000 ? 1 : 0)}s${p.smooth ? ", gliding" : ", stepping"}`;
}
