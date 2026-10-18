/**
 * What a sweep builds, and how a partial answer folds into the last full one. Generic
 * over any build output that is a list of scenarios (plus whatever else the app always
 * builds, e.g. its deck figures).
 */
import { allCharts, type ScenarioView } from "@kit/charts/scenario";

export interface BuildOutput {
  scenarios: ScenarioView[];
  /** Set when the build was restricted by `only`: the scenario ids it built (the rest are missing, not empty). */
  partial?: string[];
}

/**
 * What a sweep builds besides what the app always builds: the scenario of the view in
 * the address (#view/<id>), every tour section on screen (#s-<id>), and every scenario
 * with a chart card on screen (#chart-<id>).
 */
export function sweepScope(last: BuildOutput | null): string[] {
  if (!last || typeof document === "undefined") return [];
  const ids = new Set<string>();
  const view = /^#?view\/([\w-]+)/.exec(location.hash)?.[1];
  const vh = window.innerHeight;
  const onScreen = (el: Element | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < vh;
  };
  for (const s of last.scenarios) {
    if (view && (s.id === view || s.views.some((v) => v.id === view))) ids.add(s.id);
    else if (onScreen(document.getElementById(`s-${s.id}`))) ids.add(s.id);
    else if (allCharts(s).some((c) => onScreen(document.getElementById(`chart-${c.id}`)))) ids.add(s.id);
  }
  return [...ids];
}

/** A partial answer replaces the scenarios it built and keeps the others as they were last shown. */
export function mergeResult<O extends BuildOutput>(prev: O | null, next: O): O {
  if (!next.partial || !prev) return next;
  const fresh = new Map(next.scenarios.map((s) => [s.id, s]));
  const scenarios = prev.scenarios.map((s) => fresh.get(s.id) ?? s);
  for (const s of next.scenarios) if (!prev.scenarios.some((x) => x.id === s.id)) scenarios.push(s);
  return { ...next, scenarios };
}
