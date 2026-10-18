import { typographic } from "@kit/charts/format";
import { breakEvenLossRate, cleanEnd, pCleanFromLossRate } from "@app/model/binary";
import { recordStats, type RecordStats } from "@app/model/calibration";
import { betaPosterior, kellyFraction, nightOptimum, robustOptimum, seasonLogGrowth, seasonRuin, uniformBand, type RateWeights } from "@app/model/kelly";
import { MARKET_TOL, marketLossRate, marketOf, type Market, type Params } from "@app/params/params";
import { PARAM_BY_KEY } from "@app/params/schema";
import type { Datasets } from "@app/params/datasets";
import type { Unit } from "@kit/inputs/schema";
import { YOUR_POLICY, policies, type PolicyDef, type PolicyId } from "@app/model/policies";
import { scheduleDistribution, summarize, type Distribution, type DistributionOptions, type Summary } from "@app/model/season";
import { pct, pct2, x2, signedPp, fmtInt, sigma } from "@kit/charts/numbers";
import { ZERO_PREMIUM_NOTE, NEGATIVE_PREMIUM_NOTE } from "@app/copy/market";

export function methodLabel(m: Distribution["method"]): string {
  return m === "exact" ? "computed exactly" : m === "binned" ? "computed on a fine log grid" : "Monte Carlo";
}

/** A parameter value in its schema unit, as the deck prints it. */
export function formatIn(unit: Unit, v: number): string {
  switch (unit) {
    case "pct":
      return pct(v);
    case "pct2":
      return pct2(v);
    case "int":
      return fmtInt(v);
    case "x":
      return x2(v);
    case "sigma":
      return sigma(v);
    default:
      return typographic(v.toFixed(2));
  }
}

/**
 * What an active story moved, from the snapshot the store took before it moved the
 * deck: "moves deck: q 2.94% → 2.52%". A rebuilt chart's own badge is computed from
 * the deck as it is after the move, so the host reads this one instead. Null when
 * nothing numeric moved.
 */
export function movedBadge(before: Partial<Params> | undefined, now: Params): string | null {
  if (!before) return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(before)) {
    const def = PARAM_BY_KEY[k];
    const cur = now[k as keyof Params];
    if (!def || typeof v !== "number" || typeof cur !== "number" || v === cur) continue;
    parts.push(`${def.short ?? def.shortLabel ?? def.label} ${formatIn(def.unit, v)} → ${formatIn(def.unit, cur)}`);
  }
  return parts.length ? `moves deck: ${parts.join(", ")}` : null;
}

// ---------------------------------------------------------------------------
// Derived state shared by every scenario.
// ---------------------------------------------------------------------------

export interface Computed {
  dist: Distribution;
  summary: Summary;
}

/** How the deck's q relates to the chain's pricing. */
export interface MarketState {
  /** The state the deck was last set from (params.market). */
  chosen: Market;
  /** Where q actually sits now: a hand-typed q reads as custom. */
  actual: Market;
  /** b/(1+b): the rate at which the chain prices the wing fairly. */
  fairRate: number;
  /** The rate that gives a 55% clean coin season at the deck's n. */
  discussionRate: number;
  /** fair − q: the premium over fair per event the deck asserts, as a rate. */
  premium: number;
  /** q sits at the fair rate (within display precision): premium over fair 0. */
  zeroPremium: boolean;
  /** No positive premium (fair, or q above the fair rate): the growth-optimal risk at the deck's rate is 0. */
  noPremium: boolean;
  /**
   * The premium the deck's q implies, as one sentence: "The chain pays +0.44 pp premium
   * over fair per event at the deck's q." The market switch shows it under MARKET_LINE
   * on the Desk and in the drawer.
   */
  line: string;
  /** What the Desk and the sizing views say when there is no positive premium (empty otherwise). */
  sizingNote: string;
}

export function marketState(p: Params): MarketState {
  const fairRate = marketLossRate("fair", p);
  const discussionRate = marketLossRate("discussion", p);
  const actual = marketOf(p);
  const premium = fairRate - p.lossRate;
  const zeroPremium = Math.abs(premium) <= MARKET_TOL;
  const noPremium = premium <= MARKET_TOL;
  const line = zeroPremium
    ? `The chain pays ${signedPp(0)} premium: fair pricing.`
    : noPremium
      ? `The chain pays ${signedPp(premium)} premium over fair per event at the deck's q, which sits above the fair rate ${pct2(fairRate)}.`
      : `The chain pays ${signedPp(premium)} premium over fair per event at the deck's q.`;
  return {
    chosen: p.market,
    actual,
    fairRate,
    discussionRate,
    premium,
    zeroPremium,
    noPremium,
    line,
    sizingNote: zeroPremium ? ZERO_PREMIUM_NOTE : noPremium ? NEGATIVE_PREMIUM_NOTE : "",
  };
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
  /** The policy the deck's sizing inputs describe. */
  yours: PolicyId;
  /** One season. */
  season: Record<PolicyId, Computed>;
  /** N seasons chained. */
  chained: Record<PolicyId, Computed>;
  opts: DistributionOptions;
  /** Log growth of surviving paths per season, and ruin per season, for your policy. */
  growthYours: number;
  ruinYours: number;
  /** Loss-rate scenarios you cannot rule out. */
  band: RateWeights;
  bandLabel: string;
  /** Risk per night that maximises growth averaged over the band. */
  robust: { risk: number; growth: number };
  /** Risk per night that maximises growth at the deck's rate (0 at zero premium). */
  nightKelly: { risk: number; growth: number };
  record: RecordStats | null;
  /** The deck's k=1 or 100% risk makes two policies coincide. */
  degenerate: { singleName: boolean; fullRisk: boolean };
  market: MarketState;
}

let cacheKey = "";
let cacheValue: Derived | null = null;

function keyOf(p: Params, d: Datasets): string {
  const sum = d.record.reduce((s, v) => s + v, 0);
  return JSON.stringify([p.lossRate, p.gain, p.nights, p.names, p.riskPerNight, p.seasons, p.sharedOutcome, p.thresholdBelow, p.altLossRate, p.zSigma, p.engine, p.mcPaths, p.seed, p.maxCompositions, p.market, d.record.length, sum]);
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
  const bandLabel = record ? `Beta posterior from your ${record.events}-event record` : `uniform between the optimistic rate and break-even`;
  const kelly = kellyFraction(p.lossRate, p.gain);
  // At or past break-even nothing grows: the optimum is to risk nothing, which the
  // grid search (which starts at 1%) cannot say on its own.
  const atZero = { risk: 0, growth: 0 };
  const nightKelly = kelly > 0 ? nightOptimum(k, p.lossRate, p.gain, p.nights, p.sharedOutcome) : atZero;
  const robustRaw = robustOptimum(k, band, p.gain, p.nights, p.sharedOutcome);
  const robust = robustRaw.growth > 0 ? robustRaw : atZero;
  const out: Derived = {
    k,
    pClean,
    cleanEnd: end,
    breakEven,
    meanSeason: pClean * end,
    kelly,
    policies: pols,
    byId,
    yours: YOUR_POLICY,
    season: compute(p.nights),
    chained: compute(p.nights * p.seasons),
    opts,
    growthYours: seasonLogGrowth(p.riskPerNight, k, p.lossRate, p.gain, p.nights, p.sharedOutcome),
    ruinYours: seasonRuin(p.riskPerNight, k, p.lossRate, p.gain, p.nights, p.sharedOutcome),
    band,
    bandLabel,
    robust,
    nightKelly,
    record,
    degenerate: { singleName: k === 1, fullRisk: p.riskPerNight >= 0.999 },
    market: marketState(p),
  };
  cacheKey = key;
  cacheValue = out;
  return out;
}
