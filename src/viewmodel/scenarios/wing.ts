import { f, table, tableSpec, type ChartSpec, type Row } from "../../charts/spec";
import { pCleanFromLossRate } from "../../model/binary";
import type { Datasets, Params } from "../../model/params";
import { linspace } from "../../model/stats";
import { fairRealizedRatio, movePdf, payoutFraction, wingRates, type WingParams } from "../../model/wing";
import { pct, pct1, pct2, signedPct1, smallPct, type Derived } from "../derived";
import type { Action, ScenarioView } from "../types";

export function buildWing(p: Params, _d: Derived, data: Datasets): ScenarioView {
  const empiricalWanted = p.moveDist === "empirical";
  const haveMoves = data.moves.length > 0;
  const wp: WingParams = {
    strikeDistance: p.strikeDistance,
    wingWidth: p.wingWidth,
    creditFraction: p.creditFraction,
    moveDist: empiricalWanted && !haveMoves ? "normal" : p.moveDist,
    tailDf: p.tailDf,
    realizedRatio: p.realizedRatio,
    sample: data.moves,
  };
  const r = wingRates(wp);
  const dist = wp.moveDist === "normal" ? "Normal" : wp.moveDist === "student" ? `Student-t (${p.tailDf} d.f.)` : `${data.moves.length} imported moves`;
  const dEnd = p.strikeDistance + p.wingWidth;
  const fairRatio = fairRealizedRatio(wp);
  const edgePerMaxLoss = r.expectedPnlPerMaxLoss;

  const xs = linspace(-4, Math.max(5, dEnd + 1.5), 361);
  const densRows: Row[] = xs.map((x) => ({ x, density: movePdf(x, wp), payout: payoutFraction(x, wp) }));
  const density: ChartSpec = {
    id: "wing-density",
    title: "The realized move against the short wing",
    subtitle: `${dist} move in priced sigmas, realized at ${p.realizedRatio.toFixed(2)}× the priced sigma. Log density, so the tail the wing lives in is visible.${empiricalWanted && !haveMoves ? " No moves imported yet; showing the Normal." : ""}`,
    kind: "xy",
    data: table([f("x", "Move toward the short strike, priced sigmas", "x2"), f("density", "Density", "num"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "area",
    x: { field: "x", format: "x2", domain: [-4, Math.max(5, dEnd + 1.5)] },
    y: { field: "density", label: "Density (log)", scale: "log", domain: [1e-5, 1] },
    series: [{ field: "density", color: "b", label: "Realized move" }],
    height: 280,
    annotations: [
      { kind: "xband", x: p.strikeDistance, x2: dEnd, text: "wing: partial loss inside, full loss beyond", color: "loss" },
      { kind: "vline", x: p.strikeDistance, text: "short strike", color: "loss", at: "start" },
      { kind: "vline", x: dEnd, text: "long strike", color: "loss", at: "start" },
    ],
    stories: [
      { id: "linear", label: "The familiar bell (linear density)", narrative: "On a linear axis the tail is a sliver, which is the point.", patch: { y: { scale: "linear", domain: [0, 0.45] } } },
      { id: "student", label: "What if the tails are fat?", narrative: "Switch the move to a Student-t with 4 degrees of freedom.", params: { moveDist: "student", tailDf: 4 } },
      { id: "fair", label: "What if the chain prices this fairly?", narrative: "Sets realized ÷ priced sigma so the effective rate equals c/W.", params: fairRatio != null ? { realizedRatio: Math.round(fairRatio * 100) / 100 } : {} },
    ],
  };

  const payout: ChartSpec = {
    id: "wing-payout",
    title: "Payout per unit width",
    subtitle: "Above the credit line the event loses money; at 100% it is the full loss the binary model assumes.",
    kind: "xy",
    data: table([f("x", "Move toward the short strike, priced sigmas", "x2"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "line",
    x: { field: "x", format: "x2", domain: [-4, Math.max(5, dEnd + 1.5)] },
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
    subtitle: "Where the effective curve meets c/W the wing is fairly priced.",
    kind: "xy",
    data: table([f("d", "Short strike distance, priced sigmas", "x2"), f("breach", "Breach rate", "pct2"), f("effective", "Effective rate", "pct2"), f("fullGap", "Full-gap rate", "pct2")], sweepRows),
    mark: "line",
    x: { field: "d", format: "x2", domain: [1, 3.5] },
    y: { field: "effective", label: "Rate per event", scale: "log", format: "pct1", domain: [1e-5, 1] },
    series: [
      { field: "breach", color: "ramp1", label: "Breach: P(move > short strike)" },
      { field: "effective", color: "b", label: "Effective: E[payout] ÷ width", emphasis: "strong" },
      { field: "fullGap", color: "ramp3", label: "Full gap: P(move > long strike)" },
    ],
    height: 300,
    annotations: [
      { kind: "vline", x: p.strikeDistance, text: `your short strike ${p.strikeDistance.toFixed(2)}σ`, color: "ink", at: "start" },
      { kind: "hline", y: r.fairRate, text: `fair / break-even: c ÷ W = ${pct2(r.fairRate)}`, color: "loss", at: "end" },
      { kind: "hline", y: p.lossRate, text: `deck q ${pct2(p.lossRate)}`, color: "ink", at: "start" },
    ],
    stories: [{ id: "linear", label: "Linear rate axis", patch: { y: { scale: "linear", domain: [0, 0.2] } } }],
  };

  const bars: ChartSpec = {
    id: "wing-bars",
    title: "The three rates at your strikes",
    subtitle: "Against the fair rate c/W and the loss rate in the control deck.",
    kind: "xy",
    data: table(
      [f("rate", "Rate"), f("value", "Rate per event", "pct2")],
      [
        { rate: "Breach", value: r.breach },
        { rate: "Effective", value: r.effective },
        { rate: "Full gap", value: r.fullGap },
      ],
    ),
    mark: "bar",
    x: { field: "rate", categorical: true },
    y: { field: "value", label: "Rate per event", format: "pct1" },
    series: [{ field: "value", color: "b", label: "Rate per event", colors: ["ramp1", "b", "ramp3"] }],
    legend: false,
    height: 240,
    annotations: [
      { kind: "hline", y: r.fairRate, text: `fair c ÷ W ${pct2(r.fairRate)}`, color: "loss", at: "end" },
      { kind: "hline", y: p.lossRate, text: `deck q ${pct2(p.lossRate)}`, color: "ink", at: "start" },
    ],
  };

  const tblRows: Row[] = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, p.strikeDistance]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .map((dd) => {
      const rr = wingRates({ ...wp, strikeDistance: dd });
      return { d: dd, breach: rr.breach, effective: rr.effective, fullGap: rr.fullGap, pClean: pCleanFromLossRate(rr.effective, p.nights), ev: rr.expectedPnlPerMaxLoss };
    });
  const tbl = tableSpec({
    id: "wing-table",
    title: "Rates by short-strike distance, and the clean season they imply",
    data: table(
      [f("d", "Short strike, σ", "x2"), f("breach", "Breach", "pct2"), f("effective", "Effective", "pct2"), f("fullGap", "Full gap", "pct2"), f("pClean", `P(clean season of ${p.nights})`, "pct1"), f("ev", "Event EV ÷ max loss", "pct2")],
      tblRows,
    ),
    columns: [{ field: "d", emphasize: true }, { field: "breach" }, { field: "effective", emphasize: true }, { field: "fullGap" }, { field: "pClean" }, { field: "ev" }],
    highlightRow: { field: "d", value: p.strikeDistance },
    caption: "Credit held fixed at the deck's c/W while the strike moves, so the farther rows are not what a chain would quote. Event EV uses the credit as the gain and the expected payout as the loss.",
  });

  const actions: Action[] = [
    {
      label: `Use ${pct2(r.effective)} as the deck's loss rate`,
      hint: `This asserts an edge of ${signedPct1(edgePerMaxLoss)} of max loss per event against a fairly priced wing.`,
      warning: edgePerMaxLoss > 0.005 ? "In an efficient market the credit already equals the expected payout. Pushing a lower rate into the deck is a claim about the chain being wrong." : undefined,
      patch: { lossRate: r.effective },
    },
    { label: `Use ${pct2(r.gainPerUnit)} as the gain per unit risked`, hint: "Sets b from the credit and the width.", patch: { gain: r.gainPerUnit } },
  ];
  if (fairRatio != null) actions.push({ label: `Set realized ÷ priced sigma to ${fairRatio.toFixed(2)} (fair pricing)`, hint: "The ratio at which the effective rate equals c/W, so the wing has no edge and no drag.", patch: { realizedRatio: Math.round(fairRatio * 100) / 100 } });

  return {
    id: "wing",
    number: 4,
    title: "Effective loss rate",
    claim: "q is expected loss per unit of max loss. A fairly priced wing puts it at c/W, which is exactly break-even; anything lower is a claim about the chain.",
    lede: `The realized move against one short wing, the payout it produces, and the three candidate rates (breach ${pct2(r.breach)}, effective ${pct2(r.effective)}, full gap ${pct2(r.fullGap)}) against c/W = ${pct2(r.fairRate)}.`,
    views: [
      { id: "move-vs-wing", title: "Move against the wing", blurb: "The realized move distribution over the short and long strike, and the payout ramp.", charts: ["wing-density", "wing-payout"], params: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"], kpis: [0, 1] },
      { id: "wing-rates", title: "Candidate rates", blurb: "Breach, effective and full-gap rates at your strikes and across strike distances, against the fair rate.", charts: ["wing-bars", "wing-sweep", "wing-table"], params: ["strikeDistance", "wingWidth", "creditFraction", "realizedRatio"], kpis: [0, 1, 2, 3] },
    ],
    kpis: [
      { label: "Effective rate", value: pct2(r.effective), sub: "E[payout] ÷ width", color: "b", help: "The EV-matching full-loss rate for these inputs." },
      { label: "Edge asserted per event", value: signedPct1(edgePerMaxLoss), sub: `c ÷ W − effective = ${signedPct1(r.edgeRate)} as a rate`, color: edgePerMaxLoss > 0.005 ? "loss" : "ink", help: "Expected P&L per unit of max loss. Zero means the wing is priced fairly; positive means these inputs assume the chain overprices the tail." },
      { label: "Fair rate c ÷ W", value: pct2(r.fairRate), sub: "= b ÷ (1 + b), break-even", help: "The effective rate at which credit equals expected payout. Identical to the break-even loss rate in section 1." },
      { label: "Breach / full gap", value: `${pct2(r.breach)} / ${pct2(r.fullGap)}`, sub: `beyond ${p.strikeDistance.toFixed(2)}σ / ${dEnd.toFixed(2)}σ` },
    ],
    primary: [density],
    secondary: [payout, bars, sweep],
    tables: [tbl],
    localParams: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"],
    actions,
    notes: [
      {
        title: "Deriving the effective rate",
        body: "Per event, in units of max loss M = W − c, the real P&L is (c − payout)/M. The binary abstraction replaces it with +b at probability 1 − q and −1 at probability q, with b = c/M. Matching expectations gives q(1 + b) = E[payout]/M, hence q = E[payout]/W.\n\nThe wing-width discussion wrote the same quantity as E[payout]/(W − c), which is larger by the factor W/(W − c), about 1.035 here. The difference is whether the credit is counted as kept on a losing night. Both are listed under the figures below.",
      },
      {
        title: "Fair pricing is break-even",
        body: "If the market prices the wing fairly, credit = E[payout], so q_eff = c/W. And b/(1 + b) with b = c/(W − c) is also c/W. The break-even loss rate of section 1 and the fairly priced wing are the same number. Everything the deck assumes below that rate is a risk premium the chain is paying you, or a mispricing; the app cannot tell which, and section 3 says the record cannot either.",
      },
      {
        title: "One wing or two",
        body: "This section models one wing: the move is signed toward the short strike. Section 6 models a condor, where either side can breach, so its thresholds are two-sided. Importing moves under Data uses the one-sided convention: positive numbers are moves toward the short strike.",
      },
    ],
    sourceFigures: [
      { label: "Effective rate, this wing", quoted: "E[payout | W] ÷ (W − c)", computed: `${pct2(r.effectiveOverMaxLoss)} (over max loss) · ${pct2(r.effective)} (over width)` },
      { label: "P(clean season) it implies", quoted: "—", computed: pct(pCleanFromLossRate(r.effective, p.nights)) },
      { label: "Ruin per season if the breach rate were used", quoted: "—", computed: smallPct(1 - pCleanFromLossRate(r.breach, p.nights)) },
    ],
  };
}
