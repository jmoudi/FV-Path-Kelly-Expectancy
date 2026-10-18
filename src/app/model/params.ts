/**
 * The parameter contract: the one object every scenario reads from, and the pure
 * functions of it the market switch needs. No values live here: the defaults and the
 * discussion's numbers are data (src/app/data/params.ts), the schema the UI renders is
 * src/app/data/schema.ts.
 */
import { breakEvenLossRate, lossRateFromPClean } from "./binary";
import type { Engine } from "./season";
import type { MoveDistribution } from "./wing";

/**
 * How the deck's loss rate relates to the chain's pricing.
 *   fair        q = b/(1+b): zero premium, growth-optimal risk 0.
 *   discussion  q such that a clean coin season has a given probability at the deck's n
 *               (the discussion's 55%, src/app/data/params.ts): an assumed risk premium
 *               for selling tail insurance, not an information edge.
 *   custom      q typed by hand.
 */
export type Market = "fair" | "discussion" | "custom";

export interface Params {
  // --- primary (control deck) ---
  /** Per-name full-loss rate, q. */
  lossRate: number;
  /** Gain per unit risked on a win, b. */
  gain: number;
  /** Nights (games) per season, n. */
  nights: number;
  /** Names per night in the diversified policies, k. */
  names: number;
  /** Fraction of the tranche at risk per night in the reserve policy. */
  riskPerNight: number;
  /** Seasons chained without refilling the tranche, N. */
  seasons: number;

  // --- secondary (per section) ---
  /** Probability a night's names share one outcome, c. */
  sharedOutcome: number;
  /** Realized / priced sigma on shocked nights. */
  volShock: number;
  /** Share of nights that carry the shock. */
  volShockShare: number;
  /** Name-events per year, for the calibration clock. */
  eventsPerYear: number;
  /** Sigmas of separation demanded by the calibration question. */
  zSigma: number;
  /** The optimistic loss rate the calibration question compares against. */
  altLossRate: number;
  /** Share of a season's nights that are single-name nights (names-per-game scenario). */
  singleNameShare: number;
  /** Threshold for the "below" probability in summary tables. */
  thresholdBelow: number;
  strikeDistance: number;
  wingWidth: number;
  creditFraction: number;
  moveDist: MoveDistribution;
  tailDf: number;
  /** Realized ÷ priced sigma (the spec calls it realized over priced). */
  realizedRatio: number;
  parallelTranches: number;
  /** The market switch: which pricing the deck's q was last set from. */
  market: Market;
  /** Shares of calendar nights that offer 0 … 5 names (the calendar figure in section 07); the model scales them to 100%. */
  calShare0: number;
  calShare1: number;
  calShare2: number;
  calShare3: number;
  calShare4: number;
  calShare5: number;
  /** Win rate of the symmetric-payoff system section 03 compares with (the discussion's 60%). */
  symWinRate: number;
  /** Stake per trade of that system, as a share of its account. */
  symStake: number;

  // --- advanced ---
  engine: Engine;
  mcPaths: number;
  seed: number;
  maxCompositions: number;
  fanPaths: number;
}

/** The six calendar-histogram inputs, in order of names per night. */
export const CALENDAR_SHARE_KEYS = ["calShare0", "calShare1", "calShare2", "calShare3", "calShare4", "calShare5"] as const satisfies readonly (keyof Params)[];

/** The calendar histogram as a list indexed by names per night (unnormalised). */
export function calendarShares(p: Pick<Params, (typeof CALENDAR_SHARE_KEYS)[number]>): number[] {
  return CALENDAR_SHARE_KEYS.map((k) => p[k]);
}

/** The loss rate each market state implies at the deck's gain and nights; `discussionPClean` defines the discussion case. */
export function marketLossRate(market: Exclude<Market, "custom">, p: Pick<Params, "gain" | "nights">, discussionPClean: number): number {
  return market === "fair" ? breakEvenLossRate(p.gain) : lossRateFromPClean(discussionPClean, p.nights);
}

/** Half of the display precision of a rate (0.01 pp): rates closer than this read as equal. */
export const MARKET_TOL = 5e-5;

/** Which market state the deck's q sits at right now (q typed by hand reads as custom). */
export function marketOf(p: Pick<Params, "lossRate" | "gain" | "nights">, discussionPClean: number, tol = MARKET_TOL): Market {
  if (Math.abs(p.lossRate - marketLossRate("fair", p, discussionPClean)) < tol) return "fair";
  if (Math.abs(p.lossRate - marketLossRate("discussion", p, discussionPClean)) < tol) return "discussion";
  return "custom";
}

/** The parameter patch that moves the deck to a market state. */
export function marketPatch(market: Market, p: Pick<Params, "gain" | "nights">, discussionPClean: number): Partial<Params> {
  if (market === "custom") return { market };
  return { market, lossRate: marketLossRate(market, p, discussionPClean) };
}
