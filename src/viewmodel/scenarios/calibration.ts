import { f, table, tableSpec, type Annotation, type ChartSpec, type Row } from "../../charts/spec";
import { eventsForTest, eventsToResolve, eventsUntilUpperBelow, observedRatePmf, wilsonInterval } from "../../model/calibration";
import type { Datasets, Params } from "../../model/params";
import { linspace, logspace } from "../../model/stats";
import { pct2, type Derived } from "../derived";
import type { KPI, ScenarioView } from "../types";

function years(events: number, perYear: number): string {
  const y = events / perYear;
  if (!Number.isFinite(y)) return "never";
  if (y < 1) return `${(y * 12).toFixed(0)} months`;
  if (y < 10) return `${y.toFixed(1)} years`;
  return `${y.toFixed(0)} years`;
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
  const nTest = eventsForTest(qBE, qOpt, 0.05, 0.8);
  const qbar = (qOpt + qBE) / 2;
  const rec = d.record;

  const gaps = linspace(0.001, 0.02, 120);
  const needRows: Row[] = gaps.map((g) => ({ gap: g, events: (z * z * qbar * (1 - qbar)) / (g * g) }));
  const need: ChartSpec = {
    id: "cal-events",
    title: "Events needed to tell two loss rates apart",
    subtitle: `At ${z}σ separation around a ${pct2(qbar)} base rate. The whole range from fair to a good season lives inside one percentage point.`,
    kind: "xy",
    data: table([f("gap", "Gap between the two rates", "pct2"), f("events", "Name-events needed", "int")], needRows),
    mark: "line",
    x: { field: "gap", format: "pct1", domain: [0, 0.02] },
    y: { field: "events", scale: "log", format: "int", domain: [10, 1_000_000] },
    series: [{ field: "events", color: "b", label: "Events needed" }],
    height: 320,
    annotations: [
      { kind: "hline", y: perYear, text: `one year of events (${perYear})`, color: "muted", at: "end" },
      { kind: "hline", y: perYear * 10, text: "ten years", color: "muted", at: "end" },
      { kind: "point", x: Math.abs(qBE - qOpt), y: nOptBE, text: `optimistic vs break-even: ${Math.round(nOptBE).toLocaleString()} events`, color: "ink", at: "end" },
      { kind: "point", x: Math.abs(qBE - qDeck), y: nDeckBE, text: `deck vs break-even: ${Math.round(nDeckBE).toLocaleString()}`, color: "ink", at: "end" },
    ],
    stories: [
      { id: "linear", label: "Linear event count", patch: { y: { scale: "linear", domain: [0, 20000] } } },
      { id: "strict", label: "Demand 3σ instead", narrative: "A stricter bar more than doubles the count.", params: { zSigma: 3 } },
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
      subtitle: `The observed loss rate after ${n.toLocaleString()} name-events, if the true rate is the optimistic one or the break-even one. Stems sit at the only values a count can take.`,
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
      stories: [{ id: "area", label: "Outline instead of stems", patch: { mark: "area" } }],
    };
  };
  const oneYear = pmfChart("cal-pmf-year", "After one year", perYear);
  const resolved = pmfChart("cal-pmf-resolved", "After enough events to resolve", Math.round(nOptBE));

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
  if (nStar != null) bandAnn.push({ kind: "point", x: nStar, y: qBE, text: `band clears break-even after ${nStar.toLocaleString()} events (${years(nStar, perYear)})`, color: "ink", at: "start" });
  if (rec) bandAnn.push({ kind: "point", x: rec.events, y: rec.rate, text: `your record: ${rec.events} events, ${pct2(rec.rate)}`, color: "ink", at: "end" });
  const band: ChartSpec = {
    id: "cal-band",
    title: "The confidence band around a record that averages the deck's rate",
    subtitle: `Wilson interval at ${z}σ. The band must exclude the break-even line before the record says anything about the edge.`,
    kind: "xy",
    data: table([f("n", "Name-events observed", "int"), f("lo", "Lower bound", "pct2"), f("hat", "Observed rate", "pct2"), f("hi", "Upper bound", "pct2")], bandRows),
    mark: "line",
    x: { field: "n", scale: "log", domain: [10, 20000] },
    y: { field: "hat", label: "Loss rate", format: "pct1", domain: [0.01, 0.06] },
    series: [
      { field: "hi", color: "ramp2", label: "Upper bound" },
      { field: "hat", color: "ink", label: "Observed rate", dash: true },
      { field: "lo", color: "ramp2", label: "Lower bound" },
    ],
    height: 280,
    annotations: bandAnn,
    stories: [{ id: "wide", label: "Show the whole band", patch: { y: { domain: [0, 0.15] } } }],
  };

  const tbl = tableSpec({
    id: "cal-table",
    title: "Four calibration questions and their price",
    data: table(
      [f("question", "Question"), f("q1", "Rate 1", "pct2"), f("q2", "Rate 2", "pct2"), f("events", "Events needed", "int"), f("years", "At your pace")],
      [
        { question: "Optimistic rate vs break-even", q1: qOpt, q2: qBE, events: nOptBE, years: years(nOptBE, perYear) },
        { question: "Same, as a one-sided 5% test with 80% power", q1: qOpt, q2: qBE, events: nTest, years: years(nTest, perYear) },
        { question: "Deck rate vs break-even", q1: qDeck, q2: qBE, events: nDeckBE, years: years(nDeckBE, perYear) },
        { question: "Optimistic rate vs deck rate", q1: qOpt, q2: qDeck, events: nOptDeck, years: years(nOptDeck, perYear) },
        { question: "A 60% win-rate system vs 50%", q1: 0.5, q2: 0.6, events: nFrequent, years: `${Math.round(nFrequent)} trades` },
      ],
    ),
    columns: [{ field: "question", emphasize: true }, { field: "q1" }, { field: "q2" }, { field: "events" }, { field: "years" }],
    caption: `Events needed = z² · q̄(1 − q̄) ÷ Δq², with q̄ the midpoint of the two rates. ${z}σ is a weak bar: it means each rate sits ${z} standard errors from the other, not 95% confidence. Pace: ${perYear} name-events a year.`,
  });

  const kpis: KPI[] = [
    { label: "Events to resolve the edge", value: Math.round(nOptBE).toLocaleString(), sub: `${pct2(qOpt)} vs ${pct2(qBE)} at ${z}σ`, help: "Name-events needed before the record separates the optimistic rate from break-even." },
    { label: "At your pace", value: years(nOptBE, perYear), sub: `${perYear} events a year`, color: "loss" },
    { label: "Deck rate vs break-even", value: years(nDeckBE, perYear), sub: `${Math.round(nDeckBE).toLocaleString()} events`, help: "The gap between the deck's rate and fair is smaller, so it takes even longer to confirm." },
    { label: "The frequent game", value: `${Math.round(nFrequent)} trades`, sub: "60% vs 50% win rate", color: "good", help: "A symmetric-payoff system with a 10-point edge resolves in a season." },
  ];
  if (rec) kpis.splice(1, 0, { label: "Your record", value: `${pct2(rec.rate)} over ${rec.events}`, sub: `band ${pct2(rec.interval[0])} to ${pct2(rec.interval[1])}`, color: "ink", help: rec.kind === "binary" ? "Full losses counted over the events you imported." : "Expected loss as a fraction of max loss, from the P&L you imported." });

  return {
    id: "calibration",
    number: 3,
    eyebrow: "Expensive probability",
    title: "Your edge lives in a number you cannot measure this decade",
    question: "A 60% day-trading system reveals itself in a few hundred trades. How long until this one does?",
    lede: `Both games are probability; the difference is where the edge sits. Here the entire range from fair to a good season lives in less than one percentage point of a rare-event frequency, and telling ${pct2(
      qOpt,
    )} from ${pct2(qBE)} at ${z}σ takes about ${Math.round(nOptBE).toLocaleString()} events. The estimate has to come from cross-sectional history, and then only as far as past reaction distributions still apply.`,
    kpis,
    primary: [need],
    secondary: [oneYear, resolved, band],
    tables: [tbl],
    localParams: ["altLossRate", "eventsPerYear", "zSigma"],
    notes: [
      {
        title: "Noise versus calibration",
        body: "The strategy is not more exposed to noise than a wick-counting system. It is more exposed to calibration: the number that sets the edge is a rare-event frequency, and rare events are expensive to count. The track record cannot resolve it, so the estimate must come from many names across many quarters, and from the assumption that those distributions still apply.",
      },
      {
        title: "How the count is made",
        body: `The observed frequency after n events has standard error √(q̄(1 − q̄)/n). Demanding the gap between two candidate rates to be z standard errors gives n = z² q̄(1 − q̄)/Δq². That is a loose bar. A proper one-sided test of “is it break-even?” at 5% with 80% power needs about ${Math.round(nTest).toLocaleString()} events. The Wilson band in the third chart is the same statement from the other side: how wide the uncertainty around an observed rate is after n events.`,
      },
      {
        title: "Your own record",
        body: "Import a trade log under Data in the top bar: one number per line, either 0/1 (1 = a full loss) or P&L per unit of max loss (+b for a clean win, −1 for a full loss). The record's effective rate and its band appear here, and the sizing section weights its robust curve by the record's posterior instead of the uniform band.",
      },
    ],
    sourceFigures: [
      { label: "Events to split 3.41% from 2.52% at 2σ, as quoted", quoted: "roughly 1,500", computed: Math.round(eventsToResolve(0.0252, 0.0341, 2)).toLocaleString() },
      { label: "Trades to split 60% from 50%", quoted: "a few hundred", computed: Math.round(nFrequent).toLocaleString() },
    ],
  };
}
