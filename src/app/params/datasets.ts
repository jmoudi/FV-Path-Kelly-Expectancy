/** Imported datasets: the numbers this explainer accepts beside its parameters. */
export interface Datasets {
  /** Per-event outcomes: 0/1 full losses, or P&L per unit of max loss. */
  record: number[];
  /** Realized moves in priced sigmas, positive toward the short strike. */
  moves: number[];
}

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
