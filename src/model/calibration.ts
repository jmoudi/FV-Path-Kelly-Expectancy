/**
 * How many events it takes to tell one loss rate from another.
 */
import { binomialPmf, normalQuantile } from "./stats";

/**
 * Events needed so that the difference between two rates is `z` standard errors
 * of the observed frequency (normal approximation at the midpoint rate).
 */
export function eventsToResolve(q1: number, q2: number, z: number): number {
  const qbar = (q1 + q2) / 2;
  const d = Math.abs(q2 - q1);
  if (d === 0) return Infinity;
  return (z * z * qbar * (1 - qbar)) / (d * d);
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(qhat: number, n: number, z: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (qhat + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((qhat * (1 - qhat)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Sampling distribution of the observed rate k/n under a true rate q. */
export function observedRatePmf(q: number, n: number): { rate: number; prob: number }[] {
  const out: { rate: number; prob: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const prob = binomialPmf(n, k, q);
    if (prob > 1e-7 || out.length === 0) out.push({ rate: k / n, prob });
  }
  return out;
}

/** z for a two-sided confidence level, e.g. 0.95 -> 1.96. */
export function zForConfidence(level: number): number {
  return normalQuantile(1 - (1 - level) / 2);
}
