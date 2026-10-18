/**
 * The three policies the discussion compares, derived from the deck parameters.
 * This file is the single source of their names and colours; nothing else
 * hard-codes them.
 *
 *   coin     one name, whole tranche                         (amber,  role a)
 *   spread   k names, whole tranche, no reserve              (cyan,   role b)
 *   reserve  k names, the deck's share of the tranche a night (violet, role c)
 */
import type { Params } from "@app/data/params";
import type { NightPolicy, ScheduleBlock } from "./season";

export type PolicyId = "coin" | "spread" | "reserve";
export type PolicyColor = "a" | "b" | "c";

export const POLICY_IDS: PolicyId[] = ["coin", "spread", "reserve"];

/** Name and colour without parameters: what a legend or a column header shows. */
export interface PolicyMeta {
  id: PolicyId;
  /** Short form for tight places: "Coin", "Spread", "Spread + reserve". */
  name: string;
  color: PolicyColor;
}

export const POLICY_META: Record<PolicyId, PolicyMeta> = {
  coin: { id: "coin", name: "Coin", color: "a" },
  spread: { id: "spread", name: "Spread", color: "b" },
  reserve: { id: "reserve", name: "Spread + reserve", color: "c" },
};

/** The legend in deck row 2 and on the Desk: one entry per policy, in order. */
export const POLICY_LEGEND: PolicyMeta[] = POLICY_IDS.map((id) => POLICY_META[id]);

export interface PolicyDef extends PolicyMeta {
  /** Name with the parameters that matter: "Spread + reserve (3 names, 50% a night)". */
  label: string;
  /** The parameters alone: "3 names, 50% a night". */
  detail: string;
  policy: NightPolicy;
}

/** The parameters that describe a policy, for a label. */
export function policyDetail(id: PolicyId, p: Params): string {
  const k = Math.max(1, Math.round(p.names));
  const names = `${k} name${k === 1 ? "" : "s"}`;
  if (id === "coin") return "1 name, whole tranche";
  if (id === "spread") return `${names}, whole tranche`;
  return `${names}, ${Math.round(p.riskPerNight * 100)}% a night`;
}

export function policyLabel(id: PolicyId, p: Params): string {
  return `${POLICY_META[id].name} (${policyDetail(id, p)})`;
}

export function policies(p: Params): PolicyDef[] {
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };
  const k = Math.max(1, Math.round(p.names));
  const night: Record<PolicyId, NightPolicy> = {
    coin: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 },
    spread: { ...base, names: k, riskPerName: 1 / k },
    reserve: { ...base, names: k, riskPerName: p.riskPerNight / k },
  };
  return POLICY_IDS.map((id) => ({ ...POLICY_META[id], label: policyLabel(id, p), detail: policyDetail(id, p), policy: night[id] }));
}

/** The policy the deck's sizing inputs describe: the one the reader holds. */
export const YOUR_POLICY: PolicyId = "reserve";

export function schedule(policy: NightPolicy, nights: number): ScheduleBlock[] {
  return [{ nights, policy }];
}
