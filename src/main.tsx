import React from "react";
import { createRoot } from "react-dom/client";
// Stylesheets first, in cascade order: the theme's tokens and controls, then the kit's
// frames. Component stylesheets imported by their own modules (the deck's) come after
// both, so they win where they style the same class.
import "./ui/theme.css";
import "./kit/ui/kit.css";
import { THEME } from "./charts/theme";
import { App } from "./ui/App";

// The palette lives in one place (charts/theme.ts); the CSS reads it from these variables.
const root = document.documentElement;
root.style.setProperty("--bg", THEME.page);
root.style.setProperty("--surface", THEME.surface);
root.style.setProperty("--raised", THEME.raised);
root.style.setProperty("--hairline", THEME.hairline);
root.style.setProperty("--grid", THEME.grid);
root.style.setProperty("--ink", THEME.ink);
root.style.setProperty("--ink-2", THEME.ink2);
root.style.setProperty("--muted", THEME.muted);
for (const [role, hex] of Object.entries(THEME.roles)) root.style.setProperty(`--${role}`, hex);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
