/**
 * This explainer's sweep presets. They name the anchors its schema declares
 * (optimistic, deck, break-even for q); on an input that lacks them they fall back to
 * the built-ins. The kit's sanitizers and the store take them as a PresetCatalog.
 */
import { clonePreset, type PresetCatalog, type SweepPreset } from "@kit/sweeps/types";

/** The three presets a fresh state starts with. */
export const DEFAULT_PRESETS: SweepPreset[] = [
  {
    id: "optimistic-to-break-even",
    name: "Optimistic to break-even",
    kind: "loop",
    range: { mode: "anchors", lo: { id: "optimistic", fallback: "min" }, hi: { id: "break-even", fallback: "max" } },
    step: { size: 0.0005, unit: "units" },
    intervalMs: 400,
    scenarios: [],
  },
  {
    id: "around-current",
    name: "Around the current value",
    kind: "pingpong",
    range: { mode: "around", half: 0.2, unit: "share" },
    step: { size: 0.05, unit: "share" },
    intervalMs: 300,
    scenarios: [],
  },
  {
    id: "three-spots",
    name: "Three spots",
    kind: "scenarios",
    range: { mode: "full" },
    step: { size: 0.1, unit: "share" },
    intervalMs: 1000,
    scenarios: [
      { anchor: { id: "optimistic", fallback: "min" }, at: 0, holdMs: 2000 },
      { anchor: { id: "deck", fallback: "current" }, at: 0.5, holdMs: 2000 },
      { anchor: { id: "break-even", fallback: "max" }, at: 1, holdMs: 2000 },
    ],
  },
];

/** Ids the presets had before they spoke the input's units, and the preset that replaces each. */
export const LEGACY_PRESET_IDS: Record<string, string> = {
  "loop-full": "optimistic-to-break-even",
  "bounce-mid": "around-current",
  "three-spots": "three-spots",
};

export const PRESET_CATALOG: PresetCatalog = { defaults: DEFAULT_PRESETS, legacy: LEGACY_PRESET_IDS };

export function defaultPresets(): SweepPreset[] {
  return DEFAULT_PRESETS.map(clonePreset);
}
