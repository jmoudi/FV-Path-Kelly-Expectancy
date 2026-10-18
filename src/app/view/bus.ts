/** The kit's bus hooks, typed with this explainer's events (src/app/events.ts). */
import { busHooks } from "@kit/events/react";
import type { AppEvents } from "@app/events";

export const { useBus: useAppBus, useBusEvent: useAppEvent } = busHooks<AppEvents>();
