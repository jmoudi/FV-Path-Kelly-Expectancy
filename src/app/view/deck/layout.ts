/**
 * Which inputs the deck shows where, read from the parameter schema: the groups of
 * the reduced deck's first row, the drawer's input sections, and the phone's four.
 * Pure data, no React, so it is tested on its own.
 */
import { GROUP_LABELS, PARAM_DEFS, type ParamDef, type ParamGroup } from "@app/data/schema";
import type { Params } from "@app/model/params";

export interface DeckLayoutGroup {
  group: ParamGroup;
  /** Uppercase caption over the group in the reduced row. */
  caption: string;
  /** Heading of the group's drawer section. */
  title: string;
  blurb: string;
  keys: (keyof Params)[];
}

export interface DeckLayout {
  /** Row 1 of the reduced deck: groups with at least one field placed in the row. */
  row: DeckLayoutGroup[];
  /** The drawer's input sections: every group with an input, in schema order. */
  drawer: DeckLayoutGroup[];
  /** The row-1 fields kept on a phone, in row order. */
  phone: (keyof Params)[];
}

export function deckLayout(defs: readonly ParamDef[] = PARAM_DEFS, groups: Record<ParamGroup, { label: string; title: string; blurb: string }> = GROUP_LABELS): DeckLayout {
  const order = Object.keys(groups) as ParamGroup[];
  const section = (g: ParamGroup, keep: (d: ParamDef) => boolean): DeckLayoutGroup => ({
    group: g,
    caption: groups[g].label,
    title: groups[g].title,
    blurb: groups[g].blurb,
    keys: defs.filter((d) => d.group === g && keep(d)).map((d) => d.key),
  });
  const drawer = order.map((g) => section(g, () => true)).filter((s) => s.keys.length > 0);
  const row = order.map((g) => section(g, (d) => !!d.deck?.row)).filter((s) => s.keys.length > 0);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const phone = row.flatMap((g) => g.keys).filter((k) => !!byKey.get(k)?.deck?.phone);
  return { row, drawer, phone };
}
