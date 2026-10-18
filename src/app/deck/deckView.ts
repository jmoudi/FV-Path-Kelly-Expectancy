import type { ColorRole } from "@kit/charts/spec";
import { medianGrowthPerSeason } from "@app/model/growth";
import type { Params } from "@app/params/params";
import { POLICY_IDS, POLICY_LEGEND, type PolicyId, type PolicyMeta } from "@app/model/policies";
import type { Distribution, Summary } from "@app/model/season";
import { pct, pct1, pct2, x2, signedPct1, signedPp, smallPct } from "@kit/charts/numbers";
import type { MarketState, Derived } from "@app/scenarios/derived";

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
