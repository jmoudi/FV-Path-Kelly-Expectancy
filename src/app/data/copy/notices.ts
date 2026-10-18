/**
 * What the notices say (src/app/view/announce.ts turns bus events into them). One
 * function per event, so the words live here and the wiring stays free of copy.
 */
import { HOTKEY_HINTS } from "@kit/sweeps/hotkeys";
import { movedParts } from "./paramText";

export const NOTICE_COPY = {
  imported: "State imported: every section is recomputed from the file's parameters, data and chart edits.",
  importFailed: (error: string) => `The state was not imported. ${error}`,
  /** A story moved the deck: “What if q is really 3.2%?” moves the deck: q 2.94% → 3.20%. */
  storyMoved: (label: string | undefined, before: Record<string, unknown>, after: Record<string, unknown>): string | null => {
    const parts = movedParts(before, after);
    if (!parts.length) return null;
    return `${label ? `“${label}” moves` : "The story moves"} the deck: ${parts.join(", ")}. Click the story again or press ${HOTKEY_HINTS.undo} to put it back.`;
  },
  /** A story turned off and put the deck back: Story off, the deck is back: q 3.20% → 2.94%. */
  storyBack: (before: Record<string, unknown>, after: Record<string, unknown>): string | null => {
    const parts = movedParts(before, after);
    return parts.length ? `Story off, the deck is back: ${parts.join(", ")}.` : null;
  },
};
