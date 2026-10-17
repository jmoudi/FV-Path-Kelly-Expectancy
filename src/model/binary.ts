/**
 * The binary season: whole tranche at risk every event, gains compounding inside.
 * The first full loss is absorbing, so a season ends at (1+b)^n or 0.
 */

/** P(clean season) from the per-event full-loss rate. */
export function pCleanFromLossRate(q: number, nights: number): number {
  return Math.pow(1 - q, nights);
}

/** Per-event full-loss rate implied by a P(clean season). */
export function lossRateFromPClean(p: number, nights: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return 1 - Math.pow(p, 1 / nights);
}

/** End value of a clean season, in tranche units. */
export function cleanEnd(gain: number, nights: number): number {
  return Math.pow(1 + gain, nights);
}

/**
 * Per-event break-even full-loss rate: (1-q)(1+b) = 1.
 * The season-level break-even p·(1+b)^n = 1 gives the same q because the
 * compounding is inside the tranche.
 */
export function breakEvenLossRate(gain: number): number {
  return gain / (1 + gain);
}

/** Expected season end in tranche units. */
export function seasonMean(pClean: number, gain: number, nights: number): number {
  return pClean * cleanEnd(gain, nights);
}

export interface BinaryRow {
  pClean: number;
  lossRate: number;
  mean: number;
  /** The 2p−1 shorthand, exact only when (1+b)^n = 2. */
  twoPMinusOne: number;
}

export function binaryTable(gain: number, nights: number, pCleans: number[]): BinaryRow[] {
  return pCleans.map((p) => ({
    pClean: p,
    lossRate: lossRateFromPClean(p, nights),
    mean: seasonMean(p, gain, nights),
    twoPMinusOne: 2 * p - 1,
  }));
}
