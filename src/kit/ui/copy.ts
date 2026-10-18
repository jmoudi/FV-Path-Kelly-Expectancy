/**
 * Every sentence a kit frame shows on its own. The defaults are neutral; an app passes
 * its overrides to <KitProvider copy={...}> (this explainer: src/app/copy/kitCopy.ts).
 */
export interface KitCopy {
  /** Prefix of exported state files: "<prefix>-2026-10-18.json". */
  exportFilePrefix: string;
  /** Caption under the quoted-vs-recomputed list. */
  sourceFiguresCaption: string;
  /** Tooltip of "↺ default" in the sweep strip. */
  resetToDefaultTitle: string;
  /** Settings: the button that resets every parameter, and its confirmation. */
  resetParamsButton: string;
  resetParamsConfirm: string;
  /** Badge and tooltip on inputs whose schema entry says affectsAll. */
  affectsAllBadge: string;
  affectsAllTitle: string;
  /** Authoring popover, charts with more than 8 series. */
  manySeriesNote: (count: number) => string;
}

export const DEFAULT_COPY: KitCopy = {
  exportFilePrefix: "explainer-state",
  sourceFiguresCaption: "Recomputed from the current inputs. Small differences are rounding in the source; large ones mean the inputs have moved away from it.",
  resetToDefaultTitle: "Back to the default value",
  resetParamsButton: "Reset every parameter to its default",
  resetParamsConfirm: "Yes, back to the defaults",
  affectsAllBadge: "all sections",
  affectsAllTitle: "This input moves every section.",
  manySeriesNote: (n) => `${n} series.`,
};
