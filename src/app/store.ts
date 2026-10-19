/** The one store of this explainer: the kit's factory with this app's schema, data, presets and keys. */
import { createAppStore, type KitState } from "@kit/state/createAppStore";
import { plannerFor } from "@kit/sweeps/adapter";
import type { Datasets } from "@app/model/datasets";
import { EMPTY_DATASETS, sanitizeDatasets } from "@app/data/datasets";
import type { Params } from "@app/model/params";
import { PRESET_CATALOG } from "@app/data/presets";
import { CONSTRAINTS } from "@app/data/constraints";
import { SCHEMA } from "@app/data/schema";
import { SWEEPS } from "@app/sweeps";

export type AppState = KitState<Params, Datasets>;

export const useStore = createAppStore<Params, Datasets>({
  schema: SCHEMA,
  datasets: { empty: EMPTY_DATASETS, sanitize: sanitizeDatasets },
  // Saved states and the interaction scripts read this key: never change it.
  storageKey: "tranche-replay:v1",
  // 4: the snapshot of parameters a story moved (storyPrev) travels with the state.
  // 5: parameter settings (paramSettings: step, fine step, wheel step, drag, decimals, slider per parameter).
  // 6: parameter locks (locks: key -> true, the clean-season probability "pClean" among them).
  version: 6,
  presets: PRESET_CATALOG,
  planner: plannerFor(SWEEPS),
  // The relations among the parameters while some are locked (src/app/data/constraints.ts).
  constraints: CONSTRAINTS,
});
