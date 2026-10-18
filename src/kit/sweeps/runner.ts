/**
 * The frame-locked clock of a sweep run.
 *
 * A run never commits its next value before the build for the previous one has
 * rendered, and each value stays on screen at least its hold time. Builds take time,
 * so the runner commits a little ahead (by the shortest recent commit → render
 * latency, never more than the hold) to keep the on-screen dwell close to the hold
 * instead of hold + build time. If a build never reports back (an error, a dropped
 * answer), the run moves on after `timeoutMs` rather than stall.
 *
 * Generic: the runner knows nothing about inputs or builds; the caller says when a
 * build rendered through `settledSince(t)` ("has a build requested at or after t
 * rendered?").
 */

export interface RunnerOptions {
  /** Never commit two values closer than this, ms. */
  minSpacingMs: number;
  /** Move on when a commit has not rendered after this long, ms. */
  timeoutMs: number;
  /** How many recent latencies the lead is estimated from. */
  window: number;
}

export const RUNNER_DEFAULTS: RunnerOptions = { minSpacingMs: 0, timeoutMs: 4000, window: 5 };

export interface Cursor {
  /** When the value now on screen was first seen rendered; null while its build is pending. */
  shownAt: number | null;
  /** When the last value was committed (−∞ before the first commit). */
  committedAt: number;
  /** Recent commit → render latencies, ms. */
  latencies: number[];
}

/** A cursor for a run that starts (or resumes) now, with the input's current value on screen. */
export function startCursor(now: number): Cursor {
  return { shownAt: now, committedAt: -Infinity, latencies: [] };
}

/** How far ahead of the hold the next commit goes: the shortest recent latency, capped at the hold. */
export function leadMs(c: Cursor, holdMs: number): number {
  if (!c.latencies.length) return 0;
  return Math.min(Math.max(0, Math.min(...c.latencies)), Math.max(0, holdMs));
}

/**
 * Whether the run should advance now. Records the render of a pending commit as a
 * side effect (shownAt and the latency), so call it once per frame.
 */
export function due(c: Cursor, now: number, holdMs: number, settledSince: (t: number) => boolean, o: RunnerOptions = RUNNER_DEFAULTS): boolean {
  if (c.shownAt == null) {
    const timedOut = now - c.committedAt >= o.timeoutMs;
    if (!settledSince(c.committedAt) && !timedOut) return false;
    c.shownAt = now;
    if (!timedOut) c.latencies = [...c.latencies, now - c.committedAt].slice(-Math.max(1, o.window));
  }
  if (now - c.committedAt < o.minSpacingMs) return false;
  return now >= c.shownAt + holdMs - leadMs(c, holdMs);
}

/** The run committed a new value now; it waits for that value's build to render. */
export function committed(c: Cursor, now: number): void {
  c.committedAt = now;
  c.shownAt = null;
}

/** The next value equals the one on screen: nothing to build, its hold starts now. */
export function skipped(c: Cursor, now: number): void {
  c.shownAt = now;
}
