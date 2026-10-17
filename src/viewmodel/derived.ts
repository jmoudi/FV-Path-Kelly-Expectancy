import { breakEvenLossRate, cleanEnd, pCleanFromLossRate } from "../model/binary";
import { recordStats, type RecordStats } from "../model/calibration";
import { betaPosterior, kellyFraction, nightOptimum, robustOptimum, seasonLogGrowth, seasonRuin, uniformBand, type RateWeights } from "../model/kelly";
import type { Datasets, Params } from "../model/params";
import { policies, type PolicyDef, type PolicyId } from "../model/policies";
import { scheduleDistribution, summarize, type Distribution, type DistributionOptions, type Summary } from "../model/season";

export interface Computed {
  dist: Distribution;
  summary: Summary;
}

export interface Derived {
  k: number;
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
  /** Growth per season (conditional on survival) and ruin for the deck's own policy C. */
  growthC: number;
  ruinC: number;
  /** Loss-rate scenarios you cannot rule out. */
  band: RateWeights;
  bandLabel: string;
  /** Risk per night that maximises growth averaged over the band. */
  robust: { risk: number; growth: number };
  /** Risk per night that maximises growth at the deck's rate. */
  nightKelly: { risk: number; growth: number };
  record: RecordStats | null;
  /** The deck's k=1 or 100% risk makes two policies coincide. */
  degenerate: { singleName: boolean; fullRisk: boolean };
}

let cacheKey = "";
let cacheValue: Derived | null = null;

function keyOf(p: Params, d: Datasets): string {
  const sum = d.record.reduce((s, v) => s + v, 0);
  return JSON.stringify([p.lossRate, p.gain, p.nights, p.names, p.riskPerNight, p.seasons, p.sharedOutcome, p.thresholdBelow, p.altLossRate, p.zSigma, p.engine, p.mcPaths, p.seed, p.maxCompositions, d.record.length, sum]);
}

export function derive(p: Params, d: Datasets): Derived {
  const key = keyOf(p, d);
  if (cacheValue && key === cacheKey) return cacheValue;
  const pols = policies(p);
  const byId = Object.fromEntries(pols.map((x) => [x.id, x])) as Record<PolicyId, PolicyDef>;
  const opts: DistributionOptions = { maxCompositions: p.maxCompositions, mcPaths: p.mcPaths, seed: p.seed, engine: p.engine };
  const compute = (nights: number) =>
    Object.fromEntries(
      pols.map((pol) => {
        const dist = scheduleDistribution([{ nights, policy: pol.policy }], opts);
        return [pol.id, { dist, summary: summarize(dist, p.thresholdBelow) }];
      }),
    ) as Record<PolicyId, Computed>;
  const k = Math.max(1, Math.round(p.names));
  const pClean = pCleanFromLossRate(p.lossRate, p.nights);
  const end = cleanEnd(p.gain, p.nights);
  const breakEven = breakEvenLossRate(p.gain);
  const record = recordStats(d.record, p.gain, p.zSigma);
  const band = record ? betaPosterior(record.alpha, record.beta) : uniformBand(Math.min(p.altLossRate, breakEven), Math.max(p.altLossRate, breakEven));
  const bandLabel = record
    ? `Beta posterior from your ${record.events}-event record`
    : `uniform between the optimistic rate and break-even`;
  const out: Derived = {
    k,
    pClean,
    cleanEnd: end,
    breakEven,
    meanSeason: pClean * end,
    kelly: kellyFraction(p.lossRate, p.gain),
    policies: pols,
    byId,
    season: compute(p.nights),
    chained: compute(p.nights * p.seasons),
    opts,
    growthC: seasonLogGrowth(p.riskPerNight, k, p.lossRate, p.gain, p.nights, p.sharedOutcome),
    ruinC: seasonRuin(p.riskPerNight, k, p.lossRate, p.gain, p.nights, p.sharedOutcome),
    band,
    bandLabel,
    robust: robustOptimum(k, band, p.gain, p.nights, p.sharedOutcome),
    nightKelly: nightOptimum(k, p.lossRate, p.gain, p.nights, p.sharedOutcome),
    record,
    degenerate: { singleName: k === 1, fullRisk: p.riskPerNight >= 0.999 },
  };
  cacheKey = key;
  cacheValue = out;
  return out;
}

/** What the control deck needs; small enough to cross a worker boundary cheaply. */
export interface DeckView {
  pClean: number;
  cleanEnd: number;
  meanSeason: number;
  breakEven: number;
  kelly: number;
  growthC: number;
  ruinC: number;
  seasonB: Summary;
  chainedC: Summary;
  robust: { risk: number; growth: number };
  nightKelly: { risk: number; growth: number };
  bandLabel: string;
  recordEvents: number;
  method: { season: Distribution["method"]; chained: Distribution["method"] };
  degenerate: Derived["degenerate"];
}

export function deckView(d: Derived): DeckView {
  return {
    pClean: d.pClean,
    cleanEnd: d.cleanEnd,
    meanSeason: d.meanSeason,
    breakEven: d.breakEven,
    kelly: d.kelly,
    growthC: d.growthC,
    ruinC: d.ruinC,
    seasonB: d.season.B.summary,
    chainedC: d.chained.C.summary,
    robust: d.robust,
    nightKelly: d.nightKelly,
    bandLabel: d.bandLabel,
    recordEvents: d.record?.events ?? 0,
    method: { season: d.season.B.dist.method, chained: d.chained.C.dist.method },
    degenerate: d.degenerate,
  };
}

export const pct = (v: number, dd = 0) => `${(v * 100).toFixed(dd)}%`;
export const pct1 = (v: number) => pct(v, 1);
export const pct2 = (v: number) => pct(v, 2);
export const x2 = (v: number) => `${v.toFixed(2)}×`;
export const signedPct1 = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%` : v < 0 ? "−∞" : "∞");

/** A probability formatted so that tiny values stay readable. */
export function smallPct(v: number): string {
  if (v === 0) return "0%";
  if (v < 1e-7) return `${(v * 100).toExponential(1)}%`;
  if (v < 1e-4) return `${(v * 100).toPrecision(2)}%`;
  if (v < 0.01) return `${(v * 100).toFixed(3)}%`;
  if (v < 0.1) return `${(v * 100).toFixed(2)}%`;
  return `${(v * 100).toFixed(1)}%`;
}

export function methodLabel(m: Distribution["method"]): string {
  return m === "exact" ? "computed exactly" : m === "binned" ? "computed on a fine log grid" : "Monte Carlo";
}
