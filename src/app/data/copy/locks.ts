/**
 * What the notices say about locks (src/app/view/announceLocks.ts turns the bus's
 * param:locked, param:refused and sweep:stopped "lock" into them). A lock is loud: a
 * refused change always names the parameter and how to undo the lock.
 */
import type { ParamSource } from "@kit/events/types";
import type { Params } from "@app/model/params";
import { CONSTRAINTS } from "@app/data/constraints";
import { PARAM_BY_KEY } from "@app/data/schema";
import { formatIn } from "./paramText";

/** The value a lock holds, as the deck prints it: "2.94%", "Fair market (q = b/(1+b))", "55%". */
export function lockValueText(key: string, params: Params): string {
  const def = PARAM_BY_KEY[key];
  const v = (params as unknown as Record<string, unknown>)[key];
  if (def?.unit === "choice") return def.choices?.find((c) => c.value === v)?.label ?? String(v);
  if (def && typeof v === "number") return formatIn(def.unit, v);
  return CONSTRAINTS.linked?.[key]?.text?.(params) ?? "";
}

const UNLOCK = "Unlock it in the deck to change it.";

export interface RefusalWords {
  key: string;
  by?: string;
  detail?: string;
  source: ParamSource;
  /** The names of `key` and `by`. */
  keyLabel: string;
  byLabel: string;
  /** The value the lock kept, for an import. */
  kept?: string;
}

export const LOCK_COPY = {
  unlock: UNLOCK,
  /** "Loss rate per name is locked. Unlock it in the deck to change it." */
  refused: (w: RefusalWords): string => {
    const by = w.by ?? w.key;
    if (by === w.key) {
      switch (w.source) {
        case "sweep":
          return `${w.keyLabel} is locked, so the replayer leaves it alone. ${UNLOCK}`;
        case "import":
          return `${w.keyLabel} is locked: the import kept ${w.kept || "its value"}. ${UNLOCK}`;
        case "story":
          return `${w.keyLabel} is locked, so the story does not apply. ${UNLOCK}`;
        case "switch":
          return `${w.keyLabel} is locked, so the market switch leaves it alone. ${UNLOCK}`;
        default:
          return `${w.keyLabel} is locked. ${UNLOCK}`;
      }
    }
    if (!by) return `${w.keyLabel} cannot move: ${w.detail || "the locked parameters leave it no room"}. Unlock a parameter in the deck to change it.`;
    return `${w.keyLabel} cannot move: ${w.byLabel} is locked${w.detail ? ` (${w.detail})` : ""}. ${UNLOCK}`;
  },
  locked: (label: string, value: string): string => `${label} is locked${value ? ` at ${value}` : ""}. Hand edits, sweeps, stories, the market switch and imports leave it there; its padlock or Locks in the deck unlock it.`,
  unlocked: (label: string): string => `${label} is unlocked.`,
  sweepStopped: (label: string, value: string, lockedItself: boolean): string =>
    lockedItself ? `${label} is locked${value ? ` at ${value}` : ""}, so its sweep stopped there.` : `The sweep on ${label} stopped${value ? ` at ${value}` : ""}: a lock refuses its next value.`,
};
