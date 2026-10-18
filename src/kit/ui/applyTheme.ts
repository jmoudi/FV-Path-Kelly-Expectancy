import { THEME } from "@kit/charts/theme";

/** Writes the palette into the CSS variables the stylesheets read (was inline in main.tsx). Call once before rendering. */
export function applyThemeVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--bg", THEME.page);
  root.style.setProperty("--surface", THEME.surface);
  root.style.setProperty("--raised", THEME.raised);
  root.style.setProperty("--hairline", THEME.hairline);
  root.style.setProperty("--grid", THEME.grid);
  root.style.setProperty("--ink", THEME.ink);
  root.style.setProperty("--ink-2", THEME.ink2);
  root.style.setProperty("--muted", THEME.muted);
  for (const [role, hex] of Object.entries(THEME.roles)) root.style.setProperty(`--${role}`, hex);
}
