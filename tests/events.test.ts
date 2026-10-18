import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBus, type Bus } from "@kit/events/bus";
import type { KitEvents } from "@kit/events/types";
import { BusProvider, busHooks, useBus } from "@kit/events/react";
import { KitProvider } from "@kit/state/context";
import { createAppStore } from "@kit/state/createAppStore";
import { Notices } from "@kit/ui/Notices";
import type { AppEvents } from "@app/events";
import type { Datasets } from "@app/model/datasets";
import type { Params } from "@app/model/params";
import { EMPTY_DATASETS, sanitizeDatasets } from "@app/data/datasets";
import { DEFAULT_PARAMS } from "@app/data/params";
import { PRESET_CATALOG } from "@app/data/presets";
import { SCHEMA } from "@app/data/schema";
import { NOTICE_COPY } from "@app/data/copy/notices";
import { SWEEPS } from "@app/sweeps";

type Seen = { name: string; payload: any };

/** A bus and everything emitted on it, in order. */
function recorder<E extends object = KitEvents>() {
  const bus = createBus<E>();
  const seen: Seen[] = [];
  bus.onAny((name, payload) => seen.push({ name, payload }));
  return { bus, seen, names: () => seen.map((s) => s.name), of: (n: string) => seen.filter((s) => s.name === n).map((s) => s.payload) };
}

describe("the event bus", () => {
  it("delivers a typed payload to its subscribers until they unsubscribe", () => {
    const bus = createBus<KitEvents>();
    const got: KitEvents["param:changed"][] = [];
    const off = bus.on("param:changed", (e) => got.push(e));
    bus.emit("param:changed", { key: "lossRate", from: 0.0294, to: 0.03, source: "hand" });
    off();
    bus.emit("param:changed", { key: "lossRate", from: 0.03, to: 0.031, source: "hand" });
    expect(got).toEqual([{ key: "lossRate", from: 0.0294, to: 0.03, source: "hand" }]);
    // The map is checked at compile time (tsc runs over the tests).
    // @ts-expect-error an event that does not exist
    bus.emit("param:chnaged", {});
    // @ts-expect-error a payload of the wrong shape
    bus.emit("notice", { kind: "loud", text: "x" });
  });

  it("once fires a single time, and its unsubscribe works before it fires", () => {
    const bus = createBus<KitEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.once("sweep:paused", a);
    const offB = bus.once("sweep:paused", b);
    offB();
    bus.emit("sweep:paused", { key: "q" });
    bus.emit("sweep:paused", { key: "q" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ key: "q" });
    expect(b).not.toHaveBeenCalled();
  });

  it("off removes every subscription of that handler, and only that one", () => {
    const bus = createBus<KitEvents>();
    const h = vi.fn();
    const other = vi.fn();
    bus.on("chart:edited", h);
    bus.on("chart:edited", h);
    bus.on("chart:edited", other);
    bus.off("chart:edited", h);
    bus.emit("chart:edited", { chartId: "c" });
    expect(h).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("keeps going past a throwing handler, and a handler added during an event waits for the next", () => {
    const errors: string[] = [];
    const bus = createBus<KitEvents>({ onError: (_e, name) => errors.push(name) });
    const late = vi.fn();
    const after = vi.fn();
    bus.on("state:reset", () => {
      bus.on("state:reset", late);
      throw new Error("boom");
    });
    bus.on("state:reset", after);
    bus.emit("state:reset", {});
    expect(errors).toEqual(["state:reset"]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    bus.emit("state:reset", {});
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("remembers the recent events and logs them in development", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const bus = createBus<KitEvents>({ keep: 2, log: (name) => name !== "sweep:stepped" });
    bus.emit("sweep:stepped", { key: "q", index: 1, value: 0.03 });
    bus.emit("notice", { kind: "info", text: "a" });
    bus.emit("notice", { kind: "warn", text: "b" });
    expect(bus.recent().map((r) => r.name)).toEqual(["notice", "notice"]);
    expect(debug).toHaveBeenCalledTimes(2);
    expect(debug.mock.calls[0][0]).toBe("[bus] notice");
    debug.mockRestore();
  });

  it("an app's map extends the kit's, and its bus is a kit bus", () => {
    const app = createBus<AppEvents>();
    const kit: Bus<KitEvents> = app;
    const seen: string[] = [];
    app.on("market:switched", (e) => seen.push(`${e.from}→${e.to}`));
    kit.on("notice", (n) => seen.push(n.text));
    app.emit("market:switched", { from: "discussion", to: "fair" });
    kit.emit("notice", { kind: "info", text: "hi" });
    expect(seen).toEqual(["discussion→fair", "hi"]);
  });
});

describe("the bus in React", () => {
  const Emit = ({ text }: { text: string }) => {
    useBus().emit("notice", { kind: "info", text });
    return null;
  };

  it("useBus reads the provider's bus, and refuses to run without one", () => {
    const { bus, of } = recorder();
    renderToStaticMarkup(createElement(BusProvider, { bus, children: createElement(Emit, { text: "from a component" }) }));
    expect(of("notice")).toEqual([{ kind: "info", text: "from a component" }]);
    expect(() => renderToStaticMarkup(createElement(Emit, { text: "x" }))).toThrow(/bus is missing/);
  });

  it("busHooks types the hooks with the app's map", () => {
    const { useBus: useAppBus } = busHooks<AppEvents>();
    const Switch = () => {
      useAppBus().emit("market:switched", { from: "fair", to: "custom" });
      return null;
    };
    const { bus, of } = recorder<AppEvents>();
    renderToStaticMarkup(createElement(BusProvider, { bus, children: createElement(Switch) }));
    expect(of("market:switched")).toEqual([{ from: "fair", to: "custom" }]);
  });

  it("KitProvider passes the bus on and connects the store to it; Notices renders an empty stack", () => {
    const store = makeStore();
    const { bus, of } = recorder<AppEvents>();
    const html = renderToStaticMarkup(createElement(KitProvider, { store, schema: SCHEMA, sweeps: SWEEPS, bus, children: [createElement(Emit, { key: "e", text: "inside" }), createElement(Notices, { key: "n" })] as ReactNode }));
    expect(store.getState().getBus()).toBe(bus);
    expect(of("notice")).toEqual([{ kind: "info", text: "inside" }]);
    expect(html).toContain('class="k-notices"');
    store.getState().setParam("nights", 21);
    expect(of("param:changed")).toEqual([{ key: "nights", from: DEFAULT_PARAMS.nights, to: 21, source: "hand" }]);
  });
});

function makeStore(bus?: Bus<any>) {
  return createAppStore<Params, Datasets>({ schema: SCHEMA, datasets: { empty: EMPTY_DATASETS, sanitize: sanitizeDatasets }, storageKey: "events-test", version: 5, presets: PRESET_CATALOG, bus });
}

describe("the store's actions emit", () => {
  it("param:changed per parameter, with who changed it, after the store holds the value", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    const q0 = s().params.lossRate;
    bus.on("param:changed", (e) => expect(s().params[e.key as keyof Params]).toBe(e.to));
    s().setParam("lossRate", 0.03);
    s().setParams({ lossRate: 0.031 }, { sweep: true });
    s().setParams({ lossRate: 0.0305 }, { source: "link" });
    s().setParams({ market: "fair", lossRate: 0.0338 }, { source: "switch" });
    s().undo();
    s().redo();
    s().resetParams();
    s().setParam("lossRate", 0.0305);
    expect(of("param:changed").map((e) => `${e.key}:${e.source}`)).toEqual([
      "lossRate:hand",
      "lossRate:sweep",
      "lossRate:link",
      "lossRate:switch",
      "market:switch",
      "lossRate:undo",
      "market:undo",
      "lossRate:redo",
      "market:redo",
      "lossRate:reset",
      "market:reset",
      "lossRate:hand",
    ]);
    expect(of("param:changed")[0]).toEqual({ key: "lossRate", from: q0, to: 0.03, source: "hand" });
    // Setting a value it already has says nothing.
    const n = of("param:changed").length;
    s().setParam("lossRate", 0.0305);
    expect(of("param:changed")).toHaveLength(n);
  });

  it("story:applied with what the story moved, story:cleared with what came back, and the parameters as source story", () => {
    const { bus, of, names } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    const q0 = s().params.lossRate;
    const story = { id: "worse", label: "What if q is really 3.2%?", params: { lossRate: 0.032 } };
    s().applyStory("chain-sweep", story);
    expect(of("story:applied")).toEqual([{ chartId: "chain-sweep", storyId: "worse", label: story.label, before: { lossRate: q0 }, after: { lossRate: 0.032 } }]);
    expect(of("param:changed").slice(-1)[0]).toEqual({ key: "lossRate", from: q0, to: 0.032, source: "story" });
    // Another deck-moving story turns the first off first.
    s().applyStory("binary-outcomes", { id: "opt", label: "Optimistic", params: { lossRate: 0.0252 } });
    expect(of("story:cleared")).toEqual([{ chartId: "chain-sweep", storyId: "worse", before: { lossRate: 0.032 }, after: { lossRate: q0 } }]);
    expect(names().slice(-3)).toEqual(["story:cleared", "story:applied", "param:changed"]);
    // Clicking the active story again puts the deck back.
    s().applyStory("binary-outcomes", { id: "opt", label: "Optimistic" });
    expect(of("story:cleared").slice(-1)[0]).toEqual({ chartId: "binary-outcomes", storyId: "opt", before: { lossRate: 0.0252 }, after: { lossRate: q0 } });
    expect(s().params.lossRate).toBe(q0);
    s().setOverride("chain-sweep", { height: 300 });
    s().clearOverride("chain-sweep");
    expect(of("chart:edited")).toEqual([{ chartId: "chain-sweep" }, { chartId: "chain-sweep", reset: true }]);
  });

  it("the sweep's start, pause, resume and stop, with why it stopped", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().startSweep("lossRate", "optimistic-to-break-even");
    s().pauseSweep("lossRate");
    s().toggleSweep("lossRate");
    s().stopSweep("lossRate");
    s().startSweep("nights");
    s().setParam("nights", 30);
    expect(of("sweep:started")).toEqual([
      { key: "lossRate", presetId: "optimistic-to-break-even", resumed: false },
      { key: "lossRate", presetId: "optimistic-to-break-even", resumed: true },
      { key: "nights", presetId: "optimistic-to-break-even", resumed: false },
    ]);
    expect(of("sweep:paused")).toEqual([{ key: "lossRate" }]);
    expect(of("sweep:stopped")).toEqual([
      { key: "lossRate", reason: "stop" },
      { key: "nights", reason: "edit" },
    ]);
  });

  it("state:imported for a file taken or refused, then the imported parameters as source import; state:reset", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    expect(s().importState("{ not json").ok).toBe(false);
    const file = { ...s().exportState(), params: { ...DEFAULT_PARAMS, nights: 25 } };
    expect(s().importState(JSON.stringify(file)).ok).toBe(true);
    expect(of("state:imported")).toEqual([{ ok: false, error: expect.stringMatching(/^Not valid JSON/) }, { ok: true }]);
    expect(of("param:changed")).toEqual([{ key: "nights", from: DEFAULT_PARAMS.nights, to: 25, source: "import" }]);
    s().setDataset("record", [0, 1, 0]);
    expect(of("data:changed")).toEqual([{ kind: "record", count: 3 }]);
    s().resetEverything();
    expect(of("state:reset")).toEqual([{}]);
    expect(of("param:changed").slice(-1)[0]).toEqual({ key: "nights", from: 25, to: DEFAULT_PARAMS.nights, source: "reset" });
  });

  it("nothing without a bus, and the app's one store emits once connected", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const { useStore } = await import("@app/store");
    expect(() => useStore.getState().setParam("seasons", 5)).not.toThrow();
    const { bus, of } = recorder<AppEvents>();
    useStore.getState().connectBus(bus);
    useStore.getState().setParam("seasons", 6);
    expect(of("param:changed")).toEqual([{ key: "seasons", from: 5, to: 6, source: "hand" }]);
    useStore.getState().connectBus(null);
    useStore.getState().resetEverything();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe("the notices' words", () => {
  it("say what a story moved, and what came back", () => {
    expect(NOTICE_COPY.storyMoved("What if q is really 3.2%?", { lossRate: 0.02945 }, { lossRate: 0.032 })).toMatch(/^“What if q is really 3\.2%\?” moves the deck: q 2\.9[45]% → 3\.20%\. Click the story again or press (Ctrl|⌘)\+Z to put it back\.$/);
    expect(NOTICE_COPY.storyMoved("Chart only", {}, {})).toBeNull();
    expect(NOTICE_COPY.storyBack({ lossRate: 0.032 }, { lossRate: 0.0252 })).toBe("Story off, the deck is back: q 3.20% → 2.52%.");
    expect(NOTICE_COPY.importFailed("Expected a JSON object.")).toBe("The state was not imported. Expected a JSON object.");
  });
});
