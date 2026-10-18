/**
 * The frequent-outcome system the discussion contrasts with the tranche: a win rate p
 * (60%) with a symmetric payoff, risking a stake s of the account on each of n
 * trades. Its season ends at (1 + s)^w (1 − s)^(n − w) with w ~ Binomial(n, p): a
 * hump of many small outcomes, where the tranche is a coin with two.
 */
import type { Distribution, Outcome } from "./season";
import { binomialPmf } from "./stats";

/** Season-end distribution of n symmetric trades at stake s with win rate p. */
export function symmetricSeasonDistribution(p: number, s: number, n: number): Distribution {
  const stake = Math.min(0.999999, Math.max(0, s));
  const outcomes: Outcome[] = [];
  for (let w = 0; w <= n; w++) {
    const prob = binomialPmf(n, w, p);
    if (prob <= 0) continue;
    outcomes.push({ value: Math.pow(1 + stake, w) * Math.pow(1 - stake, n - w), prob });
  }
  // (1 + s)/(1 − s) > 1, so more wins always means a larger end: the list is already ascending.
  return { outcomes, method: "exact", nights: n };
}

/** Mean season end: (1 + s·(2p − 1))^n. */
export function symmetricSeasonMean(p: number, s: number, n: number): number {
  return Math.pow(1 + s * (2 * p - 1), n);
}

/** The growth-optimal stake for an even-money bet: p − q = 2p − 1. */
export function symmetricKelly(p: number): number {
  return Math.max(0, 2 * p - 1);
}

/** The stake whose season mean equals `targetMean`; null when the win rate is one half or the target is at or below one. */
export function evMatchingStake(targetMean: number, p: number, n: number): number | null {
  const premium = 2 * p - 1;
  if (Math.abs(premium) < 1e-12 || targetMean <= 1 || n <= 0) return null;
  const s = (Math.pow(targetMean, 1 / n) - 1) / premium;
  return s > 0 && s < 1 ? s : null;
}
