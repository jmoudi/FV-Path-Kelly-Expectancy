/**
 * Resolve an xy spec's axes once, before any backend sees it: concrete domains,
 * tick positions and tick labels. Every backend then draws the same ranges and
 * the same reference-line positions.
 */
import { tickFormatter } from "./format";
import { fieldFormat, fieldLabel, type ChartSpec, type NumberFormat, type ScaleType } from "./spec";

export interface ResolvedAxis {
  field: string;
  label: string;
  scale: ScaleType;
  categorical: boolean;
  min: number;
  max: number;
  ticks: number[];
  labels: string[];
  format: NumberFormat | undefined;
  formatter: (v: number) => string;
  grid: boolean;
}

export interface ResolvedAxes {
  x: ResolvedAxis;
  y: ResolvedAxis;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** d3-style nice step for about `count` ticks. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  const m = r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1;
  return m * p;
}

export function linearTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

export function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(min) + 1e-9);
  const hi = Math.ceil(Math.log10(max) - 1e-9);
  const decades = hi - lo;
  const out: number[] = [];
  for (let e = lo; e <= hi; e++) {
    const base = Math.pow(10, e);
    out.push(base);
    if (decades <= 2 && e < hi) out.push(2 * base, 5 * base);
  }
  return out.filter((v) => v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9));
}

function dataExtent(spec: ChartSpec, which: "x" | "y", log: boolean): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const consider = (v: unknown) => {
    if (!isNum(v)) return;
    if (log && v <= 0) return;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  };
  if (which === "x") {
    const fields = new Set(spec.series.map((s) => s.xField ?? spec.x.field));
    if (!fields.size) fields.add(spec.x.field);
    for (const r of spec.data.rows) for (const fld of fields) consider(r[fld]);
    for (const a of spec.annotations ?? []) {
      if (a.kind === "vline" || a.kind === "point" || a.kind === "label" || a.kind === "xband") {
        consider(a.x);
        consider(a.x2);
      }
    }
  } else {
    for (const r of spec.data.rows) for (const s of spec.series) consider(r[s.field]);
    for (const a of spec.annotations ?? []) {
      if (a.kind === "hline" || a.kind === "point" || a.kind === "label" || a.kind === "yband") {
        consider(a.y);
        consider(a.y2);
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [lo, hi];
}

function resolveOne(spec: ChartSpec, which: "x" | "y"): ResolvedAxis {
  const ax = spec[which];
  const scale: ScaleType = ax.scale === "log" ? "log" : "linear";
  const format = ax.format ?? fieldFormat(spec.data, ax.field);
  const formatter = tickFormatter(format);
  const categorical = which === "x" && !!ax.categorical;
  const label = ax.label ?? fieldLabel(spec.data, ax.field);
  if (categorical) return { field: ax.field, label, scale: "linear", categorical: true, min: 0, max: 1, ticks: [], labels: [], format, formatter, grid: ax.grid !== false };
  const ext = dataExtent(spec, which, scale === "log") ?? (scale === "log" ? [0.01, 1] : [0, 1]);
  let [lo, hi] = ext;
  const d0 = ax.domain?.[0];
  const d1 = ax.domain?.[1];
  let min: number;
  let max: number;
  if (scale === "log") {
    if (lo <= 0) lo = 1e-6;
    if (hi <= lo) hi = lo * 10;
    min = d0 != null && d0 > 0 ? d0 : Math.pow(10, Math.floor(Math.log10(lo) + 1e-9));
    max = d1 != null && d1 > 0 ? d1 : Math.pow(10, Math.ceil(Math.log10(hi) - 1e-9));
    if (max <= min) max = min * 10;
  } else {
    if (hi <= lo) {
      hi = lo + (Math.abs(lo) || 1);
    }
    const zeroBase = which === "y" && ax.zero !== false && lo >= 0;
    if (zeroBase) lo = 0;
    const step = niceStep(hi - lo, 6);
    min = d0 != null ? d0 : Math.floor(lo / step + 1e-9) * step;
    max = d1 != null ? d1 : Math.ceil(hi / step - 1e-9) * step;
    if (max <= min) max = min + step;
    // Keep headroom above the data on a y axis, so top labels do not collide with the frame.
    if (which === "y" && d1 == null && hi > min && max - hi < step * 0.15) max += step;
  }
  const ticks = scale === "log" ? logTicks(min, max) : linearTicks(min, max, which === "x" ? 7 : 6);
  const labels = ticks.map(formatter);
  return { field: ax.field, label, scale, categorical: false, min, max, ticks, labels, format, formatter, grid: ax.grid !== false };
}

export function resolveAxes(spec: ChartSpec): ResolvedAxes {
  return { x: resolveOne(spec, "x"), y: resolveOne(spec, "y") };
}
