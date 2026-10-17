import type { BackendId, ChartSpec, NumberFormat, Row } from "../spec";

export interface RenderHandle {
  update(spec: ChartSpec): void;
  resize(): void;
  dispose(): void;
}

export interface Backend {
  id: BackendId;
  label: string;
  mount(el: HTMLElement, spec: ChartSpec): RenderHandle;
}

/** d3-format strings used by Plotly and Vega-Lite tick formatting. */
export function d3Format(fmt?: NumberFormat): string | undefined {
  switch (fmt) {
    case "pct":
      return ".0%";
    case "pct1":
      return ".1%";
    case "pct2":
      return ".2%";
    case "pct3":
      return ".3%";
    case "x":
    case "x2":
      return ".2f";
    case "int":
      return ",d";
    case "sci":
      return ".1e";
    default:
      return undefined;
  }
}

export function numberOrNull(v: Row[string]): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Unique x values in first-seen order (for categorical axes). */
export function categories(rows: Row[], field: string): (string | number)[] {
  const seen = new Set<string | number>();
  const out: (string | number)[] = [];
  for (const r of rows) {
    const v = r[field];
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function legendSeries(spec: ChartSpec) {
  return spec.series.filter((s) => s.legend !== false);
}

export function showLegend(spec: ChartSpec): boolean {
  if (spec.legend === false) return false;
  return legendSeries(spec).length >= 2;
}
