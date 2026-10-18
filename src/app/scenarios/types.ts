/** This explainer's names for the kit's scenario types, bound to its Params. */
import type { Params } from "@app/model/params";
import type { Action as KitAction, ResponsibilityView as KitResponsibilityView, ScenarioView as KitScenarioView } from "@kit/charts/scenario";

export type { KPI, Note, SourceFigure } from "@kit/charts/scenario";
export { allCharts, quoted, viewOfChart } from "@kit/charts/scenario";
export type ScenarioView = KitScenarioView<Params>;
export type Action = KitAction<Params>;
export type ResponsibilityView = KitResponsibilityView<Params>;
