import { f, table, type ChartSpec, type Row } from "../../charts/spec";
import { crossoverSharedOutcome, jointLossProb, ruinPerSeason, ruinWithShock, shockedLossRate } from "../../model/correlation";
import type { Params } from "../../model/params";
import { linspace, logspace } from "../../model/stats";
import { pct, pct1, pct2, smallPct, type Derived } from "../derived";
import type { ScenarioView } from "../types";

export function buildCorrelation(p: Params, _d: Derived): ScenarioView {
  const k = Math.max(1, Math.round(p.names));
  const q = p.lossRate;
  const n = p.nights;
  const c = p.sharedOutcome;
  const cross = crossoverSharedOutcome(q, k);
  const pIndep = jointLossProb(q, k, 0);
  const pJoint = jointLossProb(q, k, c);
  const ruinIndep = ruinPerSeason(pIndep, n);
  const ruinJoint = ruinPerSeason(pJoint, n);

  const cs = logspace(1e-5, 0.3, 120);
  const cRows: Row[] = cs.map((cc) => ({ c: cc, joint: jointLossProb(q, k, cc), ruin: ruinPerSeason(jointLossProb(q, k, cc), n), indep: ruinIndep }));
  const curve: ChartSpec = {
    id: "cor-curve",
    title: "Season ruin against how often the names share a cause",
    subtitle: `P(all ${k} names lose on one night) ≈ c·q + q^${k}. The correlation term dominates as soon as c exceeds q^${k - 1}.`,
    kind: "xy",
    data: table([f("c", "Share of nights with one shared outcome, c", "pct2"), f("ruin", "Ruin per season", "pct2"), f("indep", "Ruin if independent", "pct3"), f("joint", "Joint loss per night", "pct3")], cRows),
    mark: "line",
    x: { field: "c", scale: "log", format: "pct2" },
    y: { field: "ruin", scale: "log", format: "pct1", label: "P(ruin) per season" },
    series: [
      { field: "ruin", color: "loss", label: "With shared causes", emphasis: "strong" },
      { field: "indep", color: "muted", label: "Independent names", dash: true },
    ],
    height: 320,
    annotations: [
      { kind: "vline", x: cross, text: `c = q^${k - 1} = ${smallPct(cross)}: shared cause takes over`, color: "ink", at: "start" },
      { kind: "point", x: Math.max(c, 1e-5), y: ruinJoint, text: `your c ${pct2(c)}: ruin ${smallPct(ruinJoint)}`, color: "a", at: "end" },
    ],
    stories: [{ id: "linear", label: "Linear axes", patch: { x: { scale: "linear", domain: [0, 0.3] }, y: { scale: "linear" } } }],
  };

  const steps = [0, 0.02, 0.05, 0.2];
  const stepRows: Row[] = steps.map((cc) => ({ c: `${(cc * 100).toFixed(0)}%`, ruin: ruinPerSeason(jointLossProb(q, k, cc), n) }));
  const bars: ChartSpec = {
    id: "cor-bars",
    title: "The discussion's four cases",
    subtitle: "Evenings on which the names effectively share one outcome.",
    kind: "xy",
    data: table([f("c", "Shared-outcome nights"), f("ruin", "Ruin per season", "pct2")], stepRows),
    mark: "bar",
    x: { field: "c", categorical: true },
    y: { field: "ruin", format: "pct", label: "P(ruin) per season" },
    series: [{ field: "ruin", color: "loss", label: "Ruin per season" }],
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
    title: "Shared volatility is convex",
    subtitle: `If realized moves run above what every chain priced, the per-name loss rate rises by a factor m and the all-${k}-names loss by m^${k}.`,
    kind: "xy",
    data: table([f("scale", "Realized ÷ priced sigma", "x2"), f("single", "Per-name loss rate multiplier", "x2"), f("joint", `All ${k} names at once`, "num")], shockRows),
    mark: "line",
    x: { field: "scale", format: "x2" },
    y: { field: "single", scale: "log", label: "Multiplier on the loss rate", format: "num" },
    series: [
      { field: "single", color: "ramp2", label: "One name" },
      { field: "joint", color: "loss", label: `All ${k} names at once` },
    ],
    height: 260,
    annotations: [
      { kind: "vline", x: p.volShock, text: `your shock ${p.volShock.toFixed(2)}×: ${mNow.toFixed(1)}× and ${Math.pow(mNow, k).toFixed(0)}×`, color: "ink", at: "start" },
    ],
  };

  const sharesList = linspace(0, 1, 21);
  const shareRows: Row[] = sharesList.map((s) => ({ share: s, ruin: ruinWithShock(q, k, n, { shockedShare: s, scale: p.volShock }, c) }));
  const shareChart: ChartSpec = {
    id: "cor-shock-share",
    title: "Season ruin as more nights carry the shock",
    subtitle: `At ${p.volShock.toFixed(2)}× priced sigma, with directions still independent. Second-order next to shared direction.`,
    kind: "xy",
    data: table([f("share", "Share of shocked nights", "pct"), f("ruin", "Ruin per season", "pct3")], shareRows),
    mark: "line",
    x: { field: "share", format: "pct", domain: [0, 1] },
    y: { field: "ruin", format: "pct2", label: "P(ruin) per season" },
    series: [{ field: "ruin", color: "loss", label: "Ruin per season" }],
    height: 240,
    annotations: [{ kind: "vline", x: p.volShockShare, text: `your share ${pct(p.volShockShare)}`, color: "ink", at: "end" }],
  };

  const tbl: ChartSpec = {
    id: "cor-table",
    title: "Shared causes, shared volatility, and ruin per season",
    kind: "table",
    data: table(
      [f("case", "Case"), f("perNight", "Joint loss per night", "pct3"), f("ruin", "Ruin per season", "pct2")],
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
    mark: "line",
    x: { field: "case" },
    y: { field: "ruin" },
    series: [],
    columns: [{ field: "case", emphasize: true }, { field: "perNight" }, { field: "ruin", color: "loss" }],
    highlightRow: { field: "case", value: `Your c = ${pct2(c)}` },
  };

  return {
    id: "correlation",
    number: 6,
    eyebrow: "Shared causes",
    title: "A triple loss is rare only if the names are strangers",
    question: `Three names at max loss on the same night has probability q³ ≈ ${smallPct(Math.pow(q, 3))} if they are independent. How much correlation does it take to swamp that?`,
    lede: `Very little. If on a fraction c of evenings the names share one outcome, the triple loss is about c·q + q³, and the correlation term wins as soon as c exceeds q² ≈ ${smallPct(
      cross,
    )}. So the chance of a joint loss is not set by how rare tails are. It is set by how often the names share a cause. Shared volatility is the same convexity working against you, but at the season level it is milder: shared direction is first-order, shared volatility second-order.`,
    kpis: [
      { label: "Joint loss per night, independent", value: smallPct(pIndep), sub: `q^${k}` },
      { label: "Joint loss per night, your c", value: smallPct(pJoint), sub: `c·q + (1 − c)·q^${k}`, color: "loss" },
      { label: "Ruin per season", value: `${smallPct(ruinIndep)} → ${smallPct(ruinJoint)}`, sub: "independent → your c" },
      { label: "Crossover c", value: smallPct(cross), sub: `q^${k - 1}`, help: "Above this share of shared-outcome nights the correlation term dominates the independent one." },
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
        body: "The per-name loss rate q implies a two-sided threshold of z = Φ⁻¹(1 − q/2) priced sigmas. On a shocked night the realized sigma is the shock multiple of the priced one, so the loss rate becomes 2(1 − Φ(z/shock)). Directions stay independent; the share of shocked nights and the multiple are both yours to set.",
      },
    ],
    sourceFigures: [
      { label: "Ruin, c = 2%", quoted: "1.2%", computed: pct1(ruinPerSeason(jointLossProb(q, k, 0.02), n)) },
      { label: "Ruin, c = 20%", quoted: "11%", computed: pct1(ruinPerSeason(jointLossProb(q, k, 0.2), n)) },
      { label: "3σ breach at 1.3× sigma", quoted: "0.27% → 2.1%, about 8×", computed: `${pct2(2 * (1 - 0.99865))} → ${pct2(shockedLossRate(2 * (1 - 0.99865), 1.3))}` },
    ],
  };
}
