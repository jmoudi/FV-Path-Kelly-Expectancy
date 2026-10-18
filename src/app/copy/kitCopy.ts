/**
 * This explainer's words for the kit's frames. Each value is the literal the frame
 * showed before the restructure; when you replace a literal in a kit file with a copy
 * key, paste that file's literal here so the page reads exactly as before.
 */
import type { KitCopy } from "@kit/ui/copy";
import type { Params } from "@app/params/params";
import { movedBadge } from "@app/scenarios/derived";

export const KIT_COPY: Partial<KitCopy> = {
  exportFilePrefix: "tranche-replay",
  sourceFiguresCaption: "Recomputed from the current deck, except where the label fixes an input at the discussion's number.",
  resetToDefaultTitle: "Back to the discussion's value",
  resetParamsButton: "Reset every parameter to the discussion's inputs",
  resetParamsConfirm: "Yes, back to the discussion's inputs",
  affectsAllBadge: "all sections",
  affectsAllTitle: "This input enters the deck's policies, so every section moves with it.",
  manySeriesNote: (n) => `${n} sampled paths. Change the count under Settings → Paths in fan charts.`,
  storyMoved: (before, now) => movedBadge(before as Partial<Params> | undefined, now as unknown as Params),
  engineSettingsBlurb: "How season distributions are computed and how many samples the sampled charts draw.",
};
