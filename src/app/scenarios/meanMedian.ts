import { f, table, tableSpec, type ChartSpec, type Row } from "@kit/charts/spec";
import { medianGrowthPerSeason } from "@app/model/growth";
import type { Datasets } from "@app/data/datasets";
import type { Params } from "@app/data/params";
import { POLICY_IDS, type PolicyId } from "@app/model/policies";
import { sampleFromDistribution, weightedQuantile } from "@app/model/season";
import { fig } from "@app/data/discussion";
import { methodLabel, type Derived } from "./derived";
import { near } from "@kit/charts/scenario";
import { pct, pct1, signedPct1, smallPct, x2 } from "@kit/charts/numbers";
import type { ScenarioView } from "./types";

export function buildMeanMedian(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids = POLICY_IDS;
  const P = d.byId;
  const k = d.k;
  const n = p.nights;
  const N = p.seasons;
  const coin = d.season.coin.summary;
  const spread = d.season.spread.summary;
  const reserve = d.season.reserve.summary;
  const spreadN = d.chained.spread.summary;
  const yTop = Math.ceil(Math.max(d.cleanEnd * 1.05, 1.2) * 4) / 4;

  // Quantile function: what share of replays end at or below each value.
  const pcts: number[] = [];
  for (let x = 0; x <= 100; x += 0.5) pcts.push(x);
  const qRows: Row[] = pcts.map((x) => {
    const r: Row = { pctile: x / 100 };
    for (const id of ids) r[id] = weightedQuantile(d.season[id].dist.outcomes, Math.min(0.9999, Math.max(0.0001, x / 100)));
    return r;
  });
  const quantiles: ChartSpec = {
    id: "mm-quantiles",
    title: "Every replay sorted from worst to best",
    subtitle: "x share of replays ending at or below · y season end, tranche units",
    kind: "xy",
    data: table([f("pctile", "Share of replays ending at or below", "pct"), ...ids.map((id) => f(id, P[id].label, "x"))], qRows),
    mark: "step",
    x: { field: "pctile", format: "pct", domain: [0, 1] },
    y: { field: "spread", label: "Season end, tranche units", format: "x", domain: [0, yTop] },
    series: ids.map((id) => ({ field: id, color: P[id].color, label: P[id].label, emphasis: id === "coin" ? "normal" : "strong" })),
    height: 330,
    annotations: [
      { kind: "vline", x: 0.5, text: "median: the middle replay", color: "muted", at: "start" },
      { kind: "hline", y: coin.mean, text: `mean, ${P.coin.name} and ${P.spread.name} ${x2(coin.mean)}`, color: "muted", at: "start" },
      { kind: "hline", y: reserve.mean, text: `mean, ${P.reserve.name} ${x2(reserve.mean)}`, color: "c", at: "end" },
    ],
  };

  // Running average across independent replays.
  const pool = p.parallelTranches;
  const runRows: Row[] = [];
  const samples = Object.fromEntries(ids.map((id) => [id, sampleFromDistribution(d.season[id].dist, pool, p.seed + 11)])) as Record<PolicyId, number[]>;
  const acc: Record<PolicyId, number> = { coin: 0, spread: 0, reserve: 0 };
  for (let i = 0; i < pool; i++) {
    const r: Row = { count: i + 1 };
    for (const id of ids) {
      acc[id] += samples[id][i];
      r[id] = acc[id] / (i + 1);
    }
    runRows.push(r);
  }
  const running: ChartSpec = {
    id: "mm-running",
    title: `Pooling ${pool} independent tranches`,
    subtitle: "x tranches pooled (log) · y running average of their season ends",
    kind: "xy",
    data: table([f("count", "Tranches pooled", "int"), ...ids.map((id) => f(id, P[id].label, "x"))], runRows),
    mark: "line",
    x: { field: "count", scale: "log", domain: [1, pool] },
    y: { field: "coin", label: "Average end of the pool", format: "x", domain: [0, yTop] },
    series: ids.map((id) => ({ field: id, color: P[id].color, label: P[id].label })),
    height: 290,
    annotations: [{ kind: "hline", y: coin.mean, text: `mean ${x2(coin.mean)}`, color: "muted", at: "end" }],
  };

  // Stems at the exact outcomes of the Spread policy (Spread + reserve in the data for ⚙).
  const stemRows = new Map<number, Row>();
  const addStems = (id: PolicyId) => {
    for (const o of d.season[id].dist.outcomes) {
      if (o.prob < 2e-4) continue;
      const key = Math.round(o.value * 1e6) / 1e6;
      const r = stemRows.get(key) ?? { end: key, spread: null, reserve: null };
      r[id] = o.prob;
      stemRows.set(key, r);
    }
  };
  addStems("spread");
  addStems("reserve");
  const stems: ChartSpec = {
    id: "mm-stems",
    title: `Exact outcomes, ${P.spread.name}`,
    subtitle: `x season end, tranche units · y probability of that exact end · ${P.spread.label}, ${methodLabel(d.season.spread.dist.method)}`,
    kind: "xy",
    data: table([f("end", "Season end, tranche units", "x"), f("spread", P.spread.label, "pct1"), f("reserve", P.reserve.label, "pct1")], [...stemRows.values()].sort((a, b) => (a.end as number) - (b.end as number))),
    mark: "bar",
    x: { field: "end", format: "x", domain: [0, yTop] },
    y: { field: "spread", label: "Probability of the outcome", format: "pct" },
    series: [{ field: "spread", color: "b", label: P.spread.label }],
    barWidthPx: 3,
    height: 290,
    annotations: [
      { kind: "vline", x: spread.mean, text: `mean ${x2(spread.mean)}`, color: "muted" },
      { kind: "vline", x: spread.median, text: `median ${x2(spread.median)}`, color: "b", dash: false, at: "start" },
    ],
  };

  const summaryTbl = tableSpec({
    id: "mm-table",
    title: "Mean, median and what they measure",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("atOrAbove", "Replays ending at or above the mean", "pct"), f("pMax", "Clean season", "pct1"), f("pRuin", "Ruin", "pct2"), f("growth", "Log growth of surviving paths", "pct1")],
      ids.map((id) => {
        const s = d.season[id].summary;
        return { policy: P[id].label, mean: s.mean, median: s.median, atOrAbove: s.pAtOrAboveMean, pMax: s.pMax, pRuin: s.pRuin, growth: s.expLog };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "atOrAbove" }, { field: "pMax" }, { field: "pRuin", color: "loss" }, { field: "growth" }],
    caption: "Growth is E[log end | the tranche survives] for one season; read it with the ruin column.",
  });

  const degenerate = d.degenerate.singleName ? ` With one name a night the ${P.spread.name} policy is the ${P.coin.name} itself; raise names a night in the deck to open the gap.` : "";
  const medianGrowth = medianGrowthPerSeason(spreadN.median, N);
  const seasonsWord = `${N} season${N === 1 ? "" : "s"}`;

  // The typical Spread season: one or two partial hits on separate nights.
  const hitFactor = 1 + (1 / k) * ((k - 1) * p.gain - 1);
  const oneHit = hitFactor * Math.pow(1 + p.gain, n - 1) - 1;
  const twoHits = hitFactor * hitFactor * Math.pow(1 + p.gain, n - 2) - 1;

  return {
    id: "mean-median",
    number: 2,
    title: "Mean and median",
    claim: "The mean is the average over a pool of independent replays; the median is the middle replay of the one tranche you hold.",
    lede: `What does the mean of a season measure, and which number describes the one tranche you hold?${degenerate}`,
    views: [
      { id: "replay-quantiles", title: "What the mean means", blurb: `Every replay sorted, with the exact outcomes of the ${P.spread.name} policy.`, charts: ["mm-quantiles", "mm-stems", "mm-table"], kpis: [0, 1, 2, 3, 4] },
      { id: "pooling", title: "What a pool of tranches would earn", blurb: "The running average of independent replays converges to the mean.", charts: ["mm-running"], params: ["parallelTranches"], kpis: [0, 2] },
    ],
    kpis: [
      { label: `Mean, ${P.coin.name} and ${P.spread.name}`, value: x2(coin.mean), sub: "the same for both", help: "Expected season end. Spreading the same risk over more names does not change it." },
      { label: `Median, ${P.coin.name} → ${P.spread.name}`, value: `${x2(coin.median)} → ${x2(spread.median)}`, sub: `${pct(d.pClean)} vs ${pct1(spread.pMax)} clean seasons`, help: "Half of replays end at or above this. For the Coin it is one of the two outcomes; for Spread it is a season with one or two partial hits." },
      { label: "Seasons at or above the mean", value: pct(spread.pAtOrAboveMean), sub: P.spread.name, help: "How often a single replay does at least as well as the average of all replays." },
      { label: "Log growth of surviving paths", value: signedPct1(spread.expLog), sub: `${P.spread.name} · one season · ruin ${smallPct(spread.pRuin)}`, help: "E[log end | the tranche survives]. Geometric growth is roughly the mean minus half the variance; diversification removes variance without touching the mean. It is not the rate the median compounds at; that is the next figure." },
      { label: "Median growth per season", value: signedPct1(medianGrowth), sub: `${P.spread.name} · median after ${seasonsWord} ${x2(spreadN.median)} → ^(1/${N}) − 1`, help: "median_N^(1/N) − 1: the rate the middle path compounds at over the seasons chained in the deck." },
    ],
    primary: [quantiles],
    secondary: [stems, running],
    tables: [summaryTbl],
    localParams: ["parallelTranches"],
    notes: [
      {
        title: "Three readings of the same distribution",
        body: `- Mean: the balance point. Multiply each outcome by its probability and add. It is the number a large pool of independent tranches converges to, and the number that matters if you refill from NAV every season and play for a long time.\n- Median: the middle replay. Half of the replays do better, half worse. For one tranche replayed a few times this is the forecast.\n- Log growth of surviving paths: E[log end | survive]. Geometric growth is roughly the mean minus half the variance, which is why removing variance without touching the mean (diversification) lifts it while leaving the mean alone. It is not the rate the median compounds at; that rate is median_N^(1/N) − 1, listed as median growth per season.`,
      },
      {
        title: `Why the ${P.spread.name} median sits below the mean`,
        body: `${k} names mean ${k * n} name-events instead of ${n}, so a clean season drops from ${pct(d.pClean)} to ${pct1(spread.pMax)}. The typical season carries one or two partial hits and ends at ${signedPct1(oneHit)} or ${signedPct1(twoHits)}. The mean is the same because those hits are exactly what the ${P.coin.name} pays in full, just more often and smaller.`,
      },
    ],
    sourceFigures: [
      fig(p, "Mean, 1 name", "1.10", x2(coin.mean), near(1.1, coin.mean, 0.006), ["q", "b", "n"]),
      fig(p, "Median · P(below 0.5) · ruin, 1 name", "1.99 · 45% · 45%", `${x2(coin.median)} · ${pct(coin.pBelow)} · ${pct(coin.pRuin)}`, near(1.99, coin.median, 0.006) && near(0.45, coin.pBelow, 0.006) && near(0.45, coin.pRuin, 0.006), ["q", "b", "n", "threshold"]),
      fig(p, "Mean, 3 names ⅓ each", "1.10", x2(spread.mean), near(1.1, spread.mean, 0.006), ["q", "b", "n"]),
      fig(p, "Median · P(below 0.5) · ruin, 3 names", "0.88 · 12% · 0.05%", `${x2(spread.median)} · ${pct(spread.pBelow)} · ${smallPct(spread.pRuin)}`, near(0.88, spread.median, 0.006) && near(0.12, spread.pBelow, 0.006) && near(0.0005, spread.pRuin, 0.00006), ["q", "b", "n", "k", "threshold", "c"]),
      fig(p, "Clean season, 1 → 3 names", "55% → 17%", `${pct(d.pClean)} → ${pct(spread.pMax)}`, near(0.55, d.pClean, 0.006) && near(0.17, spread.pMax, 0.006), ["q", "n", "k"]),
    ],
  };
}
