/** The imported datasets' empty value and their sanitizer (the Datasets contract is src/app/model/datasets.ts). */
import type { Datasets } from "@app/model/datasets";

export const EMPTY_DATASETS: Datasets = { record: [], moves: [] };

export function sanitizeDatasets(input: unknown): Datasets {
  const out: Datasets = { record: [], moves: [] };
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const k of ["record", "moves"] as const) {
    const v = src[k];
    if (Array.isArray(v)) out[k] = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).slice(0, 100_000);
  }
  return out;
}
