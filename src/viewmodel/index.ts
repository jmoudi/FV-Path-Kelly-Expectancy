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
}

export function buildAll(p: Params, data: Datasets): BuildResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const derived = derive(p, data);
  const scenarios = BUILDERS.map((b) => b(p, derived, data));
  const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
  return { deck: deckView(derived, p), desk: buildDesk(p, derived), scenarios, ms };
}

export { derive };
export type { DeckView, DeskView, Derived, ScenarioView };
