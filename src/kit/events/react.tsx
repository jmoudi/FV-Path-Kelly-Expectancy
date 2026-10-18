/**
 * The bus in React: `<BusProvider bus>` (KitProvider renders it), `useBus()` and
 * `useBusEvent(name, handler)`, which subscribes for the component's lifetime and always
 * calls the latest handler. `busHooks<AppEvents>()` gives the same two hooks typed with
 * an app's own event map.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { Bus, EventName, Handler } from "./bus";
import type { KitEvents } from "./types";

const BusContext = createContext<Bus<any> | null>(null);

export function BusProvider({ bus, children }: { bus: Bus<any>; children: ReactNode }) {
  return <BusContext.Provider value={bus}>{children}</BusContext.Provider>;
}

/** The bus of the nearest provider. */
export function useBus<E extends object = KitEvents>(): Bus<E> {
  const bus = useContext(BusContext);
  if (!bus) throw new Error("The event bus is missing: render inside <KitProvider bus> (see src/kit/events/README.md).");
  return bus as Bus<E>;
}

/** The bus of the nearest provider, or null outside one (for a kit piece that also renders on its own, such as `Link`). */
export function useOptionalBus<E extends object = KitEvents>(): Bus<E> | null {
  return useContext(BusContext) as Bus<E> | null;
}

/** Subscribe to one event for as long as the component is mounted; the newest `handler` is the one called. */
export function useBusEvent<K extends EventName<KitEvents>>(name: K, handler: Handler<KitEvents[K]>): void {
  useTypedBusEvent<KitEvents, K>(name, handler);
}

function useTypedBusEvent<E extends object, K extends EventName<E>>(name: K, handler: Handler<E[K]>): void {
  const bus = useBus<E>();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => bus.on(name, (p) => latest.current(p)), [bus, name]);
}

/** The two hooks typed with an app's event map: `export const { useBus: useAppBus, useBusEvent: useAppEvent } = busHooks<AppEvents>();` */
export function busHooks<E extends object>() {
  return {
    useBus: (): Bus<E> => useBus<E>(),
    useBusEvent: <K extends EventName<E>>(name: K, handler: Handler<E[K]>): void => useTypedBusEvent<E, K>(name, handler),
  };
}
