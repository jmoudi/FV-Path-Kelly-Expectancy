/**
 * The Desk: given my book, what happens? A policy comparison grid for one season
 * and N seasons, the sizing line, the calibration verdict and the market state.
 * Pure data; src/app/desk/DeskPage.tsx renders it.
 */
import { eventsToResolve } from "@app/model/calibration";
import type { Params } from "@app/params/params";
import { POLICY_IDS, type PolicyId, type PolicyMeta } from "@app/model/policies";
import type { Summary } from "@app/model/season";
import { fmtInt, pct, pct1, pct2, probPct, x2, years } from "@kit/charts/numbers";
import type { Derived, MarketState } from "@app/scenarios/derived";

export type DeskRowId = "mean" | "median" | "p10" | "pBelow" | "ruin";
export type DeskGroupId = "season" | "chained";

export interface DeskCell {
  value: number;
  text: string;
}

export interface DeskRow {
  id: DeskRowId;
  label: string;
  /** The view that explains the row. */
  viewId: string;
  cells: Record<PolicyId, DeskCell>;
}

export interface DeskGroup {
  id: DeskGroupId;
  /** "One season" / "4 seasons". */
  title: string;
  rows: DeskRow[];
  /** The headline cell of the group: your policy's median. */
  hero: { row: DeskRowId; policy: PolicyId };
}

export interface DeskPolicy extends PolicyMeta {
  label: string;
  detail: string;
  yours: boolean;
}

export interface DeskView {
  policies: DeskPolicy[];
  yours: PolicyId;
  threshold: number;
  seasons: number;
  groups: DeskGroup[];
  /** Block 2: how much to risk a night. */
  sizing: {
    risk: number;
    robust: number;
    nightKelly: number;
    kellyPerName: number;
    /** Your risk as a multiple of the growth-optimal risk at the deck's rate; null without a positive premium. */
    ratioToKelly: number | null;
    /** No positive premium over fair: the growth-optimal risk at the deck's rate is 0. */
    noPremium: boolean;
    /** One line beside the heatmap. */
    text: string;
    chartId: string;
    viewId: string;
  };
  /** Block 3: can the record tell. */
  calibration: {
    sentence: string;
    events: number;
    perYear: number;
    from: number;
    to: number;
    z: number;
    viewId: string;
  };
  /** Block 4: the market switch and what it changes. */
  market: MarketState & { viewId: string };
}

const ROW_LABELS: Record<DeskRowId, string> = { mean: "Mean", median: "Median", p10: "10th percentile", pBelow: "P(below threshold)", ruin: "Ruin" };

const ROW_VIEWS: Record<DeskGroupId, Record<DeskRowId, string>> = {
  season: { mean: "replay-quantiles", median: "season-shape", p10: "season-shape", pBelow: "season-shape", ruin: "season-outcomes" },
  chained: { mean: "chained-outcomes", median: "chained-outcomes", p10: "chained-outcomes", pBelow: "chained-outcomes", ruin: "shared-causes" },
};

function cell(id: DeskRowId, s: Summary): DeskCell {
  switch (id) {
    case "mean":
      return { value: s.mean, text: x2(s.mean) };
    case "median":
      return { value: s.median, text: x2(s.median) };
    case "p10":
      return { value: s.p10, text: x2(s.p10) };
    // The two probability rows follow one rule (whole percent, two figures below 1%).
    case "pBelow":
      return { value: s.pBelow, text: probPct(s.pBelow) };
    case "ruin":
      return { value: s.pRuin, text: probPct(s.pRuin) };
  }
}

function group(id: DeskGroupId, title: string, summaries: Record<PolicyId, Summary>, threshold: number, yours: PolicyId): DeskGroup {
  const rowIds: DeskRowId[] = ["mean", "median", "p10", "pBelow", "ruin"];
  return {
    id,
    title,
    hero: { row: "median", policy: yours },
    rows: rowIds.map((rid) => ({
      id: rid,
      label: rid === "pBelow" ? `P(below ${x2(threshold)})` : ROW_LABELS[rid],
      viewId: ROW_VIEWS[id][rid],
      cells: Object.fromEntries(POLICY_IDS.map((pid) => [pid, cell(rid, summaries[pid])])) as Record<PolicyId, DeskCell>,
    })),
  };
}

export function buildDesk(p: Params, d: Derived): DeskView {
  const N = p.seasons;
  const season = Object.fromEntries(POLICY_IDS.map((id) => [id, d.season[id].summary])) as Record<PolicyId, Summary>;
  const chained = Object.fromEntries(POLICY_IDS.map((id) => [id, d.chained[id].summary])) as Record<PolicyId, Summary>;
  const qOpt = p.altLossRate;
  const qBE = d.breakEven;
  const events = eventsToResolve(qOpt, qBE, p.zSigma);
  const ratioToKelly = d.nightKelly.risk > 0 ? p.riskPerNight / d.nightKelly.risk : null;
  const zero = d.market.noPremium;
  const sizingText = zero
    ? `${d.market.sizingNote} You risk ${pct(p.riskPerNight)} a night.${d.robust.risk > 0 ? ` Averaged over loss rates ${d.bandLabel}, which still reach the optimistic rate, the robust optimum is ${pct(d.robust.risk)}.` : ""}`
    : `You risk ${pct(p.riskPerNight)} a night. Robust optimum ${pct(d.robust.risk)}, averaged over loss rates ${d.bandLabel}; growth-optimal at the deck's rate alone ${pct(d.nightKelly.risk)}${ratioToKelly != null ? `, so you sit at ${ratioToKelly.toFixed(2).replace("-", "−")}× that` : ""}. Kelly per name ${pct1(d.kelly)}.`;
  return {
    policies: d.policies.map((x) => ({ id: x.id, name: x.name, color: x.color, label: x.label, detail: x.detail, yours: x.id === d.yours })),
    yours: d.yours,
    threshold: p.thresholdBelow,
    seasons: N,
    groups: [group("season", "One season", season, p.thresholdBelow, d.yours), group("chained", `${N} season${N === 1 ? "" : "s"}`, chained, p.thresholdBelow, d.yours)],
    sizing: {
      risk: p.riskPerNight,
      robust: d.robust.risk,
      nightKelly: d.nightKelly.risk,
      kellyPerName: d.kelly,
      ratioToKelly,
      noPremium: zero,
      text: sizingText,
      chartId: "chain-heat",
      viewId: "sizing-grid",
    },
    calibration: {
      sentence: Number.isFinite(events)
        ? `${fmtInt(p.eventsPerYear)} events a year separate ${pct2(qOpt)} from ${pct2(qBE)} in about ${years(events, p.eventsPerYear)} (${fmtInt(events)} events at ${p.zSigma}σ).`
        : `The optimistic rate equals break-even (${pct2(qBE)}): there is nothing for the record to tell apart.`,
      events,
      perYear: p.eventsPerYear,
      from: qOpt,
      to: qBE,
      z: p.zSigma,
      viewId: "events-needed",
    },
    market: { ...d.market, viewId: "move-vs-wing" },
  };
}

/** For a label: the policy the grid highlights. */
export function yourPolicyLabel(d: Derived): string {
  return d.byId[d.yours].label;
}
