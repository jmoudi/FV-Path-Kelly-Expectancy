import React from "react";
import { createRoot } from "react-dom/client";
// Stylesheets first, in cascade order: the theme's tokens and controls, then the kit's
// frames. Component stylesheets imported by their own modules (the deck's) come after
// both, so they win where they style the same class.
import "@kit/ui/theme.css";
import "@kit/ui/kit.css";
import { applyThemeVars } from "@kit/ui/applyTheme";
import { registerFigures } from "@kit/charts/figures/registry";
import { FIGURES } from "@app/figures";
import { KitProvider } from "@kit/state/context";
import { KIT_COPY } from "@app/copy/kitCopy";
import { SCHEMA } from "@app/params/schema";
import { useStore } from "@app/store";
import { SWEEPS } from "@app/sweeps";
import { App } from "@app/App";

// The palette lives in one place (src/kit/charts/theme.ts); the CSS reads it from these variables.
applyThemeVars();

registerFigures(FIGURES);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <KitProvider store={useStore} schema={SCHEMA} sweeps={SWEEPS} copy={KIT_COPY}>
      <App />
    </KitProvider>
  </React.StrictMode>,
);
