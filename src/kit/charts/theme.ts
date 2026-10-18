import type { ColorRole, Emphasis } from "./spec";

/**
 * Graphite: the one theme. Colour has four jobs and no colour does two of them:
 * - the ink scale (ink, ink2, muted) for every figure, title, label and caption;
 * - the accent (cream) for "act here" only: focus ring, focused field, active chips,
 *   primary buttons, the active tab; never in a chart, never on a figure;
 * - three policy colours (a amber, b cyan, c violet) for chart marks, legend swatches,
 *   8px identity dots and that policy's annotation lines;
 * - status (loss red, good green) for ruin and clean outcomes, messages, the heat
 *   map's sign and the rates pair, as lines and dots, never on a hero figure.
 * Ordered scenarios of one parameter use the neutral ramp. The policy trio passes the
 * colour-vision separation and contrast checks on the page.
 */
export const THEME = {
  page: "#121416",
  surface: "#1a1d21",
  raised: "#22262b",
  raised2: "#2a2f35",
  hairline: "#30363d",
  grid: "#1f2226",
  ink: "#e8e9eb",
  ink2: "#b4bac1",
  muted: "#8d959e",
  /** The UI accent (chrome only) and its companions. */
  accent: "#e8e1a3",
  accentHover: "#f3edbf",
  onAccent: "#121416",
  fontUi: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  roles: {
    a: "#dfa54d",
    b: "#63cfe9",
    c: "#8976cd",
    loss: "#df6768",
    good: "#5cb572",
    ink: "#e8e9eb",
    ink2: "#b4bac1",
    muted: "#8d959e",
    ramp1: "#e4e8ed",
    ramp2: "#babec3",
    ramp3: "#8f9397",
    ramp4: "#66696d",
  } satisfies Record<ColorRole, string>,
  /** Sequential ramp (neutral) for magnitudes, dark to light. */
  sequential: ["#202429", "#393e42", "#54595e", "#767b80", "#9a9fa5", "#bfc5ca"],
  /** Diverging ramp: muted loss red <- graphite -> muted gain green, ends matched in lightness. */
  diverging: ["#ad4b4b", "#733a39", "#27292c", "#2f5838", "#38804b"],
  /** Two-state cells: won (graphite) and lost (loss red). */
  binary: ["#2a2f35", "#df6768"],
};

export type Theme = typeof THEME;
type ThemePatch = { [K in keyof Theme]?: Theme[K] extends readonly string[] ? Theme[K] : Theme[K] extends object ? Partial<Theme[K]> : Theme[K] };

/**
 * Another explainer's palette: replaces values in place, so every module that reads THEME
 * sees them. Call it before the first render (first thing in main.tsx), then applyThemeVars().
 */
export function configureTheme(patch: ThemePatch): void {
  const t = THEME as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const cur = t[k];
    if (v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object") Object.assign(cur, v);
    else if (v !== undefined) t[k] = v;
  }
}

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

/** Status colours may fill a bar at most at this opacity, so a red or green bar never outshouts the data. */
export const STATUS_BAR_ALPHA = 0.6;

/**
 * A bar's fill: status roles at most STATUS_BAR_ALPHA, ink bars in secondary ink (a
 * near-white slab is the brightest mark on the page and carries no news), the rest
 * at the emphasis opacity.
 */
export function barFill(role: ColorRole | undefined, op: number): string {
  if (role === "loss" || role === "good") return withAlpha(roleColor(role), STATUS_BAR_ALPHA * op);
  if (!role || role === "ink") return withAlpha(THEME.roles.ink2, op);
  return withAlpha(roleColor(role), op);
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
