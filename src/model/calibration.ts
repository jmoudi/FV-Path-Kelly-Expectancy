/**
 * How many events it takes to tell one loss rate from another, and what an
 * actual record says.
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

/**
 * Events for a one-sided test of H0: q = q0 against q = q1 < q0 at significance
 * `alpha` with power `power` (normal approximation).
 */
export function eventsForTest(q0: number, q1: number, alpha = 0.05, power = 0.8): number {
  const d = Math.abs(q0 - q1);
  if (d === 0) return Infinity;
  const za = normalQuantile(1 - alpha);
  const zb = normalQuantile(power);
  const num = za * Math.sqrt(q0 * (1 - q0)) + zb * Math.sqrt(q1 * (1 - q1));
  return (num * num) / (d * d);
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

/** The record length at which the Wilson upper bound around `qhat` first drops below `limit`. */
export function eventsUntilUpperBelow(qhat: number, limit: number, z: number): number | null {
  if (qhat >= limit) return null;
  let lo = 1;
  let hi = 1e7;
  if (wilsonInterval(qhat, hi, z)[1] >= limit) return null;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (wilsonInterval(qhat, mid, z)[1] < limit) hi = mid;
    else lo = mid;
  }
  return hi;
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

export interface RecordStats {
  events: number;
  /** Full losses counted (binary records) or the loss mass (P&L records). */
  losses: number;
  /** Expected loss as a fraction of max loss: the effective rate the record implies. */
  rate: number;
  /** How the record was read. */
  kind: "binary" | "pnl";
  interval: [number, number];
  /** Beta posterior parameters for the rate. */
  alpha: number;
  beta: number;
}

/**
 * Read an imported trade log. Values are either 0/1 (1 = a full loss) or per-event
 * P&L in units of max loss (a clean win is +b, a full loss is −1, a partial loss is
 * in between). The effective rate is the one that reproduces the record's mean in
 * the {+b, −1} abstraction: q = (b − mean P&L) / (1 + b).
 */
export function recordStats(values: number[], b: number, z: number): RecordStats | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  const binary = xs.every((v) => v === 0 || v === 1);
  let rate: number;
  let losses: number;
  if (binary) {
    losses = xs.reduce<number>((s, v) => s + v, 0);
    rate = losses / xs.length;
  } else {
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    rate = Math.min(1, Math.max(0, (b - mean) / (1 + b)));
    losses = rate * xs.length;
  }
  return {
    events: xs.length,
    losses,
    rate,
    kind: binary ? "binary" : "pnl",
    interval: wilsonInterval(rate, xs.length, z),
    alpha: 1 + losses,
    beta: 1 + xs.length - losses,
  };
}

/** Parse a pasted or uploaded list of numbers: one per line, or CSV with a numeric column. */
export function parseNumberList(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;/]/.test(line)) continue;
    const cells = line.split(/[,\t; ]+/).filter(Boolean);
    const last = cells[cells.length - 1].replace("%", "");
    const v = Number(last);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
