/**
 * What the sweep engine needs from the app, in one object: the sweep context of an input
 * (its bounds, default, the value before the run, the anchors its schema declares and
 * their current values), how the input's values and deltas read, and whether a build
 * requested at or after a time has rendered. The app builds one (src/app/sweeps.ts) and
 * passes it to <KitProvider sweeps> and, through plannerFor, to createAppStore.
 */
import type { SweepPlanner } from "@kit/state/createAppStore";
import { describePreset, planSweep, type SweepContext, type SweepFormat } from "./engine";
import type { SweepPlan, SweepPreset } from "./types";

export interface SweepAdapter {
  /** The sweep context of one input now, or null when it cannot be swept. */
  context(key: string, params: any, at: { origin: number; current: number }): SweepContext | null;
  /** How the input's values, deltas and hold times read ("2.94%", "0.05 pp", "400 ms"). */
  format(key: string): SweepFormat;
  /** Has a build requested at or after `t` rendered? (kit/build SettleTracker.settledSince) */
  settledSince(t: number): boolean;
}

/** Resolve a preset for one input now (a run's plan, or the preview band on its track). */
export function planWith(a: SweepAdapter, key: string, preset: SweepPreset, params: any, at?: { origin: number; current: number }): SweepPlan | null {
  const value = params?.[key];
  if (typeof value !== "number") return null;
  const ctx = a.context(key, params, { origin: at?.origin ?? value, current: at?.current ?? value });
  return ctx ? planSweep(preset, ctx) : null;
}

/** "loops from optimistic 2.52% to break-even 3.38%, step 0.05 pp every 400 ms (18 values)", for this input. */
export function describeWith(a: SweepAdapter, key: string, preset: SweepPreset, params: any): string {
  const value = params?.[key];
  if (typeof value !== "number") return "";
  const ctx = a.context(key, params, { origin: value, current: value });
  return ctx ? describePreset(preset, ctx, a.format(key)) : "";
}

/** The store's run planner (createAppStore config `planner`). */
export function plannerFor(a: SweepAdapter): SweepPlanner {
  return (key, preset, at, params) => planWith(a, key, preset, params, at);
}
