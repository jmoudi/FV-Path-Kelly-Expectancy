/**
 * The single parameter object every scenario reads from, plus its schema.
 * The schema is what the UI renders; tiers decide how prominent an input is.
 */
import type { Engine } from "./season";
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
  parallelTranches: number;

  // --- advanced ---
  engine: Engine;
  mcPaths: number;
  seed: number;
  maxCompositions: number;
  fanPaths: number;
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
  parallelTranches: 400,

  engine: "auto",
  mcPaths: 20_000,
  seed: 42,
  maxCompositions: 60_000,
  fanPaths: 40,
};

export type Tier = "primary" | "secondary" | "advanced";
export type Unit = "pct" | "pct2" | "x" | "int" | "sigma" | "ratio" | "choice";

/** The deck's three input groups. */
export type ParamGroup = "event" | "season" | "sizing";
export const GROUP_LABELS: Record<ParamGroup, { label: string; blurb: string }> = {
  event: { label: "Per event", blurb: "What one name does on one night." },
  season: { label: "Per season", blurb: "How many nights, how many names a night." },
  sizing: { label: "Sizing", blurb: "How much of the tranche a night can lose, and how long you replay it." },
};

/**
 * How the synthetic number input behaves for one parameter. The slider's feel is a
 * physical distance, not a share of its rendered width.
 */
export interface InputConfig {
  /** Show the drag slider under the box. */
  slider: boolean;
  /** Pixels of drag from the middle to either extreme. */
  sensitivityPx: number;
  /** Change per wheel notch; defaults to the step. */
  wheelStep?: number;
  /** Decimal places shown in the box (in display units). */
  decimals?: number;
}

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
  /** Which deck group a primary input belongs to. */
  group?: ParamGroup;
  help: string;
  /** A one-line definition for the glossary in the expanded deck. */
  definition?: string;
  choices?: { value: string; label: string }[];
  /** The input also changes the deck's policies, so every section moves with it. */
  affectsAll?: boolean;
  input?: Partial<InputConfig>;
  /** Whether a sweep preset may drive it. Engine settings and seeds are not swept. */
  sweepable?: boolean;
}

export const DEFAULT_INPUT: InputConfig = { slider: true, sensitivityPx: 220 };

export function inputConfig(def: ParamDef): InputConfig {
  return { ...DEFAULT_INPUT, ...(def.input ?? {}) };
}

export function isSweepable(def: ParamDef): boolean {
  if (def.unit === "choice") return false;
  return def.sweepable ?? def.tier !== "advanced";
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
    group: "event",
    help: "Probability that one name hits max loss on one night. The binary abstraction treats every bad event as a full loss, so this is expected loss as a fraction of max loss (section 4 derives it from a wing).",
    definition: "q: expected loss per unit of max loss on one name-event. The breach rate overstates it, the full-gap rate understates it.",
    input: { sensitivityPx: 320, wheelStep: 0.0005 },
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
    group: "event",
    help: "What a winning name pays as a fraction of the amount it risked. 3.5% is a wing that collects 3.4% of its width.",
    definition: "b: credit over max loss, c ÷ (W − c). Break-even loss rate is b ÷ (1 + b).",
    input: { decimals: 2 },
  },
  { key: "nights", label: "Nights per season", short: "n", unit: "int", min: 5, max: 60, step: 1, tier: "primary", group: "season", help: "Games in a row before the tranche is reckoned. One night can carry several names.", definition: "n: nights in a season. Clean season = (1 − q)^n; clean end = (1 + b)^n." },
  { key: "names", label: "Names per night", short: "k", unit: "int", min: 1, max: 6, step: 1, tier: "primary", group: "season", help: "Independent bets placed on the same night in the diversified policies.", definition: "k: names on one night. Each risks 1/k of what the night risks.", input: { sensitivityPx: 140 } },
  {
    key: "riskPerNight",
    label: "Tranche at risk per night",
    short: "risk",
    unit: "pct",
    min: 0.05,
    max: 1,
    step: 0.05,
    tier: "primary",
    group: "sizing",
    help: "Share of the tranche that can be lost on one night in the reserve policy. 100% is the whole tranche; 50% keeps half in reserve.",
    definition: "Risk per night: the most a night can take from the tranche. The rest is the reserve.",
  },
  { key: "seasons", label: "Seasons chained", short: "N", unit: "int", min: 1, max: 12, step: 1, tier: "primary", group: "sizing", help: "Seasons played back to back without refilling the tranche.", definition: "N: seasons replayed without refilling. Median after N is the number you most likely see.", input: { sensitivityPx: 160 } },

  {
    key: "sharedOutcome",
    label: "Shared-outcome nights",
    short: "c",
    unit: "pct2",
    min: 0,
    max: 0.3,
    step: 0.0025,
    tier: "secondary",
    section: "correlation",
    affectsAll: true,
    help: "Share of nights on which all names effectively share one outcome because of a common cause. It enters every diversified policy, so every section moves with it.",
  },
  { key: "volShock", label: "Realized ÷ priced sigma on shocked nights", unit: "ratio", min: 1, max: 2.5, step: 0.05, tier: "secondary", section: "correlation", help: "On shocked nights the realized move is this many times what every chain priced." },
  { key: "volShockShare", label: "Share of shocked nights", unit: "pct", min: 0, max: 1, step: 0.05, tier: "secondary", section: "correlation", help: "Fraction of nights that carry the shared volatility shock." },
  { key: "eventsPerYear", label: "Name-events per year", unit: "int", min: 10, max: 600, step: 10, tier: "secondary", section: "calibration", help: "How fast the track record grows." },
  { key: "zSigma", label: "Separation demanded", unit: "sigma", min: 1, max: 4, step: 0.25, tier: "secondary", section: "calibration", help: "How many standard errors apart two loss rates must sit before you call them different. 2σ is a weak bar; a one-sided 5% test with 80% power needs about 1.6× as many events." },
  {
    key: "altLossRate",
    label: "Optimistic loss rate",
    unit: "pct2",
    min: 0.001,
    max: 0.08,
    step: 0.0005,
    tier: "secondary",
    section: "calibration",
    affectsAll: true,
    help: "The better rate you would like to be true. Sections 3, 7 and 8 compare it with the deck's rate and with break-even.",
  },
  { key: "singleNameShare", label: "Single-name nights", unit: "pct", min: 0, max: 1, step: 0.05, tier: "secondary", section: "diversification", help: "Share of a season's nights that offer only one name." },
  { key: "thresholdBelow", label: "Drawdown threshold", unit: "x", min: 0.1, max: 0.95, step: 0.05, tier: "secondary", section: "diversification", affectsAll: true, help: "Tables and tiles report the probability of ending below this multiple of the starting tranche." },
  { key: "strikeDistance", label: "Short strike distance", unit: "sigma", min: 0.5, max: 4, step: 0.05, tier: "secondary", section: "wing", help: "Distance from spot to the short strike, in sigmas the chain priced." },
  { key: "wingWidth", label: "Wing width", unit: "sigma", min: 0.05, max: 2, step: 0.05, tier: "secondary", section: "wing", help: "Distance between the short and the long strike, in priced sigmas." },
  { key: "creditFraction", label: "Credit ÷ width", unit: "pct2", min: 0.005, max: 0.3, step: 0.001, tier: "secondary", section: "wing", help: "Credit collected as a fraction of the wing width. Sets the gain per unit risked, b = c/(W−c), and the fair loss rate c/W." },
  {
    key: "moveDist",
    label: "Move distribution",
    unit: "choice",
    min: 0,
    max: 0,
    step: 0,
    tier: "secondary",
    section: "wing",
    help: "Shape of the realized move toward the short strike. The Student-t is rescaled so its standard deviation equals the priced sigma. Empirical uses the moves you imported.",
    choices: [
      { value: "normal", label: "Normal" },
      { value: "student", label: "Student-t" },
      { value: "empirical", label: "Imported moves" },
    ],
  },
  { key: "tailDf", label: "Student-t degrees of freedom", unit: "ratio", min: 2.5, max: 30, step: 0.5, tier: "secondary", section: "wing", help: "Lower is fatter-tailed. 4 is a common fit for single-stock earnings moves." },
  { key: "realizedRatio", label: "Realized ÷ priced sigma", unit: "ratio", min: 0.3, max: 2.5, step: 0.01, tier: "secondary", section: "wing", help: "Scales the whole realized distribution against what the chain priced. 1.00 means the chain was right on average." },
  { key: "parallelTranches", label: "Parallel tranches sampled", unit: "int", min: 50, max: 5000, step: 50, tier: "secondary", section: "mean-median", help: "How many independent replays the pooling chart averages.", sweepable: false },

  {
    key: "engine",
    label: "Distribution engine",
    unit: "choice",
    min: 0,
    max: 0,
    step: 0,
    tier: "advanced",
    help: "Auto enumerates every nightly-outcome composition exactly while there are fewer than the cap, and otherwise runs a binned log-space recursion that matches the exact result to about 1e-4. Monte Carlo is a cross-check.",
    choices: [
      { value: "auto", label: "Auto (exact, then binned)" },
      { value: "exact", label: "Exact only" },
      { value: "binned", label: "Binned" },
      { value: "montecarlo", label: "Monte Carlo" },
    ],
  },
  { key: "maxCompositions", label: "Exact-enumeration cap", unit: "int", min: 5_000, max: 2_000_000, step: 5_000, tier: "advanced", help: "Above this many nightly-outcome compositions the auto engine switches to the binned recursion." },
  { key: "mcPaths", label: "Monte Carlo paths", unit: "int", min: 2000, max: 200_000, step: 1000, tier: "advanced", help: "Used only when the engine is set to Monte Carlo." },
  { key: "seed", label: "Random seed", unit: "int", min: 1, max: 99_999, step: 1, tier: "advanced", help: "Seeds every sampled path and replay. Change it to see a different draw." },
  { key: "fanPaths", label: "Paths in fan charts", unit: "int", min: 5, max: 200, step: 5, tier: "advanced", help: "How many sampled seasons the railroad charts draw." },
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
  return out;
}

/** Imported datasets: numbers only, kept beside the parameters. */
export interface Datasets {
  /** Per-event outcomes: 0/1 full losses, or P&L per unit of max loss. */
  record: number[];
  /** Realized moves in priced sigmas, positive toward the short strike. */
  moves: number[];
}

export const EMPTY_DATASETS: Datasets = { record: [], moves: [] };

export function sanitizeDatasets(input: unknown): Datasets {
  const out: Datasets = { record: [], moves: [] };
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const k of ["record", "moves"] as const) {
    const v = src[k];
    if (Array.isArray(v)) out[k] = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).slice(0, 100_000);
  }
  return out;
}
