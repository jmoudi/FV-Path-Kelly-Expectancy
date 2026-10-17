import { f, table, type ChartSpec, type Row } from "../../charts/spec";
import { breadthTable, kellyFraction, logGrowthPerBet } from "../../model/kelly";
import type { Params } from "../../model/params";
import { sampleGrid } from "../../model/season";
import { linspace } from "../../model/stats";
import { pct, pct1, pct2, signedPct1, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildAxes(p: Params, d: Derived): ScenarioView {
  const k = Math.max(1, Math.round(p.names));
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
  };
  const pathRows: Row[] = grid.path.map((v, t) => ({ night: t, tranche: v }));
  const pathChart: ChartSpec = {
    id: "axes-path",
    title: "The tranche under that same grid",
    subtitle: `Each night multiplies the tranche once, by one factor that already contains all ${k} names.`,
    kind: "xy",
    data: table([f("night", "Night", "int"), f("tranche", "Tranche, start = 1", "x")], pathRows),
    mark: "step",
    x: { field: "night", domain: [0, n] },
    y: { field: "tranche", format: "x" },
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
      { kind: "point", x: p.altLossRate, y: kellyFraction(p.altLossRate, b), text: `optimistic: ${pct(kellyFraction(p.altLossRate, b))}`, color: "good", at: "end" },
      { kind: "vline", x: d.breakEven, text: "break-even: f* = 0", color: "loss", at: "end" },
    ],
  };

  const worse = Math.min(0.08, q + (q - p.altLossRate));
  const rates = [p.altLossRate, q, worse];
  const fs = linspace(0.005, 0.6, 120);
  const humpRows: Row[] = fs.map((ff) => {
    const r: Row = { f: ff };
    rates.forEach((qq, i) => (r[`g${i}`] = k * n * logGrowthPerBet(ff, qq, b)));
    return r;
  });
  const hump: ChartSpec = {
    id: "axes-hump",
    title: "Log growth per season against the fraction risked per name",
    subtitle: `${k} names a night, ${n} nights. The hump peaks at f*; twice f* is roughly zero growth. The curve for the rate you cannot rule out decides the row you sit in.`,
    kind: "xy",
    data: table([f("f", "Fraction of the tranche per name", "pct"), ...rates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1"))], humpRows),
    mark: "line",
    x: { field: "f", format: "pct", domain: [0, 0.6] },
    y: { field: "g1", label: "Log growth per season", format: "pct", domain: [-0.15, null] },
    series: [
      { field: "g0", color: "ramp1", label: `optimistic q = ${pct2(rates[0])}` },
      { field: "g1", color: "ramp2", label: `deck q = ${pct2(rates[1])}`, emphasis: "strong" },
      { field: "g2", color: "ramp3", label: `worse q = ${pct2(rates[2])}` },
    ],
    height: 300,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      { kind: "point", x: fstar, y: k * n * gBet, text: `f* ${pct(fstar)}`, color: "ink", at: "end" },
      { kind: "vline", x: p.riskPerNight / k, text: `your per-name fraction ${pct(p.riskPerNight / k)}`, color: "c", at: "start" },
    ],
    stories: [{ id: "zoom", label: "Zoom on the positive region", patch: { y: { domain: [-0.02, null] }, x: { domain: [0, 0.35] } } }],
  };

  const rows = breadthTable(q, b, n, 6);
  const breadthChart: ChartSpec = {
    id: "axes-breadth",
    title: "Breadth: one more uncorrelated name is worth one more night",
    subtitle: "Log growth per season at the Kelly fraction per name. The capital ceiling flattens the bars once k·f* passes 100%.",
    kind: "xy",
    data: table([f("names", "Names per night", "int"), f("growthCapped", "Capped by capital", "pct1"), f("growthUncapped", "Uncapped Kelly", "pct1")], rows.map((r) => ({ names: `${r.names}`, growthCapped: r.growthCapped, growthUncapped: r.growthUncapped }))),
    mark: "bar",
    x: { field: "names", categorical: true },
    y: { field: "growthCapped", label: "Log growth per season", format: "pct1" },
    series: [
      { field: "growthCapped", color: "c", label: "Capped by capital" },
      { field: "growthUncapped", color: "muted", label: "Uncapped Kelly", emphasis: "muted" },
    ],
    height: 260,
    stories: [{ id: "opt", label: "At the optimistic rate the cap binds sooner", patch: {} }],
  };

  const breadthTbl: ChartSpec = {
    id: "axes-table",
    title: "Names per night at the Kelly fraction",
    kind: "table",
    data: table(
      [f("names", "Names per night", "int"), f("fractionPerName", "Fraction per name", "pct1"), f("totalAtRisk", "Total at risk", "pct"), f("growthCapped", "Log growth per season", "pct2"), f("cap", "Capital ceiling")],
      rows.map((r) => ({ names: r.names, fractionPerName: r.fractionPerName, totalAtRisk: r.totalAtRisk, growthCapped: r.growthCapped, cap: r.capBinds ? "binds" : "" })),
    ),
    mark: "line",
    x: { field: "names" },
    y: { field: "growthCapped" },
    series: [],
    columns: [{ field: "names", emphasize: true }, { field: "fractionPerName" }, { field: "totalAtRisk" }, { field: "growthCapped" }, { field: "cap", color: "loss" }],
    highlightRow: { field: "names", value: k },
  };

  return {
    id: "axes",
    number: 7,
    eyebrow: "Time and breadth",
    title: "Two axes, and the sizing rule that makes them one",
    question: "Twenty all-in steps produce a coin; sixty parallel thirds produce a hump. Why does nobody separate the two axes?",
    lede: `Growth is a sum over steps of E[log(1 + Σ fᵢrᵢ)]. Time steps sit outside the log: each adds a term and outcomes multiply. Parallel bets sit inside it: their outcomes add up before the log is taken, so a single loss is divided by the number of bets before it hits capital. The distinction only exists while exposure is fixed per step. Size every bet at its own fraction and the grid collapses to one number: independent bets per unit time.`,
    kpis: [
      { label: "Kelly fraction per name", value: pct(fstar), sub: "p − q/b at the deck's q", color: "c" },
      { label: "Total at risk, k names", value: pct(Math.min(1, k * fstar)), sub: k * fstar > 1 ? "capital ceiling binds" : `${k} × f*` },
      { label: "Growth per season, k names", value: signedPct1(rows[k - 1].growthCapped), sub: "at the Kelly fraction" },
      { label: "Growth per name-night", value: `${(gBet * 100).toFixed(3)}%`, sub: "the same beside or after another bet", help: "Each independent bet contributes this whether it sits next to another bet on the same night or on the next night." },
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
      { label: "Growth per season, 1 / 3 / 5 names", quoted: "0.6% / 1.9% / 3.1%", computed: `${pct1(rows[0].growthCapped)} / ${pct1(rows[2].growthCapped)} / ${pct1(rows[4].growthCapped)}` },
      { label: "Five names at 2.52%", quoted: "want 25% each, 125% total", computed: `${pct(kellyFraction(0.0252, b))} each, ${pct(5 * kellyFraction(0.0252, b))} total` },
    ],
  };
}
