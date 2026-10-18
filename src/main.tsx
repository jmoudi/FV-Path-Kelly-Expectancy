import React from "react";
import { createRoot } from "react-dom/client";
// Stylesheets first, in cascade order: the theme's tokens and controls, then the kit's
// frames. Component stylesheets imported by their own modules (the deck's) come after
// both, so they win where they style the same class.
import "@kit/ui/theme.css";
import "@kit/ui/kit.css";
import { applyThemeVars } from "@kit/ui/applyTheme";
import { registerFigures } from "@kit/charts/figures/registry";
import { FIGURES } from "@app/view/figures";
import { KitProvider } from "@kit/state/context";
import { createBus } from "@kit/events/bus";
import type { AppEvents } from "@app/events";
import { KIT_COPY } from "@app/data/copy/kitCopy";
import { SCHEMA } from "@app/data/schema";
import { useStore } from "@app/store";
import { SWEEPS } from "@app/sweeps";
import { App } from "@app/view/App";

// The palette lives in one place (src/kit/charts/theme.ts); the CSS reads it from these variables.
applyThemeVars();

registerFigures(FIGURES);

// The one event bus: the store's actions, the replayer, the router and the build emit on
// it; notices and any other cross-cutting feature listen. In development every event is
// printed (console.debug "[bus] …"), except the replayer's ticks.
const bus = createBus<AppEvents>({
  log: import.meta.env.DEV ? (name, payload) => name !== "sweep:stepped" && !(name === "param:changed" && (payload as AppEvents["param:changed"]).source === "sweep") : false,
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <KitProvider store={useStore} schema={SCHEMA} sweeps={SWEEPS} copy={KIT_COPY} bus={bus}>
      <App />
    </KitProvider>
  </React.StrictMode>,
);
