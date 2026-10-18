import type { BackendId } from "./spec";
import type { Backend } from "./backends/types";

/**
 * The switchboard. Every chart spec can be routed to any of these backends; each
 * is loaded on first use so the page does not pay for the libraries it never shows.
 */
export const BACKEND_INFO: Record<BackendId, { label: string; blurb: string }> = {
  echarts: { label: "ECharts", blurb: "Canvas renderer, fast with many series. Default." },
  plotly: { label: "Plotly", blurb: "SVG renderer with unified hover. Good for reading values off lines." },
  vega: { label: "Vega-Lite", blurb: "Declarative grammar. Closest to the spec you are editing." },
  table: { label: "Table", blurb: "The numbers behind the chart. Always available." },
};

const loaders: Record<Exclude<BackendId, "table">, () => Promise<Backend>> = {
  echarts: () => import("./backends/echarts").then((m) => m.backend),
  plotly: () => import("./backends/plotly").then((m) => m.backend),
  vega: () => import("./backends/vega").then((m) => m.backend),
};

const cache = new Map<BackendId, Promise<Backend>>();

export function loadBackend(id: Exclude<BackendId, "table">): Promise<Backend> {
  let p = cache.get(id);
  if (!p) {
    p = loaders[id]();
    cache.set(id, p);
  }
  return p;
}
