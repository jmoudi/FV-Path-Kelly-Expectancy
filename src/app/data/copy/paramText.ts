/**
 * Parameter values in words, from the schema: one value in its unit, and what a story
 * moved ("moves deck: q 2.94% → 2.52%"). Shared by the kit's copy (`storyMoved`) and the
 * notices (notices.ts).
 */
import { typographic } from "@kit/charts/format";
import { fmtInt, pct, pct2, sigma, x2 } from "@kit/charts/numbers";
import type { Unit } from "@kit/inputs/schema";
import type { Params } from "@app/model/params";
import { PARAM_BY_KEY } from "@app/data/schema";

/** A parameter value in its schema unit, as the deck prints it. */
export function formatIn(unit: Unit, v: number): string {
  switch (unit) {
    case "pct":
      return pct(v);
    case "pct2":
      return pct2(v);
    case "int":
      return fmtInt(v);
    case "x":
      return x2(v);
    case "sigma":
      return sigma(v);
    default:
      return typographic(v.toFixed(2));
  }
}

/** "q 2.94% → 2.52%" for every numeric parameter that differs between the two, in the order of `before`. */
export function movedParts(before: Partial<Params> | Record<string, unknown> | undefined, now: Partial<Params> | Record<string, unknown>): string[] {
  if (!before) return [];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(before)) {
    const def = PARAM_BY_KEY[k];
    const cur = (now as Record<string, unknown>)[k];
    if (!def || typeof v !== "number" || typeof cur !== "number" || v === cur) continue;
    parts.push(`${def.short ?? def.shortLabel ?? def.label} ${formatIn(def.unit, v)} → ${formatIn(def.unit, cur)}`);
  }
  return parts;
}

/**
 * What an active story moved, from the snapshot the store took before it moved the
 * deck: "moves deck: q 2.94% → 2.52%". A rebuilt chart's own badge is computed from
 * the deck as it is after the move, so the host reads this one instead. Null when
 * nothing numeric moved.
 */
export function movedBadge(before: Partial<Params> | undefined, now: Params): string | null {
  const parts = movedParts(before, now);
  return parts.length ? `moves deck: ${parts.join(", ")}` : null;
}
