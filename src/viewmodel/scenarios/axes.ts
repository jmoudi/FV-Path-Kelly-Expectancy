import { f, table, tableSpec, type ChartSpec, type Row } from "../../charts/spec";
import { breadthTable, kellyFraction, logGrowthPerBet, seasonLogGrowth } from "../../model/kelly";
import type { Datasets, Params } from "../../model/params";
import { sampleGrid } from "../../model/season";
import { linspace } from "../../model/stats";
import { fig, movesDeck, near, pct, pct1, pct2, signedPct, signedPct1, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildAxes(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const k = d.k;
  const q = p.lossRate;
  const b = p.gain;
  const n = p.nights;
  const fstar = d.kelly;
  const gBet = logGrowthPerBet(fstar, q, b);
  const yours = d.byId[d.yours];
  const alt = p.altLossRate;

  // The railroad grid: one sampled season of your policy, as a name × night grid plus the path beneath.
  const grid = sampleGrid(yours.policy, n, p.seed + 7);
  const gridRows: Row[] = [];
  grid.losses.forEach((row, t) => row.forEach((lost, i) => gridRows.push({ night: t + 1, name: `name ${i + 1}`, outcome: lost })));
  const gridChart: ChartSpec = {
    id: "axes-grid",
    title: "One season as a grid: names by nights",
    subtitle: `x night (outside the log) · y name on the night (inside the log) · one sampled season of ${yours.label} · red = full loss`,
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
    subtitle: `x night · y tranche, start = 1 · the same sampled season · one factor per night that contains all ${k} name${k === 1 ? "" : "s"}`,
    kind: "xy",
    data: table([f("night", "Night", "int"), f("tranche", "Tranche, start = 1", "x")], pathRows),
    mark: "step",
    x: { field: "night", domain: [0, n] },
    y: { field: "tranche", format: "x", zero: false },
    series: [{ field: "tranche", color: yours.color, label: yours.label, emphasis: "strong" }],
    height: 200,
    annotations: [{ kind: "hline", y: 1, text: "start", color: "muted", at: "start" }],
  };

  const qs = linspace(0.005, Math.max(0.045, d.breakEven + 0.005), 161);
  const kellyRows: Row[] = qs.map((qq) => ({ q: qq, fstar: kellyFraction(qq, b) }));
  const kellyCurve: ChartSpec = {
    id: "axes-kelly",
    title: "The growth-optimal fraction per name",
    subtitle: "x loss rate per name · y Kelly fraction per name, f* = p − q/b · black = deck · green = optimistic · red = break-even",
    kind: "xy",
    data: table([f("q", "Loss rate per name", "pct2"), f("fstar", "Kelly fraction per name", "pct")], kellyRows),
    mark: "line",
    x: { field: "q", format: "pct1" },
    y: { field: "fstar", format: "pct", domain: [0, 1] },
    series: [{ field: "fstar", color: "ink", label: "f* per name", emphasis: "strong" }],
    height: 280,
    annotations: [
      { kind: "point", x: q, y: fstar, text: `deck q ${pct2(q)}: f* ${pct(fstar)}`, color: "ink", at: "end" },
      { kind: "point", x: alt, y: kellyFraction(alt, b), text: `optimistic ${pct2(alt)}: f* ${pct(kellyFraction(alt, b))}`, color: "good", at: "end" },
      { kind: "vline", x: d.breakEven, text: "break-even: f* = 0", color: "loss", at: "end" },
    ],
  };

  // The hump, computed exactly for k names with f of the tranche each (k·f ≤ 1).
  const worse = Math.min(0.08, d.breakEven);
  const rates = [alt, q, worse];
  const fMax = Math.min(0.6, 1 / k);
  const fs = linspace(0.005, fMax, 120);
  const humpRows: Row[] = fs.map((ff) => {
    const r: Row = { f: ff };
    rates.forEach((qq, i) => (r[`g${i}`] = seasonLogGrowth(Math.min(1, k * ff), k, qq, b, n, p.sharedOutcome)));
    return r;
  });
  const humpMin = Math.max(-0.3, Math.min(...humpRows.map((r) => Math.min(r.g0 as number, r.g1 as number, r.g2 as number))));
  const fOpt = kellyFraction(alt, b);
  const gOpt = seasonLogGrowth(Math.min(1, k * Math.min(fOpt, fMax)), k, alt, b, n, p.sharedOutcome);
  const hump: ChartSpec = {
    id: "axes-hump",
    title: "Log growth per season against the fraction risked per name",
    subtitle: `x fraction of the tranche per name · y log growth per season of surviving paths · ${k} name${k === 1 ? "" : "s"} a night, ${n} nights · green = optimistic q · black = deck q · red = break-even q · violet line = your per-name fraction · axis ends where ${k} names fill the tranche`,
    kind: "xy",
    data: table([f("f", "Fraction of the tranche per name", "pct"), ...rates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1"))], humpRows),
    mark: "line",
    x: { field: "f", format: "pct", domain: [0, fMax] },
    y: { field: "g1", label: "Log growth per season", format: "pct", domain: [Math.floor(humpMin * 20) / 20, null], zero: false },
    series: [
      { field: "g0", color: "good", label: `optimistic q = ${pct2(rates[0])}` },
      { field: "g1", color: "ink", label: `deck q = ${pct2(rates[1])}`, emphasis: "strong" },
      { field: "g2", color: "loss", label: `break-even q = ${pct2(rates[2])}` },
    ],
    height: 300,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      ...(fstar <= fMax && fstar > 0 ? [{ kind: "point" as const, x: fstar, y: seasonLogGrowth(Math.min(1, k * fstar), k, q, b, n, p.sharedOutcome), text: `f* ${pct(fstar)}`, color: "ink" as const, at: "end" as const }] : []),
      { kind: "vline", x: p.riskPerNight / k, text: `your per-name fraction ${pct(p.riskPerNight / k)}`, color: "c", at: "start" },
    ],
    stories:
      Math.abs(alt - q) < 5e-5
        ? []
        : [
            {
              id: "opt",
              label: "What if the optimistic rate is true?",
              narrative: `f* ${pct(fOpt)} instead of ${pct(fstar)}; the hump peaks at ${signedPct1(gOpt)} a season.`,
              params: { lossRate: alt },
              badge: movesDeck("q", pct2(q), pct2(alt)),
            },
          ],
  };

  const rowsDeck = breadthTable(q, b, n, 6);
  const rowsOpt = breadthTable(alt, b, n, 6);
  const capDeck = rowsDeck.find((r) => r.capBinds)?.names;
  const capOpt = rowsOpt.find((r) => r.capBinds)?.names;
  const fifthShare = logGrowthPerBet(0.2, alt, b) / logGrowthPerBet(kellyFraction(alt, b), alt, b);
  const breadthChart: ChartSpec = {
    id: "axes-breadth",
    title: "Growth per season by names per night",
    subtitle: `x names a night · y log growth per season at the Kelly fraction per name, capped once k·f* passes 100% · black = deck q · green = optimistic q · the cap ${capDeck ? `binds from ${capDeck} names at the deck's rate` : "does not bind at the deck's rate"}${capOpt ? ` and from ${capOpt} at the optimistic rate` : ""}`,
    kind: "xy",
    data: table(
      [f("names", "Names per night", "int"), f("deck", `at the deck's q ${pct2(q)}`, "pct1"), f("opt", `at the optimistic q ${pct2(alt)}`, "pct1"), f("optUncapped", "optimistic, uncapped", "pct1")],
      rowsDeck.map((r, i) => ({ names: `${r.names}`, deck: r.growthCapped, opt: rowsOpt[i].growthCapped, optUncapped: rowsOpt[i].growthUncapped })),
    ),
    mark: "bar",
    x: { field: "names", categorical: true },
    y: { field: "deck", label: "Log growth per season", format: "pct1" },
    series: [
      { field: "deck", color: "ink", label: `deck q ${pct2(q)}` },
      { field: "opt", color: "good", label: `optimistic q ${pct2(alt)}` },
    ],
    height: 260,
    stories: [
      {
        id: "uncapped",
        label: "What does the capital ceiling cost?",
        narrative: `At ${pct2(alt)} five names want ${pct(5 * kellyFraction(alt, b))} of the tranche in total; capped at ${pct(0.2)} each, the fifth name adds ${pct(fifthShare)} of its standalone growth.`,
        patch: { extraSeries: [{ field: "optUncapped", color: "muted" }] },
      },
    ],
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

  const f252 = kellyFraction(0.0252, b);
  const f294 = kellyFraction(0.02945, b);
  const f320 = kellyFraction(0.032, b);

  return {
    id: "axes",
    number: 7,
    title: "Time and breadth",
    claim: "Time steps sit outside the log and parallel bets inside it; sizing every bet at its own fraction collapses both axes into one number, independent bets per unit time.",
    lede: "Is a name added to tonight worth the same as a name added next night, and how much should each one risk?",
    views: [
      { id: "grid-and-path", title: "Time and breadth as two axes", blurb: "One sampled season drawn as names by nights, with the tranche it produces.", charts: ["axes-grid", "axes-path"] },
      { id: "kelly-breadth", title: "How much to risk per name", blurb: "The growth-optimal fraction, the growth hump, and growth per season by names per night.", charts: ["axes-kelly", "axes-hump", "axes-breadth", "axes-table"], kpis: [0, 1, 2, 3] },
    ],
    kpis: [
      { label: "Kelly fraction per name", value: pct(fstar), sub: "p − q/b at the deck's q" },
      { label: `Log growth per season at Kelly, ${k} name${k === 1 ? "" : "s"}`, value: signedPct1(rowsDeck[k - 1].growthCapped), sub: `${k} × ${pct(rowsDeck[k - 1].fractionPerName)} = ${pct(rowsDeck[k - 1].totalAtRisk)} at risk`, help: "At the Kelly fraction per name, capped so the names never exceed the tranche." },
      { label: "Growth per name-night", value: signedPct(gBet, 3), sub: "the same beside or after another bet", help: "Each independent bet contributes this whether it sits next to another bet on the same night or on the next night." },
      { label: "Capital ceiling", value: capDeck ? `from ${capDeck} names` : "not binding", sub: capOpt ? `optimistic rate: from ${capOpt}` : "at either rate" },
    ],
    primary: [gridChart, pathChart],
    secondary: [kellyCurve, hump, breadthChart],
    tables: [breadthTbl],
    localParams: [],
    notes: [
      {
        title: "Where the axes still interact",
        body: "- Capital ceiling. When k·f* exceeds 100%, every name is pushed down to 1/k and the extra name adds less than its standalone growth.\n- Correlation within a night. Shared causes shrink the count of independent bets (section 06).\n\nSamuelson's “Fallacy of Large Numbers” (1963) is the classic statement of the time-side half: repeating a bet you would refuse once does not make it acceptable, because repetition stacks risk over time instead of spreading it. Grinold's fundamental law (1989) is the institutional version of the collapse: skill per bet times the square root of independent bets per year, with cross-sectional and time-series bets counted as the same unit.",
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
      fig(p, "f* at 2.52% / 2.94% / 3.2%", "25% / 13% / 5%", `${pct(f252)} / ${pct(f294)} / ${pct(f320)}`, near(0.25, f252, 0.006) && near(0.13, f294, 0.006) && near(0.05, f320, 0.006), ["b"]),
      fig(p, "Log growth per season at f*, 1 / 3 / 5 names", "0.6% / 1.9% / 3.1%", `${pct1(rowsDeck[0].growthCapped)} / ${pct1(rowsDeck[2].growthCapped)} / ${pct1(rowsDeck[4].growthCapped)}`, near(0.006, rowsDeck[0].growthCapped, 0.0006) && near(0.019, rowsDeck[2].growthCapped, 0.0006) && near(0.031, rowsDeck[4].growthCapped, 0.0006), ["q", "b", "n"]),
      fig(p, "Five names at 2.52%", "want 25% each, 125% total", `${pct(f252)} each, ${pct(5 * f252)} total`, near(0.25, f252, 0.006), ["b"]),
      fig(p, "The fifth name, capped at 20% each", "adds 94% of its standalone growth", `${pct(fifthShare)} (growth at 20% against growth at f*)`, near(0.94, fifthShare, 0.015), ["b", "alt"]),
    ],
  };
}
