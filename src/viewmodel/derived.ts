import { breakEvenLossRate, cleanEnd, pCleanFromLossRate } from "../model/binary";
import { kellyFraction } from "../model/kelly";
import type { Params } from "../model/params";
import { policies, type PolicyDef, type PolicyId } from "../model/policies";
import { scheduleDistribution, summarize, type Distribution, type DistributionOptions, type Summary } from "../model/season";

export interface Computed {
  dist: Distribution;
  summary: Summary;
}

export interface Derived {
  pClean: number;
  cleanEnd: number;
  breakEven: number;
  meanSeason: number;
  kelly: number;
  policies: PolicyDef[];
  byId: Record<PolicyId, PolicyDef>;
  /** One season. */
  season: Record<PolicyId, Computed>;
  /** N seasons chained. */
  chained: Record<PolicyId, Computed>;
  opts: DistributionOptions;
}

export function derive(p: Params): Derived {
  const pols = policies(p);
  const byId = Object.fromEntries(pols.map((x) => [x.id, x])) as Record<PolicyId, PolicyDef>;
  const opts: DistributionOptions = { maxCompositions: p.maxCompositions, mcPaths: p.mcPaths, seed: p.seed };
  const compute = (nights: number) =>
    Object.fromEntries(
      pols.map((pol) => {
        const dist = scheduleDistribution([{ nights, policy: pol.policy }], opts);
        return [pol.id, { dist, summary: summarize(dist, p.thresholdBelow) }];
      }),
    ) as Record<PolicyId, Computed>;
  const pClean = pCleanFromLossRate(p.lossRate, p.nights);
  const end = cleanEnd(p.gain, p.nights);
  return {
    pClean,
    cleanEnd: end,
    breakEven: breakEvenLossRate(p.gain),
    meanSeason: pClean * end,
    kelly: kellyFraction(p.lossRate, p.gain),
    policies: pols,
    byId,
    season: compute(p.nights),
    chained: compute(p.nights * p.seasons),
    opts,
  };
}

export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
export const pct1 = (v: number) => pct(v, 1);
export const pct2 = (v: number) => pct(v, 2);
export const x2 = (v: number) => `${v.toFixed(2)}×`;
export const signedPct1 = (v: number) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`;

/** A probability formatted so that tiny values stay readable. */
export function smallPct(v: number): string {
  if (v === 0) return "0%";
  if (v < 1e-7) return `${(v * 100).toExponential(1)}%`;
  if (v < 1e-4) return `${(v * 100).toPrecision(2)}%`;
  if (v < 0.01) return `${(v * 100).toFixed(3)}%`;
  if (v < 0.1) return `${(v * 100).toFixed(2)}%`;
  return `${(v * 100).toFixed(1)}%`;
}
