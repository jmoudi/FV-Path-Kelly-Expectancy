import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec, type Story } from "@kit/charts/spec";
import { seasonLogGrowth, seasonRuin } from "@app/model/kelly";
import type { Datasets } from "@app/model/datasets";
import type { Params } from "@app/model/params";
import { POLICY_IDS, type PolicyId } from "@app/model/policies";
import { samplePaths, scheduleDistribution, summarize, type Distribution } from "@app/model/season";
import { fig } from "@app/data/discussion";
import type { Derived } from "./derived";
import { movesDeck, near } from "@kit/charts/scenario";
import { pct, pct1, signedPct1, smallPct, x2 } from "@kit/charts/numbers";
import { typographic } from "@kit/charts/format";
import type { ScenarioView } from "./types";

export function buildDiversification(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids = POLICY_IDS;
  const P = d.byId;
  const k = d.k;
  const n = p.nights;
  const coin = d.season.coin.summary;
  const spread = d.season.spread.summary;
  const hi = Math.ceil(Math.max(d.cleanEnd * 1.05, 1.2) * 4) / 4;
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };

  // Half the nights single-name: whole tranche on the lone name, or capped at 1/k.
  const halfSingle = Math.round(0.5 * n);
  const halfMulti = n - halfSingle;
  const halfFullDist = scheduleDistribution(
    [
      { nights: halfSingle, policy: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 } },
      { nights: halfMulti, policy: { ...base, names: k, riskPerName: 1 / k } },
    ],
    d.opts,
  );
  const halfCappedDist = scheduleDistribution(
    [
      { nights: halfSingle, policy: { ...base, names: 1, riskPerName: 1 / k, sharedOutcome: 0 } },
      { nights: halfMulti, policy: { ...base, names: k, riskPerName: 1 / k } },
    ],
    d.opts,
  );
  const halfFull = summarize(halfFullDist, p.thresholdBelow);
  const halfCapped = summarize(halfCappedDist, p.thresholdBelow);

  // Cumulative distribution of the season end: one row per distinct outcome.
  const dists: Record<string, Distribution> = { coin: d.season.coin.dist, spread: d.season.spread.dist, reserve: d.season.reserve.dist, halfFull: halfFullDist, halfCapped: halfCappedDist };
  const cols = Object.keys(dists);
  const values = new Set<number>();
  for (const c of cols) for (const o of dists[c].outcomes) values.add(Math.min(hi, Math.round(o.value * 1e6) / 1e6));
  const grid = [...values].sort((a, b) => a - b);
  const cdfRows: Row[] = [];
  const cursors = Object.fromEntries(cols.map((c) => [c, { i: 0, acc: 0 }])) as Record<string, { i: number; acc: number }>;
  for (const v of grid) {
    const r: Row = { end: v };
    for (const c of cols) {
      const outs = dists[c].outcomes;
      const cur = cursors[c];
      while (cur.i < outs.length && outs[cur.i].value <= v + 1e-9) cur.acc += outs[cur.i++].prob;
      r[c] = Math.min(1, cur.acc);
    }
    cdfRows.push(r);
  }
  const shapeStories: Story[] = [
    {
      id: "half",
      label: "Half my nights have one name",
      narrative: `Whole tranche on the lone name: ruin ${pct1(halfFull.pRuin)}, mean ${x2(halfFull.mean)}. Capped at 1/${k} of the tranche: ruin ${smallPct(halfCapped.pRuin)}, mean ${x2(halfCapped.mean)}.`,
      patch: { extraSeries: [{ field: "halfFull", color: "ramp1" }, { field: "halfCapped", color: "ramp3" }] },
    },
  ];
  if (k !== 6) {
    const six = summarize(scheduleDistribution([{ nights: n, policy: { ...base, names: 6, riskPerName: 1 / 6 } }], d.opts), p.thresholdBelow);
    shapeStories.push({
      id: "six",
      label: "What if it were six names a night?",
      narrative: `${P.spread.name} with six names: clean season ${pct1(six.pMax)}, median ${x2(six.median)}, P(below ${x2(p.thresholdBelow)}) ${pct(six.pBelow)}, ruin ${smallPct(six.pRuin)}.`,
      params: { names: 6 },
      badge: movesDeck("names a night", `${k}`, "6"),
    });
  }
  const shape: ChartSpec = {
    id: "div-shape",
    title: "Season end, cumulative",
    subtitle: "x season end, tranche units · y share of seasons ending at or below",
    kind: "xy",
    data: table(
      [f("end", "Season end, tranche units", "x"), ...ids.map((id) => f(id, P[id].label, "pct1")), f("halfFull", "Half the nights one name, whole tranche on it", "pct1"), f("halfCapped", `Half the nights one name, capped at 1/${k}`, "pct1")],
      cdfRows,
    ),
    mark: "step",
    x: { field: "end", format: "x", domain: [0, hi] },
    y: { field: "spread", label: "P(season ends at or below)", format: "pct", domain: [0, 1] },
    series: [
      { field: "coin", color: "a", label: P.coin.label },
      { field: "spread", color: "b", label: P.spread.label, emphasis: "strong" },
      { field: "reserve", color: "c", label: P.reserve.label },
    ],
    height: 330,
    annotations: [
      { kind: "hline", y: 0.5, text: "median line", color: "muted", at: "end" },
      { kind: "vline", x: coin.mean, text: `mean, ${P.coin.name} and ${P.spread.name} ${x2(coin.mean)}`, color: "muted" },
      { kind: "vline", x: p.thresholdBelow, text: `below ${x2(p.thresholdBelow)}`, color: "muted", at: "start" },
    ],
    stories: shapeStories,
  };

  const fan = (id: PolicyId, seedOffset: number): ChartSpec => {
    const pol = P[id];
    const paths = samplePaths([{ nights: n, policy: pol.policy }], p.fanPaths, p.seed + seedOffset);
    const rows: Row[] = [];
    for (let t = 0; t <= n; t++) {
      const r: Row = { night: t };
      paths.forEach((path, i) => (r[`p${i}`] = path[t]));
      rows.push(r);
    }
    const series: SeriesSpec[] = paths.map((path, i) => ({ field: `p${i}`, label: `season ${i + 1}`, color: path[path.length - 1] > 0 ? pol.color : "loss", emphasis: "muted", legend: false, tooltip: false, width: 1.2 }));
    const s = d.season[id].summary;
    return {
      id: `div-fan-${id}`,
      title: `Railroad, ${pol.label}`,
      subtitle: `x night · y tranche, start = 1 · ${p.fanPaths} sampled seasons · red = ruined`,
      kind: "xy",
      data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Season ${i + 1}`, "x"))], rows),
      mark: "step",
      x: { field: "night", domain: [0, n] },
      y: { field: "p0", label: "Tranche, start = 1", domain: [0, hi], format: "x" },
      series,
      legend: false,
      height: 240,
      annotations: [{ kind: "hline", y: s.median, text: `median ${x2(s.median)}`, color: pol.color, dash: false, at: "start" }],
    };
  };

  // Names per game is the wrong measure: share of single-name nights.
  const shares: number[] = [];
  for (let s = 0; s <= 1.0001; s += 0.05) shares.push(Math.round(s * 100) / 100);
  const mixAll = shares.map((s) => {
    const single = Math.round(s * n);
    const multi = n - single;
    const full = summarize(
      scheduleDistribution(
        [
          { nights: single, policy: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 } },
          { nights: multi, policy: { ...base, names: k, riskPerName: 1 / k } },
        ],
        d.opts,
      ),
      p.thresholdBelow,
    );
    const capped = summarize(
      scheduleDistribution(
        [
          { nights: single, policy: { ...base, names: 1, riskPerName: 1 / k, sharedOutcome: 0 } },
          { nights: multi, policy: { ...base, names: k, riskPerName: 1 / k } },
        ],
        d.opts,
      ),
      p.thresholdBelow,
    );
    return { share: s, ruinFull: full.pRuin, ruinCapped: capped.pRuin, meanFull: full.mean, meanCapped: capped.mean, medianFull: full.median, medianCapped: capped.median };
  });
  // The chart's y axis is logarithmic, so an exact zero ruin is left out of the plot (the table keeps it).
  const mixRows: Row[] = mixAll.map((r) => ({ ...r, ruinFull: r.ruinFull > 0 ? r.ruinFull : null, ruinCapped: r.ruinCapped > 0 ? r.ruinCapped : null }));
  const mixTableRows: Row[] = mixAll.map((r) => ({ ...r }));
  const yourMix = mixAll.reduce((best, r) => (Math.abs(r.share - p.singleNameShare) < Math.abs(best.share - p.singleNameShare) ? r : best), mixAll[0]);
  const mix: ChartSpec = {
    id: "div-mix",
    title: "Ruin against single-name nights",
    subtitle: `x share of single-name nights · y P(ruin) per season (log)`,
    kind: "xy",
    data: table(
      [
        f("share", "Share of single-name nights", "pct"),
        f("ruinFull", "Rule 1: whole tranche on the lone name", "pct2"),
        f("ruinCapped", `Rule 2: capped at 1/${k} per name`, "pct3"),
        f("meanFull", "Mean, rule 1", "x"),
        f("meanCapped", "Mean, rule 2", "x"),
      ],
      mixRows,
    ),
    mark: "line",
    x: { field: "share", format: "pct", domain: [0, 1] },
    y: { field: "ruinFull", label: "P(ruin) per season", format: "pct", scale: "log", domain: [1e-5, 1] },
    series: [
      { field: "ruinFull", color: "ramp1", label: "Rule 1: whole tranche on the lone name" },
      { field: "ruinCapped", color: "ramp3", label: `Rule 2: capped at 1/${k} per name` },
    ],
    height: 260,
    annotations: [{ kind: "vline", x: p.singleNameShare, text: `your mix ${pct(p.singleNameShare)}`, color: "ink", at: "end" }],
    stories: [
      {
        id: "means",
        label: "What does the idle capacity cost?",
        narrative: `At your mix rule 2 gives up mean ${x2(yourMix.meanFull)} → ${x2(yourMix.meanCapped)} for ruin ${pct1(yourMix.ruinFull)} → ${smallPct(yourMix.ruinCapped)}.`,
        patch: { hiddenSeries: ["ruinFull", "ruinCapped"], extraSeries: [{ field: "meanFull", color: "ramp1" }, { field: "meanCapped", color: "ramp3" }], y: { label: "Mean season end", scale: "linear", domain: [0.9, 1.2] } },
      },
    ],
  };

  const policyTbl = tableSpec({
    id: "div-table",
    title: "One season under each policy",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("pBelow", `P(below ${x2(p.thresholdBelow)})`, "pct1"), f("pRuin", "P(ruin)", "pct3"), f("pMax", "Clean season", "pct1"), f("growth", "Log growth of surviving paths", "pct1")],
      ids.map((id) => {
        const s = d.season[id].summary;
        const pol = P[id].policy;
        return { policy: P[id].label, mean: s.mean, median: s.median, pBelow: s.pBelow, pRuin: s.pRuin, pMax: s.pMax, growth: seasonLogGrowth(pol.riskPerName * pol.names, pol.names, pol.lossRate, pol.gain, n, pol.sharedOutcome) };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "pBelow" }, { field: "pRuin", color: "loss" }, { field: "pMax" }, { field: "growth" }],
    caption: `Growth is E[log end | the tranche survives]; read it together with the ruin column. For the ${P.coin.name} the survivors compound at the full clean rate while ${pct(coin.pRuin)} of replays are gone.`,
  });

  const mixTbl = tableSpec({
    id: "div-mix-table",
    title: "Mixing single-name nights in",
    data: table(
      [f("share", "Single-name nights", "pct"), f("ruinFull", "Ruin, rule 1", "pct2"), f("meanFull", "Mean, rule 1", "x"), f("ruinCapped", "Ruin, rule 2", "pct3"), f("meanCapped", "Mean, rule 2", "x")],
      mixTableRows.filter((r) => Math.round((r.share as number) * 100) % 25 === 0 || r.share === yourMix.share),
    ),
    columns: [{ field: "share", emphasize: true }, { field: "ruinFull", color: "loss" }, { field: "meanFull" }, { field: "ruinCapped" }, { field: "meanCapped" }],
    highlightRow: { field: "share", value: yourMix.share },
    caption: "Rule 2 gives up mean on single-name nights and removes the full-tranche night; the highlighted row is your mix.",
  });

  const growthSpread = seasonLogGrowth(1, k, p.lossRate, p.gain, n, p.sharedOutcome);
  const ruinSpread = seasonRuin(1, k, p.lossRate, p.gain, n, p.sharedOutcome);
  const degenerate = d.degenerate.singleName ? ` With one name a night the ${P.spread.name} policy is the ${P.coin.name}; raise names a night in the deck to open the gap.` : "";

  // The typical Spread season with one or two partial hits on separate nights.
  const hitFactor = 1 + (1 / k) * ((k - 1) * p.gain - 1);
  const oneHit = hitFactor * Math.pow(1 + p.gain, n - 1) - 1;
  const twoHits = hitFactor * hitFactor * Math.pow(1 + p.gain, n - 2) - 1;
  const idleCost = halfFull.mean - halfCapped.mean;

  return {
    id: "diversification",
    number: 5,
    title: "Diversification",
    claim: "Spreading a night over names leaves the mean unchanged and changes survivability.",
    lede: `What does spreading a night over ${k} names buy, and what does it cost?${degenerate}`,
    views: [
      { id: "season-shape", title: "What spreading buys", blurb: "The cumulative distribution of one season under each policy, with sampled paths.", charts: ["div-shape", "div-fan-coin", "div-fan-spread", "div-table"], params: ["thresholdBelow"], kpis: [0, 1, 2, 3] },
      { id: "single-name-mix", title: "What single-name nights cost", blurb: "Ruin and mean as single-name nights are mixed in, under two sizing rules.", charts: ["div-mix", "div-mix-table"], params: ["singleNameShare"] },
    ],
    kpis: [
      { label: `Ruin, ${P.coin.name} → ${P.spread.name}`, value: `${pct(coin.pRuin)} → ${smallPct(spread.pRuin)}`, sub: "one season" },
      { label: `Median, ${P.coin.name} → ${P.spread.name}`, value: `${x2(coin.median)} → ${x2(spread.median)}`, sub: "mean unchanged" },
      { label: "Log growth of surviving paths", value: signedPct1(growthSpread), sub: `${P.spread.name} · ruin ${smallPct(ruinSpread)} a season`, help: "Expected log of the season end given the tranche survives. Always read next to the ruin probability; it is not the rate the median compounds at." },
      { label: `Clean seasons, ${P.spread.name}`, value: pct1(spread.pMax), sub: `${k * n} name-events must all win` },
    ],
    primary: [shape],
    secondary: [fan("coin", 101), fan("spread", 202), mix],
    tables: [policyTbl, mixTbl],
    localParams: ["singleNameShare", "thresholdBelow"],
    notes: [
      {
        title: "Same mean, less variance",
        body: "You replay the tranche. A single-name tranche survives s seasons with probability p^s, while the diversified one keeps compounding. Geometric growth is roughly the mean minus half the variance, and variance is what diversification removes without touching the mean. It is close to fee-neutral too: fees and spreads scale with contract count, and splitting across names does not change the count.",
      },
      {
        title: "The measure that matters",
        body: `A target ratio of names per game still leaves single-name games in the mix, and each of those carries the full tranche. Every full-size single-name game brings back the coin flip. What matters is max loss per name as a fraction of the tranche: cap it at 1/${k} and leave the rest idle on single-name evenings. The idle capacity costs mean (${x2(halfFull.mean)} → ${x2(halfCapped.mean)} with half the nights single-name) and removes the full-tranche night.`,
      },
    ],
    sourceFigures: [
      fig(p, "Median, 3 names ⅓ each", "0.88", x2(spread.median), near(0.88, spread.median, 0.006), ["q", "b", "n", "k", "c"]),
      fig(p, "P(below 0.5), 3 names", "12%", pct1(spread.pBelow), near(0.12, spread.pBelow, 0.006), ["q", "b", "n", "k", "c", "threshold"]),
      fig(p, "Clean season, 1 → 3 names", "55% → 17%", `${pct(d.pClean)} → ${pct(spread.pMax)}`, near(0.55, d.pClean, 0.006) && near(0.17, spread.pMax, 0.006), ["q", "n", "k"]),
      fig(p, "Typical season: one or two partial hits", "+33% or −12%", `${signedPct1(oneHit)} or ${signedPct1(twoHits)}`, near(0.33, oneHit, 0.006) && near(-0.12, twoHits, 0.006), ["b", "n", "k"]),
      fig(p, "Ruin, half the games single-name at the full tranche", "26%", pct1(halfFull.pRuin), near(0.26, halfFull.pRuin, 0.006), ["q", "b", "n", "k", "c"]),
      fig(p, "Ruin with the lone name capped at ⅓", "0.03%", smallPct(halfCapped.pRuin), near(0.0003, halfCapped.pRuin, 0.00006), ["q", "b", "n", "k", "c"]),
      fig(p, "Mean with the lone name capped at ⅓", "1.06", x2(halfCapped.mean), near(1.06, halfCapped.mean, 0.006), ["q", "b", "n", "k"]),
      fig(p, "Cost of the idle capacity", "0.04", typographic(idleCost.toFixed(2)), near(0.04, idleCost, 0.006), ["q", "b", "n", "k"], "The discussion subtracted the rounded means, 1.10 − 1.06; the unrounded difference is 0.03."),
    ],
  };
}
