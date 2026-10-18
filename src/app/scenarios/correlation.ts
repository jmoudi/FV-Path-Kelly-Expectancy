import { f, table, tableSpec, type ChartSpec, type Row, type Story } from "@kit/charts/spec";
import { breachBeyond, crossoverSharedOutcome, jointLossProb, ruinPerSeason, ruinWithShock, shockedLossRate } from "@app/model/correlation";
import type { Datasets } from "@app/data/datasets";
import type { Params } from "@app/data/params";
import { linspace, logspace } from "@kit/math/stats";
import { fig } from "@app/data/discussion";
import { movesDeck, near } from "@kit/charts/scenario";
import { pct, pct1, pct2, ratio, smallPct } from "@kit/charts/numbers";
import { typographic } from "@kit/charts/format";
import type { Derived } from "./derived";
import type { ScenarioView } from "./types";

function power(k: number): string {
  return k === 1 ? "" : k === 2 ? "²" : k === 3 ? "³" : `^${k}`;
}

export function buildCorrelation(p: Params, d: Derived, _data: Datasets): ScenarioView {
  const k = d.k;
  const q = p.lossRate;
  const n = p.nights;
  const c = p.sharedOutcome;
  const cross = crossoverSharedOutcome(q, k);
  const pIndep = jointLossProb(q, k, 0);
  const pJoint = jointLossProb(q, k, c);
  const ruinIndep = ruinPerSeason(pIndep, n);
  const ruinJoint = ruinPerSeason(pJoint, n);
  const single = k === 1;
  const atZero = c <= 1e-12;
  // At c = 0 the "your c" comparison is empty; show the discussion's 2% case instead.
  const cRef = atZero ? 0.02 : c;
  const pRef = jointLossProb(q, k, cRef);
  const ruinRef = ruinPerSeason(pRef, n);
  const refLabel = atZero ? "independent → at c = 2%" : `independent → your c ${pct2(c)}`;

  const cs = logspace(1e-5, 0.3, 120);
  const cRows: Row[] = cs.map((cc) => ({ c: cc, joint: jointLossProb(q, k, cc), ruin: ruinPerSeason(jointLossProb(q, k, cc), n), indep: ruinIndep }));
  const curveStories: Story[] = [];
  // Offered at any c (also once applied, so it stays pressed after a reload); with one name a night there is nothing to share.
  if (!single) {
    const ruin5 = ruinPerSeason(jointLossProb(q, k, 0.05), n);
    curveStories.push({
      id: "five",
      label: "Two names share a cause on 5% of nights",
      narrative: `On those nights all ${k} names share one outcome: ruin per season ${smallPct(ruinIndep)} → ${pct1(ruin5)}. The shared term c·q is ${typographic(((0.05 * q) / Math.pow(q, k)).toFixed(0))}× the independent q${power(k)}.`,
      params: { sharedOutcome: 0.05 },
      badge: movesDeck("shared-cause nights", pct(c), "5%"),
    });
  }
  const curve: ChartSpec = {
    id: "cor-curve",
    title: "Season ruin against how often the names share a cause",
    subtitle: single
      ? "x share of nights with one shared cause (log) · y P(ruin) per season, whole tranche (log) · with one name a night there is nothing to share, so the joint loss is q itself"
      : `x share of nights with one shared cause, c (log) · y P(ruin) per season, whole tranche (log)`,
    kind: "xy",
    data: table([f("c", "Share of nights with one shared cause, c", "pct2"), f("ruin", "Ruin per season, whole tranche", "pct2"), f("indep", "Ruin if independent", "pct3"), f("joint", "Joint loss per night", "pct3")], cRows),
    mark: "line",
    x: { field: "c", scale: "log", format: "pct2", domain: [1e-5, 0.3] },
    y: { field: "ruin", scale: "log", format: "pct1", label: "P(ruin) per season" },
    series: [
      { field: "ruin", color: "loss", label: "With shared causes", emphasis: "strong" },
      { field: "indep", color: "muted", label: "Independent names", dash: true },
    ],
    height: 320,
    annotations: [
      ...(single ? [] : [{ kind: "vline" as const, x: cross, text: `c = q${power(k - 1)} = ${smallPct(cross)}: shared cause takes over`, color: "muted" as const, at: "start" as const }]),
      { kind: "point", x: Math.max(c, 1e-5), y: ruinJoint, text: `your c ${pct2(c)}: ruin ${smallPct(ruinJoint)}`, color: "ink", at: "end" },
    ],
    stories: curveStories,
  };

  const steps = [0, 0.02, 0.05, 0.2];
  const stepRows: Row[] = steps.map((cc) => ({ c: `${(cc * 100).toFixed(0)}%`, ruin: ruinPerSeason(jointLossProb(q, k, cc), n) }));
  const bars: ChartSpec = {
    id: "cor-bars",
    title: "The discussion's four cases",
    subtitle: "x share of nights with one shared cause · y P(ruin) per season, whole tranche",
    kind: "xy",
    data: table([f("c", "Shared-cause nights"), f("ruin", "Ruin per season, whole tranche", "pct2")], stepRows),
    mark: "bar",
    x: { field: "c", categorical: true },
    y: { field: "ruin", format: "pct", label: "P(ruin) per season" },
    series: [{ field: "ruin", color: "loss", label: "Ruin per season, whole tranche" }],
    height: 240,
  };

  const scales = linspace(1, 2.5, 61);
  const shockRows: Row[] = scales.map((s) => {
    const m = shockedLossRate(q, s) / q;
    return { scale: s, single: m, joint: Math.pow(m, k) };
  });
  const mNow = shockedLossRate(q, p.volShock) / q;
  const convexity: ChartSpec = {
    id: "cor-shock",
    title: "Loss-rate multiplier under a volatility shock",
    subtitle: `x realized ÷ priced sigma · y multiplier on the loss rate (log)`,
    kind: "xy",
    data: table([f("scale", "Realized ÷ priced sigma", "x2"), f("single", "Per-name loss rate multiplier", "x2"), f("joint", `All ${k} names at once`, "num")], shockRows),
    mark: "line",
    x: { field: "scale", format: "x2", domain: [1, 2.5] },
    y: { field: "single", scale: "log", label: "Multiplier on the loss rate", format: "num" },
    series: [
      { field: "single", color: "ramp3", label: "One name" },
      { field: "joint", color: "ramp1", label: `All ${k} names at once`, emphasis: "strong" },
    ],
    height: 260,
    annotations: [{ kind: "vline", x: p.volShock, text: `your shock ${ratio(p.volShock)}: ${typographic(mNow.toFixed(1))}× and ${typographic(Math.pow(mNow, k).toFixed(0))}×`, color: "ink", at: "start" }],
  };

  const sharesList = linspace(0, 1, 21);
  const shareRows: Row[] = sharesList.map((s) => ({ share: s, ruin: ruinWithShock(q, k, n, { shockedShare: s, scale: p.volShock }, c) }));
  const shareChart: ChartSpec = {
    id: "cor-shock-share",
    title: "Season ruin as more nights carry the shock",
    subtitle: `x share of shocked nights · y P(ruin) per season, whole tranche · at ${ratio(p.volShock)} priced sigma, directions independent`,
    kind: "xy",
    data: table([f("share", "Share of shocked nights", "pct"), f("ruin", "Ruin per season, whole tranche", "pct3")], shareRows),
    mark: "line",
    x: { field: "share", format: "pct", domain: [0, 1] },
    y: { field: "ruin", format: "pct2", label: "P(ruin) per season" },
    series: [{ field: "ruin", color: "loss", label: "Ruin per season, whole tranche" }],
    height: 240,
    annotations: [{ kind: "vline", x: p.volShockShare, text: `your share ${pct(p.volShockShare)}`, color: "ink", at: "end" }],
  };

  const tbl = tableSpec({
    id: "cor-table",
    title: "Shared causes, shared volatility, and ruin per season",
    data: table(
      [f("case", "Case"), f("perNight", "Joint loss per night", "pct3"), f("ruin", "Ruin per season, whole tranche", "pct2")],
      [
        { case: "Independent names", perNight: pIndep, ruin: ruinIndep },
        ...steps.filter((x) => x > 0).map((cc) => ({ case: `Shared cause on ${pct(cc)} of nights`, perNight: jointLossProb(q, k, cc), ruin: ruinPerSeason(jointLossProb(q, k, cc), n) })),
        { case: `Your c = ${pct2(c)}`, perNight: pJoint, ruin: ruinJoint },
        {
          case: `Vol shock ${ratio(p.volShock)} on ${pct(p.volShockShare)} of nights`,
          perNight: jointLossProb(shockedLossRate(q, p.volShock), k, c),
          ruin: ruinWithShock(q, k, n, { shockedShare: p.volShockShare, scale: p.volShock }, c),
        },
      ],
    ),
    columns: [{ field: "case", emphasize: true }, { field: "perNight" }, { field: "ruin", color: "loss" }],
    highlightRow: { field: "case", value: `Your c = ${pct2(c)}` },
  });

  // The discussion's "4× loss rate on a fifth of the games": a literal 4× per name on 20% of nights.
  const literalFourX = 1 - Math.pow(1 - jointLossProb(q, k, c), 0.8 * n) * Math.pow(1 - jointLossProb(Math.min(1, 4 * q), k, c), 0.2 * n);
  const deckShock = ruinWithShock(q, k, n, { shockedShare: 0.2, scale: 1.3 }, c);
  const breach3 = breachBeyond(3, 1);
  const breach3Shocked = breachBeyond(3, 1.3);
  const tripleMultiplier = Math.pow(breach3Shocked / breach3, 3);

  return {
    id: "correlation",
    number: 6,
    title: "Shared causes",
    claim: "A joint loss is set by how often the names share a cause, not by how rare tails are; shared volatility is second-order next to shared direction.",
    lede: single ? "When do shared causes set the chance of a joint loss? With one name a night there is no joint loss; set names a night above one in the deck." : "When do shared causes, not rare tails, set the chance of losing every name on one night?",
    views: [
      { id: "shared-causes", title: "When shared causes ruin you", blurb: "Season ruin against the share of nights on which the names share one outcome.", charts: ["cor-curve", "cor-bars", "cor-table"], params: ["sharedOutcome"], kpis: [0, 1, 2] },
      { id: "vol-shock", title: "When volatility shocks everything at once", blurb: "How a shared move in realized volatility multiplies single and joint losses.", charts: ["cor-shock", "cor-shock-share"], params: ["volShock", "volShockShare"], kpis: [3] },
    ],
    kpis: [
      { label: "Joint loss per night", value: `${smallPct(pIndep)} → ${smallPct(pRef)}`, sub: refLabel },
      { label: "Ruin per season, whole tranche", value: `${smallPct(ruinIndep)} → ${smallPct(ruinRef)}`, sub: refLabel },
      { label: "Crossover c", value: single ? "–" : smallPct(cross), sub: `q${power(k - 1)}`, help: "Above this share of shared-cause nights the correlation term dominates the independent one." },
      { label: "Vol shock multiplier", value: `${typographic(mNow.toFixed(1))}× / ${typographic(Math.pow(mNow, k).toFixed(0))}×`, sub: `one name / all ${k} at ${ratio(p.volShock)} sigma` },
    ],
    primary: [curve],
    secondary: [bars, convexity, shareChart],
    tables: [tbl],
    localParams: ["sharedOutcome", "volShock", "volShockShare"],
    notes: [
      {
        title: "Common causes in this kind of book",
        body: "- Same supply chain. Two memory names, or a supplier and its customer, reporting the same evening share one demand signal. That is closer to doubling a position than diversifying it.\n- Sequential prints. If one name reports an hour after another, the second already moves after hours on the first one's read-through. A short condor on it sold at the close carries both moves.\n- Overnight macro. A headline or a data release in the same window hits every open position at once.\n\nThe practical rule: at most one name per factor bucket per evening, and per-name risk capped at a fixed fraction of the tranche however many names the evening offers.",
      },
      {
        title: "How the shock is modelled",
        body: "The per-name loss rate q implies a two-sided threshold of z = Φ⁻¹(1 − q/2) priced sigmas, a condor where either wing can breach. On a shocked night the realized sigma is the shock multiple of the priced one, so the loss rate becomes 2(1 − Φ(z/shock)). Directions stay independent; the share of shocked nights and the multiple are both yours to set.",
      },
    ],
    sourceFigures: [
      fig(p, "All three names at max loss, independent", "q³ ≈ 0.003%", smallPct(Math.pow(q, 3)), near(0.00003, Math.pow(q, 3), 0.000006), ["q"]),
      fig(p, "Crossover: c exceeds q²", "about 0.09%", smallPct(Math.pow(q, 2)), near(0.0009, Math.pow(q, 2), 0.00006), ["q"]),
      fig(p, "Ruin per season, independent", "0.05%", smallPct(ruinPerSeason(jointLossProb(q, 3, 0), n)), near(0.0005, ruinPerSeason(jointLossProb(q, 3, 0), n), 0.00006), ["q", "n"]),
      fig(p, "Ruin, shared cause on 2% / 5% / 20% of evenings", "1.2% / 3.0% / 11%", `${pct1(ruinPerSeason(jointLossProb(q, 3, 0.02), n))} / ${pct1(ruinPerSeason(jointLossProb(q, 3, 0.05), n))} / ${pct(ruinPerSeason(jointLossProb(q, 3, 0.2), n))}`, near(0.012, ruinPerSeason(jointLossProb(q, 3, 0.02), n), 0.0006) && near(0.03, ruinPerSeason(jointLossProb(q, 3, 0.05), n), 0.0006) && near(0.11, ruinPerSeason(jointLossProb(q, 3, 0.2), n), 0.006), ["q", "n"]),
      fig(p, "3σ breach when realized moves run 30% above priced", "0.27% → 2.1%, about 8×", `${pct2(breach3)} → ${pct1(breach3Shocked)}, ${typographic((breach3Shocked / breach3).toFixed(1))}×`, near(0.0027, breach3, 0.00006) && near(0.021, breach3Shocked, 0.0006), []),
      fig(p, "The triple loss under the same shock", "≈ 8³ ≈ 470×", `${typographic(tripleMultiplier.toFixed(0))}×`, near(470, tripleMultiplier, 25), []),
      fig(
        p,
        "A 4× loss rate on a fifth of the games",
        "0.05% → 0.17%",
        `${smallPct(ruinIndep)} → ${pct2(literalFourX)} at a literal 4× per name · ${pct2(deckShock)} at a 1.30× sigma shock on 20% of nights`,
        near(0.0017, literalFourX, 0.0002) || near(0.0017, deckShock, 0.0002),
        ["q", "n", "k", "c"],
        "A 4× per-name rate on a fifth of the nights multiplies the triple loss by 64 on those nights; 0.17% needs the triple to rise only about 3.4×.",
      ),
    ],
  };
}
