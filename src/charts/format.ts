import type { NumberFormat } from "./spec";

export function formatNumber(v: number | string | null | undefined, fmt: NumberFormat = "auto"): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "–";
  switch (fmt) {
    case "pct":
      return `${(v * 100).toFixed(0)}%`;
    case "pct1":
      return `${(v * 100).toFixed(1)}%`;
    case "pct2":
      return `${(v * 100).toFixed(2)}%`;
    case "pct3":
      return `${(v * 100).toFixed(3)}%`;
    case "x":
      return `${v.toFixed(2)}×`;
    case "x2":
      return `${v.toFixed(2)}`;
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "sci":
      return v === 0 ? "0" : v.toExponential(1);
    case "num":
      return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);
    default:
      return autoFormat(v);
  }
}

export function autoFormat(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return v.toExponential(1);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  if (a >= 1e-4) return v.toFixed(5);
  return v.toExponential(1);
}

/** Compact percent for axis ticks: 3.4% or 0.05% depending on magnitude. */
export function tickPercent(v: number): string {
  const p = v * 100;
  const a = Math.abs(p);
  if (a === 0) return "0%";
  if (a >= 10) return `${p.toFixed(0)}%`;
  if (a >= 1) return `${p.toFixed(1)}%`;
  if (a >= 0.1) return `${p.toFixed(2)}%`;
  if (a >= 0.001) return `${p.toFixed(3)}%`;
  return `${p.toExponential(0)}%`;
}

export function tickFormatter(fmt?: NumberFormat): (v: number) => string {
  if (!fmt || fmt === "auto" || fmt === "num") return autoFormat;
  if (fmt.startsWith("pct")) return tickPercent;
  if (fmt === "x") return (v) => (v < 0 ? "" : `${autoFormat(v)}×`);
  return (v) => formatNumber(v, fmt);
}
