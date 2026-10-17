import { f, table, type ChartSpec, type Row } from "../../charts/spec";
import { eventsToResolve, observedRatePmf, wilsonInterval } from "../../model/calibration";
import type { Params } from "../../model/params";
import { linspace, logspace } from "../../model/stats";
import { pct2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

function years(events: number, perYear: number): string {
  const y = events / perYear;
  if (!Number.isFinite(y)) return "never";
  if (y < 1) return `${(y * 12).toFixed(0)} months`;
  if (y < 10) return `${y.toFixed(1)} years`;
  return `${y.toFixed(0)} years`;
}

export function buildCalibration(p: Params, d: Derived): ScenarioView {
  const z = p.zSigma;
  const perYear = p.eventsPerYear;
  const qOpt = p.altLossRate;
  const qDeck = p.lossRate;
  const qBE = d.breakEven;
  const nOptBE = eventsToResolve(qOpt, qBE, z);
  const nDeckBE = eventsToResolve(qDeck, qBE, z);
  const nOptDeck = eventsToResolve(qOpt, qDeck, z);
  const nFrequent = eventsToResolve(0.5, 0.6, z);
  const qbar = (qOpt + qBE) / 2;

  const gaps = linspace(0.001, 0.02, 120);
  const needRows: Row[] = gaps.map((g) => ({ gap: g, events: (z * z * qbar * (1 - qbar)) / (g * g) }));
  const need: ChartSpec = {
    id: "cal-events",
    title: "Events needed to tell two loss rates apart",
    subtitle: `At ${z}σ separation, around a ${pct2(qbar)} base rate. The whole range from fair to a good season lives inside one percentage point.`,
    kind: "xy",
    data: table([f("gap", "Gap between the two rates", "pct2"), f("events", "Name-events needed", "int")], needRows),
    mark: "line",
    x: { field: "gap", format: "pct1" },
    y: { field: "events", scale: "log", format: "int", domain: [10, 1_000_000] },
    series: [{ field: "events", color: "b", label: "Events needed" }],
    height: 320,
    annotations: [
      { kind: "hline", y: perYear, text: `one year of events (${perYear})`, color: "muted", at: "end" },
      { kind: "hline", y: perYear * 10, text: "ten years", color: "muted", at: "end" },
      { kind: "point", x: Math.abs(qBE - qOpt), y: nOptBE, text: `optimistic vs break-even: ${Math.round(nOptBE).toLocaleString()} events`, color: "ink", at: "end" },
      { kind: "point", x: Math.abs(qBE - qDeck), y: nDeckBE, text: `deck vs break-even: ${Math.round(nDeckBE).toLocaleString()}`, color: "a", at: "end" },
    ],
    stories: [{ id: "linear", label: "Linear event count", patch: { y: { scale: "linear" } } }],
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
      subtitle: `What the observed loss rate looks like after ${n.toLocaleString()} name-events, if the true rate is the optimistic one or the break-even one.`,
      kind: "xy",
      data: table([f("rate", "Observed loss rate", "pct2"), f("opt", `true rate ${pct2(qOpt)}`, "pct2"), f("be", `true rate ${pct2(qBE)}`, "pct2")], rows),
      mark: "area",
      x: { field: "rate", format: "pct1", domain: [0, 0.08] },
      y: { field: "opt", label: "Probability", format: "pct1" },
      series: [
        { field: "opt", color: "good", label: `true rate ${pct2(qOpt)} (optimistic)` },
        { field: "be", color: "loss", label: `true rate ${pct2(qBE)} (break-even)` },
      ],
      height: 260,
      annotations: [{ kind: "vline", x: qDeck, text: `deck q ${pct2(qDeck)}`, color: "a", at: "start" }],
    };
  };
  const oneYear = pmfChart("cal-pmf-year", "After one year", perYear);
  const resolved = pmfChart("cal-pmf-resolved", "After enough events to resolve", Math.round(nOptBE));

  const ns = logspace(10, 20000, 90);
  const bandRows: Row[] = ns.map((n) => {
    const [lo, hi] = wilsonInterval(qDeck, n, z);
    return { n, lo, hi, hat: qDeck };
  });
  const band: ChartSpec = {
    id: "cal-band",
    title: "The confidence band around a record that averages the deck's rate",
    subtitle: `Wilson interval at ${z}σ. The band must exclude the break-even line before the record says anything about the edge.`,
    kind: "xy",
    data: table([f("n", "Name-events observed", "int"), f("lo", "Lower bound", "pct2"), f("hat", "Observed rate", "pct2"), f("hi", "Upper bound", "pct2")], bandRows),
    mark: "line",
    x: { field: "n", scale: "log" },
    y: { field: "hat", label: "Loss rate", format: "pct1", domain: [0, 0.1] },
    series: [
      { field: "hi", color: "ramp2", label: "Upper bound" },
      { field: "hat", color: "a", label: "Observed rate", dash: true },
      { field: "lo", color: "ramp2", label: "Lower bound" },
    ],
    height: 260,
    annotations: [
      { kind: "hline", y: qBE, text: `break-even ${pct2(qBE)}`, color: "loss", at: "start" },
      { kind: "hline", y: qOpt, text: `optimistic ${pct2(qOpt)}`, color: "good", at: "end" },
      { kind: "vline", x: perYear * 10, text: "ten years", color: "muted", at: "end" },
    ],
  };

  const tbl: ChartSpec = {
    id: "cal-table",
    title: "Four calibration questions and their price",
    kind: "table",
    data: table(
      [f("question", "Question"), f("q1", "Rate 1", "pct2"), f("q2", "Rate 2", "pct2"), f("events", "Events needed", "int"), f("years", "At your pace")],
      [
        { question: "Optimistic rate vs break-even", q1: qOpt, q2: qBE, events: nOptBE, years: years(nOptBE, perYear) },
        { question: "Deck rate vs break-even", q1: qDeck, q2: qBE, events: nDeckBE, years: years(nDeckBE, perYear) },
        { question: "Optimistic rate vs deck rate", q1: qOpt, q2: qDeck, events: nOptDeck, years: years(nOptDeck, perYear) },
        { question: "A 60% win-rate system vs 50%", q1: 0.5, q2: 0.6, events: nFrequent, years: `${Math.round(nFrequent)} trades` },
      ],
    ),
    mark: "line",
    x: { field: "question" },
    y: { field: "events" },
    series: [],
    columns: [{ field: "question", emphasize: true }, { field: "q1" }, { field: "q2" }, { field: "events" }, { field: "years" }],
    caption: `Events needed = z² · q̄(1 − q̄) ÷ Δq², with q̄ the midpoint of the two rates. Pace: ${perYear} name-events a year.`,
  };

  return {
    id: "calibration",
    number: 3,
    eyebrow: "Expensive probability",
    title: "Your edge lives in a number you cannot measure this decade",
    question: "A 60% day-trading system reveals itself in a few hundred trades. How long until this one does?",
    lede: `Both games are probability. The difference is where the edge sits. A frequent-outcome system has its edge in something a few hundred trades can resolve. Here the entire range from fair to a good season lives in less than one percentage point of a rare-event frequency, and telling ${pct2(
      qOpt,
    )} from ${pct2(qBE)} at ${z}σ takes about ${Math.round(nOptBE).toLocaleString()} events. The estimate has to come from cross-sectional history, and then it is only as good as the assumption that past reaction distributions still apply.`,
    kpis: [
      { label: "Events to resolve the edge", value: Math.round(nOptBE).toLocaleString(), sub: `${pct2(qOpt)} vs ${pct2(qBE)} at ${z}σ`, help: "Name-events needed before the record separates the optimistic rate from break-even." },
      { label: "At your pace", value: years(nOptBE, perYear), sub: `${perYear} events a year`, color: "loss" },
      { label: "Deck rate vs break-even", value: years(nDeckBE, perYear), sub: `${Math.round(nDeckBE).toLocaleString()} events`, help: "The gap between the deck's rate and fair is smaller, so it takes even longer to confirm." },
      { label: "The frequent game", value: `${Math.round(nFrequent)} trades`, sub: "60% vs 50% win rate", color: "good", help: "A symmetric-payoff system with a 10-point edge resolves in a season." },
    ],
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
        body: "The observed frequency after n events has standard error √(q̄(1 − q̄)/n). Demanding the gap between two candidate rates to be z standard errors gives n = z² q̄(1 − q̄)/Δq². The Wilson band in the third chart is the same statement from the other side: how wide the uncertainty around an observed rate is after n events.",
      },
    ],
    sourceFigures: [
      { label: "Events to split 3.41% from 2.52% at 2σ", quoted: "roughly 1,500", computed: Math.round(eventsToResolve(0.0252, 0.0341, 2)).toLocaleString() },
      { label: "Trades to split 60% from 50%", quoted: "a few hundred", computed: Math.round(nFrequent).toLocaleString() },
    ],
  };
}
