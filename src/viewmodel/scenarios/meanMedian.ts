import { f, table, type ChartSpec, type Row } from "../../charts/spec";
import type { Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { sampleFromDistribution, weightedQuantile } from "../../model/season";
import { pct, pct1, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildMeanMedian(p: Params, d: Derived): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const A = d.season.A.summary;
  const B = d.season.B.summary;
  const C = d.season.C.summary;

  // Quantile plot: what share of replays end at or below each value.
  const pcts: number[] = [];
  for (let x = 0; x <= 100; x += 0.5) pcts.push(x);
  const qRows: Row[] = pcts.map((x) => {
    const r: Row = { pctile: x };
    for (const id of ids) r[id] = weightedQuantile(d.season[id].dist.outcomes, Math.min(0.9999, Math.max(0.0001, x / 100)));
    return r;
  });
  const quantiles: ChartSpec = {
    id: "mm-quantiles",
    title: "Every replay sorted from worst to best",
    subtitle: "Read the median at the 50% mark. The mean is the average height of the whole curve, which is why it can sit where no replay ends.",
    kind: "xy",
    data: table([f("pctile", "Share of replays ending at or below", "pct"), ...ids.map((id) => f(id, d.byId[id].label, "x"))], qRows.map((r) => ({ ...r, pctile: (r.pctile as number) / 100 }))),
    mark: "line",
    x: { field: "pctile", format: "pct", domain: [0, 1] },
    y: { field: "B", label: "Season end, tranche units", format: "x", domain: [0, Math.max(d.cleanEnd * 1.05, 1.2)] },
    series: ids.map((id) => ({ field: id, color: d.byId[id].color, label: d.byId[id].label, emphasis: id === "A" ? "normal" : "strong" })),
    height: 330,
    annotations: [
      { kind: "vline", x: 0.5, text: "median: the typical single tranche", color: "muted", at: "start" },
      { kind: "hline", y: A.mean, text: `mean of A and B ${A.mean.toFixed(2)}×`, color: "ink", at: "start" },
      { kind: "hline", y: C.mean, text: `mean of C ${C.mean.toFixed(2)}×`, color: "c", at: "end" },
    ],
    stories: [
      { id: "onlyAB", label: "Just the coin against the diversified tranche", patch: { hiddenSeries: ["C"] } },
      { id: "vega", label: "Render in Vega-Lite", patch: { backend: "vega" } },
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
    subtitle: "The mean is what a pool of many parallel tranches converges to. You own one tranche, so you never see this average directly.",
    kind: "xy",
    data: table([f("count", "Tranches pooled", "int"), ...ids.map((id) => f(id, d.byId[id].label, "x"))], runRows),
    mark: "line",
    x: { field: "count", scale: "log", domain: [1, N] },
    y: { field: "A", label: "Average end of the pool", format: "x", domain: [0, Math.max(d.cleanEnd * 1.05, 1.2)] },
    series: ids.map((id) => ({ field: id, color: d.byId[id].color, label: d.byId[id].label })),
    height: 290,
    annotations: [{ kind: "hline", y: A.mean, text: `mean ${A.mean.toFixed(2)}×`, color: "ink", at: "end" }],
    stories: [{ id: "linear", label: "Linear count axis", patch: { x: { scale: "linear" } } }],
  };

  // Histogram of policy B (and C) on linear bins, coarse enough for discrete outcomes.
  const width = 0.1;
  const hi = Math.max(1.3, Math.ceil((d.cleanEnd + 0.1) / width) * width);
  const bins = Math.round(hi / width);
  const histRows: Row[] = [];
  const mass = (id: PolicyId) => {
    const out = new Array<number>(bins).fill(0);
    for (const o of d.season[id].dist.outcomes) {
      let i = Math.floor(o.value / width);
      if (i >= bins) i = bins - 1;
      if (i < 0) i = 0;
      out[i] += o.prob;
    }
    return out;
  };
  const mB = mass("B");
  const mC = mass("C");
  for (let i = 0; i < bins; i++) histRows.push({ mid: (i + 0.5) * width, B: mB[i], C: mC[i] });
  const hist: ChartSpec = {
    id: "mm-hist",
    title: "The balance point",
    subtitle: "Probability by season-end bin. Put a fulcrum under the bars and they balance at the mean; half of the mass sits left of the median.",
    kind: "xy",
    data: table([f("mid", "Season end, tranche units", "x"), f("B", d.byId.B.label, "pct1"), f("C", d.byId.C.label, "pct1")], histRows),
    mark: "bar",
    x: { field: "mid", format: "x", domain: [0, hi] },
    y: { field: "B", label: "Probability per bin", format: "pct" },
    series: [
      { field: "B", color: "b", label: d.byId.B.label },
      { field: "C", color: "c", label: d.byId.C.label, emphasis: "muted" },
    ],
    barWidthPx: 10,
    height: 290,
    annotations: [
      { kind: "vline", x: B.mean, text: `mean ${B.mean.toFixed(2)}×`, color: "ink" },
      { kind: "vline", x: B.median, text: `median ${B.median.toFixed(2)}×`, color: "b", dash: false, at: "start" },
    ],
    stories: [
      { id: "onlyB", label: "Only the diversified tranche", patch: { hiddenSeries: ["C"] } },
      { id: "outline", label: "Outlines instead of bars", patch: { mark: "step" } },
    ],
  };

  const summaryTbl: ChartSpec = {
    id: "mm-table",
    title: "Mean, median and what they measure",
    kind: "table",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("atOrAbove", "Replays ending at or above the mean", "pct"), f("pMax", "Clean season", "pct1"), f("pRuin", "Ruin", "pct2")],
      ids.map((id) => {
        const s = d.season[id].summary;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, atOrAbove: s.pAtOrAboveMean, pMax: s.pMax, pRuin: s.pRuin };
      }),
    ),
    mark: "line",
    x: { field: "policy" },
    y: { field: "mean" },
    series: [],
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "atOrAbove" }, { field: "pMax" }, { field: "pRuin", color: "loss" }],
  };

  return {
    id: "mean-median",
    number: 2,
    eyebrow: "Reading the numbers",
    title: "What “mean” means when no season ends there",
    question: "The mean of the coin-flip season is 1.10×, yet a tranche can only end at 1.99× or 0. What is that number measuring?",
    lede: `The mean answers a question about a pool: run this tranche in many parallel worlds and average them. The median answers a question about you: the one world you actually live in. For the coin they differ by ${x2(
      Math.abs(A.mean - A.median),
    )}; diversification narrows the gap and pulls the typical season below the average one.`,
    kpis: [
      { label: "Mean, coin and diversified", value: x2(A.mean), sub: "same for A and B", help: "Expected season end. Spreading the same risk over more names does not change it." },
      { label: "Median, coin", value: x2(A.median), sub: `${pct(d.pClean)} land here`, color: "a", help: "Half of replays end at or above this. For the coin it is one of the two outcomes." },
      { label: "Median, diversified", value: x2(B.median), sub: `${pct1(B.pMax)} clean seasons`, color: "b", help: "The typical diversified season has one or two partial hits." },
      { label: "Seasons at or above the mean", value: pct(B.pAtOrAboveMean), sub: "diversified tranche", help: "How often a single replay does at least as well as the average of all replays." },
    ],
    primary: [quantiles],
    secondary: [hist, running],
    tables: [summaryTbl],
    localParams: ["parallelTranches"],
    notes: [
      {
        title: "Three readings of the same distribution",
        body: "- Mean: the balance point. Multiply each outcome by its probability and add. It is the number a large pool of independent tranches converges to, and the number that matters if you can refill from NAV every season and play forever.\n- Median: the middle replay. Half of the worlds do better, half do worse. For one tranche replayed a few times this is the honest forecast.\n- Log growth: the rate the median compounds at. Geometric growth is roughly the mean minus half the variance, which is why removing variance without touching the mean (diversification) lifts the median while leaving the mean alone.",
      },
      {
        title: "Why the diversified median sits below the mean",
        body: `Three names mean ${3 * p.nights} name-events instead of ${p.nights}, so a clean season drops from ${pct(d.pClean)} to ${pct1(
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
