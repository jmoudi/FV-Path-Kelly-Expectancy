/**
 * Growth-optimal sizing for a {+b with prob 1−q, −1 with prob q} bet, and the
 * robust version that averages growth over the loss rates you cannot rule out.
 */
import { nightDist, nightLogGrowth, nightRuin, type NightPolicy } from "./season";
import { lgamma } from "./stats";

/** Kelly fraction f* = p − q/b, floored at zero. */
export function kellyFraction(q: number, b: number): number {
  return Math.max(0, 1 - q - q / b);
}

/** Expected log growth per bet at fraction f. */
export function logGrowthPerBet(f: number, q: number, b: number): number {
  if (f >= 1) return -Infinity;
  if (f <= 0) return 0;
  return (1 - q) * Math.log(1 + f * b) + q * Math.log(1 - f);
}

export interface BreadthRow {
  names: number;
  fractionPerName: number;
  totalAtRisk: number;
  /** Log growth per season, uncapped Kelly (can exceed 100% at risk). */
  growthUncapped: number;
  /** Log growth per season with the capital ceiling k·f <= 1. */
  growthCapped: number;
  capBinds: boolean;
}

export function breadthTable(q: number, b: number, nights: number, maxNames: number): BreadthRow[] {
  const fstar = kellyFraction(q, b);
  const g = logGrowthPerBet(fstar, q, b);
  const rows: BreadthRow[] = [];
  for (let k = 1; k <= maxNames; k++) {
    const capBinds = k * fstar > 1;
    const fc = capBinds ? 1 / k : fstar;
    rows.push({
      names: k,
      fractionPerName: fc,
      totalAtRisk: k * fc,
      growthUncapped: k * nights * g,
      growthCapped: k * nights * logGrowthPerBet(fc, q, b),
      capBinds,
    });
  }
  return rows;
}

function policyOf(riskPerNight: number, names: number, q: number, b: number, sharedOutcome: number): NightPolicy {
  return { names, riskPerName: riskPerNight / names, gain: b, lossRate: q, sharedOutcome };
}

/** Log growth per season (conditional on survival) when `riskPerNight` of the tranche is spread over k names. */
export function seasonLogGrowth(riskPerNight: number, names: number, q: number, b: number, nights: number, sharedOutcome = 0): number {
  return nights * nightLogGrowth(nightDist(policyOf(riskPerNight, names, q, b, sharedOutcome)));
}

/** Probability that a season of `nights` wipes the tranche under that sizing. */
export function seasonRuin(riskPerNight: number, names: number, q: number, b: number, nights: number, sharedOutcome = 0): number {
  return 1 - Math.pow(1 - nightRuin(nightDist(policyOf(riskPerNight, names, q, b, sharedOutcome))), nights);
}

/** Season mean when `riskPerNight` of the tranche is spread over k names. */
export function seasonMeanMultiplier(riskPerNight: number, q: number, b: number, nights: number): number {
  const perNight = 1 + riskPerNight * ((1 - q) * b - q);
  return Math.pow(perNight, nights);
}

/** Weighted loss-rate scenarios: the distribution of q itself. */
export interface RateWeights {
  rates: number[];
  weights: number[];
}

/** Uniform weights over a band of loss rates. */
export function uniformBand(lo: number, hi: number, points = 25): RateWeights {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (b - a < 1e-9) return { rates: [a], weights: [1] };
  const rates: number[] = [];
  for (let i = 0; i < points; i++) rates.push(a + ((b - a) * i) / (points - 1));
  return { rates, weights: rates.map(() => 1 / points) };
}

/** Beta(α, β) posterior for a loss rate, discretised on a grid. */
export function betaPosterior(alpha: number, beta: number, lo = 0.002, hi = 0.08, points = 60): RateWeights {
  const rates: number[] = [];
  const w: number[] = [];
  const lnB = lgamma(alpha) + lgamma(beta) - lgamma(alpha + beta);
  for (let i = 0; i < points; i++) {
    const q = lo + ((hi - lo) * i) / (points - 1);
    rates.push(q);
    w.push(Math.exp((alpha - 1) * Math.log(q) + (beta - 1) * Math.log(1 - q) - lnB));
  }
  const s = w.reduce((x, y) => x + y, 0);
  return { rates, weights: w.map((x) => x / s) };
}

/** Log growth per season averaged over the loss-rate scenarios. */
export function robustSeasonLogGrowth(riskPerNight: number, names: number, rw: RateWeights, b: number, nights: number, sharedOutcome = 0): number {
  let g = 0;
  for (let i = 0; i < rw.rates.length; i++) g += rw.weights[i] * seasonLogGrowth(riskPerNight, names, rw.rates[i], b, nights, sharedOutcome);
  return g;
}

/** The risk per night that maximises the averaged growth, on a fine grid. */
export function robustOptimum(names: number, rw: RateWeights, b: number, nights: number, sharedOutcome = 0): { risk: number; growth: number } {
  let best = { risk: 0, growth: -Infinity };
  for (let r = 0.01; r <= 1.0001; r += 0.01) {
    const g = robustSeasonLogGrowth(r, names, rw, b, nights, sharedOutcome);
    if (g > best.growth) best = { risk: Math.round(r * 100) / 100, growth: g };
  }
  return best;
}

/** The risk per night that maximises growth at one loss rate (Kelly for the whole night). */
export function nightOptimum(names: number, q: number, b: number, nights: number, sharedOutcome = 0): { risk: number; growth: number } {
  return robustOptimum(names, { rates: [q], weights: [1] }, b, nights, sharedOutcome);
}
