import { f, table, tableSpec, type ChartSpec, type Row, type SeriesSpec } from "../../charts/spec";
import { seasonLogGrowth, seasonRuin } from "../../model/kelly";
import type { Datasets, Params } from "../../model/params";
import type { PolicyId } from "../../model/policies";
import { samplePaths, scheduleDistribution, summarize } from "../../model/season";
import { methodLabel, pct, pct1, signedPct1, smallPct, x2, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildDiversification(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const ids: PolicyId[] = ["A", "B", "C"];
  const k = d.k;
  const A = d.season.A.summary;
  const B = d.season.B.summary;
  const hi = Math.ceil(Math.max(d.cleanEnd * 1.05, 1.2) * 4) / 4;

  // Cumulative distribution of the season end: one row per distinct outcome.
  const values = new Set<number>();
  for (const id of ids) for (const o of d.season[id].dist.outcomes) values.add(Math.min(hi, Math.round(o.value * 1e6) / 1e6));
  const grid = [...values].sort((a, b) => a - b);
  const cdfRows: Row[] = [];
  const cursors: Record<PolicyId, { i: number; acc: number }> = { A: { i: 0, acc: 0 }, B: { i: 0, acc: 0 }, C: { i: 0, acc: 0 } };
  for (const v of grid) {
    const r: Row = { end: v };
    for (const id of ids) {
      const outs = d.season[id].dist.outcomes;
      const c = cursors[id];
      while (c.i < outs.length && outs[c.i].value <= v + 1e-9) c.acc += outs[c.i++].prob;
      r[id] = Math.min(1, c.acc);
    }
    cdfRows.push(r);
  }
  const shape: ChartSpec = {
    id: "div-shape",
    title: "Season end, cumulative",
    subtitle: `Share of seasons ending at or below each value (${methodLabel(d.season.B.dist.method)}).`,
    kind: "xy",
    data: table([f("end", "Season end, tranche units", "x"), ...ids.map((id) => f(id, d.byId[id].label, "pct1"))], cdfRows),
    mark: "step",
    x: { field: "end", format: "x", domain: [0, hi] },
    y: { field: "B", label: "P(season ends at or below)", format: "pct", domain: [0, 1] },
    series: [
      { field: "A", color: "a", label: d.byId.A.label },
      { field: "B", color: "b", label: d.byId.B.label, emphasis: "strong" },
      { field: "C", color: "c", label: d.byId.C.label },
    ],
    height: 330,
    annotations: [
      { kind: "hline", y: 0.5, text: "median line", color: "muted", at: "end" },
      { kind: "vline", x: A.mean, text: `mean of A and B ${A.mean.toFixed(2)}×`, color: "ink" },
      { kind: "vline", x: p.thresholdBelow, text: `below ${p.thresholdBelow.toFixed(2)}×`, color: "loss", at: "start" },
    ],
    stories: [
      { id: "ab", label: "Only the coin against the diversified tranche", patch: { hiddenSeries: ["C"] } },
      { id: "tail", label: "Zoom on the bad seasons", narrative: "How much mass sits below the drawdown threshold.", patch: { x: { domain: [0, 1] }, y: { domain: [0, 0.5] } } },
      { id: "six", label: "What if it were six names a night?", narrative: "More names per night, same risk per night.", params: { names: 6 } },
    ],
  };

  const fan = (id: PolicyId, seedOffset: number): ChartSpec => {
    const pol = d.byId[id];
    const paths = samplePaths([{ nights: p.nights, policy: pol.policy }], p.fanPaths, p.seed + seedOffset);
    const rows: Row[] = [];
    for (let t = 0; t <= p.nights; t++) {
      const r: Row = { night: t };
      paths.forEach((path, i) => (r[`p${i}`] = path[t]));
      rows.push(r);
    }
    const series: SeriesSpec[] = paths.map((path, i) => ({ field: `p${i}`, label: `season ${i + 1}`, color: path[path.length - 1] > 0 ? pol.color : "loss", emphasis: "muted", legend: false, width: 1.2 }));
    const s = d.season[id].summary;
    return {
      id: `div-fan-${id}`,
      title: `Railroad, ${pol.label}`,
      subtitle: `${p.fanPaths} sampled seasons. Median ${s.median.toFixed(2)}×, mean ${s.mean.toFixed(2)}×.`,
      kind: "xy",
      data: table([f("night", "Night", "int"), ...paths.map((_, i) => f(`p${i}`, `Season ${i + 1}`, "x"))], rows),
      mark: "step",
      x: { field: "night", domain: [0, p.nights] },
      y: { field: "p0", label: "Tranche, start = 1", domain: [0, hi], format: "x" },
      series,
      legend: false,
      height: 240,
      annotations: [{ kind: "hline", y: s.median, text: `median ${s.median.toFixed(2)}×`, color: pol.color, dash: false, at: "start" }],
    };
  };

  // Names per game is the wrong measure: share of single-name nights.
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };
  const shares: number[] = [];
  for (let s = 0; s <= 1.0001; s += 0.05) shares.push(Math.round(s * 100) / 100);
  const mixRows: Row[] = shares.map((s) => {
    const single = Math.round(s * p.nights);
    const multi = p.nights - single;
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
  const mix: ChartSpec = {
    id: "div-mix",
    title: "Ruin against single-name nights",
    subtitle: `Rule 1 puts the whole tranche on the lone name; rule 2 caps every name at 1/${k} of the tranche and leaves the rest idle.`,
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
    y: { field: "ruinFull", label: "P(ruin) per season", format: "pct" },
    series: [
      { field: "ruinFull", color: "ramp1", label: "Rule 1: whole tranche on the lone name" },
      { field: "ruinCapped", color: "ramp3", label: `Rule 2: capped at 1/${k} per name` },
    ],
    height: 260,
    annotations: [{ kind: "vline", x: p.singleNameShare, text: `your mix ${pct(p.singleNameShare)}`, color: "ink", at: "end" }],
    stories: [
      { id: "logy", label: "Log ruin axis", patch: { y: { scale: "log", domain: [1e-5, 1] } } },
      {
        id: "means",
        label: "Show the means instead",
        narrative: "The idle capacity on single-name nights costs a little mean.",
        patch: { hiddenSeries: ["ruinFull", "ruinCapped"], extraSeries: [{ field: "meanFull", color: "ramp1" }, { field: "meanCapped", color: "ramp3" }], y: { label: "Mean season end", scale: "linear", domain: [0.9, 1.2] } },
      },
    ],
  };

  const policyTbl = tableSpec({
    id: "div-table",
    title: "One season under each policy",
    data: table(
      [f("policy", "Policy"), f("mean", "Mean", "x"), f("median", "Median", "x"), f("pBelow", `P(below ${p.thresholdBelow.toFixed(2)}×)`, "pct1"), f("pRuin", "P(ruin)", "pct3"), f("pMax", "Clean season", "pct1"), f("growth", "Growth per season, surviving paths", "pct1")],
      ids.map((id) => {
        const s = d.season[id].summary;
        const pol = d.byId[id].policy;
        return { policy: d.byId[id].label, mean: s.mean, median: s.median, pBelow: s.pBelow, pRuin: s.pRuin, pMax: s.pMax, growth: seasonLogGrowth(pol.riskPerName * pol.names, pol.names, pol.lossRate, pol.gain, p.nights, pol.sharedOutcome) };
      }),
    ),
    columns: [{ field: "policy", emphasize: true }, { field: "mean" }, { field: "median" }, { field: "pBelow" }, { field: "pRuin", color: "loss" }, { field: "pMax" }, { field: "growth" }],
    caption: "Growth is E[log end | the tranche survives]; read it together with the ruin column. For the coin, the survivors compound at the full clean rate while 45% of replays are gone.",
  });

  const mixRow = mixRows.reduce((best, r) => (Math.abs((r.share as number) - p.singleNameShare) < Math.abs((best.share as number) - p.singleNameShare) ? r : best), mixRows[0]);
  const mixTbl = tableSpec({
    id: "div-mix-table",
    title: "Mixing single-name nights in",
    data: table(
      [f("share", "Single-name nights", "pct"), f("ruinFull", "Ruin, rule 1", "pct2"), f("meanFull", "Mean, rule 1", "x"), f("ruinCapped", "Ruin, rule 2", "pct3"), f("meanCapped", "Mean, rule 2", "x")],
      mixRows.filter((r) => Math.round((r.share as number) * 100) % 25 === 0 || r === mixRow),
    ),
    columns: [{ field: "share", emphasize: true }, { field: "ruinFull", color: "loss" }, { field: "meanFull" }, { field: "ruinCapped" }, { field: "meanCapped" }],
    highlightRow: { field: "share", value: mixRow.share },
    caption: "The idle capacity on single-name nights costs a little mean. That is the price of removing the coin flip.",
  });

  const growthB = seasonLogGrowth(1, k, p.lossRate, p.gain, p.nights, p.sharedOutcome);
  const ruinB = seasonRuin(1, k, p.lossRate, p.gain, p.nights, p.sharedOutcome);
  const degenerate = d.degenerate.singleName ? " With one name per night the diversified policy is the coin; raise names per night in the deck to open the gap." : "";

  return {
    id: "diversification",
    number: 5,
    title: "Diversification",
    claim: "Spreading a night over names leaves the mean alone and changes everything else: the free lunch is survivability, not a better typical season.",
    lede: `One season under the coin, ${k} names on the whole tranche, and ${k} names with a reserve; then what mixing single-name nights back in does to ruin.${degenerate}`,
    views: [
      { id: "season-shape", title: "Season shape", blurb: "The cumulative distribution of one season under each policy, with sampled paths.", charts: ["div-shape", "div-fan-A", "div-fan-B", "div-table"], params: ["thresholdBelow"], kpis: [0, 1, 2, 3] },
      { id: "single-name-mix", title: "Single-name nights", blurb: "Ruin and mean as single-name nights are mixed in, under two sizing rules.", charts: ["div-mix", "div-mix-table"], params: ["singleNameShare"] },
    ],
    kpis: [
      { label: "Ruin, coin → diversified", value: `${pct(A.pRuin)} → ${smallPct(B.pRuin)}`, sub: "one season", color: "b" },
      { label: "Median, coin → diversified", value: `${x2(A.median)} → ${x2(B.median)}`, sub: "mean unchanged" },
      { label: "Growth per season, surviving paths", value: signedPct1(growthB), sub: `whole tranche over ${k} names · ruin ${smallPct(ruinB)}`, help: "Expected log of the season end given the tranche survives, the rate the median compounds at. Always read next to the ruin probability." },
      { label: "Clean seasons, diversified", value: pct1(B.pMax), sub: `${k * p.nights} name-events must all win` },
    ],
    primary: [shape],
    secondary: [fan("A", 101), fan("B", 202), mix],
    tables: [policyTbl, mixTbl],
    localParams: ["singleNameShare", "thresholdBelow"],
    notes: [
      {
        title: "Why it is still a free lunch",
        body: "You replay the tranche. A single-name tranche survives s seasons with probability p^s, while the diversified one keeps compounding. Geometric growth is roughly the mean minus half the variance, and variance is what diversification removes without touching the mean. It is close to fee-neutral too: fees and spreads scale with contract count, and splitting across names does not change the count.",
      },
      {
        title: "The measure that matters",
        body: `A target ratio of names per game still leaves single-name games in the mix, and each of those carries the full tranche. Every full-size single-name game brings back the coin flip. What matters is max loss per name as a fraction of the tranche: cap it at 1/${k} and leave the rest idle on single-name evenings. The idle capacity costs a little mean, which is cheap for what it buys.`,
      },
    ],
    sourceFigures: [
      { label: "Median, 3 names ⅓ each", quoted: "0.88", computed: x2(B.median) },
      { label: "P(below 0.5), 3 names", quoted: "12%", computed: pct1(B.pBelow) },
      { label: "Ruin, half the games single-name at full tranche", quoted: "26%", computed: pct1(mixRows.find((r) => r.share === 0.5)?.ruinFull as number) },
      { label: "Ruin with cap at ⅓", quoted: "0.03%", computed: smallPct(mixRows.find((r) => r.share === 0.5)?.ruinCapped as number) },
      { label: "Mean with cap at ⅓", quoted: "1.06", computed: x2(mixRows.find((r) => r.share === 0.5)?.meanCapped as number) },
    ],
  };
}
