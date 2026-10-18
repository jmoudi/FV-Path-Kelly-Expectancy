/**
 * How kit components reach the app's store, schema, sweep adapter, copy and event bus
 * without importing the app: the app mounts one <KitProvider> around everything
 * (src/main.tsx) and kit components call useKit / useKitApi / useSchema / useKitSweeps /
 * useKitCopy, and useBus / useBusEvent (kit/events/react.tsx). Kit components see the
 * erased types (KitState<any, any>, Schema<any>); the app keeps its own typed useStore.
 *
 * The provider also connects the store to the bus, so the store's actions emit on it.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore as useZustand, type StoreApi } from "zustand";
import { createBus, type Bus } from "@kit/events/bus";
import { BusProvider } from "@kit/events/react";
import type { Schema } from "@kit/inputs/schema";
import type { SweepAdapter } from "@kit/sweeps/adapter";
import { DEFAULT_COPY, type KitCopy } from "@kit/ui/copy";
import type { KitState } from "./createAppStore";

export type AnyKitState = KitState<any, any>;

interface KitContextValue {
  store: StoreApi<AnyKitState>;
  schema: Schema<any>;
  sweeps: SweepAdapter;
  copy: KitCopy;
}

const KitContext = createContext<KitContextValue | null>(null);

export function KitProvider({ store, schema, sweeps, copy, bus, children }: { store: StoreApi<AnyKitState>; schema: Schema<any>; sweeps: SweepAdapter; copy?: Partial<KitCopy>; bus?: Bus<any>; children: ReactNode }) {
  // Without a bus of the app's, a private one, so kit components always have one.
  const [own] = useState(() => bus ?? createBus());
  const events = bus ?? own;
  // Connect during render, before any child can act; idempotent, so a re-render (or StrictMode's second pass) changes nothing.
  if (store.getState().getBus() !== events) store.getState().connectBus(events);
  return (
    <KitContext.Provider value={{ store, schema, sweeps, copy: { ...DEFAULT_COPY, ...(copy ?? {}) } }}>
      <BusProvider bus={events}>{children}</BusProvider>
    </KitContext.Provider>
  );
}

function useKitContext(): KitContextValue {
  const v = useContext(KitContext);
  if (!v) throw new Error("Kit components must render inside <KitProvider> (see src/kit/README.md).");
  return v;
}

/** Select from the app's store, like zustand's hook. */
export function useKit<T>(selector: (s: AnyKitState) => T): T {
  return useZustand(useKitContext().store, selector);
}

/** The store itself, for reads and writes outside render (effects, event handlers, timers). */
export function useKitApi(): StoreApi<AnyKitState> {
  return useKitContext().store;
}

export function useSchema(): Schema<any> {
  return useKitContext().schema;
}

export function useKitSweeps(): SweepAdapter {
  return useKitContext().sweeps;
}

export function useKitCopy(): KitCopy {
  return useKitContext().copy;
}
