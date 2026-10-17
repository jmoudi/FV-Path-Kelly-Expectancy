import { f, table, type ChartSpec, type Row, type SeriesSpec } from "../../charts/spec";
import { seasonLogGrowth } from "../../model/kelly";
import type { Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { samplePaths, scheduleDistribution, summarize } from "../../model/season";
import { pct, pct1, signedPct1, smallPct, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildDiversification(p: Params, d: Derived): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const k = Math.max(1, Math.round(p.names));
  const A = d.season.A.summary;
  const B = d.season.B.summary;

  // Distribution of the season end, linear bins. Outcomes are discrete, so bins are
  // kept coarse enough that neighbouring bins do not alternate between full and empty.
  const width = 0.1;
  const hi = Math.max(1.3, Math.ceil((d.cleanEnd + 0.1) / width) * width);
  const bins = Math.round(hi / width);
  const massOf = (id: PolicyId) => {
    const out = new Array<number>(bins).fill(0);
    for (const o of d.season[id].dist.outcomes) {
      let i = Math.floor(o.value / width);
      if (i >= bins) i = bins - 1;
      if (i < 0) i = 0;
      out[i] += o.prob;
    }
    return out;
  };
  const masses = Object.fromEntries(ids.map((id) => [id, massOf(id)])) as Record<PolicyId, number[]>;
  const histRows: Row[] = [];
  for (let i = 0; i < bins; i++) histRows.push({ mid: (i + 0.5) * width, A: masses.A[i], B: masses.B[i], C: masses.C[i] });
  const shape: ChartSpec = {
    id: "div-shape",
    title: "Same mean, different shape",
    subtitle: `Probability by season-end bin. The coin is two spikes; ${k} names at 1/${k} each turn it into a hump with a long left tail; the reserve policy pulls the hump in.`,
    kind: "xy",
    data: table([f("mid", "Season end, tranche units", "x"), ...ids.map((id) => f(id, d.byId[id].label, "pct1"))], histRows),
    mark: "bar",
    x: { field: "mid", format: "x", domain: [0, hi] },
    y: { field: "B", label: "Probability per bin", format: "pct" },
    series: [
      { field: "A", color: "a", label: d.byId.A.label },
      { field: "B", color: "b", label: d.byId.B.label, emphasis: "strong" },
      { field: "C", color: "c", label: d.byId.C.label },
    ],
    barWidthPx: 9,
    height: 330,
    annotations: [
      { kind: "vline", x: A.mean, text: `mean of A and B ${A.mean.toFixed(2)}×`, color: "ink" },
      { kind: "vline", x: B.median, text: `median B ${B.median.toFixed(2)}×`, color: "b", dash: false, at: "start" },
      { kind: "vline", x: p.thresholdBelow, text: `below ${p.thresholdBelow.toFixed(2)}×`, color: "loss", at: "start" },
    ],
    stories: [
      { id: "ab", label: "Only the coin against the diversified tranche", patch: { hiddenSeries: ["C"] } },
      { id: "outline", label: "Outlines instead of bars", patch: { mark: "step" } },
      { id: "logy", label: "Log probability to see the tails", patch: { y: { scale: "log", domain: [1e-5, 1] } } },
    ],
  };

  const fan = (id: PolicyId, seedOffset: number): ChartSpec => {
    const pol = d.byId[id];
    const paths = samplePaths([{ nights: p.nights, policy: pol.policy }], p.fanPaths, p.seed + seedOffset);
    const rows: Row[] = [];
    for (let t = 0; t <= p.nights; t++) {
      const r: Row = { night: t };
      paths.forEach((path, i) => (r[`p${i}`] = path[t]));
      rows.push(r);
    }
    const series: SeriesSpec[] = paths.map((path, i) => ({ field: `p${i}`, label: `season ${i + 1}`, color: path[path.length - 1] > 0 ? pol.color : "loss", emphasis: "muted", legend: false, width: 1.2 }));
    const s = d.season[id].summary;
    return {
      id: `div-fan-${id}`,
      title: `Railroad, ${pol.label}`,
      subtitle: `${p.fanPaths} sampled seasons. Median ${s.median.toFixed(2)}×, mean ${s.mean.toFixed(2)}×.`,
      kind: "xy",
      data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Season ${i + 1}`, "x"))], rows),
      mark: "step",
      x: { field: "night", domain: [0, p.nights] },
      y: { field: "p0", label: "Tranche, start = 1", domain: [0, d.cleanEnd * 1.08], format: "x" },
      series,
      legend: false,
      height: 240,
      annotations: [{ kind: "hline", y: s.median, text: `median ${s.median.toFixed(2)}×`, color: pol.color, dash: false, at: "start" }],
    };
  };

  // Names per game is the wrong measure: share of single-name nights.
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };
  const shares: number[] = [];
  for (let s = 0; s <= 1.0001; s += 0.05) shares.push(Math.round(s * 100) / 100);
  const mixRows: Row[] = shares.map((s) => {
    const single = Math.round(s * p.nights);
    const multi = p.nights - single;
    const full = summarize(
      scheduleDistribution(
        [
          { nights: single, policy: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 } },
          { nights: multi, policy: { ...base, names: k, riskPerName: 1 / k } },
        ],
        d.opts,
      ),
      p.thresholdBelow,
    );
    const capped = summarize(
      scheduleDistribution(
        [
          { nights: single, policy: { ...base, names: 1, riskPerName: 1 / k, sharedOutcome: 0 } },
          { nights: multi, policy: { ...base, names: k, riskPerName: 1 / k } },
        ],
        d.opts,
      ),
      p.thresholdBelow,
    );
    return { share: s, ruinFull: full.pRuin, ruinCapped: capped.pRuin, meanFull: full.mean, meanCapped: capped.mean, medianFull: full.median, medianCapped: capped.median };
  });
  const mix: ChartSpec = {
    id: "div-mix",
    title: "Names per game is the wrong measure",
    subtitle: `Season ruin as single-name nights are mixed in. Rule 1 puts the whole tranche on a lone name; rule 2 caps every name at 1/${k} of the tranche and leaves the rest idle.`,
    kind: "xy",
    data: table(
      [
        f("share", "Share of single-name nights", "pct"),
        f("ruinFull", "Whole tranche on a lone name", "pct2"),
        f("ruinCapped", `Capped at 1/${k} per name`, "pct3"),
        f("meanFull", "Mean, whole tranche", "x"),
        f("meanCapped", "Mean, capped", "x"),
      ],
      mixRows,
    ),
    mark: "line",
    x: { field: "share", format: "pct", domain: [0, 1] },
    y: { field: "ruinFull", label: "P(ruin) per season", format: "pct" },
    series: [
      { field: "ruinFull", color: "a", label: "Whole tranche on a lone name" },
      { field: "ruinCapped", color: "c", label: `Capped at 1/${k} per name` },
    ],
    height: 260,
    annotations: [{ kind: "vline", x: p.singleNameShare, text: `your mix ${pct(p.singleNameShare)}`, color: "ink", at: "end" }],
    stories: [
      { id: "logy", label: "Log ruin axis", patch: { y: { scale: "log", domain: [1e-5, 1] } } },
      { id: "means", label: "Show the means instead", patch: { hiddenSeries: ["ruinFull", "ruinCapped"], extraSeries: [{ field: "meanFull", color: "a" }, { field: "meanCapped", color: "c" }], y: { label: "Mean season end", scale: "linear", domain: [0.9, 1.2] } } },
    ],
  };

  const policyTbl: ChartSpec = {
    id: "div-table",
    title: "One season under each policy",
    kind: "table",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("pBelow", `P(below ${p.thresholdBelow.toFixed(2)}×)`, "pct1"), f("pRuin", "P(ruin)", "pct3"), f("pMax", "Clean season", "pct1"), f("growth", "Log growth per season", "pct1")],
      ids.map((id) => {
        const s = d.season[id].summary;
        const pol = d.byId[id].policy;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, pBelow: s.pBelow, pRuin: s.pRuin, pMax: s.pMax, growth: seasonLogGrowth(pol.riskPerName * pol.names, pol.names, pol.lossRate, pol.gain, p.nights, pol.sharedOutcome) };
      }),
    ),
    mark: "line",
    x: { field: "policy" },
    y: { field: "mean" },
    series: [],
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "pBelow" }, { field: "pRuin", color: "loss" }, { field: "pMax" }, { field: "growth" }],
  };

  const mixRow = mixRows.reduce((best, r) => (Math.abs((r.share as number) - p.singleNameShare) < Math.abs((best.share as number) - p.singleNameShare) ? r : best), mixRows[0]);
  const mixTbl: ChartSpec = {
    id: "div-mix-table",
    title: "Mixing single-name nights in",
    kind: "table",
    data: table(
      [f("share", "Single-name nights", "pct"), f("ruinFull", "Ruin, whole tranche", "pct2"), f("meanFull", "Mean, whole tranche", "x"), f("ruinCapped", "Ruin, capped", "pct3"), f("meanCapped", "Mean, capped", "x")],
      mixRows.filter((r) => Math.round((r.share as number) * 100) % 25 === 0 || r === mixRow),
    ),
    mark: "line",
    x: { field: "share" },
    y: { field: "ruinFull" },
    series: [],
    columns: [{ field: "share", emphasize: true }, { field: "ruinFull", color: "loss" }, { field: "meanFull" }, { field: "ruinCapped" }, { field: "meanCapped" }],
    highlightRow: { field: "share", value: mixRow.share },
    caption: "The idle capacity on single-name nights costs a little mean. That is the price of removing the coin flip.",
  };

  return {
    id: "diversification",
    number: 5,
    eyebrow: "The free lunch",
    title: "Three names on one night: the mean stays, the shape changes",
    question: `Is a season of ${p.nights} nights with ${k} names each the same bet as ${p.nights} spins of one all-in name?`,
    lede: `No. Diversification leaves the expected outcome unchanged and changes everything else. The binary is gone, but the median paid for it: with ${k} names the clean season drops from ${pct(
      d.pClean,
    )} to ${pct1(B.pMax)}, the typical season ends with one or two partial hits, and ruin falls from ${pct(A.pRuin)} to ${smallPct(
      B.pRuin,
    )}. It does not make the typical season better. It makes the bad one survivable, which is what lets you replay the tranche.`,
    kpis: [
      { label: "Ruin, coin", value: pct(A.pRuin), sub: d.byId.A.label, color: "a" },
      { label: "Ruin, diversified", value: smallPct(B.pRuin), sub: d.byId.B.label, color: "b" },
      { label: "Median, coin → diversified", value: `${x2(A.median)} → ${x2(B.median)}`, sub: "mean unchanged" },
      { label: "Log growth per season", value: signedPct1(seasonLogGrowth(1, k, p.lossRate, p.gain, p.nights, p.sharedOutcome)), sub: "whole tranche over k names", help: "Expected log of the season end, the rate the median compounds at. Ruin excluded." },
    ],
    primary: [shape],
    secondary: [fan("A", 101), fan("B", 202), mix],
    tables: [policyTbl, mixTbl],
    localParams: ["singleNameShare", "thresholdBelow"],
    notes: [
      {
        title: "Why it is still a free lunch",
        body: "You replay the tranche. A single-name tranche survives s seasons with probability p^s, while the diversified one keeps compounding. Geometric growth is roughly the mean minus half the variance, and variance is what diversification removes without touching the mean. It is close to fee-neutral too: fees and spreads scale with contract count, and splitting across names does not change the count.",
      },
      {
        title: "The measure that matters",
        body: `A target ratio of names per game still leaves single-name games in the mix, and each of those carries the full tranche. Every full-size single-name game brings back the coin flip. What matters is max loss per name as a fraction of the tranche: cap it at 1/${k} and leave the rest idle on single-name evenings. The idle capacity costs a little mean, which is cheap for what it buys.`,
      },
    ],
    sourceFigures: [
      { label: "Median, 3 names ⅓ each", quoted: "0.88", computed: x2(B.median) },
      { label: "P(below 0.5), 3 names", quoted: "12%", computed: pct1(B.pBelow) },
      { label: "Ruin, half the games single-name at full tranche", quoted: "26%", computed: pct1(mixRows.find((r) => r.share === 0.5)?.ruinFull as number) },
      { label: "Ruin with cap at ⅓", quoted: "0.03%", computed: smallPct(mixRows.find((r) => r.share === 0.5)?.ruinCapped as number) },
      { label: "Mean with cap at ⅓", quoted: "1.06", computed: x2(mixRows.find((r) => r.share === 0.5)?.meanCapped as number) },
    ],
  };
}
