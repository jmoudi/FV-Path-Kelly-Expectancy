import type { Datasets } from "@app/params/datasets";
import type { Params } from "@app/params/params";
import { deckView, type DeckView } from "@app/deck/deckView";
import { derive, type Derived } from "./derived";
import { buildDesk, type DeskView } from "@app/desk/desk";
import { buildAxes } from "./axes";
import { buildBinary } from "./binary";
import { buildCalibration } from "./calibration";
import { buildChaining } from "./chaining";
import { buildCorrelation } from "./correlation";
import { buildDiversification } from "./diversification";
import { buildMeanMedian } from "./meanMedian";
import { buildWing } from "./wing";
import type { ScenarioView } from "./types";

export type Builder = (p: Params, d: Derived, data: Datasets) => ScenarioView;

export const BUILDERS: Builder[] = [buildBinary, buildMeanMedian, buildCalibration, buildWing, buildDiversification, buildCorrelation, buildAxes, buildChaining];

/** What a build reads: the parameters and the imported data. */
export interface BuildInput {
  params: Params;
  datasets: Datasets;
}

export interface BuildResult {
  deck: DeckView;
  /** The Desk landing page: policy grid, sizing line, calibration verdict, market state. */
  desk: DeskView;
  scenarios: ScenarioView[];
  /** Milliseconds the build took. */
  ms: number;
  /** Set when the build was restricted by `only`: the scenario ids it built (the rest are missing, not empty). */
  partial?: string[];
}

export interface BuildOptions {
  /**
   * Build the deck figures, the Desk and these scenarios only (a sweep builds what is
   * on screen). Omitted: everything.
   */
  only?: string[];
}

/** The scenario id each builder produced, by position, learnt from earlier builds so `only` can skip builders. */
const builderIds: (string | undefined)[] = [];

export function buildAll(p: Params, data: Datasets, opts: BuildOptions = {}): BuildResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const derived = derive(p, data);
  const only = opts.only ? new Set(opts.only) : null;
  const scenarios: ScenarioView[] = [];
  BUILDERS.forEach((b, i) => {
    // A builder not seen yet is built (and its id learnt), so `only` never drops a scenario it names.
    const known = builderIds[i];
    if (only && known !== undefined && !only.has(known)) return;
    const s = b(p, derived, data);
    builderIds[i] = s.id;
    scenarios.push(s);
  });
  const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
  return { deck: deckView(derived, p), desk: buildDesk(p, derived), scenarios, ms, ...(only ? { partial: scenarios.map((s) => s.id) } : {}) };
}

export { derive };
export type { DeckView, DeskView, Derived, ScenarioView };
