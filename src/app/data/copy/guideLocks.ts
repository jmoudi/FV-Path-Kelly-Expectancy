/**
 * The Guide's "Locks" part, inside Parameters (guide.ts spreads it in): what a lock
 * does, where the padlock is, and which parameters the constraints tie together. The
 * relations' own lines come from the table (src/app/data/constraints.ts), so the Guide
 * says what the solver does. Its heading is linkable as #el-guide-parameters-locks.
 */
import type { GuideBlock } from "@kit/ui/GuideFrame";
import { HOTKEY_HINTS as K } from "@kit/sweeps/hotkeys";
import { CONSTRAINTS, SWEEP_RULE } from "@app/data/constraints";
import { PARAM_BY_KEY } from "@app/data/schema";

export const LOCKS_GUIDE: GuideBlock[] = [
  { kind: "h", text: "Locks" },
  {
    kind: "p",
    text: "A **lock** fixes a parameter at its value, loudly. While it is locked nothing moves it: not typing, the wheel, the arrows or a drag ([section 3](#guide/editing)), not the replayer ([section 5](#guide/replayer)), a story, the market switch, the linked clean-season field, an undo, a reset or an import (an import keeps the locked value and adds the file's own locks). Every refused change says so in a notice that names the parameter (“Loss rate per name is locked. Unlock it in the deck to change it.”), and the field shakes once.",
  },
  {
    kind: "table",
    head: ["Where", "What you see"],
    rows: [
      ["A field in the drawer, a section's or a view's inputs, [Settings](#settings) → Engine", "{icon:unlock} beside the label while the pointer is over the field or focus is in it. A click locks the parameter and the icon becomes {icon:lock} in the accent colour, which stays; another click unlocks it."],
      ["Settings for <parameter> (the {icon:settings} popover, [section 4](#guide/parameter-settings))", "**Lock** / **Locked** at the top."],
      ["[Settings](#settings) → Parameters", "A Lock column, one toggle per parameter."],
      ["The deck's first row", "Nothing until a field is locked; then {icon:lock} stays on it in the accent, the track is hatched and the box reads only. A click on {icon:lock} unlocks it."],
      ["The deck's second row", "**Locks (n)** while anything is locked: the list of locks with their values, Unlock for each and Unlock all."],
      ["The strip", "`locked` and Unlock while the active parameter is locked; it is never swept."],
      ["Story chips", "`blocked: <name> is locked` on a story that would move a locked parameter; clicking it only says why ([section 6](#guide/charts))."],
      ["The clean-season line and the market switch", "Their own padlocks: the clean-season probability `p` can be locked although it is not a parameter, and so can the market."],
    ],
  },
  { kind: "p", text: "Some parameters are tied by the model, so a lock on one limits how the others move. Without a lock nothing below applies:" },
  { kind: "table", head: ["Relation", "Ties", "While locked"], rows: [...CONSTRAINTS.relations.map((r) => [r.label, ties(r.keys), r.describe]), [SWEEP_RULE.label, "the swept parameter", SWEEP_RULE.describe.replace("Ctrl+Enter", K.toggle)]] },
  { kind: "p", text: "A change that sets several parameters at once (the market switch, a story, the clean-season line, a section's action) holds whole or not at all, and so does each value of a sweep. Locks are saved with the state and travel in the export ([section 8](#guide/data)); Forget everything saved clears them." },
];

/** A key as the table names it: its symbol where it has one ("q", "p"), else its label. */
function keyName(k: string): string {
  return PARAM_BY_KEY[k]?.short ?? CONSTRAINTS.linked?.[k]?.short ?? PARAM_BY_KEY[k]?.label ?? k;
}

function ties(keys: string[]): string {
  // The six calendar shares read as one thing.
  if (keys.every((k) => k.startsWith("calShare"))) return "the six calendar shares";
  return keys.map(keyName).join(", ");
}
