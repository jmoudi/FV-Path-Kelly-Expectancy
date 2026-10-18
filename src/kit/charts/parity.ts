/**
 * The parity harness: compare what two backends drew for the same chart spec.
 * Used by scripts/parity.mjs (every chart × backend against ECharts) and by the
 * unit tests. Generic: it compares probes, it does not know what a chart means.
 */
import type { AxisProbe, RenderProbe } from "./probe";

export interface Disagreement {
  what: string;
  reference: string;
  got: string;
}

export interface Tolerances {
  /** Axis ends, as a share of the axis span (log axes: of the span in decades). */
  axis: number;
  /** Bar extent and centre, as a share of the axis. */
  bar: number;
  /** Band fill area, as a share of the plot. */
  band: number;
}

export const DEFAULT_TOLERANCES: Tolerances = { axis: 1e-6, bar: 0.02, band: 0.05 };

const fmt = (v: unknown) => (typeof v === "number" ? (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5 ? v.toExponential(4) : String(Number(v.toPrecision(6)))) : JSON.stringify(v));

function compareAxis(name: string, a: AxisProbe | undefined, b: AxisProbe | undefined, tol: number, out: Disagreement[]): void {
  if (!a && !b) return;
  if (!a || !b) {
    out.push({ what: `${name} axis`, reference: a ? a.kind : "none", got: b ? b.kind : "none" });
    return;
  }
  if (a.kind !== b.kind) {
    out.push({ what: `${name} axis type`, reference: a.kind, got: b.kind });
    return;
  }
  if (a.kind === "category") {
    const ca = a.categories ?? [];
    const cb = b.categories ?? [];
    if (ca.length !== cb.length || ca.some((c, i) => c !== cb[i])) out.push({ what: `${name} axis categories`, reference: ca.join(" | "), got: cb.join(" | ") });
    return;
  }
  const t = (v: number) => (a.kind === "log" ? Math.log10(v) : v);
  if (a.min == null || a.max == null || b.min == null || b.max == null) {
    out.push({ what: `${name} axis range`, reference: `${fmt(a.min)} … ${fmt(a.max)}`, got: `${fmt(b.min)} … ${fmt(b.max)}` });
    return;
  }
  const span = Math.abs(t(a.max) - t(a.min)) || 1;
  if (Math.abs(t(a.min) - t(b.min)) > tol * span || Math.abs(t(a.max) - t(b.max)) > tol * span) out.push({ what: `${name} axis range`, reference: `${fmt(a.min)} … ${fmt(a.max)}`, got: `${fmt(b.min)} … ${fmt(b.max)}` });
}

/** Every way `other` differs from `ref`. An empty list means the two drew the same chart. */
export function compareProbes(ref: RenderProbe, other: RenderProbe, tol: Tolerances = DEFAULT_TOLERANCES): Disagreement[] {
  const out: Disagreement[] = [];
  if (ref.kind !== other.kind) out.push({ what: "chart kind", reference: ref.kind, got: other.kind });
  if (ref.horizontal !== other.horizontal) out.push({ what: "bar orientation", reference: ref.horizontal ? "horizontal" : "vertical", got: other.horizontal ? "horizontal" : "vertical" });
  compareAxis("horizontal", ref.h, other.h, tol.axis, out);
  compareAxis("vertical", ref.v, other.v, tol.axis, out);
  for (const k of ["lines", "areas", "dots", "labels", "cells"] as const) {
    if ((ref[k] ?? 0) !== (other[k] ?? 0)) out.push({ what: k === "lines" ? "reference lines" : k === "areas" ? "shaded bands" : k === "dots" ? "annotation dots" : k === "labels" ? "annotation labels" : "heatmap cells", reference: fmt(ref[k] ?? 0), got: fmt(other[k] ?? 0) });
  }
  const byKey = new Map(other.series.map((s) => [s.key, s]));
  for (const s of ref.series) {
    const o = byKey.get(s.key);
    if (!o) {
      out.push({ what: `series ${s.key}`, reference: `${s.kind} × ${s.count}`, got: "missing" });
      continue;
    }
    byKey.delete(s.key);
    if (o.kind !== s.kind) out.push({ what: `series ${s.key} mark`, reference: s.kind, got: o.kind });
    if (o.count !== s.count) out.push({ what: `series ${s.key} ${s.kind === "bar" ? "bars" : s.kind === "point" ? "points" : "points on the line"}`, reference: fmt(s.count), got: fmt(o.count) });
    const filled = s.kind === "band" || s.kind === "area";
    const t = filled ? tol.band : tol.bar;
    if (s.extent != null || o.extent != null) {
      // Summed over many bars, pixel snapping adds up: allow 1% of the total as well.
      const allow = Math.max(t, 0.01 * Math.abs(s.extent ?? 0));
      if (s.extent == null || o.extent == null || Math.abs(s.extent - o.extent) > allow) out.push({ what: `series ${s.key} ${filled ? "fill area" : "bar length"}`, reference: fmt(s.extent), got: fmt(o.extent) });
    }
    // Thickness in px: a library that takes widths in data units drifts on a log axis.
    if (s.thickness != null && o.thickness != null && Math.abs(s.thickness - o.thickness) > Math.max(1.5, 0.25 * s.thickness)) out.push({ what: `series ${s.key} bar thickness`, reference: fmt(s.thickness), got: fmt(o.thickness) });
    if (s.center != null || o.center != null) {
      if (s.center == null || o.center == null || Math.abs(s.center - o.center) > t) out.push({ what: `series ${s.key} bar position`, reference: fmt(s.center), got: fmt(o.center) });
    }
  }
  for (const o of byKey.values()) out.push({ what: `series ${o.key}`, reference: "missing", got: `${o.kind} × ${o.count}` });
  return out;
}
