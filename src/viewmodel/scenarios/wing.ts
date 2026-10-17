import { f, table, type ChartSpec, type Row } from "../../charts/spec";
import { pCleanFromLossRate } from "../../model/binary";
import type { Params } from "../../model/params";
import { linspace } from "../../model/stats";
import { movePdf, payoutFraction, wingRates, type WingParams } from "../../model/wing";
import { pct, pct1, pct2, smallPct, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildWing(p: Params, _d: Derived): ScenarioView {
  const wp: WingParams = {
    strikeDistance: p.strikeDistance,
    wingWidth: p.wingWidth,
    creditFraction: p.creditFraction,
    moveDist: p.moveDist,
    tailDf: p.tailDf,
    realizedRatio: p.realizedRatio,
  };
  const r = wingRates(wp);
  const dist = p.moveDist === "normal" ? "Normal" : `Student-t (${p.tailDf} d.f.)`;
  const dEnd = p.strikeDistance + p.wingWidth;

  const xs = linspace(-4, Math.max(5, dEnd + 1.5), 361);
  const densRows: Row[] = xs.map((x) => ({ x, density: movePdf(x, wp), payout: payoutFraction(x, wp) }));
  const density: ChartSpec = {
    id: "wing-density",
    title: "The realized move against the short wing",
    subtitle: `${dist} move in priced sigmas, realized at ${p.realizedRatio.toFixed(2)}× the priced sigma. Short strike at ${p.strikeDistance.toFixed(2)}σ, long strike at ${dEnd.toFixed(2)}σ.`,
    kind: "xy",
    data: table([f("x", "Move, priced sigmas", "x2"), f("density", "Density", "num"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "area",
    x: { field: "x", format: "x2" },
    y: { field: "density", label: "Density" },
    series: [{ field: "density", color: "b", label: "Realized move" }],
    height: 280,
    annotations: [
      { kind: "xband", x: p.strikeDistance, x2: dEnd, text: "wing: partial loss inside, full loss beyond", color: "loss" },
      { kind: "vline", x: p.strikeDistance, text: "short strike", color: "loss", at: "start" },
      { kind: "vline", x: dEnd, text: "long strike", color: "loss", at: "start" },
    ],
    stories: [
      { id: "logy", label: "Log density to see the tail", patch: { y: { scale: "log", domain: [1e-6, 1] } } },
      { id: "payout", label: "Overlay the payout ramp (same axis, 0 to 1)", patch: { extraSeries: [{ field: "payout", color: "loss" }] } },
    ],
  };

  const payout: ChartSpec = {
    id: "wing-payout",
    title: "What the wing pays out",
    subtitle: "Payout as a fraction of the width. Above the credit line the event loses money; at 100% it is the full loss the binary model assumes every bad event to be.",
    kind: "xy",
    data: table([f("x", "Move, priced sigmas", "x2"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "line",
    x: { field: "x", format: "x2" },
    y: { field: "payout", format: "pct", domain: [0, 1] },
    series: [{ field: "payout", color: "loss", label: "Payout" }],
    height: 220,
    annotations: [{ kind: "hline", y: p.creditFraction, text: `credit ${pct1(p.creditFraction)} of width`, color: "good", at: "start" }],
  };

  const ds = linspace(1, 3.5, 51);
  const sweepRows: Row[] = ds.map((dd) => {
    const rr = wingRates({ ...wp, strikeDistance: dd });
    return { d: dd, breach: rr.breach, effective: rr.effective, fullGap: rr.fullGap };
  });
  const sweep: ChartSpec = {
    id: "wing-sweep",
    title: "Three candidate rates against the short-strike distance",
    subtitle: "The breach rate overstates, the full-gap rate understates, and the effective rate reproduces the event's expectation.",
    kind: "xy",
    data: table([f("d", "Short strike distance, priced sigmas", "x2"), f("breach", "Breach rate", "pct2"), f("effective", "Effective rate", "pct2"), f("fullGap", "Full-gap rate", "pct2")], sweepRows),
    mark: "line",
    x: { field: "d", format: "x2" },
    y: { field: "effective", label: "Rate per event", scale: "log", format: "pct1" },
    series: [
      { field: "breach", color: "ramp1", label: "Breach: P(move > short strike)" },
      { field: "effective", color: "b", label: "Effective: E[payout] ÷ width", emphasis: "strong" },
      { field: "fullGap", color: "ramp3", label: "Full gap: P(move > long strike)" },
    ],
    height: 280,
    annotations: [
      { kind: "vline", x: p.strikeDistance, text: `your short strike ${p.strikeDistance.toFixed(2)}σ`, color: "ink", at: "start" },
      { kind: "hline", y: p.lossRate, text: `deck q ${pct2(p.lossRate)}`, color: "a", at: "end" },
    ],
    stories: [{ id: "linear", label: "Linear rate axis", patch: { y: { scale: "linear" } } }],
  };

  const bars: ChartSpec = {
    id: "wing-bars",
    title: "The three rates at your strikes",
    subtitle: "Against the loss rate currently in the control deck.",
    kind: "xy",
    data: table(
      [f("rate", "Rate"), f("value", "Per event", "pct2")],
      [
        { rate: "Breach", value: r.breach },
        { rate: "Effective", value: r.effective },
        { rate: "Full gap", value: r.fullGap },
      ],
    ),
    mark: "bar",
    x: { field: "rate", categorical: true },
    y: { field: "value", label: "Rate per event", format: "pct1" },
    series: [{ field: "value", color: "b", label: "Rate" }],
    height: 220,
    annotations: [{ kind: "hline", y: p.lossRate, text: `deck q ${pct2(p.lossRate)}`, color: "a", at: "end" }],
  };

  const tblRows: Row[] = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, p.strikeDistance]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .map((dd) => {
      const rr = wingRates({ ...wp, strikeDistance: dd });
      return { d: dd, breach: rr.breach, effective: rr.effective, fullGap: rr.fullGap, pClean: pCleanFromLossRate(rr.effective, p.nights), ev: rr.expectedPnlPerMaxLoss };
    });
  const tbl: ChartSpec = {
    id: "wing-table",
    title: "Rates by short-strike distance, and the clean season they imply",
    kind: "table",
    data: table(
      [f("d", "Short strike, σ", "x2"), f("breach", "Breach", "pct2"), f("effective", "Effective", "pct2"), f("fullGap", "Full gap", "pct2"), f("pClean", `P(clean season of ${p.nights})`, "pct1"), f("ev", "Event EV ÷ max loss", "pct2")],
      tblRows,
    ),
    mark: "line",
    x: { field: "d" },
    y: { field: "effective" },
    series: [],
    columns: [{ field: "d", emphasize: true }, { field: "breach" }, { field: "effective", emphasize: true }, { field: "fullGap" }, { field: "pClean" }, { field: "ev" }],
    highlightRow: { field: "d", value: p.strikeDistance },
    caption: "The clean-season column feeds the effective rate into (1 − q)^n. Event EV uses the credit as the gain and the expected payout as the loss.",
  };

  return {
    id: "wing",
    number: 4,
    eyebrow: "Which rate goes in",
    title: "Breach, full gap, or the rate in between",
    question: "The binary model wants one full-loss rate per event. The wing produces partial losses. Which number is q?",
    lede: `The breach rate (${pct2(r.breach)}) overstates it, because many breaches end inside the wing. The full-gap rate (${pct2(
      r.fullGap,
    )}) understates it, because it ignores partial losses. The effective rate (${pct2(
      r.effective,
    )}) is the one that reproduces the event's expected value once every bad event is treated as a full loss. Narrow wings make the binary exact; wide wings turn a season into a distribution where most bad seasons are partial.`,
    kpis: [
      { label: "Breach rate", value: pct2(r.breach), sub: `P(move > ${p.strikeDistance.toFixed(2)}σ)`, color: "ramp1" },
      { label: "Effective rate", value: pct2(r.effective), sub: "E[payout] ÷ width", color: "b", help: "The EV-matching full-loss rate. Push it into the deck with the button below." },
      { label: "Full-gap rate", value: pct2(r.fullGap), sub: `P(move > ${dEnd.toFixed(2)}σ)`, color: "ramp3" },
      { label: "Gain per unit risked", value: pct2(r.gainPerUnit), sub: "b = c ÷ (W − c)", help: "What the wing pays per unit of max loss when it expires worthless." },
    ],
    primary: [density],
    secondary: [payout, bars, sweep],
    tables: [tbl],
    localParams: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"],
    actions: [
      { label: `Use ${pct2(r.effective)} as the deck's loss rate`, hint: "Pushes the effective rate into every other section.", patch: { lossRate: r.effective } },
      { label: `Use ${pct2(r.gainPerUnit)} as the gain per unit risked`, hint: "Sets b from the credit and the width.", patch: { gain: r.gainPerUnit } },
    ],
    notes: [
      {
        title: "Deriving the effective rate",
        body: "Per event, in units of max loss M = W − c, the real P&L is (c − payout)/M. The binary abstraction replaces it with +b at probability 1 − q and −1 at probability q, with b = c/M. Matching expectations gives q(1 + b) = E[payout]/M, hence q = E[payout]/W.\n\nThe wing-width discussion wrote the same quantity as E[payout]/(W − c), which is larger by the factor W/(W − c), about 1.035 here. The difference is whether the credit is counted as kept on a losing night. Both are shown in the table below the chart.",
      },
      {
        title: "Why the choice of distribution matters more than the choice of strike",
        body: `Switch the move to a Student-t and the effective rate at the same strike jumps, because the rate is a tail integral and tails are where the Normal is thinnest. Realized over priced sigma does the same job for a whole evening at once; section 6 uses it for the shared-volatility case.`,
      },
    ],
    sourceFigures: [
      { label: "Effective rate, this wing", quoted: "E[payout | W] ÷ (W − c)", computed: `${pct2(r.effectiveOverMaxLoss)} (over max loss) · ${pct2(r.effective)} (over width)` },
      { label: "P(clean season) it implies", quoted: "—", computed: pct(pCleanFromLossRate(r.effective, p.nights)) },
      { label: "Ruin per season if breach rate were used", quoted: "—", computed: smallPct(1 - pCleanFromLossRate(r.breach, p.nights)) },
    ],
  };
}
