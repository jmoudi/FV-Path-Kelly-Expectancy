import { f, table, tableSpec, type ChartSpec, type Row } from "../../charts/spec";
import { breadthTable, kellyFraction, logGrowthPerBet, seasonLogGrowth } from "../../model/kelly";
import type { Datasets, Params } from "../../model/params";
import { sampleGrid } from "../../model/season";
import { linspace } from "../../model/stats";
import { pct, pct1, pct2, signedPct1, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildAxes(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const k = d.k;
  const q = p.lossRate;
  const b = p.gain;
  const n = p.nights;
  const fstar = d.kelly;
  const gBet = logGrowthPerBet(fstar, q, b);

  // The railroad grid: one sampled season of policy C, as a name × night grid plus the path beneath.
  const polC = d.byId.C.policy;
  const grid = sampleGrid(polC, n, p.seed + 7);
  const gridRows: Row[] = [];
  grid.losses.forEach((row, t) => row.forEach((lost, i) => gridRows.push({ night: t + 1, name: `name ${i + 1}`, outcome: lost })));
  const gridChart: ChartSpec = {
    id: "axes-grid",
    title: "The two axes, drawn",
    subtitle: `One sampled season of ${d.byId.C.label}. Across: nights, each a step outside the log. Down: names on the same night, added up inside the log before the tranche feels them.`,
    kind: "heatmap",
    data: table([f("night", "Night", "int"), f("name", "Name"), f("outcome", "Outcome (1 = full loss)", "int")], gridRows),
    mark: "bar",
    x: { field: "night" },
    y: { field: "name", label: "Parallel bets" },
    series: [],
    heat: { xField: "night", yField: "name", valueField: "outcome", palette: "binary", cellLabels: false },
    height: Math.max(90, 34 * k + 20),
    caption: "Dark cells won, red cells lost everything they risked.",
    stories: [{ id: "seed", label: "Draw another season", params: { seed: (p.seed % 90_000) + 41 } }],
  };
  const pathRows: Row[] = grid.path.map((v, t) => ({ night: t, tranche: v }));
  const pathChart: ChartSpec = {
    id: "axes-path",
    title: "The tranche under that same grid",
    subtitle: `Each night multiplies the tranche once, by one factor that already contains all ${k} name${k === 1 ? "" : "s"}.`,
    kind: "xy",
    data: table([f("night", "Night", "int"), f("tranche", "Tranche, start = 1", "x")], pathRows),
    mark: "step",
    x: { field: "night", domain: [0, n] },
    y: { field: "tranche", format: "x", zero: false },
    series: [{ field: "tranche", color: "c", label: "Tranche", emphasis: "strong" }],
    height: 200,
    annotations: [{ kind: "hline", y: 1, text: "start", color: "muted", at: "start" }],
  };

  const qs = linspace(0.005, Math.max(0.045, d.breakEven + 0.005), 161);
  const kellyRows: Row[] = qs.map((qq) => ({ q: qq, fstar: kellyFraction(qq, b) }));
  const kellyCurve: ChartSpec = {
    id: "axes-kelly",
    title: "The growth-optimal fraction per name",
    subtitle: "f* = p − q/b. With b this small the q/b term is huge, so the fraction collapses long before the loss rate reaches break-even.",
    kind: "xy",
    data: table([f("q", "Loss rate per name", "pct2"), f("fstar", "Kelly fraction per name", "pct")], kellyRows),
    mark: "line",
    x: { field: "q", format: "pct1" },
    y: { field: "fstar", format: "pct", domain: [0, 1] },
    series: [{ field: "fstar", color: "c", label: "f* per name", emphasis: "strong" }],
    height: 280,
    annotations: [
      { kind: "point", x: q, y: fstar, text: `deck q ${pct2(q)}: f* ${pct(fstar)}`, color: "ink", at: "end" },
      { kind: "point", x: p.altLossRate, y: kellyFraction(p.altLossRate, b), text: `optimistic: ${pct(kellyFraction(p.altLossRate, b))}`, color: "ramp1", at: "end" },
      { kind: "vline", x: d.breakEven, text: "break-even: f* = 0", color: "loss", at: "end" },
    ],
  };

  // The hump, computed exactly for k names with f of the tranche each (k·f ≤ 1).
  const worse = Math.min(0.08, d.breakEven);
  const rates = [p.altLossRate, q, worse];
  const fMax = Math.min(0.6, 1 / k);
  const fs = linspace(0.005, fMax, 120);
  const humpRows: Row[] = fs.map((ff) => {
    const r: Row = { f: ff };
    rates.forEach((qq, i) => (r[`g${i}`] = seasonLogGrowth(Math.min(1, k * ff), k, qq, b, n, p.sharedOutcome)));
    return r;
  });
  const humpMin = Math.max(-0.3, Math.min(...humpRows.map((r) => Math.min(r.g0 as number, r.g1 as number, r.g2 as number))));
  const hump: ChartSpec = {
    id: "axes-hump",
    title: "Log growth per season against the fraction risked per name",
    subtitle: `${k} name${k === 1 ? "" : "s"} a night, ${n} nights, computed exactly for the whole night. The hump peaks at f*; about twice f* gives zero growth. The axis stops where ${k} names would exceed the tranche.`,
    kind: "xy",
    data: table([f("f", "Fraction of the tranche per name", "pct"), ...rates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1"))], humpRows),
    mark: "line",
    x: { field: "f", format: "pct", domain: [0, fMax] },
    y: { field: "g1", label: "Log growth per season", format: "pct", domain: [Math.floor(humpMin * 20) / 20, null], zero: false },
    series: [
      { field: "g0", color: "ramp1", label: `optimistic q = ${pct2(rates[0])}` },
      { field: "g1", color: "ramp2", label: `deck q = ${pct2(rates[1])}`, emphasis: "strong" },
      { field: "g2", color: "ramp3", label: `break-even q = ${pct2(rates[2])}` },
    ],
    height: 300,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      ...(fstar <= fMax ? [{ kind: "point" as const, x: fstar, y: seasonLogGrowth(Math.min(1, k * fstar), k, q, b, n, p.sharedOutcome), text: `f* ${pct(fstar)}`, color: "ink" as const, at: "end" as const }] : []),
      { kind: "vline", x: p.riskPerNight / k, text: `your per-name fraction ${pct(p.riskPerNight / k)}`, color: "c", at: "start" },
    ],
    stories: [
      { id: "zoom", label: "Zoom on the positive region", patch: { y: { domain: [-0.02, null] }, x: { domain: [0, Math.min(fMax, 0.35)] } } },
      { id: "opt", label: "What if the optimistic rate is true?", narrative: "The deck moves to the optimistic rate; f* roughly doubles.", params: { lossRate: p.altLossRate } },
    ],
  };

  const rowsDeck = breadthTable(q, b, n, 6);
  const rowsOpt = breadthTable(p.altLossRate, b, n, 6);
  const capDeck = rowsDeck.find((r) => r.capBinds)?.names;
  const capOpt = rowsOpt.find((r) => r.capBinds)?.names;
  const breadthChart: ChartSpec = {
    id: "axes-breadth",
    title: "Breadth: one more uncorrelated name is worth one more night",
    subtitle: `Log growth per season at the Kelly fraction per name, capped by capital once k·f* passes 100%. At the deck's rate the cap ${capDeck ? `binds from ${capDeck} names` : "does not bind up to six names"}; at the optimistic rate it ${capOpt ? `binds from ${capOpt}` : "does not bind"}.`,
    kind: "xy",
    data: table(
      [f("names", "Names per night", "int"), f("deck", `at the deck's q ${pct2(q)}`, "pct1"), f("opt", `at the optimistic q ${pct2(p.altLossRate)}`, "pct1"), f("optUncapped", "optimistic, uncapped", "pct1")],
      rowsDeck.map((r, i) => ({ names: `${r.names}`, deck: r.growthCapped, opt: rowsOpt[i].growthCapped, optUncapped: rowsOpt[i].growthUncapped })),
    ),
    mark: "bar",
    x: { field: "names", categorical: true },
    y: { field: "deck", label: "Log growth per season", format: "pct1" },
    series: [
      { field: "deck", color: "ramp2", label: `deck q ${pct2(q)}` },
      { field: "opt", color: "ramp1", label: `optimistic q ${pct2(p.altLossRate)}` },
    ],
    height: 260,
    stories: [{ id: "uncapped", label: "Show what the cap takes away", narrative: "Uncapped Kelly would risk more than the tranche.", patch: { extraSeries: [{ field: "optUncapped", color: "muted" }] } }],
  };

  const breadthTbl = tableSpec({
    id: "axes-table",
    title: "Names per night at the Kelly fraction, deck rate",
    data: table(
      [f("names", "Names per night", "int"), f("fractionPerName", "Fraction per name", "pct1"), f("totalAtRisk", "Total at risk", "pct"), f("growthCapped", "Log growth per season", "pct2"), f("cap", "Capital ceiling")],
      rowsDeck.map((r) => ({ names: r.names, fractionPerName: r.fractionPerName, totalAtRisk: r.totalAtRisk, growthCapped: r.growthCapped, cap: r.capBinds ? "binds" : "" })),
    ),
    columns: [{ field: "names", emphasize: true }, { field: "fractionPerName" }, { field: "totalAtRisk" }, { field: "growthCapped" }, { field: "cap", color: "loss" }],
    highlightRow: { field: "names", value: k },
  });

  return {
    id: "axes",
    number: 7,
    eyebrow: "Time and breadth",
    title: "Two axes, and the sizing rule that makes them one",
    question: `${n} all-in steps produce a coin; ${k * n} parallel ${k === 1 ? "bets" : `${k === 2 ? "halves" : k === 3 ? "thirds" : `${k}ths`}`} produce a hump. Why does nobody separate the two axes?`,
    lede: `Growth is a sum over steps of E[log(1 + Σ fᵢrᵢ)]. Time steps sit outside the log, so outcomes multiply; parallel bets sit inside it, so a single loss is divided by the number of bets before it hits capital. The distinction only exists while exposure is fixed per step: size every bet at its own fraction and the grid collapses to one number, independent bets per unit time.`,
    kpis: [
      { label: "Kelly fraction per name", value: pct(fstar), sub: "p − q/b at the deck's q", color: "c" },
      { label: "Growth per season, k names", value: signedPct1(rowsDeck[k - 1].growthCapped), sub: `${k} × ${pct(rowsDeck[k - 1].fractionPerName)} = ${pct(rowsDeck[k - 1].totalAtRisk)} at risk`, help: "At the Kelly fraction per name, capped so the names never exceed the tranche." },
      { label: "Growth per name-night", value: `${(gBet * 100).toFixed(3)}%`, sub: "the same beside or after another bet", help: "Each independent bet contributes this whether it sits next to another bet on the same night or on the next night." },
      { label: "Capital ceiling", value: capDeck ? `from ${capDeck} names` : "not binding", sub: capOpt ? `optimistic rate: from ${capOpt}` : "at either rate" },
    ],
    primary: [gridChart, pathChart],
    secondary: [kellyCurve, hump, breadthChart],
    tables: [breadthTbl],
    localParams: [],
    notes: [
      {
        title: "Where the axes still interact",
        body: "- Capital ceiling. When k·f* exceeds 100%, every name is pushed down to 1/k and the extra name adds less than its standalone growth.\n- Correlation within a night. Shared causes shrink the count of independent bets (section 6).\n\nSamuelson's “Fallacy of Large Numbers” (1963) is the classic statement of the time-side half: repeating a bet you would refuse once does not make it acceptable, because repetition stacks risk over time instead of spreading it. Grinold's fundamental law (1989) is the institutional version of the collapse: skill is edge per bet times the square root of independent bets per year, with cross-sectional and time-series bets counted as the same unit.",
      },
      {
        title: "Why full capital on a low-risk trade does not replace position size",
        body: "Moving strikes changes the probability of a loss. Position size changes how big a loss is relative to capital. The log does not trade these off one for one: losing all capital is log(0), so no probability short of zero compensates for it. Full capital is optimal only at a zero loss rate.",
      },
      {
        title: "Why the mainstream does not separate the axes",
        body: "Institutions size per bet by design. Volatility targeting and risk budgeting put every position in risk units, so the axes really are interchangeable for them; idle capital sits in T-bills and “downtime” is not a category. Most trading content is about positions held continuously, so there are no discrete steps to see. The fields with a discrete calendar do discuss it: betting syndicates sizing many games on the same Saturday, reinsurers managing accumulation, merger arbitrage recycling capital between deals. Retail options states the collapsed version as a slogan (“trade small, trade often”) without the cases where it fails: fixed exposure per step, correlation within a step, and the capital ceiling.",
      },
    ],
    sourceFigures: [
      { label: "f* at 2.94%", quoted: "13%", computed: pct1(kellyFraction(0.02945, b)) },
      { label: "Growth per season, 1 / 3 / 5 names", quoted: "0.6% / 1.9% / 3.1%", computed: `${pct1(rowsDeck[0].growthCapped)} / ${pct1(rowsDeck[2].growthCapped)} / ${pct1(rowsDeck[4].growthCapped)}` },
      { label: "Five names at 2.52%", quoted: "want 25% each, 125% total", computed: `${pct(kellyFraction(0.0252, b))} each, ${pct(5 * kellyFraction(0.0252, b))} total` },
    ],
  };
}
