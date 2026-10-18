/**
 * The single parameter object every scenario reads from, its defaults and the
 * market switch. The schema the UI renders is in schema.ts.
 */
import { breakEvenLossRate, lossRateFromPClean } from "@app/model/binary";
import type { Engine } from "@app/model/season";
import { ratioForLossRate, type MoveDistribution } from "@app/model/wing";

/**
 * How the deck's loss rate relates to the chain's pricing.
 *   fair        q = b/(1+b): zero premium, growth-optimal risk 0.
 *   discussion  q such that a clean coin season has probability 0.55 at the deck's n
 *               (the discussion's 2.945%): an assumed risk premium for selling tail
 *               insurance, not an information edge.
 *   custom      q typed by hand.
 */
export type Market = "fair" | "discussion" | "custom";

/** The clean-season probability that defines the discussion case. */
export const DISCUSSION_P_CLEAN = 0.55;

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

/** The discussion's wing: 2σ short strike, 0.5σ wide, credit 3.38% of width, Normal moves. */
const DEFAULT_WING = { strikeDistance: 2.0, wingWidth: 0.5, creditFraction: 0.0338, moveDist: "normal" as MoveDistribution, tailDf: 4 };
const DEFAULT_NIGHTS = 20;
/** The discussion case: p(clean) = 0.55 over 20 nights, 2.945% per name. */
const DEFAULT_LOSS_RATE = lossRateFromPClean(DISCUSSION_P_CLEAN, DEFAULT_NIGHTS);
/**
 * Realized ÷ priced sigma solved so that the default wing's effective loss rate
 * equals the deck's q: the wing section opens with "effective rate = deck q".
 */
const DEFAULT_REALIZED_RATIO = ratioForLossRate(DEFAULT_LOSS_RATE, { ...DEFAULT_WING, realizedRatio: 1 }) ?? 1;

export const DEFAULT_PARAMS: Params = {
  lossRate: DEFAULT_LOSS_RATE,
  gain: 0.035,
  nights: DEFAULT_NIGHTS,
  names: 3,
  riskPerNight: 0.5,
  seasons: 4,

  sharedOutcome: 0,
  volShock: 1.3,
  volShockShare: 0.2,
  eventsPerYear: 80,
  zSigma: 2,
  altLossRate: 0.0252,
  singleNameShare: 0.5,
  thresholdBelow: 0.5,
  strikeDistance: DEFAULT_WING.strikeDistance,
  wingWidth: DEFAULT_WING.wingWidth,
  creditFraction: DEFAULT_WING.creditFraction,
  moveDist: DEFAULT_WING.moveDist,
  tailDf: DEFAULT_WING.tailDf,
  realizedRatio: DEFAULT_REALIZED_RATIO,
  parallelTranches: 400,
  market: "discussion",
  calShare0: 0.25,
  calShare1: 0.25,
  calShare2: 0.2,
  calShare3: 0.15,
  calShare4: 0.1,
  calShare5: 0.05,
  symWinRate: 0.6,
  symStake: 0.05,

  engine: "auto",
  mcPaths: 20_000,
  seed: 42,
  maxCompositions: 60_000,
  fanPaths: 40,
};

/** The six calendar-histogram inputs, in order of names per night. */
export const CALENDAR_SHARE_KEYS = ["calShare0", "calShare1", "calShare2", "calShare3", "calShare4", "calShare5"] as const satisfies readonly (keyof Params)[];

/** The calendar histogram as a list indexed by names per night (unnormalised). */
export function calendarShares(p: Pick<Params, (typeof CALENDAR_SHARE_KEYS)[number]>): number[] {
  return CALENDAR_SHARE_KEYS.map((k) => p[k]);
}

/** The loss rate each market state implies at the deck's gain and nights. */
export function marketLossRate(market: Exclude<Market, "custom">, p: Pick<Params, "gain" | "nights">): number {
  return market === "fair" ? breakEvenLossRate(p.gain) : lossRateFromPClean(DISCUSSION_P_CLEAN, p.nights);
}

/** Half of the display precision of a rate (0.01 pp): rates closer than this read as equal. */
export const MARKET_TOL = 5e-5;

/** Which market state the deck's q sits at right now (q typed by hand reads as custom). */
export function marketOf(p: Pick<Params, "lossRate" | "gain" | "nights">, tol = MARKET_TOL): Market {
  if (Math.abs(p.lossRate - marketLossRate("fair", p)) < tol) return "fair";
  if (Math.abs(p.lossRate - marketLossRate("discussion", p)) < tol) return "discussion";
  return "custom";
}

/** The parameter patch that moves the deck to a market state. */
export function marketPatch(market: Market, p: Pick<Params, "gain" | "nights">): Partial<Params> {
  if (market === "custom") return { market };
  return { market, lossRate: marketLossRate(market, p) };
}
