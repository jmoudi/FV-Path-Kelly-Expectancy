import type { NumberFormat } from "./spec";

/**
 * Number formatting for charts, tables and tick labels. It prints exactly what the
 * app's formatter prints (src/viewmodel/derived.ts): the same rounding per format,
 * and the typographic minus U+2212, never the hyphen JavaScript emits.
 */
export const MINUS = "−";

/** Replace the hyphen-minus a JavaScript number prints with the typographic minus. */
export function typographic(s: string): string {
  return s.replace(/-/g, MINUS);
}

const int = (v: number) => typographic(Math.round(v).toLocaleString("en-US"));

export function formatNumber(v: number | string | null | undefined, fmt: NumberFormat = "auto"): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? `${MINUS}∞` : "–";
  switch (fmt) {
    case "pct":
      return typographic(`${(v * 100).toFixed(0)}%`);
    case "pct1":
      return typographic(`${(v * 100).toFixed(1)}%`);
    case "pct2":
      return typographic(`${(v * 100).toFixed(2)}%`);
    case "pct3":
      return typographic(`${(v * 100).toFixed(3)}%`);
    case "x":
      return typographic(`${v.toFixed(2)}×`);
    case "x2":
      return typographic(v.toFixed(2));
    case "int":
      return int(v);
    case "sci":
      return v === 0 ? "0" : typographic(v.toExponential(1));
    case "num":
      return typographic(Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));
    default:
      return autoFormat(v);
  }
}

/** Drop trailing zeros after the decimal point ("1.50" -> "1.5", "2.00" -> "2"). */
function trim(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Shortest exact decimal for a tick value, at most `maxDecimals` places. */
function shortest(v: number, maxDecimals: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  for (let d = 0; d <= maxDecimals; d++) {
    const s = v.toFixed(d);
    if (Math.abs(Number(s) - v) < 1e-9 * Math.max(1, a)) return typographic(trim(s));
  }
  return typographic(trim(v.toFixed(maxDecimals)));
}

export function autoFormat(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return typographic(v.toExponential(1));
  if (a >= 1000) return int(v);
  if (a >= 100) return typographic(v.toFixed(0));
  if (a >= 10) return typographic(v.toFixed(1));
  if (a >= 1) return typographic(v.toFixed(2));
  if (a >= 0.01) return typographic(v.toFixed(3));
  if (a >= 1e-4) return typographic(v.toFixed(5));
  return typographic(v.toExponential(1));
}

/** Tick label for a percentage: the shortest exact form, so 0.3%, 1.2%, 2.94%, 0.001%. */
export function tickPercent(v: number): string {
  const p = v * 100;
  const a = Math.abs(p);
  if (a === 0) return "0%";
  if (a >= 1e5) return typographic(`${p.toExponential(0)}%`);
  if (a < 1e-4) return typographic(`${p.toExponential(0)}%`);
  return `${shortest(p, 5)}%`;
}

/** Tick label for a multiple: 0.5×, 1×, 1.5×, 2×. Negative multiples make no sense and stay blank. */
export function tickMultiple(v: number): string {
  if (v < 0) return "";
  const a = Math.abs(v);
  if (a >= 1000) return `${int(v)}×`;
  return `${shortest(v, a < 0.1 ? 4 : 3)}×`;
}

export function tickPlain(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return typographic(v.toExponential(0));
  if (a >= 1000) return int(v);
  return shortest(v, a < 0.01 ? 5 : 3);
}

export function tickFormatter(fmt?: NumberFormat): (v: number) => string {
  if (!fmt || fmt === "auto" || fmt === "num" || fmt === "x2") return tickPlain;
  if (fmt.startsWith("pct")) return tickPercent;
  if (fmt === "x") return tickMultiple;
  if (fmt === "int") return int;
  return (v) => formatNumber(v, fmt);
}
