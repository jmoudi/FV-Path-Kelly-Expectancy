import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec, type Story } from "../../charts/spec";
import { medianGrowthPerSeason } from "../../model/growth";
import { robustSeasonLogGrowth, seasonLogGrowth, seasonRuin } from "../../model/kelly";
import type { Datasets, Params } from "../../model/params";
import { POLICY_IDS, type PolicyId } from "../../model/policies";
import { binnedDistributions, logHistogram, samplePaths, summarize, weightedQuantile } from "../../model/season";
import { linspace } from "../../model/stats";
import { fig, methodLabel, movesDeck, near, pct, pct1, pct2, signedPct1, smallPct, typographic, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

const SEASON_WORDS: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Twelve" };

export function buildChaining(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids = POLICY_IDS;
  const P = d.byId;
  const k = d.k;
  const N = p.seasons;
  const n = p.nights;
  const S = Math.max(N, 8);
  const yours = P[d.yours];
  const sCoin = d.chained.coin.summary;
  const sSpread = d.chained.spread.summary;
  const sYours = d.chained[d.yours].summary;
  const zero = d.market.zeroPremium;

  // Log growth grid: risk per night × true loss rate. Cells with material ruin say so.
  const riskList = Array.from(new Set([0.2, 0.3, 0.39, 0.5, 0.6, 0.75, 0.9, 1.0, Math.round(p.riskPerNight * 100) / 100])).sort((a, b) => a - b);
  const qList = Array.from(new Set([0.022, p.altLossRate, 0.028, p.lossRate, 0.032, d.breakEven].map((v) => Math.round(v * 1e5) / 1e5))).sort((a, b) => a - b);
  const gridRows: Row[] = [];
  for (const r of riskList)
    for (const qq of qList) {
      const ruin = seasonRuin(r, k, qq, p.gain, n, p.sharedOutcome);
      const growth = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome);
      gridRows.push({ risk: r, q: qq, growth: ruin > 0.01 ? null : growth, label: ruin > 0.01 ? `ruin ${pct(ruin)}` : null });
    }
  const heat: ChartSpec = {
    id: "chain-heat",
    title: "Log growth per season by risk a night and true loss rate",
    subtitle: `x true loss rate per name · y tranche at risk a night · cell = log growth per season of surviving paths, ${k} name${k === 1 ? "" : "s"} a night · cells where a season wipes the tranche more than 1% of the time say so · outline = your deck`,
    kind: "heatmap",
    data: table([f("risk", "Tranche at risk a night", "pct"), f("q", "True loss rate per name", "pct2"), f("growth", "Log growth per season", "pct1"), f("label", "Label")], gridRows),
    mark: "bar",
    x: { field: "q" },
    y: { field: "risk" },
    series: [],
    heat: { xField: "q", yField: "risk", valueField: "growth", labelField: "label", palette: "diverging", center: 0, format: "pct1", cellLabels: true, highlight: { x: Math.round(p.lossRate * 1e5) / 1e5, y: Math.round(p.riskPerNight * 100) / 100 } },
    height: Math.max(240, 30 * riskList.length + 40),
  };

  // The same grid as curves, plus the curve averaged over the band you cannot rule out.
  const riskSweep = linspace(0.02, 1, 99);
  const sweepRates = [p.altLossRate, p.lossRate, d.breakEven];
  const sweepRows: Row[] = riskSweep.map((r) => {
    const row: Row = { risk: r };
    sweepRates.forEach((qq, i) => (row[`g${i}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome)));
    row.robust = robustSeasonLogGrowth(r, k, d.band, p.gain, n, p.sharedOutcome);
    return row;
  });
  const sweepMin = Math.max(-0.2, Math.min(...sweepRows.map((r) => Math.min(r.g0 as number, r.g1 as number, r.g2 as number, r.robust as number))));
  const robustRisk = Math.round(d.robust.risk * 100) / 100;
  const sweepStories: Story[] = [];
  if (!zero && Math.abs(robustRisk - p.riskPerNight) > 1e-9 && robustRisk > 0) {
    sweepStories.push({
      id: "robust",
      label: "I sit at the robust optimum",
      narrative: `${pct(robustRisk)} a night: ${signedPct1(robustSeasonLogGrowth(robustRisk, k, d.band, p.gain, n, p.sharedOutcome))} a season averaged over the band, ${signedPct1(seasonLogGrowth(robustRisk, k, p.lossRate, p.gain, n, p.sharedOutcome))} at the deck's rate.`,
      params: { riskPerNight: robustRisk },
      badge: movesDeck("at risk a night", pct(p.riskPerNight), pct(robustRisk)),
    });
  }
  if (Math.abs(p.lossRate - 0.032) > 5e-5) {
    sweepStories.push({
      id: "worse",
      label: "What if q is really 3.2%?",
      narrative: `At your ${pct(p.riskPerNight)} a night the log growth of surviving paths is ${signedPct1(seasonLogGrowth(p.riskPerNight, k, 0.032, p.gain, n, p.sharedOutcome))} a season instead of ${signedPct1(d.growthYours)}.`,
      params: { lossRate: 0.032, market: "custom" },
      badge: movesDeck("q", pct2(p.lossRate), "3.20%"),
    });
  }
  if (!zero) {
    sweepStories.push({
      id: "be",
      label: "The chain is right: q = break-even",
      narrative: "At zero premium the growth-optimal risk is 0; every curve sits at or below zero, and sizing only changes the median, P(below threshold) and ruin.",
      params: { lossRate: d.breakEven, market: "fair" },
      badge: movesDeck("q", pct2(p.lossRate), pct2(d.breakEven)),
    });
  }
  const sweep: ChartSpec = {
    id: "chain-sweep",
    title: "Growth averaged over the loss-rate band",
    subtitle: `x tranche at risk a night · y log growth per season of surviving paths · green = optimistic q · black = deck q · red = break-even q · thick = averaged over a loss rate drawn ${d.bandLabel} · violet line = your risk`,
    kind: "xy",
    data: table(
      [f("risk", "Tranche at risk a night", "pct"), ...sweepRates.map((qq, i) => f(`g${i}`, `q = ${pct2(qq)}`, "pct1")), f("robust", "averaged over the band", "pct1")],
      sweepRows,
    ),
    mark: "line",
    x: { field: "risk", format: "pct", domain: [0, 1] },
    y: { field: "robust", label: "Log growth per season", format: "pct", domain: [Math.floor(sweepMin * 20) / 20, null], zero: false },
    series: [
      { field: "g0", color: "good", label: `optimistic q = ${pct2(sweepRates[0])}` },
      { field: "g1", color: "ink", label: `deck q = ${pct2(sweepRates[1])}`, dash: true },
      { field: "g2", color: "loss", label: `break-even q = ${pct2(sweepRates[2])}` },
      { field: "robust", color: "ink", label: "averaged over the band", emphasis: "strong" },
    ],
    height: 320,
    annotations: [
      { kind: "hline", y: 0, text: "no growth", color: "muted", at: "end" },
      ...(d.robust.risk > 0 ? [{ kind: "point" as const, x: d.robust.risk, y: d.robust.growth, text: `robust optimum ${pct(d.robust.risk)}`, color: "ink" as const, at: (d.robust.risk <= d.nightKelly.risk ? "start" : "end") as "start" | "end" }] : []),
      ...(d.nightKelly.risk > 0 ? [{ kind: "point" as const, x: d.nightKelly.risk, y: d.nightKelly.growth, text: `growth-optimal at the deck's rate ${pct(d.nightKelly.risk)}`, color: "ink" as const, at: (d.robust.risk <= d.nightKelly.risk ? "end" : "start") as "start" | "end" }] : []),
      { kind: "vline", x: p.riskPerNight, text: `your risk a night ${pct(p.riskPerNight)}`, color: "c", at: "start" },
    ],
    stories: sweepStories,
  };

  // Mean, median and the 25–75% band by number of seasons chained.
  const snaps = Array.from({ length: S }, (_, i) => (i + 1) * n);
  const curves = Object.fromEntries(
    (["spread", "reserve"] as PolicyId[]).map((id) => [
      id,
      binnedDistributions([{ nights: S * n, policy: P[id].policy }], snaps).map((dist) => ({ ...summarize(dist, p.thresholdBelow), p25: weightedQuantile(dist.outcomes, 0.25), p75: weightedQuantile(dist.outcomes, 0.75) })),
    ]),
  ) as Record<"spread" | "reserve", (ReturnType<typeof summarize> & { p25: number; p75: number })[]>;
  const seasonRows: Row[] = [];
  for (let s = 1; s <= S; s++) {
    const pCoin = Math.pow(d.pClean, s);
    const cs = curves.spread[s - 1];
    const cr = curves.reserve[s - 1];
    seasonRows.push({
      seasons: s,
      meanCoin: pCoin * Math.pow(d.cleanEnd, s),
      medianCoin: pCoin >= 0.5 ? Math.pow(d.cleanEnd, s) : 0,
      meanSpread: cs.mean,
      medianSpread: cs.median,
      p25Spread: cs.p25,
      p75Spread: cs.p75,
      meanReserve: cr.mean,
      medianReserve: cr.median,
      p25Reserve: cr.p25,
      p75Reserve: cr.p75,
    });
  }
  const curveStories: Story[] = [];
  if (N !== 8) {
    const c8s = curves.spread[7];
    const c8r = curves.reserve[7];
    curveStories.push({
      id: "eight",
      label: "What if I chain eight seasons?",
      narrative: `Median after 8: ${P.spread.name} ${x2(c8s.median)}, ${P.reserve.name} ${x2(c8r.median)}; means ${x2(c8s.mean)} and ${x2(c8r.mean)}, carried by fewer paths each season.`,
      params: { seasons: 8 },
      badge: movesDeck("seasons chained", `${N}`, "8"),
    });
  }
  const growthChart: ChartSpec = {
    id: "chain-curve",
    title: "Mean and median as seasons are chained",
    subtitle: `x seasons chained · y tranche after that many seasons · solid steps = median · dashed = mean · band = 25th to 75th percentile of ${P.reserve.name} · line = the deck's ${N} season${N === 1 ? "" : "s"}`,
    kind: "xy",
    data: table(
      [
        f("seasons", "Seasons chained", "int"),
        f("meanCoin", `${P.coin.label}, mean`, "x"),
        f("medianCoin", `${P.coin.label}, median`, "x"),
        f("meanSpread", `${P.spread.label}, mean`, "x"),
        f("medianSpread", `${P.spread.label}, median`, "x"),
        f("p25Spread", `${P.spread.label}, 25th percentile`, "x"),
        f("p75Spread", `${P.spread.label}, 75th percentile`, "x"),
        f("meanReserve", `${P.reserve.label}, mean`, "x"),
        f("medianReserve", `${P.reserve.label}, median`, "x"),
        f("p25Reserve", `${P.reserve.label}, 25th percentile`, "x"),
        f("p75Reserve", `${P.reserve.label}, 75th percentile`, "x"),
      ],
      seasonRows,
    ),
    mark: "step",
    x: { field: "seasons", domain: [1, S] },
    y: { field: "medianReserve", label: "Tranche after N seasons", format: "x" },
    series: [
      { field: "p75Reserve", color: "c", label: `${P.reserve.name}, 25th to 75th percentile`, emphasis: "muted", band: "p25Reserve", width: 1 },
      { field: "p25Reserve", color: "c", label: `${P.reserve.name}, 25th percentile`, emphasis: "muted", legend: false, width: 1 },
      { field: "meanSpread", color: "b", label: `${P.spread.name}, mean`, dash: true },
      { field: "medianSpread", color: "b", label: `${P.spread.name}, median`, emphasis: "strong" },
      { field: "meanReserve", color: "c", label: `${P.reserve.name}, mean`, dash: true },
      { field: "medianReserve", color: "c", label: `${P.reserve.name}, median`, emphasis: "strong" },
    ],
    height: 300,
    annotations: [
      { kind: "vline", x: N, text: `${N} season${N === 1 ? "" : "s"}`, color: "ink", at: "start" },
      { kind: "hline", y: 1, text: "start", color: "muted", at: "start" },
    ],
    stories: curveStories,
  };

  // Distribution after N seasons on log bins.
  const lo = 0.02;
  const hiEnd = Math.max(3, Math.pow(d.cleanEnd, N) * 1.1);
  const bins = 36;
  const hists = Object.fromEntries(ids.map((id) => [id, logHistogram(d.chained[id].dist, lo, hiEnd, bins)])) as Record<PolicyId, ReturnType<typeof logHistogram>>;
  const histRows: Row[] = hists.coin.bins.map((bn, i) => ({ mid: bn.mid, coin: hists.coin.bins[i].prob, spread: hists.spread.bins[i].prob, reserve: hists.reserve.bins[i].prob }));
  const endDist: ChartSpec = {
    id: "chain-dist",
    title: `Where the tranche stands after ${N} season${N === 1 ? "" : "s"}`,
    subtitle: `x tranche after ${N} season${N === 1 ? "" : "s"} (log) · y probability per log bin · one bar series per policy · ${methodLabel(d.chained[d.yours].dist.method)} · ruin mass off the chart: ${P.coin.name} ${smallPct(hists.coin.zeroMass)}, ${P.spread.name} ${smallPct(hists.spread.zeroMass)}, ${P.reserve.name} ${smallPct(hists.reserve.zeroMass)} · red line = threshold`,
    kind: "xy",
    data: table([f("mid", "Tranche after N seasons", "x"), ...ids.map((id) => f(id, P[id].label, "pct1"))], histRows),
    mark: "bar",
    x: { field: "mid", scale: "log", format: "x", domain: [lo, hiEnd] },
    y: { field: "spread", label: "Probability per bin", format: "pct" },
    series: [
      { field: "coin", color: "a", label: P.coin.label },
      { field: "spread", color: "b", label: P.spread.label },
      { field: "reserve", color: "c", label: P.reserve.label, emphasis: "strong" },
    ],
    barWidthPx: 5,
    height: 300,
    annotations: [
      { kind: "vline", x: 1, text: "start", color: "muted", at: "start" },
      { kind: "vline", x: p.thresholdBelow, text: `below ${x2(p.thresholdBelow)}`, color: "loss", at: "start" },
      { kind: "vline", x: sYours.median, text: `median, ${yours.name} ${x2(sYours.median)}`, color: "c", dash: false },
    ],
  };

  const paths = samplePaths([{ nights: N * n, policy: yours.policy }], p.fanPaths, p.seed + 303);
  const fanRows: Row[] = [];
  for (let t = 0; t <= N * n; t++) {
    const r: Row = { night: t };
    paths.forEach((path, i) => (r[`p${i}`] = path[t]));
    fanRows.push(r);
  }
  const fanSeries: SeriesSpec[] = paths.map((_, i) => ({ field: `p${i}`, label: `path ${i + 1}`, color: "c", emphasis: "muted", legend: false, width: 1.2 }));
  const fan: ChartSpec = {
    id: "chain-fan",
    title: `Railroad over ${N} season${N === 1 ? "" : "s"}, ${yours.label}`,
    subtitle: `x night · y tranche, start = 1 · ${p.fanPaths} sampled paths · vertical lines = season boundaries · line = median after ${N} season${N === 1 ? "" : "s"}`,
    kind: "xy",
    data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Path ${i + 1}`, "x"))], fanRows),
    mark: "step",
    x: { field: "night", domain: [0, N * n] },
    y: { field: "p0", label: "Tranche, start = 1", format: "x" },
    series: fanSeries,
    legend: false,
    height: 260,
    annotations: [
      ...Array.from({ length: N - 1 }, (_, i) => ({ kind: "vline" as const, x: (i + 1) * n, color: "muted" as const, text: `season ${i + 2}`, at: "start" as const })),
      { kind: "hline", y: sYours.median, text: `median ${x2(sYours.median)}`, color: "c", dash: false, at: "end" },
    ],
  };

  const policyTbl = tableSpec({
    id: "chain-table",
    title: `${N} season${N === 1 ? "" : "s"} chained, same per-name loss rate`,
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("p10", "10th percentile", "x"), f("pBelow", `P(below ${x2(p.thresholdBelow)})`, "pct1"), f("pRuin", "P(ruin)", "pct2"), f("medianGrowth", "Median growth per season", "pct1")],
      ids.map((id) => {
        const s = d.chained[id].summary;
        return { policy: P[id].label, mean: s.mean, median: s.median, p10: s.p10, pBelow: s.pBelow, pRuin: s.pRuin, medianGrowth: medianGrowthPerSeason(s.median, N) };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median", emphasize: true }, { field: "p10" }, { field: "pBelow", color: "loss" }, { field: "pRuin", color: "loss" }, { field: "medianGrowth" }],
    caption: `Distributions ${methodLabel(d.chained[d.yours].dist.method)}. Median growth per season is median^(1/${N}) − 1.`,
  });

  const gridTbl = tableSpec({
    id: "chain-grid-table",
    title: "Log growth per season, as numbers",
    data: table(
      [f("risk", "At risk a night", "pct"), ...qList.map((qq) => f(`q${qq}`, pct2(qq), "pct1")), f("robust", "averaged over the band", "pct1")],
      riskList.map((r) => {
        const row: Row = { risk: r };
        for (const qq of qList) row[`q${qq}`] = seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome);
        row.robust = robustSeasonLogGrowth(r, k, d.band, p.gain, n, p.sharedOutcome);
        return row;
      }),
    ),
    columns: [{ field: "risk", emphasize: true }, ...qList.map((qq) => ({ field: `q${qq}` })), { field: "robust", emphasize: true }],
    highlightRow: { field: "risk", value: Math.round(p.riskPerNight * 100) / 100 },
    caption: "Columns are the true per-name loss rate; growth is E[log end | survive] per season. The last column averages over the band of rates you cannot rule out.",
  });

  const hitFactorFull = 1 + (1 / k) * ((k - 1) * p.gain - 1);
  const hitFactorYours = 1 + (p.riskPerNight / k) * ((k - 1) * p.gain - 1);
  const recoveryNights = hitFactorFull > 0 ? Math.ceil(Math.log(1 / hitFactorFull) / Math.log(1 + p.gain)) : NaN;
  const recovery =
    hitFactorFull > 0
      ? `One partial hit at full exposure costs about ${pct(1 - hitFactorFull)} of the tranche. Recovering takes +${pct(1 / hitFactorFull - 1)}, roughly ${recoveryNights} clean nights at +${pct1(p.gain)}. With ${k * n} name-events at ${pct2(p.lossRate)} you expect about ${typographic((k * n * p.lossRate).toFixed(1))} hits a season, which take back roughly ${Math.round(k * n * p.lossRate * recoveryNights)} of the season's ${n} nights.`
      : `With one name at full exposure a hit is not partial: it is the whole tranche, and there is nothing to recover from.`;
  const halfVsKelly = d.nightKelly.risk > 0 ? p.riskPerNight / d.nightKelly.risk : NaN;
  const medianGrowth = medianGrowthPerSeason(sYours.median, N);
  const seasonsWord = `${N} season${N === 1 ? "" : "s"}`;
  const expectedHits = 3 * 20 * 0.02945;

  // Quoted growth grid at the discussion's columns, with the deck's k, n and b.
  const gridFig = (qq: number, label: string, quotedText: string, quotedVals: number[]) => {
    const vals = [0.39, 0.5, 0.75, 1].map((r) => seasonLogGrowth(r, k, qq, p.gain, n, p.sharedOutcome));
    return fig(p, `Growth grid at ${label}: 39% / 50% / 75% / 100% a night`, quotedText, vals.map((v) => signedPct1(v)).join(" / "), vals.every((v, i) => near(quotedVals[i], v, 0.0011)), ["b", "n", "k", "c"]);
  };

  return {
    id: "chaining",
    number: 8,
    title: "Chained seasons",
    claim: "Over seasons the median becomes your number. Sit where growth stays best averaged over the loss rates you cannot rule out, not where it peaks at one rate.",
    lede: `${N} season${N === 1 ? "" : "s"} later, where does the tranche stand, and how much should a night risk?`,
    views: [
      { id: "sizing-grid", title: "How much to risk a night", blurb: "Growth per season by risk a night and true loss rate, and the curve averaged over the band of rates you cannot rule out.", charts: ["chain-heat", "chain-sweep", "chain-grid-table"], kpis: [0, 4, 5] },
      { id: "chained-outcomes", title: N === 1 ? "One season later" : `${SEASON_WORDS[N] ?? N} seasons later`, blurb: "Mean and median as seasons are chained, the distribution after N seasons, and sampled paths.", charts: ["chain-curve", "chain-dist", "chain-fan", "chain-table"], kpis: [1, 2, 3, 5] },
    ],
    kpis: [
      zero
        ? { label: "Robust risk a night", value: pct(d.robust.risk), sub: `peak of the averaged curve · at the deck's rate (zero premium) the growth-optimal risk is 0`, help: `Risk a night that maximises growth averaged over a loss rate drawn ${d.bandLabel}; the band still reaches the optimistic rate. ${d.market.sizingNote}` }
        : { label: "Robust risk a night", value: pct(d.robust.risk), sub: `peak of the averaged curve · growth-optimal at the deck's rate ${pct(d.nightKelly.risk)}`, help: `Risk a night that maximises growth averaged over a loss rate drawn ${d.bandLabel}. The deck's ${pct(p.riskPerNight)} is ${Number.isFinite(halfVsKelly) ? `${typographic(halfVsKelly.toFixed(2))}× the single-rate optimum` : "beyond any positive optimum"}.` },
      { label: `Median after ${seasonsWord}`, value: `${x2(sSpread.median)} → ${x2(sYours.median)}`, sub: `${P.spread.name} → ${yours.name}`, color: "c" },
      { label: `Mean after ${seasonsWord}`, value: `${x2(sSpread.mean)} → ${x2(sYours.mean)}`, sub: `${P.spread.name} → ${yours.name}` },
      { label: `P(below ${x2(p.thresholdBelow)})`, value: `${pct(sSpread.pBelow)} → ${pct(sYours.pBelow)}`, sub: `${P.spread.name} → ${yours.name}`, color: "loss" },
      { label: `Log growth of surviving paths, ${yours.name}`, value: signedPct1(d.growthYours), sub: `${pct(p.riskPerNight)} a night at the deck's q · ruin ${smallPct(d.ruinYours)} a season`, color: "c", help: "E[log end | the tranche survives] per season at the deck's loss rate and your risk a night. Read it next to the ruin probability." },
      { label: `Median growth per season, ${yours.name}`, value: signedPct1(medianGrowth), sub: `median after ${seasonsWord} ${x2(sYours.median)} → ^(1/${N}) − 1`, color: "c", help: "The rate the middle path compounds at: median_N^(1/N) − 1." },
    ],
    primary: [heat, sweep],
    secondary: [growthChart, endDist, fan],
    tables: [policyTbl, gridTbl],
    localParams: [],
    notes: [
      {
        title: "Which row to sit in",
        body: zero
          ? `${d.market.sizingNote} The grid shows it: in the break-even column every cell is at or below zero. ${d.robust.risk > 0 ? `The averaged curve still peaks at ${pct(d.robust.risk)} a night because the band reaches down to the optimistic rate ${pct2(p.altLossRate)}; that peak is a bet on the band, not on the deck's rate.` : "With the whole band at or past break-even the averaged curve has no positive peak either."}`
          : `Full exposure is never the best choice, even at the optimistic rate, and it turns sharply negative as soon as the true rate is a few tenths of a point worse. No row stays positive at break-even, because at break-even nothing grows. The rule used here is to maximise growth averaged over the loss rates you cannot rule out: with the band ${d.bandLabel}, that peak is ${pct(
              d.robust.risk,
            )} of the tranche a night. At the deck's rate alone the optimum is ${pct(d.nightKelly.risk)}, so the deck's ${pct(p.riskPerNight)} is ${Number.isFinite(halfVsKelly) ? `${typographic(halfVsKelly.toFixed(2))}× that` : "past any positive optimum"}: fractional Kelly only if the optimistic rate is closer to the truth than the deck's.\n\nIn tranche terms the share you do not risk each night is a reserve: a partial hit at ${pct(p.riskPerNight)} a night costs ${pct(1 - hitFactorYours)} of the tranche instead of ${pct(1 - Math.max(0, hitFactorFull))} at full exposure.`,
      },
      { title: "Recovering from one partial hit", body: recovery },
    ],
    sourceFigures: [
      fig(p, "Four seasons, 1 name all-in: mean / median / 10th pct / P(below 0.5) / ruin", "1.44 / 0 / 0 / 91% / 91%", `${x2(sCoin.mean)} / ${x2(sCoin.median)} / ${x2(sCoin.p10)} / ${pct(sCoin.pBelow)} / ${pct(sCoin.pRuin)}`, near(1.44, sCoin.mean, 0.006) && sCoin.median === 0 && near(0.91, sCoin.pRuin, 0.006), ["q", "b", "n", "N", "threshold"]),
      fig(p, "Four seasons, 3 names whole tranche: mean / median / 10th pct / P(below 0.5) / ruin", "1.44 / 0.92 / 0.18 / 31% / 0.2%", `${x2(sSpread.mean)} / ${x2(sSpread.median)} / ${x2(sSpread.p10)} / ${pct(sSpread.pBelow)} / ${pct1(sSpread.pRuin)}`, near(1.44, sSpread.mean, 0.006) && near(0.92, sSpread.median, 0.02) && near(0.18, sSpread.p10, 0.02) && near(0.31, sSpread.pBelow, 0.02) && near(0.002, sSpread.pRuin, 0.0006), ["q", "b", "n", "k", "N", "c", "threshold"]),
      fig(p, "Four seasons, 3 names half the tranche: mean / median / P(below 0.5) / ruin", "1.20 / 1.09 / 7% / ≈ 0", `${x2(sYours.mean)} / ${x2(sYours.median)} / ${pct(sYours.pBelow)} / ${smallPct(sYours.pRuin)}`, near(1.2, sYours.mean, 0.006) && near(1.09, sYours.median, 0.02) && near(0.07, sYours.pBelow, 0.011) && sYours.pRuin < 1e-4, ["q", "b", "n", "k", "risk", "N", "c", "threshold"]),
      fig(p, "Four seasons, 3 names half the tranche: 10th percentile", "0.57", x2(sYours.p10), near(0.57, sYours.p10, 0.02), ["q", "b", "n", "k", "risk", "N"], `Exact enumeration of the ${N * n}-night schedule puts the 10th percentile at ${x2(sYours.p10)}; the discussion's 0.57 is not reproduced by any engine here, while its other four figures are.`),
      fig(p, "Surviving coin paths after four seasons end at", "15.7×", x2(Math.pow(d.cleanEnd, 4)), near(15.7, Math.pow(d.cleanEnd, 4), 0.06), ["b", "n"]),
      fig(p, "One partial hit at full exposure: cost / recovery / clean nights", "31% / +45% / about 11", hitFactorFull > 0 ? `${pct(1 - hitFactorFull)} / +${pct(1 / hitFactorFull - 1)} / ${recoveryNights}` : "the whole tranche", hitFactorFull > 0 && near(0.31, 1 - hitFactorFull, 0.006) && near(0.45, 1 / hitFactorFull - 1, 0.006) && recoveryNights === 11, ["b", "k"]),
      fig(p, "Hits a season, 60 name-events at 2.94%", "about 1.8", typographic((k * n * p.lossRate).toFixed(1)), near(expectedHits, k * n * p.lossRate, 0.06), ["q", "n", "k"]),
      fig(p, "Log growth per season, 3 names at full exposure", "−4%", signedPct1(seasonLogGrowth(1, k, p.lossRate, p.gain, n, p.sharedOutcome)), near(-0.04, seasonLogGrowth(1, k, p.lossRate, p.gain, n, p.sharedOutcome), 0.006), ["q", "b", "n", "k", "c"]),
      fig(p, "The mean keeps rising per season", "about +10%", signedPct1(d.meanSeason - 1), near(0.1, d.meanSeason - 1, 0.011), ["q", "b", "n"]),
      gridFig(0.0252, "2.52%", "+5.5% / +6.5% / +7.4% / +6.5%", [0.055, 0.065, 0.074, 0.065]),
      gridFig(0.02945, "2.94%", "+1.9% / +1.7% / −0.1% / −4.1%", [0.019, 0.017, -0.001, -0.041]),
      gridFig(0.032, "3.20%", "−0.4% / −1.2% / −4.7% / −10.7%", [-0.004, -0.012, -0.047, -0.107]),
      fig(p, "Twice the optimal fraction gives roughly zero growth", "75% a night at 2.94%: −0.1%", signedPct1(seasonLogGrowth(0.75, k, 0.02945, p.gain, n, p.sharedOutcome)), near(-0.001, seasonLogGrowth(0.75, k, 0.02945, p.gain, n, p.sharedOutcome), 0.0011), ["b", "n", "k", "c"]),
    ],
  };
}
