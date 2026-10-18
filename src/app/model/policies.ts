/**
 * The three policies the discussion compares, as the model sees them: an id and the
 * night each one plays, derived from the deck parameters. Their names, colours and
 * labels are data (src/app/data/policies.ts).
 *
 *   coin     one name, whole tranche
 *   spread   k names, whole tranche, no reserve
 *   reserve  k names, the deck's share of the tranche a night
 */
import type { Params } from "./params";
import type { NightPolicy, ScheduleBlock } from "./season";

export type PolicyId = "coin" | "spread" | "reserve";

export const POLICY_IDS: PolicyId[] = ["coin", "spread", "reserve"];

/** The night each policy plays at the deck's parameters. */
export function nightPolicies(p: Params): Record<PolicyId, NightPolicy> {
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };
  const k = Math.max(1, Math.round(p.names));
  return {
    coin: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 },
    spread: { ...base, names: k, riskPerName: 1 / k },
    reserve: { ...base, names: k, riskPerName: p.riskPerNight / k },
  };
}

export function schedule(policy: NightPolicy, nights: number): ScheduleBlock[] {
  return [{ nights, policy }];
}
