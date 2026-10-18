import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec } from "@kit/charts/spec";
import { binaryTable, pCleanFromLossRate, seasonMean } from "@app/model/binary";
import type { Datasets } from "@app/data/datasets";
import type { Params } from "@app/data/params";
import { samplePaths } from "@app/model/season";
import { linspace } from "@kit/math/stats";
import { fig } from "@app/data/discussion";
import { movesDeck, near } from "@kit/charts/scenario";
import { pct, pct1, pct2, signedPct1, signedPp, x2 } from "@kit/charts/numbers";
import { typographic } from "@kit/charts/format";
import type { Derived } from "./derived";
import type { ScenarioView } from "./types";

export function buildBinary(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const { nights: n, gain: b, lossRate: q } = p;
  const end = d.cleanEnd;
  const mean = d.meanSeason;
  const coin = d.byId.coin;
  const alt = p.altLossRate;
  const pOpt = pCleanFromLossRate(alt, n);
  const be = d.breakEven;

  const outcomes: ChartSpec = {
    id: "binary-outcomes",
    title: `Where a single-name season can end (${coin.name})`,
    subtitle: "x probability · y season end, tranche units",
    kind: "xy",
    data: table(
      [f("end", "Season end, tranche units", "x"), f("ruin", "Ruin", "pct1"), f("clean", "Clean season", "pct1")],
      [
        { end: 0, ruin: 1 - d.pClean, clean: null },
        { end, ruin: null, clean: d.pClean },
      ],
    ),
    mark: "bar",
    // Two horizontal segments on a season-end axis drawn up the side: where a season
    // ends is the position, how often is the length, and the mean sits between them.
    orientation: "horizontal",
    x: { field: "end", label: "Season end", domain: [-0.5, Math.ceil((Math.max(end, mean) + 0.5) * 2) / 2], format: "x" },
    y: { field: "clean", label: "Probability", domain: [0, 1], format: "pct" },
    series: [
      { field: "ruin", color: "loss", label: `ruin ${pct(1 - d.pClean)}` },
      { field: "clean", color: "good", label: `clean ${pct(d.pClean)}` },
    ],
    legend: false,
    barWidthPx: 22,
    height: 140,
    annotations: [
      { kind: "vline", x: mean, text: `mean ${x2(mean)}: no season ends here`, color: "muted" },
      { kind: "label", x: 0, y: 1 - d.pClean, text: `ruin ${pct(1 - d.pClean)} → 0×`, color: "loss", at: "end" },
      { kind: "label", x: end, y: d.pClean, text: `clean ${pct(d.pClean)} → ${x2(end)}`, color: "good", at: "end" },
    ],
    caption: `The mean is p × ${x2(end)} = ${x2(mean)}; no season ends there. Section 02 takes the mean apart.`,
    stories: [
      {
        id: "opt",
        label: "What if the loss rate is the optimistic one?",
        narrative: `At ${pct2(alt)} a clean season is ${pct(pOpt)} and the mean ${x2(seasonMean(pOpt, b, n))}; every section follows the deck.`,
        params: { lossRate: alt },
        badge: movesDeck("q", pct2(q), pct2(alt)),
      },
      {
        id: "be",
        label: "The chain is right: q = break-even",
        narrative: `At ${pct2(be)} the two bars are a fair coin: mean 1.00×, premium over fair 0, growth-optimal risk 0.`,
        params: { lossRate: be, market: "fair" },
        badge: movesDeck("q", pct2(q), pct2(be)),
      },
    ],
  };

  const qs = linspace(0.002, 0.08, 157);
  const curveRows: Row[] = qs.map((qq) => ({ q: qq, pClean: pCleanFromLossRate(qq, n), mean: seasonMean(pCleanFromLossRate(qq, n), b, n) }));
  const curve: ChartSpec = {
    id: "binary-curve",
    title: "A clean season against the per-event loss rate",
    subtitle: `x loss rate per event · y P(clean season) = (1 − q)^${n}`,
    kind: "xy",
    data: table([f("q", "Loss rate per event, q", "pct2"), f("pClean", "P(clean season)", "pct1"), f("mean", "Mean season end, tranche units", "x")], curveRows),
    mark: "line",
    x: { field: "q", format: "pct1", domain: [0, 0.08] },
    y: { field: "pClean", label: "P(clean season)", domain: [0, 1], format: "pct" },
    series: [{ field: "pClean", color: "a", label: `P(clean season), ${coin.name}` }],
    height: 300,
    annotations: [
      { kind: "vline", x: be, text: `break-even q ${pct2(be)}`, color: "loss" },
      { kind: "hline", y: 0.5, text: "coin flip", color: "muted", at: "start" },
      { kind: "point", x: q, y: d.pClean, text: `deck: q ${pct2(q)}, p ${pct(d.pClean)}`, color: "ink", at: "end" },
    ],
    stories: [
      {
        id: "mean",
        label: "Where does the mean season cross 1×?",
        narrative: `At break-even ${pct2(be)}: the mean is this curve times ${x2(end)}.`,
        patch: {
          hiddenSeries: ["pClean"],
          extraSeries: [{ field: "mean", color: "ink" }],
          y: { label: "Mean season end, tranche units", domain: [0, 2] },
          annotations: [
            { kind: "vline", x: be, text: `break-even q ${pct2(be)}`, color: "loss" },
            { kind: "hline", y: 1, text: "fair: mean 1×", color: "muted", at: "start" },
            { kind: "point", x: q, y: mean, text: `deck: mean ${x2(mean)}`, color: "ink", at: "end" },
          ],
        },
      },
    ],
  };

  const paths = samplePaths([{ nights: n, policy: coin.policy }], p.fanPaths, p.seed);
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
    tooltip: false,
    width: 1.2,
  }));
  const ruined = paths.filter((x) => x[x.length - 1] === 0).length;
  const fan: ChartSpec = {
    id: "binary-fan",
    title: `The railroad: ${p.fanPaths} sampled seasons (${coin.name})`,
    subtitle: `x night · y tranche, start = 1 · ${p.fanPaths} sampled seasons · red = ruined (${ruined} in this draw)`,
    kind: "xy",
    data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Season ${i + 1}`, "x"))], fanRows),
    mark: "step",
    x: { field: "night", domain: [0, n] },
    y: { field: "p0", label: "Tranche, start = 1", domain: [0, Math.ceil(end * 4) / 4], format: "x" },
    series: fanSeries,
    legend: false,
    height: 280,
    annotations: [
      { kind: "hline", y: end, text: `clean end ${x2(end)}`, color: "good", at: "start" },
      { kind: "hline", y: mean, text: `mean ${x2(mean)}`, color: "muted", at: "start" },
    ],
  };

  const rowsP = [0.45, 0.5, 0.55, 0.6, 0.7];
  const tbl = binaryTable(b, n, rowsP);
  const current = { pClean: d.pClean, lossRate: q, mean, twoPMinusOne: 2 * d.pClean - 1 };
  const all = [...tbl, current].sort((a, c) => a.pClean - c.pClean);
  const binaryTbl = tableSpec({
    id: "binary-table",
    title: "Clean-season probability, implied loss rate, and the season's mean",
    data: table(
      [f("pClean", "P(clean season)", "pct1"), f("lossRate", "Implied loss rate per event", "pct2"), f("mean", "Mean season end", "x"), f("ev", "Expected value per season (mean − 1)", "pct1"), f("twoPMinusOne", "2p − 1", "pct1")],
      all.map((r) => ({ pClean: r.pClean, lossRate: r.lossRate, mean: r.mean, ev: r.mean - 1, twoPMinusOne: r.twoPMinusOne })),
    ),
    columns: [{ field: "pClean", emphasize: true }, { field: "lossRate" }, { field: "mean" }, { field: "ev" }, { field: "twoPMinusOne" }],
    highlightRow: { field: "lossRate", value: q },
    caption: `The highlighted row is the deck. 2p − 1 equals mean − 1 only when the clean end is exactly 2×; here it is ${x2(end)}.`,
  });

  // The discussion's table, p → implied q and E[season] ≈ 2p − 1.
  const quotedRows: { p: number; q: string; ev: string }[] = [
    { p: 0.45, q: "3.91%", ev: "−0.10" },
    { p: 0.5, q: "3.41%", ev: "0" },
    { p: 0.55, q: "2.94%", ev: "+0.09" },
    { p: 0.6, q: "2.52%", ev: "+0.19" },
    { p: 0.7, q: "1.77%", ev: "+0.39" },
  ];
  const evText = (v: number) => typographic(`${v > 0.005 ? "+" : ""}${v.toFixed(2)}`);
  const tableFigs = quotedRows.map((row, i) => {
    const r = tbl[i];
    const qQuoted = Number(row.q.replace("%", "")) / 100;
    const evQuoted = Number(row.ev.replace("−", "-"));
    return fig(p, `p = ${row.p.toFixed(2)}: implied q · E[season] − 1`, `${row.q} · ${row.ev}`, `${pct2(r.lossRate)} · ${evText(r.mean - 1)}`, near(qQuoted, r.lossRate, 0.00006) && near(evQuoted, r.mean - 1, 0.011), ["b", "n"]);
  });

  return {
    id: "binary",
    number: 1,
    title: "Season reduction",
    claim: "An all-in season is a coin: “roughly 50-50, doubled or zero” is the break-even point, not a premium over fair.",
    lede: `Where can a season of ${n} all-in nights end, and which single number decides it?`,
    views: [
      { id: "season-outcomes", title: "Where a season ends", blurb: `The two ends of an all-in season and the sampled paths that get there, for the ${coin.label}.`, charts: ["binary-outcomes", "binary-fan"], kpis: [0, 1, 2, 3] },
      { id: "clean-season-curve", title: "The one curve the coin reduces to", blurb: "P(clean season) against the per-event loss rate, with break-even and the deck marked.", charts: ["binary-curve", "binary-table"], kpis: [0, 4, 2] },
    ],
    kpis: [
      { label: "Break-even loss rate", value: pct2(be), sub: "b ÷ (1 + b) · the chain's fair rate c ÷ W", help: "Above this per-event loss rate the season has negative expectation. It is also c/W, the rate at which the wing is fairly priced." },
      { label: "Expected value per season", value: signedPct1(mean - 1), sub: `mean ${x2(mean)} − 1 · ≈ 2p − 1 = ${signedPct1(2 * d.pClean - 1)}`, help: "Mean season end minus one: the average over a pool of independent replays, the same for Coin and Spread. The shorthand 2p − 1 is exact when the clean end is 2×." },
      { label: `Clean season (${coin.name})`, value: pct(d.pClean), sub: `(1 − q)^${n} at q ${pct2(q)}`, color: "a" },
      { label: "Clean end", value: x2(end), sub: `(1 + b)^${n}`, help: "What the tranche becomes if no event hits max loss." },
      { label: "Premium over fair per event", value: signedPp(d.market.premium), sub: `b ÷ (1 + b) − q = ${pct2(be)} − ${pct2(q)}`, help: "How far the deck's loss rate sits below the chain's fair rate. The discussion's case is an assumed risk premium for selling tail insurance, not an information edge." },
    ],
    primary: [outcomes],
    secondary: [curve, fan],
    tables: [binaryTbl],
    localParams: [],
    notes: [
      {
        title: "What the sentence actually says",
        body: `A 50-50 double-or-nothing is a fair coin with expected value zero. The per-event arithmetic agrees: a gain of ${pct1(b)} of the risked amount breaks even at a full-loss rate of ${pct2(be)}, and surviving ${n} events at that rate has probability ${pct1(pCleanFromLossRate(be, n))}.\n\nThe season's mean in tranche units is p × ${x2(end)}, so the expected value per season is p × ${typographic(end.toFixed(2))} − 1 ≈ 2p − 1. Every tenth of a percentage point in the loss rate moves it.`,
      },
      {
        title: "Why the per-event and the season break-even coincide",
        body: "Compounding inside the tranche makes the season's expectation (1 − q)^n (1 + b)^n. That equals one exactly when (1 − q)(1 + b) = 1, which is the per-event break-even. Nothing about the season length changes where fair sits; it only changes how far from fair you are for a given q.",
      },
      {
        title: "The rate that goes in",
        body: "The binary abstraction treats every bad event as a full loss, so q is expected loss as a fraction of max loss per event, not the breach rate and not the full-gap rate. Section 04 derives it from the wing and shows that an efficiently priced wing puts it exactly at break-even.",
      },
    ],
    sourceFigures: [
      fig(p, `Clean end after ${n} events`, "1.035²⁰ ≈ 1.99", x2(end), near(1.99, end, 0.006), ["b", "n"]),
      fig(p, "Break-even full-loss rate", "0.035 ÷ 1.035 = 3.38%", pct2(be), near(0.0338, be, 0.00006), ["b"]),
      fig(p, `P(survive ${n}) at break-even`, "50.3%", pct1(pCleanFromLossRate(be, n)), near(0.503, pCleanFromLossRate(be, n), 0.0011), ["b", "n"]),
      ...tableFigs,
    ],
  };
}
