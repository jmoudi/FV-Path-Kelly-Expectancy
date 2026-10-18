/**
 * This explainer's events: the kit's map (src/kit/events/types.ts) plus its own. The bus
 * is created in src/main.tsx and passed through <KitProvider bus>; components reach it
 * with useAppBus / useAppEvent (src/app/view/bus.ts). Types only.
 */
import type { KitEvents } from "@kit/events/types";
import type { Market } from "@app/model/params";

export interface AppEvents extends KitEvents {
  /** The market switch moved the deck to another pricing (the parameters it set arrive as param:changed, source "switch"). */
  "market:switched": { from: Market; to: Market };
}
