import { f, table, tableSpec, type ChartSpec, type Row, type Story } from "../../charts/spec";
import { pCleanFromLossRate } from "../../model/binary";
import { marketPatch, MARKET_TOL, type Datasets, type Params } from "../../model/params";
import { linspace } from "../../model/stats";
import { fairRealizedRatio, movePdf, payoutFraction, ratioForLossRate, wingRates, type WingParams } from "../../model/wing";
import { fig, movesDeck, near, pct, pct1, pct2, ratio, sigma, signedPct, signedPp, type Derived } from "../derived";
import type { Action, ScenarioView } from "../types";

export function buildWing(p: Params, d: Derived, data: Datasets): ScenarioView {
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
  const q = p.lossRate;
  const dist = wp.moveDist === "normal" ? "Normal" : wp.moveDist === "student" ? `Student-t (${p.tailDf} d.f.)` : `${data.moves.length} imported moves`;
  const dEnd = p.strikeDistance + p.wingWidth;
  const fairRatio = fairRealizedRatio(wp);
  const ratioForDeck = ratioForLossRate(q, wp);
  const matchesDeck = Math.abs(r.effective - q) <= MARKET_TOL;
  const premiumDeck = d.market.premium;
  const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

  const xLo = -4;
  const xHi = Math.max(5, dEnd + 1.5);
  const xs = linspace(xLo, xHi, 361);
  const densRows: Row[] = xs.map((x) => ({ x, density: movePdf(x, wp), payout: payoutFraction(x, wp) }));

  const densityStories: Story[] = [];
  if (wp.moveDist !== "student") {
    const st = wingRates({ ...wp, moveDist: "student", tailDf: 4 });
    densityStories.push({
      id: "student",
      label: "What if the tails are fat?",
      narrative: `A Student-t with 4 degrees of freedom: breach ${pct2(st.breach)} and effective rate ${pct2(st.effective)} instead of ${pct2(r.breach)} and ${pct2(r.effective)}.`,
      params: { moveDist: "student", tailDf: 4 },
      badge: movesDeck("move distribution", dist, "Student-t (4 d.f.)"),
    });
  }
  if (fairRatio != null && Math.abs(fairRatio - p.realizedRatio) > 0.005) {
    densityStories.push({
      id: "fair",
      label: "What if the chain prices this wing fairly?",
      narrative: `At realized ÷ priced ${ratio(fairRatio)} the effective rate is c ÷ W = ${pct2(r.fairRate)}: premium over fair 0.`,
      params: { realizedRatio: round4(fairRatio) },
      badge: movesDeck("realized ÷ priced", ratio(p.realizedRatio), ratio(fairRatio)),
    });
  }
  if (Math.abs(p.wingWidth - 1) > 1e-9) {
    const wide = wingRates({ ...wp, wingWidth: 1 });
    densityStories.push({
      id: "wide",
      label: "I widen the wing to 1σ",
      narrative: `Breach stays ${pct2(wide.breach)}; the effective rate becomes ${pct2(wide.effective)} as more breaches end inside the wing (credit held at ${pct2(p.creditFraction)} of width).`,
      params: { wingWidth: 1 },
      badge: movesDeck("wing width", sigma(p.wingWidth), sigma(1)),
    });
  }

  const density: ChartSpec = {
    id: "wing-density",
    title: "The realized move against the short wing",
    subtitle: `x move toward the short strike, priced sigmas · y density (log) · ${dist} realized at ${ratio(p.realizedRatio)} the priced sigma · red band = wing${empiricalWanted && !haveMoves ? " · no moves imported yet, showing the Normal" : ""}`,
    kind: "xy",
    data: table([f("x", "Move toward the short strike, priced sigmas", "x2"), f("density", "Density", "num"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "area",
    x: { field: "x", format: "x2", domain: [xLo, xHi] },
    y: { field: "density", label: "Density (log)", scale: "log", domain: [1e-5, 1] },
    series: [{ field: "density", color: "ink", label: "Realized move" }],
    height: 280,
    annotations: [
      { kind: "xband", x: p.strikeDistance, x2: dEnd, text: "wing: partial loss inside, full loss beyond", color: "loss" },
      { kind: "vline", x: p.strikeDistance, text: "short strike", color: "loss", at: "start" },
      { kind: "vline", x: dEnd, text: "long strike", color: "loss", at: "start" },
    ],
    stories: densityStories,
  };

  // The payout ramp, from one sigma before the short strike to one after the long strike.
  const rampLo = p.strikeDistance - 1;
  const rampHi = dEnd + 1;
  const rampRows: Row[] = linspace(rampLo, rampHi, 201).map((x) => ({ x, payout: payoutFraction(x, wp) }));
  const payout: ChartSpec = {
    id: "wing-payout",
    title: "Payout per unit width",
    subtitle: "x move toward the short strike, priced sigmas · y payout per unit width · green line = credit · 100% = the full loss the binary model assumes",
    kind: "xy",
    data: table([f("x", "Move toward the short strike, priced sigmas", "x2"), f("payout", "Payout per unit width", "pct")], rampRows),
    mark: "line",
    x: { field: "x", format: "x2", domain: [rampLo, rampHi] },
    y: { field: "payout", format: "pct", domain: [0, 1] },
    series: [{ field: "payout", color: "loss", label: "Payout" }],
    height: 220,
    annotations: [
      { kind: "hline", y: p.creditFraction, text: `credit ${pct1(p.creditFraction)} of width`, color: "good", at: "start" },
      { kind: "vline", x: p.strikeDistance, text: "short strike", color: "muted", at: "start" },
      { kind: "vline", x: dEnd, text: "long strike", color: "muted", at: "end" },
    ],
  };

  const ds = linspace(1, 3.5, 51);
  const sweepRows: Row[] = ds.map((dd) => {
    const rr = wingRates({ ...wp, strikeDistance: dd });
    return { d: dd, breach: rr.breach, effective: rr.effective, fullGap: rr.fullGap };
  });
  const sweep: ChartSpec = {
    id: "wing-sweep",
    title: "Three candidate rates against the short-strike distance",
    subtitle: "x short strike distance, priced sigmas · y rate per event (log) · breach, effective, full gap · red = fair c ÷ W · black = deck q · line = your strike",
    kind: "xy",
    data: table([f("d", "Short strike distance, priced sigmas", "x2"), f("breach", "Breach rate", "pct2"), f("effective", "Effective rate", "pct2"), f("fullGap", "Full-gap rate", "pct2")], sweepRows),
    mark: "line",
    x: { field: "d", format: "x2", domain: [1, 3.5] },
    y: { field: "effective", label: "Rate per event", scale: "log", format: "pct1", domain: [1e-5, 1] },
    series: [
      { field: "breach", color: "ramp1", label: "Breach: P(move > short strike)" },
      { field: "effective", color: "ink", label: "Effective: E[payout] ÷ width", emphasis: "strong" },
      { field: "fullGap", color: "ramp3", label: "Full gap: P(move > long strike)" },
    ],
    height: 300,
    annotations: [
      { kind: "vline", x: p.strikeDistance, text: `your short strike ${sigma(p.strikeDistance)}`, color: "muted", at: "start" },
      { kind: "hline", y: r.fairRate, text: `fair / break-even: c ÷ W = ${pct2(r.fairRate)}`, color: "loss", at: "end" },
      { kind: "hline", y: q, text: `deck q ${pct2(q)}`, color: "ink", at: "start" },
    ],
  };

  const bars: ChartSpec = {
    id: "wing-bars",
    title: "The three rates at your strikes",
    subtitle: "x candidate rate · y rate per event · red = fair c ÷ W · black = deck q",
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
    series: [{ field: "value", color: "ink", label: "Rate per event", colors: ["ramp1", "ink", "ramp3"] }],
    legend: false,
    height: 240,
    annotations: [
      { kind: "hline", y: r.fairRate, text: `fair c ÷ W ${pct2(r.fairRate)}`, color: "loss", at: "end" },
      { kind: "hline", y: q, text: `deck q ${pct2(q)}`, color: "ink", at: "start" },
    ],
  };

  const tblRows: Row[] = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, p.strikeDistance]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .map((dd) => {
      const rr = wingRates({ ...wp, strikeDistance: dd });
      return { d: dd, breach: rr.breach, effective: rr.effective, fullGap: rr.fullGap, pClean: pCleanFromLossRate(rr.effective, p.nights), premium: rr.premiumRate };
    });
  const tbl = tableSpec({
    id: "wing-table",
    title: "Rates by short-strike distance, and the clean season they imply",
    data: table(
      [f("d", "Short strike, σ", "x2"), f("breach", "Breach", "pct2"), f("effective", "Effective", "pct2"), f("fullGap", "Full gap", "pct2"), f("pClean", `P(clean season of ${p.nights}, Coin)`, "pct1"), f("premium", "Premium over fair per event (c ÷ W − effective)", "pct2")],
      tblRows,
    ),
    columns: [{ field: "d", emphasize: true }, { field: "breach" }, { field: "effective", emphasize: true }, { field: "fullGap" }, { field: "pClean" }, { field: "premium" }],
    highlightRow: { field: "d", value: p.strikeDistance },
    caption: "Credit held fixed at the deck's c ÷ W while the strike moves, so the farther rows are not what a chain would quote. The premium column is the fair rate minus the effective rate; positive means the inputs assume the chain pays for tail insurance.",
  });

  const fairDeck = marketPatch("fair", p);
  const fairQ = fairDeck.lossRate ?? d.breakEven;
  const actions: Action[] = [
    {
      label: `Use the chain's fair rate c ÷ W = ${pct2(fairQ)} as the deck's loss rate`,
      hint: `Sets q = b ÷ (1 + b): premium over fair 0 instead of ${signedPp(premiumDeck)}; the growth-optimal risk is then 0.${Math.abs(r.fairRate - fairQ) > MARKET_TOL ? ` The wing's own c ÷ W is ${pct2(r.fairRate)}; set b from the credit first to align them.` : ""}`,
      patch: fairDeck,
    },
  ];
  if (!matchesDeck) {
    const prem = r.premiumRate;
    actions.push({
      label: `Plug the wing's effective rate ${pct2(r.effective)} into the deck`,
      hint: `Asserts ${signedPp(prem)} premium over fair per event (${signedPct(r.expectedPnlPerMaxLoss, 2)} of max loss).`,
      warning: prem > 0.005 ? "In an efficient market the credit equals the expected payout. A rate this far below c ÷ W claims that the chain pays a large premium for tail insurance." : undefined,
      patch: { lossRate: r.effective, market: "custom" },
    });
  }
  if (ratioForDeck != null && Math.abs(ratioForDeck - p.realizedRatio) > 0.005) {
    actions.push({ label: `Set realized ÷ priced sigma to ${ratio(ratioForDeck)} so the effective rate equals the deck's q`, hint: `The realized distribution at which this wing's E[payout] ÷ W is ${pct2(q)}.`, patch: { realizedRatio: round4(ratioForDeck) } });
  }
  if (Math.abs(r.gainPerUnit - p.gain) > 0.0005) {
    actions.push({ label: `Use ${pct2(r.gainPerUnit)} as the gain per unit risked`, hint: "Sets b from the credit and the width, b = c ÷ (W − c).", patch: { gain: r.gainPerUnit } });
  }

  return {
    id: "wing",
    number: 4,
    title: "Effective loss rate",
    claim: "q is expected loss per unit of max loss. A fairly priced wing puts it at c/W, which is exactly break-even; anything lower is a premium the chain pays, not information about the chain.",
    lede: "Which per-event loss rate belongs in the model: breach, effective or full gap?",
    views: [
      { id: "move-vs-wing", title: "Which loss rate to plug in", blurb: "The realized move against the short and long strike, and the payout ramp between them.", charts: ["wing-density", "wing-payout"], params: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"], kpis: [0, 1] },
      { id: "wing-rates", title: "Breach, effective and full-gap rates", blurb: "The three candidate rates at your strikes and across strike distances, against the fair rate.", charts: ["wing-bars", "wing-sweep", "wing-table"], params: ["strikeDistance", "wingWidth", "creditFraction", "realizedRatio"], kpis: [0, 1, 2, 3] },
    ],
    kpis: [
      { label: "Effective rate", value: pct2(r.effective), sub: matchesDeck ? `= deck q ${pct2(q)} · E[payout] ÷ width` : `deck q ${pct2(q)} · gap ${signedPp(r.effective - q)} · E[payout] ÷ width`, color: "ink", help: "The EV-matching full-loss rate for these inputs. The default realized ÷ priced sigma is solved so that it equals the deck's q." },
      { label: "Premium over fair per event", value: signedPp(r.premiumRate), sub: `c ÷ W ${pct2(r.fairRate)} − effective ${pct2(r.effective)} · EV ${signedPct(r.expectedPnlPerMaxLoss, 2)} of max loss`, help: "How far below the chain's fair rate the effective rate sits. Positive means these inputs assume the chain pays a premium for tail insurance, which is not an information edge; zero means fair pricing." },
      { label: "Fair rate c ÷ W", value: pct2(r.fairRate), sub: "= b ÷ (1 + b), break-even", color: "loss", help: "The effective rate at which credit equals expected payout. Identical to the break-even loss rate in section 01." },
      { label: "Breach / full gap", value: `${pct2(r.breach)} / ${pct2(r.fullGap)}`, sub: `beyond ${sigma(p.strikeDistance)} / ${sigma(dEnd)}` },
    ],
    primary: [density],
    secondary: [payout, bars, sweep],
    tables: [tbl],
    localParams: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"],
    actions,
    notes: [
      {
        title: "Deriving the effective rate",
        body: "Per event, in units of max loss M = W − c, the real P&L is (c − payout)/M. The binary abstraction replaces it with +b at probability 1 − q and −1 at probability q, with b = c/M. Matching expectations gives q(1 + b) = E[payout]/M, hence q = E[payout]/W.\n\nThe wing-width discussion wrote the same quantity as E[payout]/(W − c), which is larger by the factor W/(W − c), about 1.035 here. The difference is whether the credit is counted as kept on a losing night. Both are listed under the quoted figures.",
      },
      {
        title: "Fair pricing is break-even",
        body: "If the market prices the wing fairly, credit = E[payout], so q_eff = c/W. And b/(1 + b) with b = c/(W − c) is also c/W. The break-even loss rate of section 01 and the fairly priced wing are the same number. Everything the deck assumes below that rate is a premium the chain pays for tail insurance, or a mispricing; the app cannot tell which, and section 03 says the record cannot either.",
      },
      {
        title: "Why the default realized ÷ priced sigma is not 1.00",
        body: `The deck's q is the discussion case, ${pct2(p.lossRate)}. For this wing to produce that rate the realized move has to run ${ratio(p.realizedRatio)} the priced sigma; at 1.00 the chain would be right on average and the effective rate would be c/W = ${pct2(r.fairRate)}. The default is solved so the section opens with effective rate = deck q; the first action below takes the deck to fair pricing instead.`,
      },
      {
        title: "One wing or two",
        body: "This section models one wing: the move is signed toward the short strike. Section 06 models a condor, where either side can breach, so its thresholds are two-sided. Importing moves under Data uses the one-sided convention: positive numbers are moves toward the short strike.",
      },
    ],
    sourceFigures: [
      fig(p, "Effective rate definition", "E[payout | W] ÷ (W − c)", `${pct2(r.effectiveOverMaxLoss)} over max loss · ${pct2(r.effective)} over width`, true, []),
      fig(p, "Gain per unit risked from the credit", "3.5%", pct2(r.gainPerUnit), near(0.035, r.gainPerUnit, 0.0005), []),
      fig(p, "Breach overstates, full gap understates", "breach > effective > full gap", `${pct2(r.breach)} > ${pct2(r.effective)} > ${pct2(r.fullGap)}`, r.breach >= r.effective && r.effective >= r.fullGap, [], "The imported sample is too small for the ordering to hold."),
      fig(p, "Fair pricing puts q at break-even", "c ÷ W = b ÷ (1 + b)", `${pct2(r.fairRate)} = ${pct2(r.gainPerUnit / (1 + r.gainPerUnit))}`, near(r.fairRate, r.gainPerUnit / (1 + r.gainPerUnit), 1e-9), []),
      fig(p, "Clean season (Coin) the effective rate implies", `(1 − q)^${p.nights}`, pct(pCleanFromLossRate(r.effective, p.nights)), true, []),
    ],
  };
}
