import { f, table, tableSpec, type Annotation, type ChartSpec, type Row, type Story } from "@kit/charts/spec";
import { eventsForTest, eventsToResolve, eventsUntilUpperBelow, observedRatePmf, wilsonInterval } from "@app/model/calibration";
import type { Datasets } from "@app/params/datasets";
import type { Params } from "@app/params/params";
import { summarize, type Distribution } from "@app/model/season";
import { linspace, logspace, normalQuantile } from "@kit/math/stats";
import { evMatchingStake, symmetricKelly, symmetricSeasonDistribution } from "@app/model/symmetric";
import { fig } from "./discussion";
import { fmtInt, pct, pct1, pct2, x2, years } from "@kit/charts/numbers";
import { movesDeck, near } from "@kit/charts/scenario";
import type { Derived } from "./derived";
import type { KPI, ScenarioView } from "./types";

/** Events for a two-sided 5% test with 80% power (the one-sided version is eventsForTest). */
function eventsTwoSided(q0: number, q1: number): number {
  const dlt = Math.abs(q0 - q1);
  const za = normalQuantile(0.975);
  const zb = normalQuantile(0.8);
  const num = za * Math.sqrt(q0 * (1 - q0)) + zb * Math.sqrt(q1 * (1 - q1));
  return (num * num) / (dlt * dlt);
}

export function buildCalibration(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const z = p.zSigma;
  const perYear = p.eventsPerYear;
  const qOpt = p.altLossRate;
  const qDeck = p.lossRate;
  const qBE = d.breakEven;
  const nOptBE = eventsToResolve(qOpt, qBE, z);
  const nDeckBE = eventsToResolve(qDeck, qBE, z);
  const nOptDeck = eventsToResolve(qOpt, qDeck, z);
  const nFrequent = eventsToResolve(0.5, 0.6, z);
  const nFrequentTest = eventsForTest(0.5, 0.6, 0.05, 0.8);
  const nTest = eventsForTest(qBE, qOpt, 0.05, 0.8);
  const qbar = (qOpt + qBE) / 2;
  const rec = d.record;

  const gaps = linspace(0.001, 0.02, 120);
  const needRows: Row[] = gaps.map((g) => ({ gap: g, events: (z * z * qbar * (1 - qbar)) / (g * g) }));
  const need: ChartSpec = {
    id: "cal-events",
    title: "Events needed to tell two loss rates apart",
    subtitle: `x gap between the two rates · y name-events needed (log) · ${z}σ separation around a ${pct2(qbar)} base rate`,
    kind: "xy",
    data: table([f("gap", "Gap between the two rates", "pct2"), f("events", "Name-events needed", "int")], needRows),
    mark: "line",
    x: { field: "gap", format: "pct1", domain: [0, 0.02] },
    y: { field: "events", scale: "log", format: "int", domain: [10, 1_000_000] },
    series: [{ field: "events", color: "ink", label: "Events needed" }],
    height: 320,
    annotations: [
      { kind: "hline", y: perYear, text: `one year of events (${perYear})`, color: "muted", at: "end" },
      { kind: "hline", y: perYear * 10, text: "ten years", color: "muted", at: "end" },
      { kind: "point", x: Math.abs(qBE - qOpt), y: nOptBE, text: `optimistic vs break-even: ${fmtInt(nOptBE)} events`, color: "ink", at: "end" },
      { kind: "point", x: Math.abs(qBE - qDeck), y: nDeckBE, text: `deck vs break-even: ${fmtInt(nDeckBE)}`, color: "ink", at: "end" },
    ],
    stories:
      z === 3
        ? []
        : [
            {
              id: "strict",
              label: "What if I demand 3σ?",
              narrative: `${fmtInt(eventsToResolve(qOpt, qBE, 3))} events instead of ${fmtInt(nOptBE)}: ${years(eventsToResolve(qOpt, qBE, 3), perYear)} at your pace.`,
              params: { zSigma: 3 },
              badge: movesDeck("separation", `${z}σ`, "3σ"),
            },
          ],
  };

  const pmfChart = (id: string, title: string, n: number): ChartSpec => {
    const a = observedRatePmf(qOpt, n);
    const bq = observedRatePmf(qBE, n);
    const rates = Array.from(new Set([...a.map((r) => r.rate), ...bq.map((r) => r.rate)])).sort((x, y) => x - y);
    const ma = new Map(a.map((r) => [r.rate, r.prob]));
    const mb = new Map(bq.map((r) => [r.rate, r.prob]));
    const rows: Row[] = rates.filter((r) => r <= 0.1).map((r) => ({ rate: r, opt: ma.get(r) ?? 0, be: mb.get(r) ?? 0 }));
    return {
      id,
      title,
      subtitle: `x observed loss rate after ${fmtInt(n)} name-events · y probability`,
      kind: "xy",
      data: table([f("rate", "Observed loss rate", "pct2"), f("opt", `true rate ${pct2(qOpt)}`, "pct2"), f("be", `true rate ${pct2(qBE)}`, "pct2")], rows),
      mark: "bar",
      x: { field: "rate", format: "pct1", domain: [0, 0.08] },
      y: { field: "opt", label: "Probability", format: "pct1" },
      series: [
        { field: "opt", color: "good", label: `true rate ${pct2(qOpt)} (optimistic)` },
        { field: "be", color: "loss", label: `true rate ${pct2(qBE)} (break-even)` },
      ],
      barWidthPx: n > 400 ? 2 : 4,
      height: 260,
      annotations: [{ kind: "vline", x: qDeck, text: `deck q ${pct2(qDeck)}`, color: "ink", at: "start" }],
    };
  };
  const oneYear = pmfChart("cal-pmf-year", "After one year", perYear);
  // When the two rates coincide no record resolves them; show a long record instead of an infinite one.
  const PMF_CAP = 20_000;
  const nResolved = Number.isFinite(nOptBE) ? Math.min(Math.round(nOptBE), PMF_CAP) : PMF_CAP;
  const resolved = pmfChart("cal-pmf-resolved", nResolved === Math.round(nOptBE) ? "After enough events to resolve" : `After ${fmtInt(nResolved)} events`, nResolved);

  const ns = logspace(10, 20000, 90);
  const bandRows: Row[] = ns.map((n) => {
    const [lo, hi] = wilsonInterval(qDeck, n, z);
    return { n, lo, hi, hat: qDeck };
  });
  const nStar = eventsUntilUpperBelow(qDeck, qBE, z);
  const bandAnn: Annotation[] = [
    { kind: "hline", y: qBE, text: `break-even ${pct2(qBE)}`, color: "loss", at: "start" },
    { kind: "hline", y: qOpt, text: `optimistic ${pct2(qOpt)}`, color: "good", at: "start" },
    { kind: "vline", x: perYear * 10, text: "ten years", color: "muted", at: "end" },
  ];
  if (nStar != null) bandAnn.push({ kind: "point", x: nStar, y: qBE, text: `band clears break-even after ${fmtInt(nStar)} events (${years(nStar, perYear)})`, color: "ink", at: "start" });
  if (rec) bandAnn.push({ kind: "point", x: rec.events, y: rec.rate, text: `your record: ${rec.events} events, ${pct2(rec.rate)}`, color: "ink", at: "end" });
  const band: ChartSpec = {
    id: "cal-band",
    title: "Confidence band as the record grows",
    subtitle: `x name-events observed (log) · y loss rate · band = Wilson interval at ${z}σ around an observed rate equal to the deck's`,
    kind: "xy",
    data: table([f("n", "Name-events observed", "int"), f("lo", "Lower bound", "pct2"), f("hat", "Observed rate", "pct2"), f("hi", "Upper bound", "pct2")], bandRows),
    mark: "line",
    x: { field: "n", scale: "log", domain: [10, 20000] },
    y: { field: "hat", label: "Loss rate", format: "pct1", domain: [0.01, 0.06] },
    series: [
      { field: "hi", color: "ramp2", label: "Upper bound", band: "lo" },
      { field: "hat", color: "ink", label: "Observed rate", dash: true },
      { field: "lo", color: "ramp2", label: "Lower bound" },
    ],
    height: 280,
    annotations: bandAnn,
  };

  const tbl = tableSpec({
    id: "cal-table",
    title: "Calibration questions and their price",
    data: table(
      [f("question", "Question"), f("q1", "Rate 1", "pct2"), f("q2", "Rate 2", "pct2"), f("events", "Events needed", "int"), f("years", "At your pace")],
      [
        { question: `Optimistic rate vs break-even, ${z}σ apart`, q1: qOpt, q2: qBE, events: nOptBE, years: years(nOptBE, perYear) },
        { question: "Same, as a one-sided 5% test with 80% power", q1: qOpt, q2: qBE, events: nTest, years: years(nTest, perYear) },
        { question: `Deck rate vs break-even, ${z}σ apart`, q1: qDeck, q2: qBE, events: nDeckBE, years: years(nDeckBE, perYear) },
        { question: `Optimistic rate vs deck rate, ${z}σ apart`, q1: qOpt, q2: qDeck, events: nOptDeck, years: years(nOptDeck, perYear) },
        { question: `A 60% win-rate system vs 50%, ${z}σ apart`, q1: 0.5, q2: 0.6, events: nFrequent, years: `${fmtInt(nFrequent)} trades` },
        { question: "Same, as a one-sided 5% test with 80% power", q1: 0.5, q2: 0.6, events: nFrequentTest, years: `${fmtInt(nFrequentTest)} trades` },
      ],
    ),
    columns: [{ field: "question", emphasize: true }, { field: "q1" }, { field: "q2" }, { field: "events" }, { field: "years" }],
    caption: `Events needed = z² · q̄(1 − q̄) ÷ Δq², with q̄ the midpoint of the two rates. ${z}σ is a weak bar: it means each rate sits ${z} standard errors from the other, not 95% confidence. Pace: ${perYear} name-events a year.`,
  });

  // The frequent-outcome system: a symmetric payoff at win rate p, one trade per event, the
  // same number of events as a season. Its season is a hump of many ends; the coin has two.
  const symP = p.symWinRate;
  const symS = p.symStake;
  const sym = symmetricSeasonDistribution(symP, symS, p.nights);
  const symSum = summarize(sym, p.thresholdBelow);
  const coinDist = d.season.coin.dist;
  const coinSum = d.season.coin.summary;
  const coin = d.byId.coin;
  const below1 = (dist: Distribution) => dist.outcomes.reduce((s, o) => (o.value < 1 - 1e-9 ? s + o.prob : s), 0);
  const symBelow = below1(sym);
  const coinBelow = below1(coinDist);
  const symHi = Math.ceil(Math.max(d.cleanEnd, symSum.max) * 1.05 * 20) / 20;
  const symGrid = Array.from(new Set([0, ...coinDist.outcomes.map((o) => o.value), ...sym.outcomes.map((o) => o.value), symHi].map((v) => Math.min(symHi, Math.round(v * 1e6) / 1e6)))).sort((a, b) => a - b);
  const cdfAt = (dist: Distribution, x: number) => Math.min(1, dist.outcomes.reduce((s, o) => (o.value <= x + 1e-9 ? s + o.prob : s), 0));
  const symRows: Row[] = symGrid.map((x) => ({ end: x, coin: cdfAt(coinDist, x), sym: cdfAt(sym, x) }));
  const symLabel = `Symmetric ${pct(symP)} system, ${pct1(symS)} a trade`;
  const symKelly = symmetricKelly(symP);
  const evStake = evMatchingStake(coinSum.mean, symP, p.nights);
  const nSym = eventsToResolve(0.5, symP, z);
  const symStories: Story[] = [];
  if (Math.abs(symP - 0.5) > 1e-9) {
    const fifty = symmetricSeasonDistribution(0.5, symS, p.nights);
    symStories.push({
      id: "fifty",
      label: `What if the ${pct(symP)} system is really 50%?`,
      narrative: `At a 50% win rate the hump sits around the start: median ${x2(summarize(fifty).median)}, P(below start) ${pct(below1(fifty))}. Telling ${pct(symP)} from 50% takes ${fmtInt(nSym)} trades at ${z}σ.`,
      params: { symWinRate: 0.5 },
      badge: movesDeck("win rate", pct(symP), "50%"),
    });
  }
  if (symKelly > 0 && symKelly <= 0.25 && Math.abs(symS - symKelly) > 1e-6) {
    const kd = symmetricSeasonDistribution(symP, symKelly, p.nights);
    symStories.push({
      id: "kelly",
      label: "I stake the Kelly fraction 2p − 1",
      narrative: `${pct(symKelly)} a trade: median ${x2(summarize(kd).median)}, P(below start) ${pct(below1(kd))}, 10th percentile ${x2(summarize(kd).p10)}; a far wider season for the same win rate.`,
      params: { symStake: Math.round(symKelly * 1e4) / 1e4 },
      badge: movesDeck("stake", pct1(symS), pct(symKelly)),
    });
  }
  const symChart: ChartSpec = {
    id: "cal-symmetric",
    title: `The ${pct(symP)} symmetric system's season next to the ${coin.name}'s`,
    subtitle: `x season end, units of the starting stake · y share of seasons ending at or below · ${p.nights} events each`,
    kind: "xy",
    data: table([f("end", "Season end", "x"), f("coin", coin.label, "pct1"), f("sym", symLabel, "pct1")], symRows),
    mark: "step",
    x: { field: "end", format: "x", domain: [0, symHi] },
    y: { field: "sym", label: "P(season ends at or below)", format: "pct", domain: [0, 1] },
    series: [
      { field: "coin", color: "a", label: coin.label },
      { field: "sym", color: "ink", label: symLabel, emphasis: "strong" },
    ],
    height: 300,
    annotations: [
      { kind: "vline", x: 1, text: "start", color: "muted", at: "start" },
      { kind: "hline", y: 0.5, text: "median line", color: "muted", at: "end" },
    ],
    stories: symStories,
  };
  const symTbl = tableSpec({
    id: "cal-symmetric-table",
    title: "Two games over the same number of events",
    data: table(
      [f("game", "Game"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("p10", "10th percentile", "x"), f("below", "P(below start)", "pct1"), f("ruin", "P(ruin)", "pct2"), f("ends", "Distinct season ends", "int"), f("events", `Events to tell it from fair, ${z}σ`, "int")],
      [
        { game: coin.label, mean: coinSum.mean, median: coinSum.median, p10: coinSum.p10, below: coinBelow, ruin: coinSum.pRuin, ends: coinDist.outcomes.length, events: nDeckBE },
        { game: symLabel, mean: symSum.mean, median: symSum.median, p10: symSum.p10, below: symBelow, ruin: symSum.pRuin, ends: sym.outcomes.length, events: nSym },
      ],
    ),
    columns: [{ field: "game", emphasize: true }, { field: "mean" }, { field: "median", emphasize: true }, { field: "p10" }, { field: "below", color: "loss" }, { field: "ruin", color: "loss" }, { field: "ends" }, { field: "events", emphasize: true }],
    caption: `Both over ${p.nights} events. The symmetric system's case rests on a frequent outcome, so its record resolves in ${fmtInt(nSym)} trades; the tranche's rests on a rare one. Its growth-optimal stake is 2p − 1 = ${pct(symKelly)}${evStake != null ? `; ${pct2(evStake)} a trade would give it the ${coin.name}'s mean season` : ""}.`,
  });

  const kpis: KPI[] = [
    { label: "Events to tell optimistic from break-even", value: fmtInt(nOptBE), sub: `${pct2(qOpt)} vs ${pct2(qBE)} at ${z}σ`, help: "Name-events needed before the record separates the optimistic rate from break-even." },
    { label: "At your pace", value: years(nOptBE, perYear), sub: `${perYear} events a year` },
    { label: "Deck rate vs break-even", value: years(nDeckBE, perYear), sub: `${fmtInt(nDeckBE)} events`, help: "The gap between the deck's rate and fair is smaller, so it takes even longer to confirm." },
    { label: "The frequent game", value: `${fmtInt(nFrequent)} trades`, sub: `60% vs 50% win rate at ${z}σ · ${fmtInt(nFrequentTest)} as a 5%/80% test`, help: "A symmetric-payoff system with a 10-point gap in win rate resolves within a season or two." },
  ];
  if (rec) kpis.splice(1, 0, { label: "Your record", value: `${pct2(rec.rate)} over ${rec.events}`, sub: `band ${pct2(rec.interval[0])} to ${pct2(rec.interval[1])}`, color: "ink", help: rec.kind === "binary" ? "Full losses counted over the events you imported." : "Expected loss as a fraction of max loss, from the P&L you imported." });
  const symKpi = kpis.length;
  kpis.push({
    label: `P(season below start), symmetric ${pct(symP)} system → ${coin.name}`,
    value: `${pct(symBelow)} → ${pct(coinBelow)}`,
    sub: `${p.nights} events · ${pct1(symS)} a trade · ${sym.outcomes.length} distinct ends → ${coinDist.outcomes.length}`,
    help: "The frequent-outcome system spreads its season over many small ends around the start; the coin has two. Its case rests on a frequent outcome, which is why a few hundred trades calibrate it and a decade cannot calibrate the tranche.",
  });

  const n1500 = eventsToResolve(0.0252, 0.0341, 2);

  return {
    id: "calibration",
    number: 3,
    title: "Calibration",
    claim: "The premium over fair sits in a rare-event rate that a decade of your own trading cannot resolve; the estimate has to come from cross-sectional history.",
    lede: "How long until my record can tell the deck's loss rate from break-even?",
    views: [
      { id: "events-needed", title: "How long until my record proves q", blurb: "How many name-events separate two loss rates, what that is in years, and the frequent-outcome system's season next to the coin's.", charts: ["cal-events", "cal-symmetric", "cal-table", "cal-symmetric-table"], params: ["altLossRate", "zSigma", "eventsPerYear", "symWinRate", "symStake"], kpis: [0, 1, 2, 3, symKpi] },
      { id: "sampling", title: "How wide the record's error bar is", blurb: "What an observed loss rate can look like under either true rate.", charts: ["cal-pmf-year", "cal-pmf-resolved"], params: ["eventsPerYear", "altLossRate"] },
      { id: "confidence-band", title: "Which rates my record cannot rule out", blurb: "How the uncertainty around an observed rate shrinks with the record.", charts: ["cal-band"], params: ["zSigma", "eventsPerYear"] },
    ],
    kpis,
    primary: [need],
    secondary: [oneYear, resolved, band, symChart],
    tables: [tbl, symTbl],
    localParams: ["altLossRate", "eventsPerYear", "zSigma", "symWinRate", "symStake"],
    notes: [
      {
        title: "Noise versus calibration",
        body: "The strategy is not more exposed to noise than a wick-counting system. It is more exposed to calibration: the number that sets the premium over fair is a rare-event frequency, and rare events are expensive to count. The track record cannot resolve it, so the estimate must come from many names across many quarters, and from the assumption that those distributions still apply.",
      },
      {
        title: "The frequent game",
        body: `A ${pct(symP)} win-rate system with a symmetric payoff has its case in a frequent outcome: its season is a hump of ${sym.outcomes.length} possible ends around the start, and ${fmtInt(nSym)} trades tell ${pct(symP)} from 50% at ${z}σ. The tranche's whole range from fair to about +19% a season lives in less than one percentage point of a rare-event frequency, and its season has two ends. Both games are probability; the tranche's is probability that is expensive to measure.`,
      },
      {
        title: "How the count is made",
        body: `The observed frequency after n events has standard error √(q̄(1 − q̄)/n). Demanding the gap between two candidate rates to be z standard errors gives n = z² q̄(1 − q̄)/Δq². That is a loose bar. A one-sided test of “is it break-even?” at 5% with 80% power needs about ${fmtInt(nTest)} events. The Wilson band in the third chart is the same statement from the other side: how wide the uncertainty around an observed rate is after n events.`,
      },
      {
        title: "Your own record",
        body: "Import a trade log under Data in the top bar: one number per line, either 0/1 (1 = a full loss) or P&L per unit of max loss (+b for a clean win, −1 for a full loss). The record's effective rate and its band appear here, and the sizing section weights its robust curve by the record's posterior instead of the uniform band.",
      },
    ],
    sourceFigures: [
      fig(p, "Events to tell 3.41% from 2.52% apart at two sigma", "roughly 1,500", fmtInt(n1500), near(1500, n1500, 100), []),
      fig(p, "At ~80 events a year", "cannot resolve this decade", years(n1500, 80), n1500 / 80 >= 10, []),
      fig(p, "Trades to tell a 60% win rate from 50%, 2σ apart", "a few hundred", fmtInt(eventsToResolve(0.5, 0.6, 2)), false, [], "2σ separation is a loose bar: each rate two standard errors from the other, not a test at a stated power."),
      fig(p, "Same, as a 5% test with 80% power", "a few hundred", `${fmtInt(eventsForTest(0.5, 0.6, 0.05, 0.8))} one-sided · ${fmtInt(eventsTwoSided(0.5, 0.6))} two-sided`, true, []),
      fig(p, "A 60% symmetric system's case sits in a frequent outcome", "a hump, not a coin", `${sym.outcomes.length} distinct season ends against the ${coin.name}'s ${coinDist.outcomes.length} · P(below start) ${pct(symBelow)}`, sym.outcomes.length > coinDist.outcomes.length, []),
    ],
  };
}
