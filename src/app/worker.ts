/// <reference lib="webworker" />
import type { Datasets } from "@app/params/datasets";
import type { Params } from "@app/params/params";
import { buildAll } from "@app/scenarios";

export interface BuildRequest {
  id: number;
  params: Params;
  datasets: Datasets;
  /** During a sweep: the scenarios on screen; the deck figures and the Desk are always built. */
  only?: string[];
}

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, params, datasets, only } = e.data;
  try {
    const out = buildAll(params, datasets, only ? { only } : {});
    (self as unknown as Worker).postMessage({ id, out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
