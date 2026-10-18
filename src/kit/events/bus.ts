/**
 * A typed event bus: the one channel cross-cutting features talk through (notices,
 * locks, logging). `createBus<Events>()` takes the event map as a type; `emit`, `on`,
 * `once` and `off` check names and payloads against it. Handlers run synchronously in
 * the order they subscribed; a throwing handler is reported and never stops the others.
 * Worker-safe: no React, no DOM.
 */
import type { KitEvents } from "./types";

export type Handler<T> = (payload: T) => void;

/** A name of the map (string keys only). */
export type EventName<E> = keyof E & string;

export interface BusRecord {
  name: string;
  payload: unknown;
  /** performance.now() (or Date.now()) when it was emitted. */
  at: number;
}

export interface BusOptions {
  /**
   * The dev log: true prints every event with console.debug ("[bus] param:changed {…}");
   * a function prints the events it returns true for. Off by default.
   */
  log?: boolean | ((name: string, payload: unknown) => boolean);
  /** How many recent events `recent()` keeps (default 100). */
  keep?: number;
  /** Where a throwing handler's error goes (default console.error). */
  onError?: (error: unknown, name: string) => void;
}

export interface Bus<E extends object = KitEvents> {
  emit<K extends EventName<E>>(name: K, payload: E[K]): void;
  /** Subscribe; returns the unsubscribe. */
  on<K extends EventName<E>>(name: K, handler: Handler<E[K]>): () => void;
  /** Subscribe for the next event of this name only. */
  once<K extends EventName<E>>(name: K, handler: Handler<E[K]>): () => void;
  /** Remove every subscription of this handler to this name. */
  off<K extends EventName<E>>(name: K, handler: Handler<E[K]>): void;
  /** Every event, whatever its name: for logs and analytics. Returns the unsubscribe. (Untyped, so a bus of a wider map still is a bus of the kit's.) */
  onAny(handler: (name: string, payload: unknown) => void): () => void;
  /** The last events emitted, oldest first (the dev log's memory; tests read it too). */
  recent(): BusRecord[];
}

interface Entry {
  fn: Handler<any>;
  once: boolean;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createBus<E extends object = KitEvents>(opts: BusOptions = {}): Bus<E> {
  const subs = new Map<string, Entry[]>();
  const any: ((name: string, payload: unknown) => void)[] = [];
  const keep = Math.max(0, opts.keep ?? 100);
  const log: BusRecord[] = [];
  const report = opts.onError ?? ((error: unknown, name: string) => console.error(`[bus] a handler of "${name}" threw`, error));

  const add = (name: string, fn: Handler<any>, once: boolean) => {
    const entry: Entry = { fn, once };
    subs.set(name, [...(subs.get(name) ?? []), entry]);
    return () => {
      const list = subs.get(name);
      if (list) subs.set(name, list.filter((e) => e !== entry));
    };
  };

  return {
    emit(name, payload) {
      if (keep) {
        log.push({ name, payload, at: now() });
        if (log.length > keep) log.splice(0, log.length - keep);
      }
      if (opts.log && (opts.log === true || opts.log(name, payload))) console.debug(`[bus] ${name}`, payload);
      const list = subs.get(name);
      if (list?.length) {
        // A snapshot: handlers added while this event runs wait for the next one.
        if (list.some((e) => e.once)) subs.set(name, list.filter((e) => !e.once));
        for (const e of list) {
          try {
            e.fn(payload);
          } catch (err) {
            report(err, name);
          }
        }
      }
      for (const fn of any.slice()) {
        try {
          fn(name, payload);
        } catch (err) {
          report(err, name);
        }
      }
    },
    on: (name, handler) => add(name, handler, false),
    once: (name, handler) => add(name, handler, true),
    off(name, handler) {
      const list = subs.get(name);
      if (list) subs.set(name, list.filter((e) => e.fn !== handler));
    },
    onAny(handler) {
      any.push(handler);
      return () => {
        const i = any.indexOf(handler);
        if (i >= 0) any.splice(i, 1);
      };
    },
    recent: () => log.slice(),
  };
}
