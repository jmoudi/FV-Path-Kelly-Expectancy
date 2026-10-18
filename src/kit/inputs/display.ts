/**
 * How a synthetic number field shows and reads its value. Percent units are stored
 * as shares (0.0294) and shown as percentages (2.94); the minus sign is U+2212 and
 * both minus signs parse.
 */

export const MINUS = "−";

function isPercent(unit: string): boolean {
  return unit === "pct" || unit === "pct2";
}

/** Decimal places shown in the box, in display units. */
export function decimalsFor(unit: string, step: number, override?: number): number {
  if (override != null) return override;
  const s = isPercent(unit) ? step * 100 : step;
  if (!(s > 0) || s >= 1) return 0;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(s) - 1e-9)));
}

/** "2.94", "50", "1.30"; an all-zero fraction is dropped ("3" for 3.00). */
export function toDisplay(v: number, unit: string, decimals: number): string {
  if (!Number.isFinite(v)) return "";
  const x = isPercent(unit) ? v * 100 : v;
  let s = x.toFixed(decimals);
  if (decimals > 0 && /\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  return s.replace(/^-/, MINUS);
}

/** Parse what was typed; null when it is not a number. */
export function fromDisplay(s: string, unit: string): number | null {
  const cleaned = s.replace(/[−–]/g, "-").replace(",", ".").replace(/[%×σ\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isPercent(unit) ? n / 100 : n;
}

/** The unit sign shown after the number when the box is not being edited. */
export function suffix(unit: string): string {
  switch (unit) {
    case "pct":
    case "pct2":
      return "%";
    case "x":
      return "×";
    case "sigma":
      return "σ";
    default:
      return "";
  }
}

/** Snap to the step grid that starts at min, inside [min, max]. */
export function snapTo(v: number, min: number, max: number, step: number): number {
  const s = step > 0 ? step : 1;
  const r = min + Math.round((v - min) / s) * s;
  return Math.max(min, Math.min(max, Number(r.toPrecision(12))));
}

/** Where v sits on the track, 0..1. */
export function fractionOf(v: number, min: number, max: number): number {
  return max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
}
