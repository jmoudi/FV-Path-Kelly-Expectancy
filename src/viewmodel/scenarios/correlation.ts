import { f, table, tableSpec, type ChartSpec, type Row } from "../../charts/spec";
import { crossoverSharedOutcome, jointLossProb, ruinPerSeason, ruinWithShock, shockedLossRate } from "../../model/correlation";
import type { Datasets, Params } from "../../model/params";
import { linspace, logspace } from "../../model/stats";
import { pct, pct1, pct2, smallPct, type Derived } from "../derived";
import type { ScenarioView } from "../types";

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

  const cs = logspace(1e-5, 0.3, 120);
  const cRows: Row[] = cs.map((cc) => ({ c: cc, joint: jointLossProb(q, k, cc), ruin: ruinPerSeason(jointLossProb(q, k, cc), n), indep: ruinIndep }));
  const curve: ChartSpec = {
    id: "cor-curve",
    title: "Season ruin against how often the names share a cause",
    subtitle: single
      ? "With one name per night there is nothing to share: the joint loss is q itself. Raise names per night in the deck."
      : `P(all ${k} names lose on one night) ≈ c·q + q${power(k)}. The correlation term dominates as soon as c exceeds q${power(k - 1)}.`,
    kind: "xy",
    data: table([f("c", "Share of nights with one shared outcome, c", "pct2"), f("ruin", "Ruin per season, whole tranche", "pct2"), f("indep", "Ruin if independent", "pct3"), f("joint", "Joint loss per night", "pct3")], cRows),
    mark: "line",
    x: { field: "c", scale: "log", format: "pct2", domain: [1e-5, 0.3] },
    y: { field: "ruin", scale: "log", format: "pct1", label: "P(ruin) per season" },
    series: [
      { field: "ruin", color: "loss", label: "With shared causes", emphasis: "strong" },
      { field: "indep", color: "muted", label: "Independent names", dash: true },
    ],
    height: 320,
    annotations: [
      ...(single ? [] : [{ kind: "vline" as const, x: cross, text: `c = q${power(k - 1)} = ${smallPct(cross)}: shared cause takes over`, color: "ink" as const, at: "start" as const }]),
      { kind: "point", x: Math.max(c, 1e-5), y: ruinJoint, text: `your c ${pct2(c)}: ruin ${smallPct(ruinJoint)}`, color: "ink", at: "end" },
    ],
    stories: [
      { id: "linear", label: "Linear axes", patch: { x: { scale: "linear", domain: [0, 0.3] }, y: { scale: "linear" } } },
      { id: "two", label: "What if 2% of evenings share a cause?", narrative: "Two memory names reporting the same evening is already more than that.", params: { sharedOutcome: 0.02 } },
    ],
  };

  const steps = [0, 0.02, 0.05, 0.2];
  const stepRows: Row[] = steps.map((cc) => ({ c: `${(cc * 100).toFixed(0)}%`, ruin: ruinPerSeason(jointLossProb(q, k, cc), n) }));
  const bars: ChartSpec = {
    id: "cor-bars",
    title: "The discussion's four cases",
    subtitle: "Evenings on which the names effectively share one outcome.",
    kind: "xy",
    data: table([f("c", "Shared-outcome nights"), f("ruin", "Ruin per season, whole tranche", "pct2")], stepRows),
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
    subtitle: `Realized moves above what every chain priced raise the per-name loss rate by m and the all-${k}-names loss by m${power(k)}.`,
    kind: "xy",
    data: table([f("scale", "Realized ÷ priced sigma", "x2"), f("single", "Per-name loss rate multiplier", "x2"), f("joint", `All ${k} names at once`, "num")], shockRows),
    mark: "line",
    x: { field: "scale", format: "x2", domain: [1, 2.5] },
    y: { field: "single", scale: "log", label: "Multiplier on the loss rate", format: "num" },
    series: [
      { field: "single", color: "ramp2", label: "One name" },
      { field: "joint", color: "loss", label: `All ${k} names at once` },
    ],
    height: 260,
    annotations: [{ kind: "vline", x: p.volShock, text: `your shock ${p.volShock.toFixed(2)}×: ${mNow.toFixed(1)}× and ${Math.pow(mNow, k).toFixed(0)}×`, color: "ink", at: "start" }],
  };

  const sharesList = linspace(0, 1, 21);
  const shareRows: Row[] = sharesList.map((s) => ({ share: s, ruin: ruinWithShock(q, k, n, { shockedShare: s, scale: p.volShock }, c) }));
  const shareChart: ChartSpec = {
    id: "cor-shock-share",
    title: "Season ruin as more nights carry the shock",
    subtitle: `At ${p.volShock.toFixed(2)}× priced sigma, with directions still independent. Second-order next to shared direction.`,
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
        ...steps.filter((x) => x > 0).map((cc) => ({ case: `Shared outcome on ${pct(cc)} of nights`, perNight: jointLossProb(q, k, cc), ruin: ruinPerSeason(jointLossProb(q, k, cc), n) })),
        { case: `Your c = ${pct2(c)}`, perNight: pJoint, ruin: ruinJoint },
        {
          case: `Vol shock ${p.volShock.toFixed(2)}× on ${pct(p.volShockShare)} of nights`,
          perNight: jointLossProb(shockedLossRate(q, p.volShock), k, c),
          ruin: ruinWithShock(q, k, n, { shockedShare: p.volShockShare, scale: p.volShock }, c),
        },
      ],
    ),
    columns: [{ field: "case", emphasize: true }, { field: "perNight" }, { field: "ruin", color: "loss" }],
    highlightRow: { field: "case", value: `Your c = ${pct2(c)}` },
  });

  return {
    id: "correlation",
    number: 6,
    title: "Shared causes",
    claim: "A joint loss is set by how often the names share a cause, not by how rare tails are; shared volatility is second-order next to shared direction.",
    lede: single
      ? "With one name per night there is no joint loss; set names per night above one in the deck to see shared causes act."
      : `Season ruin against the share of nights with one shared outcome (joint loss ≈ c·q + q${power(k)}, crossover at c = q${power(k - 1)} ≈ ${smallPct(cross)}), the four cases from the discussion, and the convexity of a volatility shock across ${k} names.`,
    views: [
      { id: "shared-causes", title: "Shared-cause ruin", blurb: "Season ruin against the share of nights on which the names share one outcome.", charts: ["cor-curve", "cor-bars", "cor-table"], params: ["sharedOutcome"], kpis: [0, 1, 2] },
      { id: "vol-shock", title: "Volatility shock", blurb: "How a shared move in realized volatility multiplies single and joint losses.", charts: ["cor-shock", "cor-shock-share"], params: ["volShock", "volShockShare"], kpis: [3] },
    ],
    kpis: [
      { label: "Joint loss per night", value: `${smallPct(pIndep)} → ${smallPct(pJoint)}`, sub: `independent → your c ${pct2(c)}`, color: "loss" },
      { label: "Ruin per season, whole tranche", value: `${smallPct(ruinIndep)} → ${smallPct(ruinJoint)}`, sub: "independent → your c" },
      { label: "Crossover c", value: single ? "—" : smallPct(cross), sub: `q${power(k - 1)}`, help: "Above this share of shared-outcome nights the correlation term dominates the independent one." },
      { label: "Vol shock multiplier", value: `${mNow.toFixed(1)}× / ${Math.pow(mNow, k).toFixed(0)}×`, sub: `one name / all ${k} at ${p.volShock.toFixed(2)}× sigma` },
    ],
    primary: [curve],
    secondary: [bars, convexity, shareChart],
    tables: [tbl],
    localParams: ["sharedOutcome", "volShock", "volShockShare"],
    notes: [
      {
        title: "Common causes in this kind of book",
        body: "- Same supply chain. Two memory names, or a supplier and its customer, reporting the same evening share one demand signal. That is closer to doubling a position than diversifying it.\n- Sequential prints. If name B reports an hour after name A, B already moves after hours on A's read-through. A short B condor sold at the close carries both moves.\n- Overnight macro. A headline or a data release in the same window hits every open position at once.\n\nThe practical rule: at most one name per factor bucket per evening, and per-name risk capped at a fixed fraction of the tranche however many names the evening offers.",
      },
      {
        title: "How the shock is modelled",
        body: "The per-name loss rate q implies a two-sided threshold of z = Φ⁻¹(1 − q/2) priced sigmas, a condor where either wing can breach. On a shocked night the realized sigma is the shock multiple of the priced one, so the loss rate becomes 2(1 − Φ(z/shock)). Directions stay independent; the share of shocked nights and the multiple are both yours to set.",
      },
    ],
    sourceFigures: [
      { label: "Ruin, c = 2%", quoted: "1.2%", computed: pct1(ruinPerSeason(jointLossProb(q, k, 0.02), n)) },
      { label: "Ruin, c = 20%", quoted: "11%", computed: pct1(ruinPerSeason(jointLossProb(q, k, 0.2), n)) },
      { label: "3σ breach at 1.3× sigma", quoted: "0.27% → 2.1%, about 8×", computed: `${pct2(2 * (1 - 0.99865))} → ${pct2(shockedLossRate(2 * (1 - 0.99865), 1.3))}` },
    ],
  };
}
