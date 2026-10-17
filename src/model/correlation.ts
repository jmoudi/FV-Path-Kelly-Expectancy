/**
 * Shared causes within a night, and the convexity of a volatility shock.
 */
import { normalCdf, normalQuantile } from "./stats";

/** P(all k names lose on one night) with a shared-outcome probability c. */
export function jointLossProb(q: number, k: number, c: number): number {
  return c * q + (1 - c) * Math.pow(q, k);
}

/** The c at which the correlation term equals the independent term: c·q = q^k. */
export function crossoverSharedOutcome(q: number, k: number): number {
  return Math.pow(q, k - 1);
}

/** P(at least one full-tranche night in a season of n nights). */
export function ruinPerSeason(pJoint: number, nights: number): number {
  return 1 - Math.pow(1 - pJoint, nights);
}

/** Two-sided z threshold implied by a per-name loss rate. */
export function impliedZ(q: number): number {
  return normalQuantile(1 - q / 2);
}

/** Loss rate when the realized sigma is `scale` times the priced sigma (two-sided normal). */
export function shockedLossRate(q: number, scale: number): number {
  const z = impliedZ(q);
  return 2 * (1 - normalCdf(z / scale));
}

/** Two-sided breach probability beyond z priced sigmas when realized sigma is scaled. */
export function breachBeyond(z: number, scale: number): number {
  return 2 * (1 - normalCdf(z / scale));
}

export interface ShockScenario {
  /** Fraction of nights with a shared volatility shock. */
  shockedShare: number;
  /** Realized / priced sigma on those nights. */
  scale: number;
}

/** Season ruin with a share of nights under a shared vol shock (independent directions). */
export function ruinWithShock(q: number, k: number, nights: number, s: ShockScenario, c = 0): number {
  const qs = shockedLossRate(q, s.scale);
  const normalNights = nights * (1 - s.shockedShare);
  const shockNights = nights * s.shockedShare;
  const pj = jointLossProb(q, k, c);
  const pjs = jointLossProb(qs, k, c);
  return 1 - Math.pow(1 - pj, normalNights) * Math.pow(1 - pjs, shockNights);
}
