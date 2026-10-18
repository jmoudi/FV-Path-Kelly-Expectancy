import type { Datasets, Params } from "../model/params";
import { deckView, derive, type DeckView, type Derived } from "./derived";
import { buildDesk, type DeskView } from "./desk";
import { buildAxes } from "./scenarios/axes";
import { buildBinary } from "./scenarios/binary";
import { buildCalibration } from "./scenarios/calibration";
import { buildChaining } from "./scenarios/chaining";
import { buildCorrelation } from "./scenarios/correlation";
import { buildDiversification } from "./scenarios/diversification";
import { buildMeanMedian } from "./scenarios/meanMedian";
import { buildWing } from "./scenarios/wing";
import type { ScenarioView } from "./types";

export type Builder = (p: Params, d: Derived, data: Datasets) => ScenarioView;

export const BUILDERS: Builder[] = [buildBinary, buildMeanMedian, buildCalibration, buildWing, buildDiversification, buildCorrelation, buildAxes, buildChaining];

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
