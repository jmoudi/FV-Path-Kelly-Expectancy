/**
 * Numbers as text, on top of format.ts: shares, multiples, signed values, counts,
 * durations. Every string an explainer shows a number in comes from here or format.ts;
 * the minus sign is always U+2212. No React, no DOM.
 */

import { formatNumber, MINUS, typographic } from "./format";

/** A share as a percentage with `dd` decimals: 0.0294 → "2.94%". */
export const pct = (v: number, dd = 0) => (Number.isFinite(v) ? typographic(`${(v * 100).toFixed(dd)}%`) : formatNumber(v));
export const pct1 = (v: number) => pct(v, 1);
export const pct2 = (v: number) => pct(v, 2);
export const pct3 = (v: number) => pct(v, 3);
/** A multiple of the starting tranche: 1.09 → "1.09×". */
export const x2 = (v: number) => (Number.isFinite(v) ? typographic(`${v.toFixed(2)}×`) : formatNumber(v));
/** A signed percentage: +9.4% / −4.2%. */
export const signedPct1 = (v: number) => signedPct(v, 1);
export function signedPct(v: number, dd = 1): string {
  if (!Number.isFinite(v)) return v < 0 ? `${MINUS}∞` : "∞";
  const s = (Math.abs(v) * 100).toFixed(dd);
  const zero = Number(s) === 0;
  return `${zero ? "" : v < 0 ? MINUS : "+"}${s}%`;
}
/** A difference between two rates, in percentage points: 0.0044 → "+0.44 pp". */
export function signedPp(v: number, dd = 2): string {
  if (!Number.isFinite(v)) return v < 0 ? `${MINUS}∞` : "∞";
  const s = (Math.abs(v) * 100).toFixed(dd);
  const zero = Number(s) === 0;
  return `${zero ? "" : v < 0 ? MINUS : "+"}${s} pp`;
}
/** A count with thousands separators: 1453 → "1,453". */
export const fmtInt = (v: number) => (Number.isFinite(v) ? typographic(Math.round(v).toLocaleString("en-US")) : formatNumber(v));
/** A sigma distance: 2 → "2.00σ". */
export const sigma = (v: number) => typographic(`${v.toFixed(2)}σ`);
/** A ratio: 1.17 → "1.17×". */
export const ratio = (v: number) => typographic(`${v.toFixed(2)}×`);

/** A probability formatted so that tiny values stay readable. */
export function smallPct(v: number): string {
  if (!Number.isFinite(v)) return formatNumber(v);
  if (v === 0) return "0%";
  const a = Math.abs(v);
  if (a < 1e-6) return `${v < 0 ? MINUS : ""}< 0.0001%`;
  if (a < 1e-4) return typographic(`${(v * 100).toPrecision(2)}%`);
  if (a < 0.01) return typographic(`${(v * 100).toFixed(3)}%`);
  if (a < 0.1) return typographic(`${(v * 100).toFixed(2)}%`);
  return typographic(`${(v * 100).toFixed(1)}%`);
}

/** A time interval: sub-second in milliseconds, seconds otherwise. */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return formatNumber(ms);
  if (Math.abs(ms) < 1000) return `${typographic(Math.round(ms).toString())} ms`;
  const s = ms / 1000;
  return `${typographic(Number.isInteger(s) ? s.toFixed(0) : s.toFixed(1))} s`;
}

/** Events at a yearly pace, as a duration: "7 months", "2.5 years", "18 years". */
export function years(events: number, perYear: number): string {
  const y = events / perYear;
  if (!Number.isFinite(y)) return "never";
  if (y < 1) return `${Math.max(1, Math.round(y * 12))} months`;
  if (y < 10) return `${typographic(y.toFixed(1))} years`;
  return `${typographic(y.toFixed(0))} years`;
}
