/// <reference lib="webworker" />
import type { Datasets, Params } from "../model/params";
import { buildAll } from "./index";

export interface BuildRequest {
  id: number;
  params: Params;
  datasets: Datasets;
}

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, params, datasets } = e.data;
  try {
    const out = buildAll(params, datasets);
    (self as unknown as Worker).postMessage({ id, out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
