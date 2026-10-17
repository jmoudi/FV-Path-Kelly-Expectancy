/**
 * The three policies the discussion compares, derived from the deck parameters.
 *   A  one name, whole tranche            (the coin flip)
 *   B  k names, whole tranche             (diversified, no reserve)
 *   C  k names, `riskPerNight` of tranche (diversified, with reserve)
 */
import type { Params } from "./params";
import type { NightPolicy, ScheduleBlock } from "./season";

export type PolicyId = "A" | "B" | "C";

export interface PolicyDef {
  id: PolicyId;
  label: string;
  short: string;
  color: "a" | "b" | "c";
  policy: NightPolicy;
}

export function policies(p: Params): PolicyDef[] {
  const base = { gain: p.gain, lossRate: p.lossRate, sharedOutcome: p.sharedOutcome };
  const k = Math.max(1, Math.round(p.names));
  return [
    { id: "A", label: "1 name, whole tranche", short: "1 name, all-in", color: "a", policy: { ...base, names: 1, riskPerName: 1, sharedOutcome: 0 } },
    { id: "B", label: `${k} names, whole tranche`, short: `${k} names, all-in`, color: "b", policy: { ...base, names: k, riskPerName: 1 / k } },
    {
      id: "C",
      label: `${k} names, ${Math.round(p.riskPerNight * 100)}% of tranche`,
      short: `${k} names, ${Math.round(p.riskPerNight * 100)}% at risk`,
      color: "c",
      policy: { ...base, names: k, riskPerName: p.riskPerNight / k },
    },
  ];
}

export function schedule(policy: NightPolicy, nights: number): ScheduleBlock[] {
  return [{ nights, policy }];
}
