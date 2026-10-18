import type { ColorRole, NumberFormat } from "../charts/spec";
import { breakEvenLossRate, cleanEnd, pCleanFromLossRate } from "../model/binary";
import { recordStats, type RecordStats } from "../model/calibration";
import { medianGrowthPerSeason } from "../model/growth";
import { betaPosterior, kellyFraction, nightOptimum, robustOptimum, seasonLogGrowth, seasonRuin, uniformBand, type RateWeights } from "../model/kelly";
import { MARKET_TOL, marketLossRate, marketOf, type Datasets, type Market, type Params } from "../model/params";
import { POLICY_IDS, POLICY_LEGEND, YOUR_POLICY, policies, type PolicyDef, type PolicyId, type PolicyMeta } from "../model/policies";
import { scheduleDistribution, summarize, type Distribution, type DistributionOptions, type Summary } from "../model/season";
import { quoted, type SourceFigure } from "./types";

export type { PolicyId };

// ---------------------------------------------------------------------------
// The one number formatter. Every string the app shows a number in comes from
// here; the minus sign is always U+2212.
// ---------------------------------------------------------------------------

export const MINUS = "−";

/** Replace the hyphen-minus a JavaScript number prints with the typographic minus. */
export function typographic(s: string): string {
  return s.replace(/-/g, MINUS);
}

/** Format a number in one of the chart formats (the same names src/charts/spec.ts uses). */
export function formatNumber(v: number | string | null | undefined, fmt: NumberFormat = "auto"): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? `${MINUS}∞` : "–";
  switch (fmt) {
    case "pct":
      return pct(v, 0);
    case "pct1":
      return pct(v, 1);
    case "pct2":
      return pct(v, 2);
    case "pct3":
      return pct(v, 3);
    case "x":
      return x2(v);
    case "x2":
      return typographic(v.toFixed(2));
    case "int":
      return fmtInt(v);
    case "sci":
      return v === 0 ? "0" : typographic(v.toExponential(1));
    case "num":
      return typographic(Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));
    default:
      return autoFormat(v);
  }
}

export function autoFormat(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return typographic(v.toExponential(1));
  if (a >= 1000) return fmtInt(v);
  if (a >= 100) return typographic(v.toFixed(0));
  if (a >= 10) return typographic(v.toFixed(1));
  if (a >= 1) return typographic(v.toFixed(2));
  if (a >= 0.01) return typographic(v.toFixed(3));
  if (a >= 1e-4) return typographic(v.toFixed(5));
  return typographic(v.toExponential(1));
}

/** A share as a percentage with `dd` decimals: 0.0294 → "2.94%". */
export const pct = (v: number, dd = 0) => (Number.isFinite(v) ? typographic(`${(v * 100).toFixed(dd)}%`) : formatNumber(v));
export const pct1 = (v: number) => pct(v, 1);
export const pct2 = (v: number) => pct(v, 2);
export const pct3 = (v: number) => pct(v, 3);
/** A multiple of the starting tranche: 1.09 → "1.09×". */
export const x2 = (v: number) => (Number.isFinite(v) ? typographic(`${v.toFixed(2)}×`) : formatNumber(v));
/** A signed percentage: +9.4% / −4.2%. */
export const signedPct1 = (v: number) => signedPct(v, 1);
export function signedPct(v: number, dd = 1): string {
  if (!Number.isFinite(v)) return v < 0 ? `${MINUS}∞` : "∞";
  const s = (Math.abs(v) * 100).toFixed(dd);
  const zero = Number(s) === 0;
  return `${zero ? "" : v < 0 ? MINUS : "+"}${s}%`;
}
/** A difference between two rates, in percentage points: 0.0044 → "+0.44 pp". */
export function signedPp(v: number, dd = 2): string {
  if (!Number.isFinite(v)) return v < 0 ? `${MINUS}∞` : "∞";
  const s = (Math.abs(v) * 100).toFixed(dd);
  const zero = Number(s) === 0;
  return `${zero ? "" : v < 0 ? MINUS : "+"}${s} pp`;
}
/** A count with thousands separators: 1453 → "1,453". */
export const fmtInt = (v: number) => (Number.isFinite(v) ? typographic(Math.round(v).toLocaleString("en-US")) : formatNumber(v));
/** A sigma distance: 2 → "2.00σ". */
export const sigma = (v: number) => typographic(`${v.toFixed(2)}σ`);
/** A ratio: 1.17 → "1.17×". */
export const ratio = (v: number) => typographic(`${v.toFixed(2)}×`);

/** A probability formatted so that tiny values stay readable. */
export function smallPct(v: number): string {
  if (!Number.isFinite(v)) return formatNumber(v);
  if (v === 0) return "0%";
  const a = Math.abs(v);
  if (a < 1e-6) return `${v < 0 ? MINUS : ""}< 0.0001%`;
  if (a < 1e-4) return typographic(`${(v * 100).toPrecision(2)}%`);
  if (a < 0.01) return typographic(`${(v * 100).toFixed(3)}%`);
  if (a < 0.1) return typographic(`${(v * 100).toFixed(2)}%`);
  return typographic(`${(v * 100).toFixed(1)}%`);
}

/** A time interval: sub-second in milliseconds, seconds otherwise. */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return formatNumber(ms);
  if (Math.abs(ms) < 1000) return `${typographic(Math.round(ms).toString())} ms`;
  const s = ms / 1000;
  return `${typographic(Number.isInteger(s) ? s.toFixed(0) : s.toFixed(1))} s`;
}

/** Events at a yearly pace, as a duration: "7 months", "2.5 years", "18 years". */
export function years(events: number, perYear: number): string {
  const y = events / perYear;
  if (!Number.isFinite(y)) return "never";
  if (y < 1) return `${Math.max(1, Math.round(y * 12))} months`;
  if (y < 10) return `${typographic(y.toFixed(1))} years`;
  return `${typographic(y.toFixed(0))} years`;
}

export function methodLabel(m: Distribution["method"]): string {
  return m === "exact" ? "computed exactly" : m === "binned" ? "computed on a fine log grid" : "Monte Carlo";
}

/** Whether a recomputed figure agrees with a quoted one, within a tolerance. */
export function near(quoted: number, computed: number, absTol: number, relTol = 0.05): boolean {
  if (!Number.isFinite(quoted) || !Number.isFinite(computed)) return false;
  const diff = Math.abs(quoted - computed);
  return diff <= absTol || diff <= relTol * Math.abs(quoted);
}

/** The badge of a story that moves the deck: "moves deck: q 2.94% → 2.52%". */
export function movesDeck(label: string, from: string, to: string): string {
  return `moves deck: ${label} ${from} → ${to}`;
}

/** The discussion's setup, which every quoted figure assumes. */
export const DISCUSSION = { q: 0.02945, b: 0.035, n: 20, k: 3, risk: 0.5, N: 4, c: 0, threshold: 0.5, alt: 0.0252, z: 2, perYear: 80 } as const;
export type DiscussionInput = keyof typeof DISCUSSION;

/**
 * When a recomputed figure disagrees with the quote, the usual reason is that the
 * deck has moved off the discussion's inputs. Name the inputs that differ.
 */
export function whyDeck(p: Params, deps: readonly DiscussionInput[]): string | undefined {
  const diffs: string[] = [];
  const off = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  for (const dep of deps) {
    switch (dep) {
      case "q":
        if (off(p.lossRate, DISCUSSION.q, 5e-5)) diffs.push(`q ${pct2(p.lossRate)} (quoted at ${pct2(DISCUSSION.q)})`);
        break;
      case "b":
        if (off(p.gain, DISCUSSION.b, 5e-5)) diffs.push(`b ${pct2(p.gain)} (quoted at ${pct1(DISCUSSION.b)})`);
        break;
      case "n":
        if (p.nights !== DISCUSSION.n) diffs.push(`${p.nights} nights (quoted for ${DISCUSSION.n})`);
        break;
      case "k":
        if (Math.round(p.names) !== DISCUSSION.k) diffs.push(`${Math.round(p.names)} names a night (quoted for ${DISCUSSION.k})`);
        break;
      case "risk":
        if (off(p.riskPerNight, DISCUSSION.risk, 1e-6)) diffs.push(`${pct(p.riskPerNight)} at risk a night (quoted for ${pct(DISCUSSION.risk)})`);
        break;
      case "N":
        if (p.seasons !== DISCUSSION.N) diffs.push(`${p.seasons} seasons (quoted for ${DISCUSSION.N})`);
        break;
      case "c":
        if (off(p.sharedOutcome, DISCUSSION.c, 1e-9)) diffs.push(`shared-cause nights ${pct2(p.sharedOutcome)} (quoted for independent names)`);
        break;
      case "threshold":
        if (off(p.thresholdBelow, DISCUSSION.threshold, 1e-6)) diffs.push(`threshold ${x2(p.thresholdBelow)} (quoted for ${x2(DISCUSSION.threshold)})`);
        break;
      case "alt":
        if (off(p.altLossRate, DISCUSSION.alt, 5e-5)) diffs.push(`optimistic rate ${pct2(p.altLossRate)} (quoted at ${pct2(DISCUSSION.alt)})`);
        break;
      case "z":
        if (off(p.zSigma, DISCUSSION.z, 1e-6)) diffs.push(`${p.zSigma}σ separation (quoted at ${DISCUSSION.z}σ)`);
        break;
      case "perYear":
        if (p.eventsPerYear !== DISCUSSION.perYear) diffs.push(`${p.eventsPerYear} events a year (quoted at ${DISCUSSION.perYear})`);
        break;
    }
  }
  return diffs.length ? `The deck differs from the discussion's setup: ${diffs.join(", ")}.` : undefined;
}

/**
 * A quoted-vs-recomputed row. When the figure disagrees, the reason is the deck
 * input that moved, or else the reason given, or else rounding.
 */
export function fig(p: Params, label: string, quotedText: string, computed: string, agrees: boolean, deps: readonly DiscussionInput[], reason?: string): SourceFigure {
  const why = agrees ? undefined : (whyDeck(p, deps) ?? reason ?? "Rounding in the discussion.");
  return quoted(label, quotedText, computed, agrees, why);
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
  zeroPremium: boolean;
  /** The one line next to the switch. */
  line: string;
  /** What the Desk and the sizing views say under fair pricing (empty otherwise). */
  sizingNote: string;
}

export const MARKET_LINE = "The discussion's case is an assumed risk premium for selling tail insurance, not an information edge.";
export const ZERO_PREMIUM_NOTE = "At zero premium the growth-optimal risk is 0; sizing only changes the median, P(below threshold) and ruin.";

export function marketState(p: Params): MarketState {
  const fairRate = marketLossRate("fair", p);
  const discussionRate = marketLossRate("discussion", p);
  const actual = marketOf(p);
  const premium = fairRate - p.lossRate;
  const zeroPremium = premium <= MARKET_TOL;
  return {
    chosen: p.market,
    actual,
    fairRate,
    discussionRate,
    premium,
    zeroPremium,
    line: zeroPremium ? `Fair pricing: q = b/(1+b) = ${pct2(fairRate)}, premium over fair 0.` : `${MARKET_LINE} The deck's q asserts ${signedPp(premium)} premium over fair per event.`,
    sizingNote: zeroPremium ? ZERO_PREMIUM_NOTE : "",
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

// ---------------------------------------------------------------------------
// What the control deck shows.
// ---------------------------------------------------------------------------

/** One figure in the deck's figure table: label, basis, a formatted value, a policy colour. */
export interface DeckFigure {
  id: string;
  label: string;
  basis: string;
  value: string;
  color?: ColorRole;
  help: string;
}

/** The row-2 line for the policy the reader holds, with values both raw and formatted. */
export interface PolicyLine {
  id: PolicyId;
  name: string;
  label: string;
  detail: string;
  color: PolicyMeta["color"];
  seasons: number;
  threshold: number;
  /** mean − 1 for one season. */
  evPerSeason: number;
  medianAfterN: number;
  pBelowAfterN: number;
  ruinAfterN: number;
  /** E[log end | survive] per season, and ruin per season. */
  logGrowth: number;
  ruinPerSeason: number;
  /** median_N^(1/N) − 1. */
  medianGrowthPerSeason: number;
  text: { ev: string; median: string; pBelow: string; ruin: string; logGrowth: string; medianGrowth: string };
}

/** What the control deck needs; small enough to cross a worker boundary cheaply. */
export interface DeckView {
  pClean: number;
  cleanEnd: number;
  meanSeason: number;
  breakEven: number;
  kelly: number;
  /** Log growth of surviving paths per season for your policy. */
  growthYours: number;
  ruinYours: number;
  /** @deprecated alias of growthYours, kept while the deck bar moves to the new names. */
  growthC: number;
  /** @deprecated alias of ruinYours. */
  ruinC: number;
  season: Record<PolicyId, Summary>;
  chained: Record<PolicyId, Summary>;
  /** @deprecated alias of season.spread. */
  seasonB: Summary;
  /** @deprecated alias of chained.reserve. */
  chainedC: Summary;
  robust: { risk: number; growth: number };
  nightKelly: { risk: number; growth: number };
  bandLabel: string;
  recordEvents: number;
  method: { season: Distribution["method"]; chained: Distribution["method"] };
  degenerate: Derived["degenerate"];
  /** Row 2: your policy. */
  yours: PolicyLine;
  /** Row 2, muted: "Coin: clean season 55% · ruin 45%". */
  coin: { pClean: number; ruin: number; cleanEnd: number; mean: number; text: string };
  /** The persistent mini-legend. */
  legend: PolicyMeta[];
  market: MarketState;
  /** The drawer's figure table, every policy named. */
  figures: DeckFigure[];
  /** The drawer's definitions of the figures (parameter definitions come from the schema). */
  definitions: { term: string; def: string }[];
}

export function deckView(d: Derived, p: Params): DeckView {
  const yoursDef = d.byId[d.yours];
  const s1 = d.season[d.yours].summary;
  const sN = d.chained[d.yours].summary;
  const spread1 = d.season.spread.summary;
  const N = p.seasons;
  const medianGrowth = medianGrowthPerSeason(sN.median, N);
  const yours: PolicyLine = {
    id: d.yours,
    name: yoursDef.name,
    label: yoursDef.label,
    detail: yoursDef.detail,
    color: yoursDef.color,
    seasons: N,
    threshold: p.thresholdBelow,
    evPerSeason: s1.mean - 1,
    medianAfterN: sN.median,
    pBelowAfterN: sN.pBelow,
    ruinAfterN: sN.pRuin,
    logGrowth: d.growthYours,
    ruinPerSeason: d.ruinYours,
    medianGrowthPerSeason: medianGrowth,
    text: { ev: signedPct1(s1.mean - 1), median: x2(sN.median), pBelow: pct(sN.pBelow), ruin: smallPct(sN.pRuin), logGrowth: signedPct1(d.growthYours), medianGrowth: signedPct1(medianGrowth) },
  };
  const coinRuin = 1 - d.pClean;
  const seasonsWord = `${N} season${N === 1 ? "" : "s"}`;
  const coinName = d.byId.coin.name;
  const spreadName = d.byId.spread.name;
  const figures: DeckFigure[] = [
    { id: "clean", label: `Clean season (${coinName})`, basis: `(1 − q)^${p.nights} at q ${pct2(p.lossRate)}`, value: pct(d.pClean), color: "a", help: "Probability that a single all-in name survives the whole season." },
    { id: "ev", label: "Expected value per season", basis: `mean ${x2(d.meanSeason)} − 1 · ≈ 2p − 1 · same for ${coinName} and ${spreadName}`, value: signedPct1(d.meanSeason - 1), help: "Mean season end minus one. Spreading the same risk over more names does not change it; it is not what one tranche earns." },
    { id: "premium", label: "Premium over fair per event", basis: `b ÷ (1 + b) − q = ${pct2(d.breakEven)} − ${pct2(p.lossRate)}`, value: signedPp(d.market.premium), help: "How far the deck's loss rate sits below the chain's fair rate. The discussion's case is an assumed risk premium for selling tail insurance, not an information edge." },
    { id: "median-spread", label: `Median, ${spreadName}`, basis: `${d.byId.spread.detail} · ruin ${smallPct(spread1.pRuin)}`, value: x2(spread1.median), color: "b", help: "Typical season end with the names split over the whole tranche, no reserve." },
    { id: "growth", label: `Log growth of surviving paths, ${yoursDef.name}`, basis: `${yoursDef.detail} · ruin ${smallPct(d.ruinYours)} a season`, value: signedPct1(d.growthYours), color: "c", help: "E[log end | the tranche survives] per season under your policy. Always read next to the ruin probability." },
    { id: "median-growth", label: `Median growth per season, ${yoursDef.name}`, basis: `median after ${seasonsWord} ${x2(sN.median)} → ^(1/${N}) − 1`, value: signedPct1(medianGrowth), color: "c", help: "The rate the middle path compounds at: median_N^(1/N) − 1." },
    { id: "robust", label: "Robust risk a night", basis: `you risk ${pct(p.riskPerNight)} · growth-optimal at the deck's rate ${pct(d.nightKelly.risk)} · Kelly per name ${pct1(d.kelly)}`, value: pct(d.robust.risk), color: "c", help: `Risk per night that maximises growth averaged over a loss rate drawn ${d.bandLabel}.` },
    { id: "median-N", label: `Median after ${seasonsWord}, ${yoursDef.name}`, basis: `P(below ${x2(p.thresholdBelow)}) ${pct(sN.pBelow)} · ruin ${smallPct(sN.pRuin)}`, value: x2(sN.median), color: "c", help: "Where the middle path of your policy stands after the seasons chained in the deck." },
  ];
  const definitions = [
    { term: `Clean season (${coinName})`, def: `P(no name hits max loss all season) = (1 − q)^n = ${pct(d.pClean)}.` },
    { term: "Expected value per season", def: `Mean season end minus one, p × (1 + b)^n − 1 ≈ 2p − 1 = ${signedPct1(d.meanSeason - 1)}. Neither a return you earn nor a premium: the average over a pool of replays.` },
    { term: "Premium over fair per event", def: `b ÷ (1 + b) − q = ${signedPp(d.market.premium)}. Zero under fair pricing; the discussion's case assumes a premium for selling tail insurance, not an information edge.` },
    { term: "Log growth of surviving paths", def: "E[log season end | the tranche survives], per season. Read it next to P(ruin); the unconditional expectation is −∞ whenever ruin is possible." },
    { term: "Median growth per season", def: "median_N^(1/N) − 1, where median_N is the median of the N-season end: the rate the middle path compounds at." },
    { term: "Robust risk a night", def: `Risk per night maximising growth averaged over loss rates ${d.bandLabel}.` },
    { term: "Policies", def: d.policies.map((x) => x.label).join(" · ") },
  ];
  return {
    pClean: d.pClean,
    cleanEnd: d.cleanEnd,
    meanSeason: d.meanSeason,
    breakEven: d.breakEven,
    kelly: d.kelly,
    growthYours: d.growthYours,
    ruinYours: d.ruinYours,
    growthC: d.growthYours,
    ruinC: d.ruinYours,
    season: Object.fromEntries(POLICY_IDS.map((id) => [id, d.season[id].summary])) as Record<PolicyId, Summary>,
    chained: Object.fromEntries(POLICY_IDS.map((id) => [id, d.chained[id].summary])) as Record<PolicyId, Summary>,
    seasonB: spread1,
    chainedC: sN,
    robust: d.robust,
    nightKelly: d.nightKelly,
    bandLabel: d.bandLabel,
    recordEvents: d.record?.events ?? 0,
    method: { season: d.season.spread.dist.method, chained: d.chained[d.yours].dist.method },
    degenerate: d.degenerate,
    yours,
    coin: { pClean: d.pClean, ruin: coinRuin, cleanEnd: d.cleanEnd, mean: d.meanSeason, text: `${coinName}: clean season ${pct(d.pClean)} · ruin ${pct(coinRuin)}` },
    legend: POLICY_LEGEND,
    market: d.market,
    figures,
    definitions,
  };
}
