/** The one store of this explainer: the kit's factory with this app's schema, data, presets and keys. */
import { createAppStore, type KitState } from "@kit/state/createAppStore";
import { plannerFor } from "@kit/sweeps/adapter";
import { EMPTY_DATASETS, sanitizeDatasets, type Datasets } from "@app/params/datasets";
import type { Params } from "@app/params/params";
import { PRESET_CATALOG } from "@app/params/presets";
import { SCHEMA } from "@app/params/schema";
import { SWEEPS } from "@app/sweeps";

export type AppState = KitState<Params, Datasets>;

export const useStore = createAppStore<Params, Datasets>({
  schema: SCHEMA,
  datasets: { empty: EMPTY_DATASETS, sanitize: sanitizeDatasets },
  // Saved states and the interaction scripts read this key: never change it.
  storageKey: "tranche-replay:v1",
  // 4: the snapshot of parameters a story moved (storyPrev) travels with the state.
  version: 4,
  presets: PRESET_CATALOG,
  planner: plannerFor(SWEEPS),
});
