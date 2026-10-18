/**
 * The parameter values: the discussion's defaults and the number that defines its
 * market case. The contract (the Params type and the market functions) is the model's,
 * src/app/model/params.ts; the schema the UI renders is schema.ts.
 */
import { lossRateFromPClean } from "@app/model/binary";
import type { Params } from "@app/model/params";
import type { MoveDistribution } from "@app/model/wing";
import { ratioForLossRate } from "@app/model/wing";

/** The clean-season probability that defines the discussion case (the market switch's "Discussion case"). */
export const DISCUSSION_P_CLEAN = 0.55;

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
