/**
 * The single parameter object every scenario reads from, plus its schema.
 * The schema is what the UI renders; tiers decide how prominent an input is.
 */
import type { MoveDistribution } from "./wing";

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
  realizedRatio: number;

  // --- advanced ---
  mcPaths: number;
  seed: number;
  maxCompositions: number;
  fanPaths: number;
  parallelTranches: number;
}

export const DEFAULT_PARAMS: Params = {
  lossRate: 0.02945,
  gain: 0.035,
  nights: 20,
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
  strikeDistance: 2.0,
  wingWidth: 0.5,
  creditFraction: 0.0338,
  moveDist: "normal",
  tailDf: 4,
  realizedRatio: 1.0,

  mcPaths: 20_000,
  seed: 42,
  maxCompositions: 250_000,
  fanPaths: 40,
  parallelTranches: 400,
};

export type Tier = "primary" | "secondary" | "advanced";
export type Unit = "pct" | "pct2" | "x" | "int" | "sigma" | "ratio" | "choice";

export interface ParamDef {
  key: keyof Params;
  label: string;
  short?: string;
  unit: Unit;
  min: number;
  max: number;
  step: number;
  tier: Tier;
  /** Which section the secondary input belongs to. */
  section?: string;
  help: string;
  choices?: { value: string; label: string }[];
}

export const PARAM_DEFS: ParamDef[] = [
  {
    key: "lossRate",
    label: "Loss rate per name",
    short: "q",
    unit: "pct2",
    min: 0.001,
    max: 0.08,
    step: 0.0005,
    tier: "primary",
    help: "Probability that one name hits max loss on one night. The binary abstraction treats every bad event as a full loss, so this is expected loss as a fraction of max loss (see section 4).",
  },
  {
    key: "gain",
    label: "Gain per unit risked",
    short: "b",
    unit: "pct",
    min: 0.005,
    max: 0.15,
    step: 0.0025,
    tier: "primary",
    help: "What a winning name pays as a fraction of the amount it risked. 3.5% is a wing that collects 3.4% of its width.",
  },
  { key: "nights", label: "Nights per season", short: "n", unit: "int", min: 5, max: 60, step: 1, tier: "primary", help: "Games in a row before the tranche is reckoned. One night can carry several names." },
  { key: "names", label: "Names per night", short: "k", unit: "int", min: 1, max: 6, step: 1, tier: "primary", help: "Independent bets placed on the same night in the diversified policies." },
  {
    key: "riskPerNight",
    label: "Tranche at risk per night",
    unit: "pct",
    min: 0.05,
    max: 1,
    step: 0.05,
    tier: "primary",
    help: "Share of the tranche that can be lost on one night in the reserve policy. 100% is the whole tranche; 50% keeps half in reserve.",
  },
  { key: "seasons", label: "Seasons chained", short: "N", unit: "int", min: 1, max: 12, step: 1, tier: "primary", help: "Seasons played back to back without refilling the tranche." },

  { key: "sharedOutcome", label: "Shared-outcome nights", short: "c", unit: "pct2", min: 0, max: 0.3, step: 0.0025, tier: "secondary", section: "correlation", help: "Share of nights on which all names effectively share one outcome because of a common cause." },
  { key: "volShock", label: "Realized ÷ priced sigma", unit: "ratio", min: 1, max: 2.5, step: 0.05, tier: "secondary", section: "correlation", help: "On shocked nights the realized move is this many times what every chain priced." },
  { key: "volShockShare", label: "Share of shocked nights", unit: "pct", min: 0, max: 1, step: 0.05, tier: "secondary", section: "correlation", help: "Fraction of nights that carry the shared volatility shock." },
  { key: "eventsPerYear", label: "Name-events per year", unit: "int", min: 10, max: 600, step: 10, tier: "secondary", section: "calibration", help: "How fast the track record grows." },
  { key: "zSigma", label: "Separation demanded", unit: "sigma", min: 1, max: 4, step: 0.25, tier: "secondary", section: "calibration", help: "How many standard errors apart two loss rates must sit before you call them different." },
  { key: "altLossRate", label: "Optimistic loss rate", unit: "pct2", min: 0.001, max: 0.08, step: 0.0005, tier: "secondary", section: "calibration", help: "The better rate you would like to be true. The question is how long it takes to tell it from the deck's rate." },
  { key: "singleNameShare", label: "Single-name nights", unit: "pct", min: 0, max: 1, step: 0.05, tier: "secondary", section: "diversification", help: "Share of a season's nights that offer only one name." },
  { key: "thresholdBelow", label: "Drawdown threshold", unit: "x", min: 0.1, max: 0.95, step: 0.05, tier: "secondary", section: "diversification", help: "Tables report the probability of ending below this multiple of the starting tranche." },
  { key: "strikeDistance", label: "Short strike distance", unit: "sigma", min: 0.5, max: 4, step: 0.05, tier: "secondary", section: "wing", help: "Distance from spot to the short strike, in sigmas the chain priced." },
  { key: "wingWidth", label: "Wing width", unit: "sigma", min: 0.05, max: 2, step: 0.05, tier: "secondary", section: "wing", help: "Distance between the short and the long strike, in priced sigmas." },
  { key: "creditFraction", label: "Credit ÷ width", unit: "pct2", min: 0.005, max: 0.3, step: 0.001, tier: "secondary", section: "wing", help: "Credit collected as a fraction of the wing width. Sets the gain per unit risked, b = c/(W−c)." },
  {
    key: "moveDist",
    label: "Move distribution",
    unit: "choice",
    min: 0,
    max: 0,
    step: 0,
    tier: "secondary",
    section: "wing",
    help: "Shape of the realized move. The Student-t is rescaled so its standard deviation equals the priced sigma.",
    choices: [
      { value: "normal", label: "Normal" },
      { value: "student", label: "Student-t" },
    ],
  },
  { key: "tailDf", label: "Student-t degrees of freedom", unit: "ratio", min: 2.5, max: 30, step: 0.5, tier: "secondary", section: "wing", help: "Lower is fatter-tailed. 4 is a common fit for single-stock earnings moves." },
  { key: "realizedRatio", label: "Realized ÷ priced sigma", unit: "ratio", min: 0.5, max: 2, step: 0.05, tier: "secondary", section: "wing", help: "Scales the whole realized distribution against what the chain priced." },

  { key: "mcPaths", label: "Monte Carlo paths", unit: "int", min: 2000, max: 200_000, step: 1000, tier: "advanced", help: "Used only when the exact enumeration would exceed the composition cap." },
  { key: "seed", label: "Random seed", unit: "int", min: 1, max: 99_999, step: 1, tier: "advanced", help: "Seeds every sampled path and replay. Change it to see a different draw." },
  { key: "maxCompositions", label: "Exact-enumeration cap", unit: "int", min: 10_000, max: 2_000_000, step: 10_000, tier: "advanced", help: "Above this many nightly-outcome compositions the engine switches to Monte Carlo." },
  { key: "fanPaths", label: "Paths in fan charts", unit: "int", min: 5, max: 200, step: 5, tier: "advanced", help: "How many sampled seasons the railroad charts draw." },
  { key: "parallelTranches", label: "Parallel tranches sampled", unit: "int", min: 50, max: 5000, step: 50, tier: "advanced", help: "How many independent replays the mean-versus-median charts pool." },
];

export const PARAM_BY_KEY: Record<string, ParamDef> = Object.fromEntries(PARAM_DEFS.map((d) => [d.key, d]));

export function sanitizeParams(input: unknown): Params {
  const out: Params = { ...DEFAULT_PARAMS };
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const def of PARAM_DEFS) {
    const v = src[def.key];
    if (def.unit === "choice") {
      if (typeof v === "string" && def.choices?.some((c) => c.value === v)) (out as unknown as Record<string, unknown>)[def.key] = v;
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      const clamped = Math.min(def.max, Math.max(def.min, v));
      (out as unknown as Record<string, unknown>)[def.key] = def.unit === "int" ? Math.round(clamped) : clamped;
    }
  }
  if (out.names * (out.riskPerNight / out.names) > 1) out.riskPerNight = 1;
  return out;
}
