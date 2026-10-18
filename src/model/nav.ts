/**
 * Refilling the tranche from NAV.
 *
 * Excluding sizing is clean as long as the tranche is not refilled. Once it is
 * refilled from NAV each season, a season becomes a bet of a share f of NAV on the
 * tranche's season-end multiple X:
 *
 *   NAV after the season = NAV · (1 − f + f·X)
 *
 * The growth-optimal share maximises E[log(1 − f + f·X)]. For the coin, X is 0 or
 * about 2 (double or nothing), and the optimum is f* ≈ 2p − 1: the same quantity that
 * sets the expected value per season sets how much of the account the game can carry.
 */
import type { Outcome } from "./season";

/** E[log(1 − f + f·X)] over the season-end outcomes; −∞ when some outcome wipes NAV. */
export function navLogGrowth(f: number, outcomes: Outcome[]): number {
  let g = 0;
  for (const o of outcomes) {
    if (o.prob <= 0) continue;
    const m = 1 - f + f * o.value;
    if (m <= 0) return -Infinity;
    g += o.prob * Math.log(m);
  }
  return g;
}

/** d/df E[log(1 − f + f·X)] = E[(X − 1) / (1 − f + f·X)]. */
export function navLogGrowthSlope(f: number, outcomes: Outcome[]): number {
  let s = 0;
  for (const o of outcomes) {
    if (o.prob <= 0) continue;
    const m = 1 - f + f * o.value;
    if (m <= 0) return -Infinity;
    s += (o.prob * (o.value - 1)) / m;
  }
  return s;
}

/**
 * The share of NAV that maximises log growth, in [0, 1]. The objective is concave in
 * f, so bisection on its slope finds the optimum; a non-positive slope at f = 0
 * (mean ≤ 1) means the best share is none, and the share is capped at 1 because the
 * tranche is a share of NAV, not leverage on it.
 */
export function navKellyShare(outcomes: Outcome[]): number {
  if (!outcomes.length) return 0;
  if (navLogGrowthSlope(0, outcomes) <= 0) return 0;
  const canRuin = outcomes.some((o) => o.prob > 0 && o.value <= 0);
  let lo = 0;
  let hi = canRuin ? 1 - 1e-9 : 1;
  if (navLogGrowthSlope(hi, outcomes) >= 0) return hi >= 1 ? 1 : hi;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (navLogGrowthSlope(mid, outcomes) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The coin's season end: 0 with probability 1 − p, the clean end with probability p. */
export function coinOutcomes(pClean: number, cleanEnd: number): Outcome[] {
  return [
    { value: 0, prob: 1 - pClean },
    { value: cleanEnd, prob: pClean },
  ];
}

/** The double-or-nothing shorthand f* = 2p − 1, exact when the season ends at 0 or 2. */
export function doubleOrNothingShare(pClean: number): number {
  return Math.max(0, 2 * pClean - 1);
}

/**
 * The exact optimum for a two-point season {0, X}: f* = p − (1 − p)/(X − 1). With
 * X = 2 this is 2p − 1; with the discussion's X = 1.99 it is a little below.
 */
export function twoPointShare(pClean: number, cleanEnd: number): number {
  if (cleanEnd <= 1) return 0;
  return Math.max(0, pClean - (1 - pClean) / (cleanEnd - 1));
}

/** Log growth of NAV at each share in `shares`. */
export function navCurve(outcomes: Outcome[], shares: number[]): number[] {
  return shares.map((f) => navLogGrowth(f, outcomes));
}
