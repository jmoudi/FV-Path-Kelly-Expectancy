/**
 * Growth-optimal sizing for a {+b with prob 1−q, −1 with prob q} bet.
 */
import { nightDist, nightLogGrowth, type NightPolicy } from "./season";

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

/** Log growth per season when `riskPerNight` of the tranche is spread over k names. */
export function seasonLogGrowth(riskPerNight: number, names: number, q: number, b: number, nights: number, sharedOutcome = 0): number {
  const policy: NightPolicy = { names, riskPerName: riskPerNight / names, gain: b, lossRate: q, sharedOutcome };
  return nights * nightLogGrowth(nightDist(policy));
}

/** Season mean when `riskPerNight` of the tranche is spread over k names. */
export function seasonMeanMultiplier(riskPerNight: number, q: number, b: number, nights: number): number {
  const perNight = 1 + riskPerNight * ((1 - q) * b - q);
  return Math.pow(perNight, nights);
}
