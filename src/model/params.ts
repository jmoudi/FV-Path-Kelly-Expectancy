/**
 * The single parameter object every scenario reads from, plus its schema.
 * The schema is what the UI renders; tiers decide how prominent an input is.
 */
import { breakEvenLossRate, lossRateFromPClean } from "./binary";
import type { AnchorDef } from "../sweeps/types";
import type { Engine } from "./season";
import { ratioForLossRate, type MoveDistribution } from "./wing";

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

export type Tier = "primary" | "secondary" | "advanced";
export type Unit = "pct" | "pct2" | "x" | "int" | "sigma" | "ratio" | "choice";

/**
 * The deck's input groups, in drawer order. `label` is the caption over the group in
 * the reduced deck's first row (only groups with a field placed in that row show
 * there); `title` is the group's heading in the drawer.
 */
export type ParamGroup = "event" | "season" | "sizing" | "shared" | "band";
export const GROUP_LABELS: Record<ParamGroup, { label: string; title: string; blurb: string }> = {
  event: { label: "Per event", title: "Event", blurb: "What one name does on one night." },
  season: { label: "Per season", title: "Season", blurb: "How many nights, how many names a night, and how often the names share a cause." },
  sizing: { label: "Sizing", title: "Sizing", blurb: "How much of the tranche a night can lose, how long you replay it, and the drawdown the figures count." },
  shared: { label: "Shared risk", title: "Shared risk", blurb: "Nights on which realized volatility runs above what every chain priced." },
  band: { label: "Calibration band", title: "Calibration band", blurb: "How fast the record grows, and how far apart two loss rates must sit before the record tells them apart." },
};

/** Where an input sits in the deck beyond its group (tier 1 is the deck). */
export interface DeckPlacement {
  /** Shown in the reduced deck's first row, not only in the drawer. */
  row?: boolean;
  /** Kept in that row on a phone (≤ 700px), where the row holds four fields. */
  phone?: boolean;
}

/**
 * How the synthetic number input behaves for one parameter. The slider's feel is a
 * physical distance, not a share of its rendered width.
 */
export interface InputConfig {
  /** Show the drag slider under the box. */
  slider: boolean;
  /** Drag sensitivity in the input's own units per 100 px of pointer travel (Shift ×0.1). */
  perHundredPx?: number;
  /** What one unit of an integer input counts, for "1 name" / "5 nights" in sweep descriptions. */
  noun?: { one: string; many: string };
  /** Pixels of drag from the middle to either extreme; used only where perHundredPx is not set. */
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
  /** A shorter name for tight places (the reduced deck); the label stays the full name. */
  shortLabel?: string;
  unit: Unit;
  min: number;
  max: number;
  step: number;
  tier: Tier;
  /** Which section the secondary input belongs to. */
  section?: string;
  /** Which deck group (drawer section) the input belongs to. */
  group?: ParamGroup;
  /** Its place in the reduced deck; set in DECK_PLACEMENT below. */
  deck?: DeckPlacement;
  help: string;
  /** A one-line definition for the glossary in the expanded deck. */
  definition?: string;
  choices?: { value: string; label: string }[];
  /** The input also changes the deck's policies, so every section moves with it. */
  affectsAll?: boolean;
  input?: Partial<InputConfig>;
  /** Whether a sweep preset may drive it. Engine settings and seeds are not swept. */
  sweepable?: boolean;
  /** Named points a sweep range or spot can refer to; the app computes their values (src/app/params/sweepAnchors.ts). */
  anchors?: AnchorDef[];
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
    help: "Probability that one name hits max loss on one night. The binary abstraction treats every bad event as a full loss, so this is expected loss as a fraction of max loss (section 04 derives it from a wing). Typing a value here makes the market state custom.",
    definition: "q: expected loss per unit of max loss on one name-event. The breach rate overstates it, the full-gap rate understates it.",
    input: { sensitivityPx: 320, wheelStep: 0.0005, perHundredPx: 0.0025 },
    anchors: [
      { id: "optimistic", label: "optimistic", help: "The optimistic loss rate (section 03)." },
      { id: "deck", label: "deck", help: "The deck's q when the sweep started." },
      { id: "break-even", label: "break-even", help: "b ÷ (1 + b): the fair rate, zero premium." },
    ],
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
    input: { decimals: 2, perHundredPx: 0.0025 },
  },
  { key: "nights", label: "Nights per season", short: "n", unit: "int", min: 5, max: 60, step: 1, tier: "primary", group: "season", help: "Games in a row before the tranche is reckoned. One night can carry several names.", definition: "n: nights in a season. Clean season (Coin) = (1 − q)^n; clean end = (1 + b)^n.", input: { perHundredPx: 5, noun: { one: "night", many: "nights" } } },
  { key: "names", label: "Names a night", short: "k", unit: "int", min: 1, max: 6, step: 1, tier: "primary", group: "season", help: "Independent bets placed on the same night in the Spread and Spread + reserve policies.", definition: "k: names on one night. Each risks 1/k of what the night risks.", input: { sensitivityPx: 140, perHundredPx: 1, noun: { one: "name", many: "names" } } },
  {
    key: "riskPerNight",
    label: "At risk a night",
    shortLabel: "At risk a night",
    short: "risk",
    unit: "pct",
    min: 0.05,
    max: 1,
    step: 0.05,
    tier: "primary",
    group: "sizing",
    help: "Share of the tranche that can be lost on one night in the Spread + reserve policy. 100% is the whole tranche; 50% keeps half in reserve.",
    definition: "At risk a night: the most a night can take from the tranche. The rest is the reserve.",
    input: { perHundredPx: 0.1 },
    anchors: [
      { id: "robust", label: "robust", help: "The risk a night that maximises growth averaged over the loss rates you cannot rule out." },
      { id: "kelly", label: "Kelly", help: "The growth-optimal risk a night at the deck's loss rate." },
      { id: "deck", label: "deck", help: "The deck's risk a night when the sweep started." },
    ],
  },
  { key: "seasons", label: "Seasons chained", short: "N", unit: "int", min: 1, max: 12, step: 1, tier: "primary", group: "sizing", help: "Seasons played back to back without refilling the tranche.", definition: "N: seasons replayed without refilling. The median after N seasons is the number the middle path shows.", input: { sensitivityPx: 160, perHundredPx: 1, noun: { one: "season", many: "seasons" } } },

  {
    key: "sharedOutcome",
    label: "Shared-cause nights",
    short: "c",
    unit: "pct2",
    min: 0,
    max: 0.3,
    step: 0.0025,
    tier: "secondary",
    section: "correlation",
    affectsAll: true,
    help: "Share of nights on which all names effectively share one outcome because of a common cause. It enters the Spread and Spread + reserve policies, so every section moves with it.",
  },
  { key: "volShock", label: "Shock: realized ÷ priced sigma", unit: "ratio", min: 1, max: 2.5, step: 0.05, tier: "secondary", section: "correlation", help: "On shocked nights the realized move is this many times what every chain priced." },
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
    help: "The better rate you would like to be true. Sections 03, 07 and 08 compare it with the deck's rate and with break-even.",
    input: { perHundredPx: 0.0025 },
  },
  { key: "singleNameShare", label: "Single-name nights", unit: "pct", min: 0, max: 1, step: 0.05, tier: "secondary", section: "diversification", help: "Share of a season's nights that offer only one name." },
  { key: "thresholdBelow", label: "Drawdown threshold", unit: "x", min: 0.1, max: 0.95, step: 0.05, tier: "secondary", section: "diversification", affectsAll: true, help: "Tables and figures report the probability of ending below this multiple of the starting tranche." },
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
  {
    key: "realizedRatio",
    label: "Realized ÷ priced sigma",
    unit: "ratio",
    min: 0.3,
    max: 2.5,
    step: 0.01,
    tier: "secondary",
    section: "wing",
    help: "Scales the whole realized distribution against what the chain priced. 1.00 means the chain was right on average; the default is solved so the wing's effective loss rate equals the deck's q.",
  },
  { key: "parallelTranches", label: "Parallel tranches sampled", unit: "int", min: 50, max: 5000, step: 50, tier: "secondary", section: "mean-median", help: "How many independent replays the pooling chart averages.", sweepable: false },
  ...CALENDAR_SHARE_KEYS.map(
    (key, m): ParamDef => ({
      key,
      label: m === 0 ? "Empty nights" : `Nights with ${m} name${m === 1 ? "" : "s"}`,
      unit: "pct",
      min: 0,
      max: 1,
      step: 0.05,
      tier: "secondary",
      section: "axes",
      help: `Share of the season's calendar nights that offer ${m === 0 ? "no names" : `${m} name${m === 1 ? "" : "s"}`}. The six shares are scaled to 100% together; each name is sized at its own Kelly fraction, so ${m === 0 ? "an empty night uses no capital and adds no term to the growth sum" : "a denser night uses more of the tranche"}.`,
      input: { sensitivityPx: 160 },
    }),
  ),
  { key: "symWinRate", label: "Win rate, symmetric system", unit: "pct", min: 0.5, max: 0.8, step: 0.01, tier: "secondary", section: "calibration", help: "Win rate of the frequent-outcome system section 03 compares with the tranche: a symmetric payoff, one trade per event, the same number of events as a season. The discussion's case is 60%." },
  { key: "symStake", label: "Stake per trade, symmetric system", unit: "pct", min: 0.005, max: 0.25, step: 0.005, tier: "secondary", section: "calibration", help: "Share of that system's account won or lost on each trade. Its growth-optimal stake is 2p − 1; the chart compares shapes, so a modest stake keeps both seasons on one axis.", input: { decimals: 1 } },
  {
    key: "market",
    label: "Market",
    unit: "choice",
    min: 0,
    max: 0,
    step: 0,
    tier: "secondary",
    section: "market",
    help: "Fair market sets q = b/(1+b): zero premium, growth-optimal risk 0. Discussion case sets q so that a clean coin season has probability 55% at the deck's nights. Editing q by hand makes it custom. The discussion's case is an assumed risk premium for selling tail insurance, not an information edge.",
    definition: "Market: fair means q = b/(1+b) (zero premium); discussion means a 55% clean coin season; custom means q was typed.",
    choices: [
      { value: "fair", label: "Fair market (q = b/(1+b))" },
      { value: "discussion", label: "Discussion case (55% clean season)" },
      { value: "custom", label: "Custom" },
    ],
  },

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

// ---------------------------------------------------------------------------
// Tiering. Tier 1 is the deck, tier 2 the section strips (each scenario lists its
// own inputs), tier 3 Settings. Where every deck input sits is kept here in one
// table and applied onto the definitions above, so the deck's layout reads in one
// place: `group` is the drawer section, `deck.row` puts the field in the reduced
// deck's first row (eight fields in three groups), `deck.phone` keeps it there on a
// phone (four fields).
// ---------------------------------------------------------------------------

type Placement = Partial<Pick<ParamDef, "group" | "tier" | "shortLabel" | "short" | "deck">>;

const DECK_PLACEMENT: Partial<Record<keyof Params, Placement>> = {
  lossRate: { group: "event", deck: { row: true, phone: true } },
  gain: { group: "event", deck: { row: true, phone: true } },
  // Secondary tier, in the row because sections 03, 07 and 08 all read it.
  altLossRate: { group: "event", deck: { row: true } },
  nights: { group: "season", shortLabel: "Nights", deck: { row: true } },
  names: { group: "season", deck: { row: true, phone: true } },
  // Enters every policy, so it is a deck input, not a section input.
  sharedOutcome: { group: "season", tier: "primary", deck: { row: true } },
  // "risk" is a word, not a symbol; the label already says it.
  riskPerNight: { group: "sizing", short: undefined, deck: { row: true, phone: true } },
  seasons: { group: "sizing", deck: { row: true } },
  thresholdBelow: { group: "sizing" },
  volShock: { group: "shared" },
  volShockShare: { group: "shared" },
  eventsPerYear: { group: "band" },
  zSigma: { group: "band" },
};

/** Seeds, caps and path counts take plain number boxes: a drag slider means nothing for them. */
const NO_SLIDER: readonly (keyof Params)[] = ["seed", "maxCompositions", "mcPaths", "fanPaths"];

for (const def of PARAM_DEFS) {
  const place = DECK_PLACEMENT[def.key];
  if (place) Object.assign(def, place);
  if (NO_SLIDER.includes(def.key)) def.input = { ...def.input, slider: false };
}

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
