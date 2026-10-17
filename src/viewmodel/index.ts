import type { Params } from "../model/params";
import { derive, type Derived } from "./derived";
import { buildAxes } from "./scenarios/axes";
import { buildBinary } from "./scenarios/binary";
import { buildCalibration } from "./scenarios/calibration";
import { buildChaining } from "./scenarios/chaining";
import { buildCorrelation } from "./scenarios/correlation";
import { buildDiversification } from "./scenarios/diversification";
import { buildMeanMedian } from "./scenarios/meanMedian";
import { buildWing } from "./scenarios/wing";
import type { ScenarioView } from "./types";

export type Builder = (p: Params, d: Derived) => ScenarioView;

export const BUILDERS: Builder[] = [buildBinary, buildMeanMedian, buildCalibration, buildWing, buildDiversification, buildCorrelation, buildAxes, buildChaining];

export function buildAll(p: Params): { derived: Derived; scenarios: ScenarioView[] } {
  const derived = derive(p);
  return { derived, scenarios: BUILDERS.map((b) => b(p, derived)) };
}

export { derive };
export type { Derived, ScenarioView };
