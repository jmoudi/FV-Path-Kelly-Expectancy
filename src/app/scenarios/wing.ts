import { f, table, tableSpec, type ChartSpec, type ColorRole, type Row, type SeriesSpec, type Story } from "@kit/charts/spec";
import { pCleanFromLossRate } from "@app/model/binary";
import { marketPatch, MARKET_TOL, type Params } from "@app/params/params";
import type { Datasets } from "@app/params/datasets";
import { summarize } from "@app/model/season";
import { linspace } from "@kit/math/stats";
import { fairRealizedRatio, movePdf, payoutFraction, ratioForLossRate, wingRates, type WingParams } from "@app/model/wing";
import { partialShareOfBadSeasons, wingSeasonDistribution } from "@app/model/wingSeason";
import { fig } from "./discussion";
import { methodLabel, type Derived } from "./derived";
import { movesDeck, near } from "@kit/charts/scenario";
import { pct, pct1, pct2, ratio, sigma, signedPct, signedPp, smallPct, x2 } from "@kit/charts/numbers";
import type { Action, ScenarioView } from "./types";

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
    subtitle: `x move toward the short strike, priced sigmas · y density (log) · ${dist} realized at ${ratio(p.realizedRatio)} the priced sigma${empiricalWanted && !haveMoves ? " · no moves imported yet, showing the Normal" : ""}`,
    kind: "xy",
    data: table([f("x", "Move toward the short strike, priced sigmas", "x2"), f("density", "Density", "num"), f("payout", "Payout per unit width", "pct")], densRows),
    mark: "area",
    x: { field: "x", format: "x2", domain: [xLo, xHi] },
    y: { field: "density", label: "Density (log)", scale: "log", domain: [1e-5, 1] },
    series: [{ field: "density", color: "ink", label: "Realized move" }],
    height: 280,
    annotations: [
      { kind: "xband", x: p.strikeDistance, x2: dEnd, text: "wing: partial loss inside, full loss beyond", color: "loss" },
      { kind: "vline", x: p.strikeDistance, text: "short strike", color: "muted", at: "start" },
      { kind: "vline", x: dEnd, text: "long strike", color: "muted", at: "start" },
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
    subtitle: "x move toward the short strike, priced sigmas · y payout per unit width · 100% = the full loss the binary model assumes",
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
    subtitle: "x short strike distance, priced sigmas · y rate per event (log)",
    kind: "xy",
    data: table([f("d", "Short strike distance, priced sigmas", "x2"), f("breach", "Breach rate", "pct2"), f("effective", "Effective rate", "pct2"), f("fullGap", "Full-gap rate", "pct2")], sweepRows),
    mark: "line",
    x: { field: "d", format: "x2", domain: [1, 3.5] },
    y: { field: "effective", label: "Rate per event", scale: "log", format: "pct1", domain: [1e-5, 1] },
    series: [
      { field: "breach", color: "ramp3", label: "Breach: P(move > short strike)" },
      { field: "effective", color: "ink", label: "Effective: E[payout] ÷ width", emphasis: "strong" },
      { field: "fullGap", color: "ramp4", label: "Full gap: P(move > long strike)" },
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
    subtitle: "x candidate rate · y rate per event",
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
    series: [{ field: "value", color: "ink", label: "Rate per event", colors: ["ramp3", "ink", "ramp4"] }],
    legend: false,
    height: 240,
    annotations: [
      { kind: "hline", y: r.fairRate, text: `fair c ÷ W ${pct2(r.fairRate)}`, color: "loss", at: "end" },
      // At the end, clear of the tall breach bar on the left.
      { kind: "hline", y: q, text: `deck q ${pct2(q)}`, color: "ink", at: "end" },
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

  // The season the wing's payout produces, for three widths and yours. Realized ÷ priced is
  // solved per width so every wing has the deck's effective rate: same mean, different shape.
  const yourWidth = Math.round(p.wingWidth * 1000) / 1000;
  const standardWidths = [0.25, 0.5, 1];
  const widthList = Array.from(new Set([...standardWidths, yourWidth])).sort((a, b) => a - b);
  const seasonByWidth = widthList.map((w) => {
    const wpW: WingParams = { ...wp, wingWidth: w };
    const solved = ratioForLossRate(q, wpW);
    const wpUsed: WingParams = { ...wpW, realizedRatio: solved ?? p.realizedRatio };
    const rates = wingRates(wpUsed);
    const dist = wingSeasonDistribution(wpUsed, p.nights, { maxCompositions: p.maxCompositions });
    let below1 = 0;
    for (const o of dist.outcomes) if (o.value < 1 - 1e-9) below1 += o.prob;
    return { width: w, ratio: wpUsed.realizedRatio, solved: solved != null, rates, dist, summary: summarize(dist, p.thresholdBelow), below1, partial: partialShareOfBadSeasons(dist) };
  });
  const yoursW = seasonByWidth.find((s) => s.width === yourWidth)!;
  const w025 = seasonByWidth.find((s) => s.width === 0.25)!;
  const w1 = seasonByWidth.find((s) => s.width === 1)!;
  const hiEnd = Math.max(1.2, Math.ceil(Math.max(...seasonByWidth.map((s) => s.summary.max)) * 1.05 * 20) / 20);
  const endGrid = [0, ...linspace(0.02, hiEnd, 160)];
  const cursors = seasonByWidth.map(() => ({ i: 0, acc: 0 }));
  const seasonRows: Row[] = endGrid.map((x) => {
    const row: Row = { end: x };
    seasonByWidth.forEach((s, i) => {
      const cur = cursors[i];
      const outs = s.dist.outcomes;
      while (cur.i < outs.length && outs[cur.i].value <= x + 1e-9) cur.acc += outs[cur.i++].prob;
      row[`w${i}`] = Math.min(1, cur.acc);
    });
    return row;
  });
  // Your wing is the deck's, so it is the ink line; the alternatives are grey, lighter for narrower.
  const widthColors: ColorRole[] = ["ramp2", "ramp3", "ramp4"];
  const seasonSeries: SeriesSpec[] = seasonByWidth.map((s, i) => {
    const std = standardWidths.indexOf(s.width);
    const isYours = s.width === yourWidth;
    return { field: `w${i}`, color: isYours || std < 0 ? "ink" : widthColors[std], label: `${sigma(s.width)} wide${isYours ? " (your wing)" : ""}`, emphasis: isYours ? "strong" : "normal" };
  });
  const partialText = (s: (typeof seasonByWidth)[number]) => (s.partial == null ? "no bad seasons" : pct(s.partial));
  const seasonStories: Story[] = [];
  if (yourWidth !== 1) {
    seasonStories.push({
      id: "wide",
      label: "I widen the wing to 1σ",
      narrative: `${partialText(w1)} of the bad seasons end above zero instead of ${partialText(yoursW)}; ruin per season ${smallPct(w1.summary.pRuin)} instead of ${smallPct(yoursW.summary.pRuin)}, at the same effective rate.`,
      params: { wingWidth: 1 },
      badge: movesDeck("wing width", sigma(p.wingWidth), sigma(1)),
    });
  }
  if (yourWidth !== 0.25) {
    seasonStories.push({
      id: "narrow",
      label: "I narrow the wing to 0.25σ",
      narrative: `${partialText(w025)} of the bad seasons end above zero instead of ${partialText(yoursW)}: the season moves toward the coin, ruin ${pct1(w025.summary.pRuin)} instead of ${smallPct(yoursW.summary.pRuin)}.`,
      params: { wingWidth: 0.25 },
      badge: movesDeck("wing width", sigma(p.wingWidth), sigma(0.25)),
    });
  }
  const wingSeason: ChartSpec = {
    id: "wing-season",
    title: "Where a season ends when the wing pays out in part",
    subtitle: `x season end, tranche units · y share of seasons ending at or below · whole tranche on each of ${p.nights} events · realized ÷ priced solved per width so every wing has the deck's effective rate ${pct2(q)} · ${methodLabel(yoursW.dist.method)}`,
    kind: "xy",
    data: table([f("end", "Season end, tranche units", "x"), ...seasonByWidth.map((s, i) => f(`w${i}`, `${sigma(s.width)} wide`, "pct1"))], seasonRows),
    mark: "step",
    x: { field: "end", format: "x", domain: [0, hiEnd] },
    y: { field: `w${seasonByWidth.indexOf(yoursW)}`, label: "P(season ends at or below)", format: "pct", domain: [0, 1] },
    series: seasonSeries,
    height: 300,
    annotations: [
      { kind: "vline", x: 1, text: "start: a bad season ends below", color: "muted", at: "start" },
      { kind: "hline", y: 0.5, text: "median line", color: "muted", at: "end" },
    ],
    stories: seasonStories,
  };
  const seasonTbl = tableSpec({
    id: "wing-season-table",
    title: "The season by wing width, effective rate held at the deck's q",
    data: table(
      [
        f("width", "Wing width, σ", "x2"),
        f("ratio", "Realized ÷ priced solved", "x2"),
        f("breach", "Breach", "pct2"),
        f("fullGap", "Full gap", "pct2"),
        f("below1", "P(season below start)", "pct1"),
        f("ruin", "P(ruin)", "pct2"),
        f("partial", "Bad seasons that are partial", "pct"),
        f("median", "Median", "x"),
        f("mean", "Mean", "x"),
      ],
      seasonByWidth.map((s) => ({ width: s.width, ratio: s.ratio, breach: s.rates.breach, fullGap: s.rates.fullGap, below1: s.below1, ruin: s.summary.pRuin, partial: s.partial, median: s.summary.median, mean: s.summary.mean })),
    ),
    columns: [{ field: "width", emphasize: true }, { field: "ratio" }, { field: "breach" }, { field: "fullGap" }, { field: "below1" }, { field: "ruin", color: "loss" }, { field: "partial", emphasize: true }, { field: "median" }, { field: "mean" }],
    highlightRow: { field: "width", value: yourWidth },
    caption: `Whole tranche on each of ${p.nights} events; one event multiplies the tranche by 1 + (c/W − payout)/(1 − c/W). Where a ratio could be solved the mean is the same for every width, because the effective rate is; the width changes the shape.${seasonByWidth.some((s) => !s.solved) ? " A width without a solvable ratio keeps the deck's realized ÷ priced." : ""}`,
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
      { id: "move-vs-wing", title: "Which loss rate to plug in", blurb: "The realized move against the short and long strike, the payout ramp between them, and the season that payout produces at three wing widths.", charts: ["wing-density", "wing-payout", "wing-season", "wing-season-table"], params: ["strikeDistance", "wingWidth", "creditFraction", "moveDist", "tailDf", "realizedRatio"], kpis: [0, 1, 4] },
      { id: "wing-rates", title: "Breach, effective and full-gap rates", blurb: "The three candidate rates at your strikes and across strike distances, against the fair rate.", charts: ["wing-bars", "wing-sweep", "wing-table"], params: ["strikeDistance", "wingWidth", "creditFraction", "realizedRatio"], kpis: [0, 1, 2, 3] },
    ],
    kpis: [
      { label: "Effective rate", value: pct2(r.effective), sub: matchesDeck ? `= deck q ${pct2(q)} · E[payout] ÷ width` : `deck q ${pct2(q)} · gap ${signedPp(r.effective - q)} · E[payout] ÷ width`, color: "ink", help: "The EV-matching full-loss rate for these inputs. The default realized ÷ priced sigma is solved so that it equals the deck's q." },
      { label: "Premium over fair per event", value: signedPp(r.premiumRate), sub: `c ÷ W ${pct2(r.fairRate)} − effective ${pct2(r.effective)} · EV ${signedPct(r.expectedPnlPerMaxLoss, 2)} of max loss`, help: "How far below the chain's fair rate the effective rate sits. Positive means these inputs assume the chain pays a premium for tail insurance, which is not an information edge; zero means fair pricing." },
      { label: "Fair rate c ÷ W", value: pct2(r.fairRate), sub: "= b ÷ (1 + b), break-even", help: "The effective rate at which credit equals expected payout. Identical to the break-even loss rate in section 01." },
      { label: "Breach / full gap", value: `${pct2(r.breach)} / ${pct2(r.fullGap)}`, sub: `beyond ${sigma(p.strikeDistance)} / ${sigma(dEnd)}` },
      {
        label: "Bad seasons that are partial",
        value: partialText(yoursW),
        sub: `${sigma(p.wingWidth)} wide · ${sigma(0.25)}: ${partialText(w025)} · ${sigma(1)}: ${partialText(w1)} · median season ${x2(yoursW.summary.median)}`,
        help: "Among seasons that end below the start, the share that end above zero. Narrow wings make the binary exact, so a bad season is ruin; wide wings turn most bad seasons into partial losses. Realized ÷ priced is solved per width so each curve keeps the deck's effective rate.",
      },
    ],
    primary: [density],
    secondary: [payout, bars, sweep, wingSeason],
    tables: [tbl, seasonTbl],
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
        title: "Narrow wings make the binary exact; wide wings make the bad season partial",
        body: `Per event the tranche multiplies by 1 + (c/W − payout)/(1 − c/W): ×(1 + b) when the wing expires worthless, ×0 when the move gaps past the long strike, and something between when it ends inside the wing. A narrow wing leaves almost no room inside, so nearly every bad event is a full loss and the season is the coin. A wide wing catches most breaches inside it, so most bad seasons end above zero: at ${sigma(1)} ${partialText(w1)} of them, at ${sigma(0.25)} ${partialText(w025)}, at your ${sigma(p.wingWidth)} ${partialText(yoursW)}. The comparison holds the effective rate at the deck's q by solving realized ÷ priced for each width, so the mean season is the same and only the shape differs.`,
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
      fig(
        p,
        "Bad seasons that are partial, 0.25σ → 1σ wide",
        "narrow: the binary is exact · wide: most are partial",
        `${partialText(w025)} → ${partialText(w1)}`,
        (w025.partial ?? 0) < (w1.partial ?? 0) && (w1.partial ?? 0) > 0.5,
        [],
        "At these inputs fewer than half of the bad seasons on a 1σ wing end above zero, or the narrow wing is not the more binary one.",
      ),
    ],
  };
}
