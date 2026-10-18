/**
 * The three policies' names, colours and labels: the single source; nothing else
 * hard-codes them. The model's side (the ids and the night each plays) is
 * src/app/model/policies.ts.
 *
 *   coin     "Coin"              (amber,  role a)
 *   spread   "Spread"            (cyan,   role b)
 *   reserve  "Spread + reserve"  (violet, role c)
 */
import type { Params } from "@app/model/params";
import { nightPolicies, POLICY_IDS, type PolicyId } from "@app/model/policies";
import type { NightPolicy } from "@app/model/season";

export type PolicyColor = "a" | "b" | "c";

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

/** The policy the deck's sizing inputs describe: the one the reader holds. */
export const YOUR_POLICY: PolicyId = "reserve";

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

/** Every policy at the deck's parameters: its name and colour, its labels, and the night it plays. */
export function policies(p: Params): PolicyDef[] {
  const night = nightPolicies(p);
  return POLICY_IDS.map((id) => ({ ...POLICY_META[id], label: policyLabel(id, p), detail: policyDetail(id, p), policy: night[id] }));
}
