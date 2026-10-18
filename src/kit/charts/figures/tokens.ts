/**
 * Shared bits for the SVG figures: the theme's colours, the type tokens the page
 * defines (no literal px sizes here) and the one number formatter with the
 * typographic minus.
 */
import { formatNumber } from "../format";
import type { Cell, NumberFormat } from "../spec";
import { THEME } from "../theme";

export const FIGURE_FONT = {
  get family() {
    return THEME.fontUi;
  },
  get mono() {
    return THEME.fontMono;
  },
  /** Axis labels, captions, station numbers. */
  label: "var(--fs-label, 11.5px)",
  /** Legends and in-figure annotations. */
  ui: "var(--fs-ui, 13px)",
};

export interface Tokens {
  ink: string;
  ink2: string;
  muted: string;
  hairline: string;
  grid: string;
  surface: string;
}

/** Read at draw time, so configureTheme() before the first render reaches the figures. */
export const TOKENS: Tokens = {
  get ink() {
    return THEME.ink;
  },
  get ink2() {
    return THEME.ink2;
  },
  get muted() {
    return THEME.muted;
  },
  get hairline() {
    return THEME.hairline;
  },
  get grid() {
    return THEME.grid;
  },
  get surface() {
    return THEME.surface;
  },
};

/** Format a number for a figure label; the minus sign is always U+2212. */
export function figureNumber(v: number | null | undefined, fmt: NumberFormat = "auto"): string {
  if (v == null || !Number.isFinite(v)) return v == null ? "" : v > 0 ? "∞" : "−∞";
  return formatNumber(v, fmt).replace(/-/g, "−");
}

/** Read a numeric figure parameter with a fallback. */
export function numParam(params: Record<string, Cell> | undefined, key: string, fallback: number): number {
  const v = params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Read a string figure parameter with a fallback. */
export function strParam(params: Record<string, Cell> | undefined, key: string, fallback: string): string {
  const v = params?.[key];
  return typeof v === "string" ? v : fallback;
}
