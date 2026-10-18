/** Imported datasets: the numbers this explainer accepts beside its parameters (the empty value and the sanitizer are data, src/app/data/datasets.ts). */
export interface Datasets {
  /** Per-event outcomes: 0/1 full losses, or P&L per unit of max loss. */
  record: number[];
  /** Realized moves in priced sigmas, positive toward the short strike. */
  moves: number[];
}
