import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec } from "../../charts/spec";
import { robustSeasonLogGrowth, seasonLogGrowth, seasonRuin } from "../../model/kelly";
import type { Datasets, Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { binnedDistributions, logHistogram, samplePaths, summarize } from "../../model/season";
import { linspace } from "../../model/stats";
import { methodLabel, pct, pct1, pct2, signedPct1, smallPct, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildChaining(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const k = d.k;
  const N = p.seasons;
  const n = p.nights;
  const S = Math.max(N, 8);
  const sA = d.chained.A.summary;
  const sB = d.chained.B.summary;
  const sC = d.chained.C.summary;

  // Log growth grid: risk per night × true loss rate. Cells with material ruin say so.
  const riskList = Array.from(new Set([0.2, 0.3, 0.39, 0.5, 0.6, 0.75, 0.9, 1.0, Math.round(p.riskPerNight * 100) / 100])).sort((a, b) => a - b);
  const qList = Array.from(new Set([0.022, p.altLossRate, 0.028, p.lossRate, 0.032, d.breakEven].map((v) => Math.round(v * 1e5) / 1e5))).sort((a, b) => a - b);
  const gridRows: Row[] = [];
  for (const r of riskList)
    for (const qq of qList) {
      const ruin = seasonRuin(r, k, qq, p.gain, n, p.sharedOutcome);
      const growth = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome);
      gridRows.push({ risk: r, q: qq, growth: ruin > 0.01 ? null : growth, label: ruin > 0.01 ? `ruin ${pct(ruin)}` : null });
    }
  const heat: ChartSpec = {
    id: "chain-heat",
    title: "Log growth per season by risk per night and true loss rate",
    subtitle: `${k} name${k === 1 ? "" : "s"} a night, growth conditional on survival; cells where a season wipes the tranche more than 1% of the time say so instead. No row stays positive at break-even. The outlined cell is your deck.`,
    kind: "heatmap",
    data: table([f("risk", "Tranche at risk per night", "pct"), f("q", "True loss rate per name", "pct2"), f("growth", "Log growth per season", "pct1"), f("label", "Label")], gridRows),
    mark: "bar",
    x: { field: "q" },
    y: { field: "risk" },
    series: [],
    heat: { xField: "q", yField: "risk", valueField: "growth", labelField: "label", palette: "diverging", center: 0, format: "pct1", cellLabels: true, highlight: { x: Math.round(p.lossRate * 1e5) / 1e5, y: Math.round(p.riskPerNight * 100) / 100 } },
    height: Math.max(240, 30 * riskList.length + 40),
  };

  // The same grid as curves, plus the curve averaged over the band you cannot rule out.
  const riskSweep = linspace(0.02, 1, 99);
  const sweepRates = [p.altLossRate, p.lossRate, d.breakEven];
  const sweepRows: Row[] = riskSweep.map((r) => {
    const row: Row = { risk: r };
    sweepRates.forEach((qq, i) => (row[`g${i}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome)));
    row.robust = robustSeasonLogGrowth(r, k, d.band, p.gain, n, p.sharedOutcome);
    return row;
  });
  const sweepMin = Math.max(-0.2, Math.min(...sweepRows.map((r) => Math.min(r.g0 as number, r.g1 as number, r.g2 as number, r.robust as number))));
  const sweep: ChartSpec = {
    id: "chain-sweep",
    title: "The row to sit in: growth averaged over the rates you cannot rule out",
    subtitle: `The thick curve averages growth over a loss rate drawn ${d.bandLabel}. It peaks at ${pct(d.robust.risk)} of the tranche per night; growth-optimal at the deck's rate alone would be ${pct(d.nightKelly.risk)}.`,
    kind: "xy",
    data: table(
      [f("risk", "Tranche at risk per night", "pct"), ...sweepRates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1")), f("robust", "averaged over the band", "pct1")],
      sweepRows,
    ),
    mark: "line",
    x: { field: "risk", format: "pct", domain: [0, 1] },
    y: { field: "robust", label: "Log growth per season", format: "pct", domain: [Math.floor(sweepMin * 20) / 20, null], zero: false },
    series: [
      { field: "g0", color: "ramp1", label: `optimistic q = ${pct2(sweepRates[0])}` },
      { field: "g1", color: "ramp2", label: `deck q = ${pct2(sweepRates[1])}` },
      { field: "g2", color: "ramp3", label: `break-even q = ${pct2(sweepRates[2])}` },
      { field: "robust", color: "ink", label: "averaged over the band", emphasis: "strong" },
    ],
    height: 320,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      { kind: "point", x: d.robust.risk, y: d.robust.growth, text: `robust optimum ${pct(d.robust.risk)}`, color: "ink", at: d.robust.risk <= d.nightKelly.risk ? "start" : "end" },
      { kind: "point", x: d.nightKelly.risk, y: d.nightKelly.growth, text: `Kelly at the deck's rate ${pct(d.nightKelly.risk)}`, color: "ramp2", at: d.robust.risk <= d.nightKelly.risk ? "end" : "start" },
      { kind: "vline", x: p.riskPerNight, text: `your risk per night ${pct(p.riskPerNight)}`, color: "c", at: "start" },
    ],
    stories: [
      { id: "robust", label: "Sit at the robust optimum", narrative: "Sets the deck's risk per night to the peak of the averaged curve.", params: { riskPerNight: Math.round(d.robust.risk * 20) / 20 } },
      { id: "worse", label: "What if q is really 3.2%?", narrative: "A few tenths of a point worse, and the row you sit in changes sign.", params: { lossRate: 0.032 } },
      { id: "zoom", label: "Zoom on the positive region", patch: { y: { domain: [-0.02, null] }, x: { domain: [0, 0.7] } } },
    ],
  };

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
    subtitle: "Solid is the median, dashed the mean. The mean compounds on a shrinking set of lucky paths; the median is where the typical path sits.",
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
    y: { field: "medianC", label: "Tranche after N seasons", format: "x" },
    series: [
      { field: "meanB", color: "b", label: `${d.byId.B.short}, mean`, dash: true },
      { field: "medianB", color: "b", label: `${d.byId.B.short}, median`, emphasis: "strong" },
      { field: "meanC", color: "c", label: `${d.byId.C.short}, mean`, dash: true },
      { field: "medianC", color: "c", label: `${d.byId.C.short}, median`, emphasis: "strong" },
    ],
    height: 300,
    annotations: [
      { kind: "vline", x: N, text: `${N} seasons`, color: "ink", at: "start" },
      { kind: "hline", y: 1, text: "start", color: "muted", at: "start" },
    ],
    stories: [
      { id: "coin", label: "Include the single-name coin", narrative: "Its mean rides a vanishing minority; its median is zero after two seasons.", patch: { extraSeries: [{ field: "meanA", color: "a" }, { field: "medianA", color: "a" }], y: { scale: "log", domain: [0.05, null] } } },
      { id: "medians", label: "Medians only", patch: { hiddenSeries: ["meanB", "meanC"] } },
    ],
  };

  // Distribution after N seasons on log bins.
  const lo = 0.02;
  const hiEnd = Math.max(3, Math.pow(d.cleanEnd, N) * 1.1);
  const bins = 36;
  const hists = Object.fromEntries(ids.map((id) => [id, logHistogram(d.chained[id].dist, lo, hiEnd, bins)])) as Record<PolicyId, ReturnType<typeof logHistogram>>;
  const histRows: Row[] = hists.A.bins.map((bn, i) => ({ mid: bn.mid, A: hists.A.bins[i].prob, B: hists.B.bins[i].prob, C: hists.C.bins[i].prob }));
  const endDist: ChartSpec = {
    id: "chain-dist",
    title: `Where the tranche stands after ${N} season${N === 1 ? "" : "s"}`,
    subtitle: `Probability per log-spaced bin (${methodLabel(d.chained.C.dist.method)}). Ruin mass off the chart: ${smallPct(hists.A.zeroMass)} for the coin, ${smallPct(hists.B.zeroMass)} and ${smallPct(hists.C.zeroMass)} for the diversified policies.`,
    kind: "xy",
    data: table([f("mid", "Tranche after N seasons", "x"), ...ids.map((id) => f(id, d.byId[id].label, "pct1"))], histRows),
    mark: "bar",
    x: { field: "mid", scale: "log", format: "x", domain: [lo, hiEnd] },
    y: { field: "B", label: "Probability per bin", format: "pct" },
    series: [
      { field: "A", color: "a", label: d.byId.A.label },
      { field: "B", color: "b", label: d.byId.B.label },
      { field: "C", color: "c", label: d.byId.C.label, emphasis: "strong" },
    ],
    barWidthPx: 5,
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
    title: `Railroad over ${N} season${N === 1 ? "" : "s"}, ${d.byId.C.label}`,
    subtitle: "The reserve turns partial hits into dips you can recover from. Season boundaries marked.",
    kind: "xy",
    data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Path ${i + 1}`, "x"))], fanRows),
    mark: "step",
    x: { field: "night", domain: [0, N * n] },
    y: { field: "p0", label: "Tranche, start = 1", format: "x" },
    series: fanSeries,
    legend: false,
    height: 260,
    annotations: [
      ...Array.from({ length: N - 1 }, (_, i) => ({ kind: "vline" as const, x: (i + 1) * n, color: "muted" as const, text: `season ${i + 2}`, at: "start" as const })),
      { kind: "hline", y: sC.median, text: `median ${sC.median.toFixed(2)}×`, color: "c", dash: false, at: "end" },
    ],
    stories: [{ id: "seed", label: "Draw another set of paths", params: { seed: (p.seed % 90_000) + 53 } }],
  };

  const policyTbl = tableSpec({
    id: "chain-table",
    title: `${N} season${N === 1 ? "" : "s"} chained, same per-name loss rate`,
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("p10", "10th percentile", "x"), f("pBelow", `P(below ${p.thresholdBelow.toFixed(2)}×)`, "pct1"), f("pRuin", "P(ruin)", "pct2")],
      ids.map((id) => {
        const s = d.chained[id].summary;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, p10: s.p10, pBelow: s.pBelow, pRuin: s.pRuin };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median", emphasize: true }, { field: "p10" }, { field: "pBelow", color: "loss" }, { field: "pRuin", color: "loss" }],
    caption: `Distributions ${methodLabel(d.chained.C.dist.method)}.`,
  });

  const gridTbl = tableSpec({
    id: "chain-grid-table",
    title: "Log growth per season, as numbers",
    data: table(
      [f("risk", "Risk per night", "pct"), ...qList.map((qq) => f(`q${qq}`, pct2(qq), "pct1")), f("robust", "averaged over the band", "pct1")],
      riskList.map((r) => {
        const row: Row = { risk: r };
        for (const qq of qList) row[`q${qq}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome);
        row.robust = robustSeasonLogGrowth(r, k, d.band, p.gain, n, p.sharedOutcome);
        return row;
      }),
    ),
    columns: [{ field: "risk", emphasize: true }, ...qList.map((qq) => ({ field: `q${qq}` })), { field: "robust", emphasize: true }],
    highlightRow: { field: "risk", value: Math.round(p.riskPerNight * 100) / 100 },
    caption: "Columns are the true per-name loss rate; growth is conditional on survival. The last column averages over the band of rates you cannot rule out.",
  });

  const hitFactor = 1 + (1 / k) * ((k - 1) * p.gain - 1);
  const recovery =
    hitFactor > 0
      ? `One partial hit at full exposure costs about ${pct(1 - hitFactor)} of the tranche. Recovering takes +${pct(1 / hitFactor - 1)}, roughly ${Math.ceil(Math.log(1 / hitFactor) / Math.log(1 + p.gain))} clean nights at +${pct1(
          p.gain,
        )}. With ${k * n} name-events at ${pct2(p.lossRate)} you expect about ${(k * n * p.lossRate).toFixed(1)} hits a season.`
      : `With one name at full exposure a hit is not partial: it is the whole tranche, and there is nothing to recover from.`;
  const halfVsKelly = d.nightKelly.risk > 0 ? p.riskPerNight / d.nightKelly.risk : NaN;

  return {
    id: "chaining",
    number: 8,
    eyebrow: "Replaying the tranche",
    title: `Chain ${N} season${N === 1 ? "" : "s"} and the median becomes your number`,
    question: "Survive season one with the drawdown a bad season brings, then play again. What changes over several seasons?",
    lede: `Chaining compounds every policy's mean the same way; what changes is which number describes your outcome. The coin's mean after ${N} seasons rides the ${pct1(
      Math.pow(d.pClean, N),
    )} of paths that survive them all. The diversified tranche at full exposure solves ruin but not growth, and the reserve policy turns the median positive at the price of mean that belonged to paths you were unlikely to be on. Section 3 says the loss rate cannot be pinned down, so the row to sit in is the one that does best averaged over the rates you cannot rule out.`,
    kpis: [
      { label: "Robust risk per night", value: pct(d.robust.risk), sub: `peak of the averaged curve · Kelly at the deck's rate ${pct(d.nightKelly.risk)}`, color: "ink", help: `Risk per night that maximises growth averaged over a loss rate drawn ${d.bandLabel}. The deck's ${pct(p.riskPerNight)} is ${Number.isFinite(halfVsKelly) ? `${halfVsKelly.toFixed(2)}× the single-rate optimum` : "beyond any positive optimum"}.` },
      { label: `Median after ${N} season${N === 1 ? "" : "s"}`, value: `${x2(sB.median)} → ${x2(sC.median)}`, sub: "whole tranche → reserve", color: "c" },
      { label: `Mean after ${N} season${N === 1 ? "" : "s"}`, value: `${x2(sB.mean)} → ${x2(sC.mean)}`, sub: "the cost of the reserve" },
      { label: `P(below ${p.thresholdBelow.toFixed(2)}×)`, value: `${pct(sB.pBelow)} → ${pct(sC.pBelow)}`, sub: "whole tranche → reserve", color: "loss" },
      { label: "Growth per season, your deck", value: signedPct1(d.growthC), sub: `${pct(p.riskPerNight)} at risk, deck q · ruin ${smallPct(d.ruinC)}`, help: "At the deck's loss rate and your risk per night, conditional on survival." },
    ],
    primary: [heat, sweep],
    secondary: [growthChart, endDist, fan],
    tables: [policyTbl, gridTbl],
    localParams: [],
    notes: [
      {
        title: "Which row to sit in",
        body: `Full exposure is never the best choice, even at the optimistic rate, and it turns sharply negative as soon as the true rate is a few tenths of a point worse. No row stays positive at break-even, because at break-even nothing grows. The honest rule is to maximise growth averaged over the loss rates you cannot rule out: with the band ${d.bandLabel}, that peak is ${pct(
          d.robust.risk,
        )} of the tranche per night. At the deck's rate alone the optimum is ${pct(d.nightKelly.risk)}, so the deck's ${pct(p.riskPerNight)} is ${Number.isFinite(halfVsKelly) ? `${halfVsKelly.toFixed(2)}× that` : "past any positive optimum"}: fractional Kelly only if the optimistic rate is closer to the truth than the deck's.\n\nIn tranche terms the share you do not risk each night is a reserve. Its job is to turn partial hits into dips you can recover from, not to sit idle.`,
      },
      { title: "Recovering from one partial hit", body: recovery },
    ],
    sourceFigures: [
      { label: "Four seasons, 1 name: mean / ruin", quoted: "1.44 / 91%", computed: `${x2(sA.mean)} / ${pct(sA.pRuin)}` },
      { label: "Four seasons, 3 names whole tranche: median / 10th pct / P(<0.5)", quoted: "0.92 / 0.18 / 31%", computed: `${x2(sB.median)} / ${x2(sB.p10)} / ${pct(sB.pBelow)}` },
      { label: "Four seasons, 3 names half tranche: mean / median / P(<0.5)", quoted: "1.20 / 1.09 / 7%", computed: `${x2(sC.mean)} / ${x2(sC.median)} / ${pct(sC.pBelow)}` },
      { label: "Growth grid: 100% at 2.94%", quoted: "−4.1%", computed: pct1(seasonLogGrowth(1, 3, 0.02945, 0.035, 20)) },
    ],
  };
}
