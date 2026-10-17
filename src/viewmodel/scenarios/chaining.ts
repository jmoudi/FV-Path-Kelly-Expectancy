import { f, table, type ChartSpec, type Row, type SeriesSpec } from "../../charts/spec";
import { seasonLogGrowth } from "../../model/kelly";
import type { Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { binnedDistributions, logHistogram, samplePaths, summarize } from "../../model/season";
import { linspace } from "../../model/stats";
import { pct, pct1, pct2, signedPct1, smallPct, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildChaining(p: Params, d: Derived): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const k = Math.max(1, Math.round(p.names));
  const N = p.seasons;
  const n = p.nights;
  const S = Math.max(N, 8);

  // Mean and median by number of seasons chained.
  const snaps = Array.from({ length: S }, (_, i) => (i + 1) * n);
  const curves = Object.fromEntries(
    (["B", "C"] as PolicyId[]).map((id) => [id, binnedDistributions([{ nights: S * n, policy: d.byId[id].policy }], snaps).map((dist) => summarize(dist, p.thresholdBelow))]),
  ) as Record<"B" | "C", ReturnType<typeof summarize>[]>;
  const seasonRows: Row[] = [];
  for (let s = 1; s <= S; s++) {
    const pA = Math.pow(d.pClean, s);
    seasonRows.push({
      seasons: s,
      meanA: pA * Math.pow(d.cleanEnd, s),
      medianA: pA >= 0.5 ? Math.pow(d.cleanEnd, s) : 0,
      meanB: curves.B[s - 1].mean,
      medianB: curves.B[s - 1].median,
      meanC: curves.C[s - 1].mean,
      medianC: curves.C[s - 1].median,
    });
  }
  const growthChart: ChartSpec = {
    id: "chain-curve",
    title: "Mean and median as seasons are chained",
    subtitle: "Solid is the median, dashed the mean. The mean keeps rising on a shrinking set of lucky paths; the median is where you most likely are.",
    kind: "xy",
    data: table(
      [
        f("seasons", "Seasons chained", "int"),
        f("meanA", `${d.byId.A.label}, mean`, "x"),
        f("medianA", `${d.byId.A.label}, median`, "x"),
        f("meanB", `${d.byId.B.label}, mean`, "x"),
        f("medianB", `${d.byId.B.label}, median`, "x"),
        f("meanC", `${d.byId.C.label}, mean`, "x"),
        f("medianC", `${d.byId.C.label}, median`, "x"),
      ],
      seasonRows,
    ),
    mark: "line",
    x: { field: "seasons", domain: [1, S] },
    y: { field: "medianC", label: "Tranche after N seasons", format: "x", domain: [0, null] },
    series: [
      { field: "meanB", color: "b", label: `${d.byId.B.short}, mean`, dash: true },
      { field: "medianB", color: "b", label: `${d.byId.B.short}, median`, emphasis: "strong" },
      { field: "meanC", color: "c", label: `${d.byId.C.short}, mean`, dash: true },
      { field: "medianC", color: "c", label: `${d.byId.C.short}, median`, emphasis: "strong" },
    ],
    height: 330,
    annotations: [
      { kind: "vline", x: N, text: `${N} seasons`, color: "ink", at: "start" },
      { kind: "hline", y: 1, text: "start", color: "muted", at: "start" },
    ],
    stories: [
      { id: "coin", label: "Include the single-name coin", patch: { extraSeries: [{ field: "meanA", color: "a" }, { field: "medianA", color: "a" }], y: { scale: "log", domain: [0.05, null] } } },
      { id: "medians", label: "Medians only", patch: { hiddenSeries: ["meanB", "meanC"] } },
    ],
  };

  // Distribution after N seasons on log bins.
  const lo = 0.02;
  const hiEnd = Math.max(3, Math.pow(d.cleanEnd, N) * 1.1);
  const bins = 36;
  const hists = Object.fromEntries(ids.map((id) => [id, logHistogram(d.chained[id].dist, lo, hiEnd, bins)])) as Record<PolicyId, ReturnType<typeof logHistogram>>;
  const histRows: Row[] = hists.A.bins.map((bn, i) => ({ mid: bn.mid, A: hists.A.bins[i].prob, B: hists.B.bins[i].prob, C: hists.C.bins[i].prob }));
  const sA = d.chained.A.summary;
  const sB = d.chained.B.summary;
  const sC = d.chained.C.summary;
  const endDist: ChartSpec = {
    id: "chain-dist",
    title: `Where the tranche stands after ${N} seasons`,
    subtitle: `Probability per log-spaced bin. Ruin mass off the chart: ${smallPct(hists.A.zeroMass)} for the coin, ${smallPct(hists.B.zeroMass)} and ${smallPct(hists.C.zeroMass)} for the diversified policies.`,
    kind: "xy",
    data: table([f("mid", "Tranche after N seasons", "x"), ...ids.map((id) => f(id, d.byId[id].label, "pct1"))], histRows),
    mark: "bar",
    x: { field: "mid", scale: "log", format: "x" },
    y: { field: "B", label: "Probability per bin", format: "pct" },
    series: [
      { field: "A", color: "a", label: d.byId.A.label },
      { field: "B", color: "b", label: d.byId.B.label },
      { field: "C", color: "c", label: d.byId.C.label, emphasis: "strong" },
    ],
    barWidthPx: 6,
    height: 300,
    annotations: [
      { kind: "vline", x: 1, text: "start", color: "muted", at: "start" },
      { kind: "vline", x: p.thresholdBelow, text: `below ${p.thresholdBelow.toFixed(2)}×`, color: "loss", at: "start" },
      { kind: "vline", x: sC.median, text: `median C ${sC.median.toFixed(2)}×`, color: "c", dash: false },
    ],
    stories: [
      { id: "noA", label: "Hide the coin", patch: { hiddenSeries: ["A"] } },
      { id: "outline", label: "Outlines instead of bars", patch: { mark: "step" } },
    ],
  };

  // Log growth grid: risk per night × true loss rate.
  const risks = [0.2, 0.3, 0.39, 0.5, 0.6, 0.75, 0.9, 1.0];
  const qGrid = [0.022, 0.0252, 0.028, 0.02945, 0.032, 0.034];
  const gridRows: Row[] = [];
  for (const r of risks) for (const qq of qGrid) gridRows.push({ risk: r, q: qq, growth: seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome) });
  const heat: ChartSpec = {
    id: "chain-heat",
    title: "Log growth per season by risk per night and true loss rate",
    subtitle: `${k} names a night. The right row is the one that stays positive across the rates you cannot rule out.`,
    kind: "heatmap",
    data: table([f("risk", "Tranche at risk per night", "pct"), f("q", "True loss rate per name", "pct2"), f("growth", "Log growth per season", "pct1")], gridRows),
    mark: "bar",
    x: { field: "q" },
    y: { field: "risk" },
    series: [],
    heat: { xField: "q", yField: "risk", valueField: "growth", palette: "diverging", center: 0, format: "pct1", cellLabels: true },
    height: 300,
  };

  const riskSweep = linspace(0.05, 1, 96);
  const sweepRates = [p.altLossRate, p.lossRate, Math.min(0.08, p.lossRate + (p.lossRate - p.altLossRate))];
  const sweepRows: Row[] = riskSweep.map((r) => {
    const row: Row = { risk: r };
    sweepRates.forEach((qq, i) => (row[`g${i}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome)));
    return row;
  });
  const sweep: ChartSpec = {
    id: "chain-sweep",
    title: "The same grid as curves",
    subtitle: "Fractional Kelly in concrete form: betting about twice the optimal fraction gives roughly zero growth.",
    kind: "xy",
    data: table([f("risk", "Tranche at risk per night", "pct"), ...sweepRates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1"))], sweepRows),
    mark: "line",
    x: { field: "risk", format: "pct", domain: [0, 1] },
    y: { field: "g1", label: "Log growth per season", format: "pct" },
    series: [
      { field: "g0", color: "ramp1", label: `optimistic q = ${pct2(sweepRates[0])}` },
      { field: "g1", color: "ramp2", label: `deck q = ${pct2(sweepRates[1])}`, emphasis: "strong" },
      { field: "g2", color: "ramp3", label: `worse q = ${pct2(sweepRates[2])}` },
    ],
    height: 280,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      { kind: "vline", x: p.riskPerNight, text: `your risk per night ${pct(p.riskPerNight)}`, color: "c", at: "start" },
    ],
  };

  const paths = samplePaths([{ nights: N * n, policy: d.byId.C.policy }], p.fanPaths, p.seed + 303);
  const fanRows: Row[] = [];
  for (let t = 0; t <= N * n; t++) {
    const r: Row = { night: t };
    paths.forEach((path, i) => (r[`p${i}`] = path[t]));
    fanRows.push(r);
  }
  const fanSeries: SeriesSpec[] = paths.map((_, i) => ({ field: `p${i}`, label: `path ${i + 1}`, color: "c", emphasis: "muted", legend: false, width: 1.2 }));
  const fan: ChartSpec = {
    id: "chain-fan",
    title: `Railroad over ${N} seasons, ${d.byId.C.label}`,
    subtitle: "The reserve turns partial hits into dips you can recover from. Season boundaries marked.",
    kind: "xy",
    data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Path ${i + 1}`, "x"))], fanRows),
    mark: "step",
    x: { field: "night", domain: [0, N * n] },
    y: { field: "p0", label: "Tranche, start = 1", format: "x", domain: [0, null] },
    series: fanSeries,
    legend: false,
    height: 260,
    annotations: [
      ...Array.from({ length: N - 1 }, (_, i) => ({ kind: "vline" as const, x: (i + 1) * n, color: "muted" as const, text: `season ${i + 2}`, at: "start" as const })),
      { kind: "hline", y: sC.median, text: `median ${sC.median.toFixed(2)}×`, color: "c", dash: false, at: "end" },
    ],
  };

  const policyTbl: ChartSpec = {
    id: "chain-table",
    title: `${N} seasons chained, same per-name loss rate`,
    kind: "table",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("p10", "10th percentile", "x"), f("pBelow", `P(below ${p.thresholdBelow.toFixed(2)}×)`, "pct1"), f("pRuin", "P(ruin)", "pct2")],
      ids.map((id) => {
        const s = d.chained[id].summary;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, p10: s.p10, pBelow: s.pBelow, pRuin: s.pRuin };
      }),
    ),
    mark: "line",
    x: { field: "policy" },
    y: { field: "mean" },
    series: [],
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median", emphasize: true }, { field: "p10" }, { field: "pBelow", color: "loss" }, { field: "pRuin", color: "loss" }],
  };

  const gridTbl: ChartSpec = {
    id: "chain-grid-table",
    title: "Log growth per season, as numbers",
    kind: "table",
    data: table(
      [f("risk", "Risk per night", "pct"), ...qGrid.map((qq) => f(`q${qq}`, pct2(qq), "pct1"))],
      risks.map((r) => {
        const row: Row = { risk: r };
        for (const qq of qGrid) row[`q${qq}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome);
        return row;
      }),
    ),
    mark: "line",
    x: { field: "risk" },
    y: { field: "risk" },
    series: [],
    columns: [{ field: "risk", emphasize: true }, ...qGrid.map((qq) => ({ field: `q${qq}` }))],
    highlightRow: { field: "risk", value: risks.reduce((best, r) => (Math.abs(r - p.riskPerNight) < Math.abs(best - p.riskPerNight) ? r : best), risks[0]) },
    caption: "Columns are the true per-name loss rate. Ruin is excluded from the expectation and reported separately in the policy table.",
  };

  const growthNow = seasonLogGrowth(p.riskPerNight, k, p.lossRate, p.gain, n, p.sharedOutcome);
  return {
    id: "chaining",
    number: 8,
    eyebrow: "Replaying the tranche",
    title: `Chain ${N} seasons and the median becomes your number`,
    question: "Survive season one with the drawdown a bad season brings, then play again. What changes over four seasons?",
    lede: `Chaining does not change the mean. It changes which number describes your actual outcome. Over many seasons almost every path ends near the median, not the mean, and the gap widens with every season you add. The single-name coin has its mean carried by the ${pct1(
      Math.pow(d.pClean, N),
    )} of paths that survive ${N} clean seasons. The diversified tranche at full exposure solves ruin but not growth. Half the tranche per night turns the median positive, and the mean it gives up belonged to paths you were unlikely to be on.`,
    kpis: [
      { label: "Median after N seasons", value: `${x2(sB.median)} → ${x2(sC.median)}`, sub: "whole tranche → reserve", color: "c" },
      { label: "Mean after N seasons", value: `${x2(sB.mean)} → ${x2(sC.mean)}`, sub: "the cost of the reserve" },
      { label: `P(below ${p.thresholdBelow.toFixed(2)}×)`, value: `${pct(sB.pBelow)} → ${pct(sC.pBelow)}`, sub: "whole tranche → reserve", color: "loss" },
      { label: "Log growth per season", value: signedPct1(growthNow), sub: `${pct(p.riskPerNight)} at risk, deck q`, help: "At the deck's loss rate and your risk per night. The heatmap shows how it moves if the true rate differs." },
    ],
    primary: [growthChart],
    secondary: [endDist, fan, heat, sweep],
    tables: [policyTbl, gridTbl],
    localParams: [],
    notes: [
      {
        title: "Why half and not full",
        body: `Full exposure is never the best choice, even at the optimistic loss rate, and it turns sharply negative as soon as the true rate is a few tenths of a point worse. Section 3 showed the loss rate cannot be pinned down to within a point, so the right row of the grid is the one that stays positive across the range you cannot rule out. Half the tranche per night does that: near-optimal at the deck's rate, a point behind at the optimistic one, and the least negative among the rows that work at both.\n\nIn tranche terms the half you do not risk each night is a reserve. Its job is to turn partial hits into dips you can recover from, not to sit idle.`,
      },
      {
        title: "Recovering from one partial hit",
        body: `One partial hit at full exposure costs about ${pct(1 - (1 + (1 / k) * ((k - 1) * p.gain - 1)))} of the tranche. Recovering takes ${pct(
          1 / (1 + (1 / k) * ((k - 1) * p.gain - 1)) - 1,
        )}, which is roughly ${Math.ceil(Math.log(1 / (1 + (1 / k) * ((k - 1) * p.gain - 1))) / Math.log(1 + p.gain))} clean nights at +${pct1(p.gain)}. With ${k * n} name-events at ${pct2(
          p.lossRate,
        )} you expect about ${(k * n * p.lossRate).toFixed(1)} hits a season.`,
      },
    ],
    sourceFigures: [
      { label: "Four seasons, 1 name: mean / ruin", quoted: "1.44 / 91%", computed: `${x2(sA.mean)} / ${pct(sA.pRuin)}` },
      { label: "Four seasons, 3 names whole tranche: median / 10th pct / P(<0.5)", quoted: "0.92 / 0.18 / 31%", computed: `${x2(sB.median)} / ${x2(sB.p10)} / ${pct(sB.pBelow)}` },
      { label: "Four seasons, 3 names half tranche: mean / median / P(<0.5)", quoted: "1.20 / 1.09 / 7%", computed: `${x2(sC.mean)} / ${x2(sC.median)} / ${pct(sC.pBelow)}` },
      { label: "Growth grid: 100% at 2.94%", quoted: "−4.1%", computed: pct1(seasonLogGrowth(1, 3, 0.02945, 0.035, 20)) },
    ],
  };
}
