import type { ColorRole, Emphasis } from "./spec";

/**
 * Graphite: the one theme. Three policy hues (amber, cyan, violet), a loss red and a
 * gain green reserved for status, and a cyan ramp for ordered scenarios of one
 * parameter. Validated for colour-vision separation on the chart surface.
 */
export const THEME = {
  page: "#121416",
  surface: "#191c1f",
  raised: "#20242a",
  hairline: "#2b3036",
  grid: "#23272c",
  ink: "#e8e9eb",
  ink2: "#aeb4bb",
  muted: "#7d858e",
  fontUi: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  roles: {
    a: "#C4861A",
    b: "#2BA3C7",
    c: "#8B6FE4",
    loss: "#D64566",
    good: "#46A860",
    ink: "#e8e9eb",
    muted: "#7d858e",
    ramp1: "#9fd6e8",
    ramp2: "#4fb6d4",
    ramp3: "#1f87a7",
    ramp4: "#125c74",
  } satisfies Record<ColorRole, string>,
  /** Sequential ramp (cyan) for magnitudes, light to dark. */
  sequential: ["#1b2c33", "#174a5b", "#1f6f88", "#2b97b8", "#59b9d4", "#9fd6e8"],
  /** Diverging ramp: loss red <- neutral graphite -> gain green. */
  diverging: ["#D64566", "#8a3a4e", "#3a3b40", "#2f6a44", "#46A860"],
  /** Two-state cells: won (calm) and lost (loss red). */
  binary: ["#1f4a5a", "#D64566"],
};

export function heatPalette(kind: "diverging" | "sequential" | "binary"): string[] {
  return kind === "diverging" ? THEME.diverging : kind === "binary" ? THEME.binary : THEME.sequential;
}

export function roleColor(role: ColorRole | undefined): string {
  return role ? THEME.roles[role] : THEME.roles.ink;
}

export function emphasisOpacity(e: Emphasis | undefined): number {
  return e === "muted" ? 0.35 : e === "strong" ? 1 : 0.9;
}

export function emphasisWidth(e: Emphasis | undefined, base = 2): number {
  return e === "muted" ? Math.max(1, base - 1) : e === "strong" ? base + 1 : base;
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
