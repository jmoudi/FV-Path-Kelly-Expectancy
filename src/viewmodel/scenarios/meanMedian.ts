import { f, table, tableSpec, type ChartSpec, type Row } from "../../charts/spec";
import type { Datasets, Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { sampleFromDistribution, weightedQuantile } from "../../model/season";
import { methodLabel, pct, pct1, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildMeanMedian(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const k = d.k;
  const A = d.season.A.summary;
  const B = d.season.B.summary;
  const C = d.season.C.summary;
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
    subtitle: "Median at the 50% mark; the mean is the average height of the whole curve.",
    kind: "xy",
    data: table([f("pctile", "Share of replays ending at or below", "pct"), ...ids.map((id) => f(id, d.byId[id].label, "x"))], qRows),
    mark: "step",
    x: { field: "pctile", format: "pct", domain: [0, 1] },
    y: { field: "B", label: "Season end, tranche units", format: "x", domain: [0, yTop] },
    series: ids.map((id) => ({ field: id, color: d.byId[id].color, label: d.byId[id].label, emphasis: id === "A" ? "normal" : "strong" })),
    height: 330,
    annotations: [
      { kind: "vline", x: 0.5, text: "median: the typical single tranche", color: "muted", at: "start" },
      { kind: "hline", y: A.mean, text: `mean of A and B ${A.mean.toFixed(2)}×`, color: "ink", at: "start" },
      { kind: "hline", y: C.mean, text: `mean of C ${C.mean.toFixed(2)}×`, color: "c", at: "end" },
    ],
    stories: [
      { id: "onlyAB", label: "Just the coin against the diversified tranche", narrative: "Same mean, two very different curves.", patch: { hiddenSeries: ["C"] } },
      { id: "vega", label: "Render in Vega-Lite", narrative: "The same definition through another backend.", patch: { backend: "vega" } },
    ],
  };

  // Running average across independent replays.
  const N = p.parallelTranches;
  const runRows: Row[] = [];
  const samples = Object.fromEntries(ids.map((id) => [id, sampleFromDistribution(d.season[id].dist, N, p.seed + 11)])) as Record<PolicyId, number[]>;
  const acc: Record<PolicyId, number> = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < N; i++) {
    const r: Row = { count: i + 1 };
    for (const id of ids) {
      acc[id] += samples[id][i];
      r[id] = acc[id] / (i + 1);
    }
    runRows.push(r);
  }
  const running: ChartSpec = {
    id: "mm-running",
    title: `Pooling ${N} independent tranches`,
    subtitle: "Running average of independent replays; it converges to the mean.",
    kind: "xy",
    data: table([f("count", "Tranches pooled", "int"), ...ids.map((id) => f(id, d.byId[id].label, "x"))], runRows),
    mark: "line",
    x: { field: "count", scale: "log", domain: [1, N] },
    y: { field: "A", label: "Average end of the pool", format: "x", domain: [0, yTop] },
    series: ids.map((id) => ({ field: id, color: d.byId[id].color, label: d.byId[id].label })),
    height: 290,
    annotations: [{ kind: "hline", y: A.mean, text: `mean ${A.mean.toFixed(2)}×`, color: "ink", at: "end" }],
    stories: [
      { id: "linear", label: "Linear count axis", patch: { x: { scale: "linear" } } },
      { id: "seed", label: "Another draw of replays", narrative: "The early wobble differs; the limit does not.", params: { seed: (p.seed % 90_000) + 29 } },
    ],
  };

  // Stems at the exact outcomes of policy B (and C by story): the balance point.
  const stemRows = new Map<number, Row>();
  const addStems = (id: PolicyId) => {
    for (const o of d.season[id].dist.outcomes) {
      if (o.prob < 2e-4) continue;
      const key = Math.round(o.value * 1e6) / 1e6;
      const r = stemRows.get(key) ?? { end: key, B: null, C: null };
      r[id] = o.prob;
      stemRows.set(key, r);
    }
  };
  addStems("B");
  addStems("C");
  const stems: ChartSpec = {
    id: "mm-stems",
    title: "Exact outcomes, policy B",
    subtitle: `Probability of each exact season end of ${d.byId.B.label} (${methodLabel(d.season.B.dist.method)}). Mean and median marked.`,
    kind: "xy",
    data: table([f("end", "Season end, tranche units", "x"), f("B", d.byId.B.label, "pct1"), f("C", d.byId.C.label, "pct1")], [...stemRows.values()].sort((a, b) => (a.end as number) - (b.end as number))),
    mark: "bar",
    x: { field: "end", format: "x", domain: [0, yTop] },
    y: { field: "B", label: "Probability of the outcome", format: "pct" },
    series: [{ field: "B", color: "b", label: d.byId.B.label }],
    barWidthPx: 3,
    height: 290,
    annotations: [
      { kind: "vline", x: B.mean, text: `mean ${B.mean.toFixed(2)}×`, color: "ink" },
      { kind: "vline", x: B.median, text: `median ${B.median.toFixed(2)}×`, color: "b", dash: false, at: "start" },
    ],
    stories: [
      {
        id: "withC",
        label: "Add the reserve policy",
        narrative: "The reserve pulls the stems toward 1× and lifts the median.",
        patch: {
          extraSeries: [{ field: "C", color: "c" }],
          annotations: [
            { kind: "vline", x: B.median, text: `median B ${B.median.toFixed(2)}×`, color: "b", dash: false, at: "start" },
            { kind: "vline", x: C.median, text: `median C ${C.median.toFixed(2)}×`, color: "c", dash: false },
          ],
        },
      },
      { id: "logy", label: "Log probability to see the rare outcomes", patch: { y: { scale: "log", domain: [1e-4, 1] } } },
    ],
  };

  const summaryTbl = tableSpec({
    id: "mm-table",
    title: "Mean, median and what they measure",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("atOrAbove", "Replays ending at or above the mean", "pct"), f("pMax", "Clean season", "pct1"), f("pRuin", "Ruin", "pct2")],
      ids.map((id) => {
        const s = d.season[id].summary;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, atOrAbove: s.pAtOrAboveMean, pMax: s.pMax, pRuin: s.pRuin };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "atOrAbove" }, { field: "pMax" }, { field: "pRuin", color: "loss" }],
  });

  const degenerate = d.degenerate.singleName ? " With one name per night the diversified policy is the coin itself; raise names per night in the deck to see the gap open." : "";

  return {
    id: "mean-median",
    number: 2,
    title: "Mean and median",
    claim: "The mean is the average of a pool of parallel tranches you never own; the median is the season you most likely live.",
    lede: `Every replay of one season sorted, the exact outcomes of the diversified tranche, and the average of a pool of replays.${degenerate}`,
    views: [
      { id: "replay-quantiles", title: "Replay quantiles", blurb: "Every replay sorted, with the exact outcomes of the diversified tranche.", charts: ["mm-quantiles", "mm-stems", "mm-table"], kpis: [0, 1, 2] },
      { id: "pooling", title: "Pooling parallel tranches", blurb: "How the mean emerges from a pool you do not own.", charts: ["mm-running"], params: ["parallelTranches"], kpis: [0, 3] },
    ],
    kpis: [
      { label: "Mean, coin and diversified", value: x2(A.mean), sub: "the same for A and B", help: "Expected season end. Spreading the same risk over more names does not change it." },
      { label: "Median, coin → diversified", value: `${x2(A.median)} → ${x2(B.median)}`, sub: `${pct(d.pClean)} vs ${pct1(B.pMax)} clean seasons`, color: "b", help: "Half of replays end at or above this. For the coin it is one of the two outcomes; for the diversified tranche it is a season with one or two partial hits." },
      { label: "Seasons at or above the mean", value: pct(B.pAtOrAboveMean), sub: "diversified tranche", help: "How often a single replay does at least as well as the average of all replays." },
      { label: "Growth the median compounds at", value: `${(B.expLog * 100).toFixed(1)}%`, sub: "E[log end | survive], diversified", help: "Geometric growth is roughly the mean minus half the variance. Diversification removes variance without touching the mean." },
    ],
    primary: [quantiles],
    secondary: [stems, running],
    tables: [summaryTbl],
    localParams: ["parallelTranches"],
    notes: [
      {
        title: "Three readings of the same distribution",
        body: "- Mean: the balance point. Multiply each outcome by its probability and add. It is the number a large pool of independent tranches converges to, and the number that matters if you can refill from NAV every season and play forever.\n- Median: the middle replay. Half of the worlds do better, half do worse. For one tranche replayed a few times this is the honest forecast.\n- Log growth: the rate the median compounds at. Geometric growth is roughly the mean minus half the variance, which is why removing variance without touching the mean (diversification) lifts the median while leaving the mean alone.",
      },
      {
        title: "Why the diversified median sits below the mean",
        body: `${k} names mean ${k * p.nights} name-events instead of ${p.nights}, so a clean season drops from ${pct(d.pClean)} to ${pct1(
          B.pMax,
        )}. The typical season carries one or two partial hits that gnaw into the payoff. The mean is the same because those hits are exactly what the coin pays in full, just more often and smaller.`,
      },
    ],
    sourceFigures: [
      { label: "Mean, 1 name", quoted: "1.10", computed: x2(A.mean) },
      { label: "Median, 3 names ⅓ each", quoted: "0.88", computed: x2(B.median) },
      { label: "Clean season, 3 names", quoted: "17%", computed: pct1(B.pMax) },
    ],
  };
}
