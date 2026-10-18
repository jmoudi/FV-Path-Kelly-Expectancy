/**
 * This explainer's parameter schema: every input's label, unit, range, tier, deck group,
 * placement, section and sweep anchors. The generic types and sanitizers are in
 * src/kit/inputs/schema.ts; ParamDef here is the kit's, bound to Params.
 */
import { createSchema, type ParamDef as KitParamDef } from "@kit/inputs/schema";
import { CALENDAR_SHARE_KEYS, type Params } from "@app/model/params";
import { DEFAULT_PARAMS } from "./params";

export type ParamDef = KitParamDef<Params>;

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
      { id: "deck", label: "deck", help: "The deck's q when the sweep started.", fallback: "current" },
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
      { id: "deck", label: "deck", help: "The deck's risk a night when the sweep started.", fallback: "current" },
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

export const SCHEMA = createSchema<Params>({ defs: PARAM_DEFS, defaults: DEFAULT_PARAMS });

export const PARAM_BY_KEY: Record<string, ParamDef> = SCHEMA.byKey;

export function sanitizeParams(input: unknown): Params {
  return SCHEMA.sanitize(input);
}
