/**
 * Two growth figures that are easy to confuse, kept apart by name.
 *
 *   Log growth of surviving paths   E[log end | the tranche survives], per season.
 *                                   Reported next to P(ruin); the unconditional
 *                                   expectation is −∞ whenever ruin is possible.
 *   Median growth per season        median_N^(1/N) − 1, where median_N is the median
 *                                   of the N-season end. The rate the middle path
 *                                   compounds at; the two differ whenever the end
 *                                   distribution is skewed.
 */

/** median_N^(1/N) − 1. A median of zero (the coin after enough seasons) is −100%. */
export function medianGrowthPerSeason(medianAfterN: number, seasons: number): number {
  if (!(seasons > 0) || !Number.isFinite(medianAfterN)) return NaN;
  if (medianAfterN <= 0) return -1;
  return Math.pow(medianAfterN, 1 / seasons) - 1;
}

/** Per-season log growth of a path that ends at `end` after N seasons (for a path label). */
export function logGrowthPerSeason(end: number, seasons: number): number {
  if (!(seasons > 0) || end <= 0) return -Infinity;
  return Math.log(end) / seasons;
}
