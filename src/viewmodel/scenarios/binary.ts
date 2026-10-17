import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec } from "../../charts/spec";
import { binaryTable, pCleanFromLossRate, seasonMean } from "../../model/binary";
import type { Datasets, Params } from "../../model/params";
import { samplePaths } from "../../model/season";
import { linspace } from "../../model/stats";
import { pct, pct1, pct2, signedPct1, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildBinary(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const { nights: n, gain: b, lossRate: q } = p;
  const end = d.cleanEnd;
  const mean = d.meanSeason;

  const outcomes: ChartSpec = {
    id: "binary-outcomes",
    title: "Where a single-name season can end",
    subtitle: "Whole tranche at risk every night, gains compounding inside. Two outcomes, nothing in between.",
    kind: "xy",
    data: table(
      [f("end", "Season end, tranche units", "x"), f("ruin", "Ruin", "pct1"), f("clean", "Clean season", "pct1")],
      [
        { end: 0, ruin: 1 - d.pClean, clean: null },
        { end, ruin: null, clean: d.pClean },
      ],
    ),
    mark: "bar",
    x: { field: "end", domain: [-0.25, Math.ceil((Math.max(end, mean) + 0.3) * 2) / 2], format: "x" },
    y: { field: "clean", label: "Probability", domain: [0, 1], format: "pct" },
    series: [
      { field: "ruin", color: "loss", label: `ruin ${pct(1 - d.pClean)}` },
      { field: "clean", color: "good", label: `clean ${pct(d.pClean)}` },
    ],
    barWidthPx: 34,
    height: 300,
    annotations: [{ kind: "vline", x: mean, text: `mean ${mean.toFixed(2)}×, where no season ends`, color: "ink" }],
    caption: "The mean is the balance point of the two bars, not a place a tranche can land. Section 2 takes this apart.",
    stories: [
      { id: "opt", label: "What if the loss rate is the optimistic one?", narrative: "Moves the deck to the optimistic rate; every section follows.", params: { lossRate: p.altLossRate } },
      { id: "be", label: "What if it is exactly break-even?", narrative: "Sets q = b/(1+b); the two bars become the fair coin.", params: { lossRate: d.breakEven } },
    ],
  };

  const qs = linspace(0.002, 0.08, 157);
  const curveRows: Row[] = qs.map((qq) => ({ q: qq, pClean: pCleanFromLossRate(qq, n), mean: seasonMean(pCleanFromLossRate(qq, n), b, n) }));
  const curve: ChartSpec = {
    id: "binary-curve",
    title: "A clean season against the per-event loss rate",
    subtitle: `(1 − q)^${n}. Break-even is where this crosses the coin flip; the mean season is this curve times ${end.toFixed(2)}×.`,
    kind: "xy",
    data: table([f("q", "Loss rate per event, q", "pct2"), f("pClean", "P(clean season)", "pct1"), f("mean", "Mean season end, tranche units", "x")], curveRows),
    mark: "line",
    x: { field: "q", format: "pct1", domain: [0, 0.08] },
    y: { field: "pClean", label: "P(clean season)", domain: [0, 1], format: "pct" },
    series: [{ field: "pClean", color: "a", label: "P(clean season)" }],
    height: 300,
    annotations: [
      { kind: "vline", x: d.breakEven, text: `break-even q ${pct2(d.breakEven)}`, color: "loss" },
      { kind: "hline", y: 0.5, text: "coin flip", color: "muted", at: "start" },
      { kind: "point", x: q, y: d.pClean, text: `your deck: q ${pct2(q)}, p ${pct(d.pClean)}`, color: "ink", at: "end" },
    ],
    stories: [
      { id: "zoom", label: "Zoom on the range you cannot rule out", narrative: "The whole strategy lives between the optimistic rate and break-even.", patch: { x: { domain: [0.015, 0.045] }, y: { domain: [0.3, 0.8] } } },
      {
        id: "mean",
        label: "Show the mean season end instead",
        narrative: "The same curve scaled by the clean end; fair is where it crosses 1×.",
        patch: {
          hiddenSeries: ["pClean"],
          extraSeries: [{ field: "mean", color: "b" }],
          y: { label: "Mean season end, tranche units", domain: [0, 2] },
          annotations: [
            { kind: "vline", x: d.breakEven, text: `break-even q ${pct2(d.breakEven)}`, color: "loss" },
            { kind: "hline", y: 1, text: "fair: mean 1×", color: "muted", at: "start" },
            { kind: "point", x: q, y: mean, text: `your deck: mean ${mean.toFixed(2)}×`, color: "ink", at: "end" },
          ],
        },
      },
    ],
  };

  const polA = d.byId.A.policy;
  const paths = samplePaths([{ nights: n, policy: polA }], p.fanPaths, p.seed);
  const fanRows: Row[] = [];
  for (let t = 0; t <= n; t++) {
    const r: Row = { night: t };
    paths.forEach((path, i) => (r[`p${i}`] = path[t]));
    fanRows.push(r);
  }
  const fanSeries: SeriesSpec[] = paths.map((path, i) => ({
    field: `p${i}`,
    label: `season ${i + 1}`,
    color: path[path.length - 1] > 0 ? "a" : "loss",
    emphasis: "muted",
    legend: false,
    width: 1.2,
  }));
  const ruined = paths.filter((x) => x[x.length - 1] === 0).length;
  const fan: ChartSpec = {
    id: "binary-fan",
    title: `The railroad: ${p.fanPaths} sampled seasons`,
    subtitle: `Every path climbs the same stairs until the first full loss drops it to zero. ${ruined} of ${p.fanPaths} ended there in this draw.`,
    kind: "xy",
    data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Season ${i + 1}`, "x"))], fanRows),
    mark: "step",
    x: { field: "night", domain: [0, n] },
    y: { field: "p0", label: "Tranche, start = 1", domain: [0, Math.ceil(end * 4) / 4], format: "x" },
    series: fanSeries,
    legend: false,
    height: 280,
    annotations: [
      { kind: "hline", y: end, text: `clean end ${end.toFixed(2)}×`, color: "good", at: "start" },
      { kind: "hline", y: mean, text: `mean ${mean.toFixed(2)}×`, color: "ink", at: "start" },
    ],
    stories: [{ id: "seed", label: "Draw another set of seasons", narrative: "Same odds, a different roll of the dice.", params: { seed: (p.seed % 90_000) + 17 } }],
  };

  const rowsP = [0.45, 0.5, 0.55, 0.6, 0.7];
  const tbl = binaryTable(b, n, rowsP);
  const current = { pClean: d.pClean, lossRate: q, mean, twoPMinusOne: 2 * d.pClean - 1 };
  const all = [...tbl, current].sort((a, c) => a.pClean - c.pClean);
  const binaryTbl = tableSpec({
    id: "binary-table",
    title: "Clean-season probability, implied loss rate, and the season's mean",
    data: table(
      [f("pClean", "P(clean season)", "pct1"), f("lossRate", "Implied loss rate per event", "pct2"), f("mean", "Mean season end", "x"), f("edge", "Mean − 1", "pct1"), f("twoPMinusOne", "2p − 1", "pct1")],
      all.map((r) => ({ pClean: r.pClean, lossRate: r.lossRate, mean: r.mean, edge: r.mean - 1, twoPMinusOne: r.twoPMinusOne })),
    ),
    columns: [{ field: "pClean", emphasize: true }, { field: "lossRate" }, { field: "mean" }, { field: "edge" }, { field: "twoPMinusOne" }],
    highlightRow: { field: "lossRate", value: q },
    caption: `The highlighted row is the control deck. 2p − 1 equals mean − 1 only when the clean end is exactly 2×; here it is ${end.toFixed(2)}×.`,
  });

  return {
    id: "binary",
    number: 1,
    eyebrow: "The reduction",
    title: "A season is a coin, and “roughly 50-50” is the whole edge",
    question: "If every event risks the whole tranche and gains compound inside it, what is left of the per-event detail?",
    lede: `One number: the probability of a clean season. A full loss is absorbing, so ${n} nights end at ${end.toFixed(2)}× or at 0, and “roughly 50-50, doubled or zero” is not an edge but the break-even point, almost to the decimal.`,
    kpis: [
      { label: "Break-even loss rate", value: pct2(d.breakEven), sub: "b ÷ (1 + b)", color: "loss", help: "Above this per-event loss rate the season has negative expectation. It is also c/W, the rate at which the wing is fairly priced." },
      { label: "Edge per season", value: signedPct1(mean - 1), sub: `≈ 2p − 1 = ${signedPct1(2 * d.pClean - 1)}`, help: "Mean season end minus one. The shorthand 2p − 1 is exact when the clean end is 2×." },
      { label: "Clean season", value: pct(d.pClean), sub: `(1 − q)^${n} at q ${pct2(q)}`, color: "a" },
      { label: "Clean end", value: x2(end), sub: `(1 + b)^${n}`, help: "What the tranche becomes if no event hits max loss." },
    ],
    primary: [outcomes],
    secondary: [curve, fan],
    tables: [binaryTbl],
    localParams: [],
    notes: [
      {
        title: "What the sentence actually says",
        body: `A 50-50 double-or-nothing is a fair coin with expected value zero. The per-event arithmetic agrees: a gain of ${pct1(b)} of the risked amount breaks even at a full-loss rate of ${pct2(
          d.breakEven,
        )}, and surviving ${n} events at that rate has probability ${pct1(pCleanFromLossRate(d.breakEven, n))}.\n\nThe season's mean in tranche units is p × ${end.toFixed(2)}, so the edge is p × ${end.toFixed(
          2,
        )} − 1 ≈ 2p − 1. Every tenth of a percentage point in the loss rate moves the whole strategy.`,
      },
      {
        title: "Why the per-event and the season break-even coincide",
        body: "Compounding inside the tranche makes the season's expectation (1 − q)^n (1 + b)^n. That equals one exactly when (1 − q)(1 + b) = 1, which is the per-event break-even. Nothing about the season length changes where fair sits; it only changes how far from fair you are for a given q.",
      },
      {
        title: "The rate that goes in",
        body: "The binary abstraction treats every bad event as a full loss, so q is expected loss as a fraction of max loss per event, not the breach rate and not the full-gap rate. Section 4 derives it from the wing and shows that an efficiently priced wing puts it exactly at break-even.",
      },
    ],
    sourceFigures: [
      { label: "Clean end after 20 events", quoted: "1.035²⁰ ≈ 1.99", computed: `${end.toFixed(3)}×` },
      { label: "Break-even full-loss rate", quoted: "3.38%", computed: pct2(d.breakEven) },
      { label: "P(survive 20) at break-even", quoted: "50.3%", computed: pct1(pCleanFromLossRate(d.breakEven, n)) },
      { label: "Implied q at p = 0.55", quoted: "2.94%", computed: pct2(tbl[2].lossRate) },
    ],
  };
}
