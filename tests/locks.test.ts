import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus, type Bus } from "@kit/events/bus";
import type { KitEvents } from "@kit/events/types";
import { applyConstraints, sanitizeLocks, type ConstraintSet, type Locks } from "@kit/state/constraints";
import { createAppStore } from "@kit/state/createAppStore";
import { lossRateFromPClean, pCleanFromLossRate, breakEvenLossRate } from "@app/model/binary";
import { CALENDAR_SHARE_KEYS, type Params } from "@app/model/params";
import type { Datasets } from "@app/model/datasets";
import { CONSTRAINTS, P_CLEAN, effectiveMarket } from "@app/data/constraints";
import { EMPTY_DATASETS, sanitizeDatasets } from "@app/data/datasets";
import { DEFAULT_PARAMS, DISCUSSION_P_CLEAN } from "@app/data/params";
import { PRESET_CATALOG } from "@app/data/presets";
import { SCHEMA } from "@app/data/schema";
import { LOCK_COPY, lockValueText } from "@app/data/copy/locks";
import { LOCKS_GUIDE } from "@app/data/copy/guideLocks";
import { GUIDE_SECTIONS } from "@app/data/copy/guide";
import { plannerFor } from "@kit/sweeps/adapter";
import { SWEEPS } from "@app/sweeps";

const P0 = DEFAULT_PARAMS;
const opts = { set: CONSTRAINTS, byKey: SCHEMA.byKey };
const solve = (prev: Params, patch: Partial<Params>, locks: Locks, source: KitEvents["param:changed"]["source"] = "hand", atomic = false, via?: string) => applyConstraints(prev, patch, locks, source, { ...opts, atomic, via });
const pOf = (p: Pick<Params, "lossRate" | "nights">) => pCleanFromLossRate(p.lossRate, p.nights);

describe("the solver (kit/state/constraints.ts)", () => {
  it("without locks takes every change as asked", () => {
    const patch = { lossRate: 0.031, nights: 25, gain: 0.04, calShare0: 0.6, market: "fair" as const };
    const out = solve(P0, patch, {});
    expect(out.patch).toEqual(patch);
    expect(out.refusals).toEqual([]);
  });

  it("refuses a change of a locked key, keeps the rest, and drops what does not change", () => {
    const out = solve(P0, { lossRate: 0.031, nights: 25, gain: P0.gain }, { lossRate: true });
    expect(out.patch).toEqual({ nights: 25 });
    expect(out.refusals).toEqual([{ key: "lossRate", reason: "locked", by: "lossRate", attempted: 0.031 }]);
  });

  it("atomic: one refusal refuses the whole change", () => {
    const out = solve(P0, { lossRate: 0.031, nights: 25 }, { lossRate: true }, "story", true);
    expect(out.patch).toEqual({});
    expect(out.refusals.map((r) => `${r.key}:${r.by}`)).toEqual(["lossRate:lossRate", "nights:lossRate"]);
  });

  it("a locked linked key refuses the change solved from it", () => {
    const out = solve(P0, { lossRate: 0.03 }, { [P_CLEAN]: true }, "link", true, P_CLEAN);
    expect(out.patch).toEqual({});
    expect(out.refusals).toEqual([{ key: P_CLEAN, reason: "locked", by: P_CLEAN, attempted: undefined }]);
  });

  it("the cycle guard: relations that never settle refuse the change", () => {
    type X = { x: number; y: number };
    const set: ConstraintSet<X> = {
      maxPasses: 5,
      relations: [{ id: "chase", label: "chase", keys: ["x", "y"], describe: "", solve: (c) => ({ set: { y: c.next.y + 1 }, by: "y" }) }],
    };
    const out = applyConstraints<X>({ x: 0, y: 0 }, { x: 1 }, {}, "hand", { set });
    expect(out.patch).toEqual({});
    expect(out.refusals).toEqual([{ key: "x", reason: "cycle", by: "", detail: expect.stringMatching(/do not settle/), attempted: 1 }]);
  });

  it("two relations that want one key two ways refuse the change", () => {
    type X = { a: number; b: number };
    const set: ConstraintSet<X> = {
      relations: [
        { id: "one", label: "one", keys: ["a"], describe: "", solve: (c) => (c.changed("a") ? { set: { b: 1 }, by: "a" } : null) },
        { id: "two", label: "two", keys: ["a"], describe: "", solve: (c) => (c.changed("a") ? { set: { b: 2 }, by: "a" } : null) },
      ],
    };
    const out = applyConstraints<X>({ a: 0, b: 0 }, { a: 5 }, {}, "hand", { set });
    expect(out.patch).toEqual({});
    expect(out.refusals[0]).toMatchObject({ key: "a", reason: "two" });
  });

  it("locks from untrusted input: known keys, true only", () => {
    expect(sanitizeLocks({ lossRate: true, nights: 1, nope: true, [P_CLEAN]: true }, (k) => k in SCHEMA.byKey || k === P_CLEAN)).toEqual({ lossRate: true, [P_CLEAN]: true });
    expect(sanitizeLocks([1, 2], () => true)).toEqual({});
    expect(sanitizeLocks("x", () => true)).toEqual({});
  });
});

describe("the constraints table (src/app/data/constraints.ts)", () => {
  it("clean season: with p locked, a change of n re-solves q so p holds", () => {
    const p = pOf(P0);
    const out = solve(P0, { nights: 25 }, { [P_CLEAN]: true });
    expect(out.refusals).toEqual([]);
    expect(out.patch.nights).toBe(25);
    expect(out.patch.lossRate).toBeCloseTo(lossRateFromPClean(p, 25), 15);
    expect(pOf({ ...P0, ...out.patch })).toBeCloseTo(p, 12);
  });

  it("clean season: with p locked, q up moves n down by whole nights and puts q where p holds", () => {
    const p = pOf(P0);
    const out = solve(P0, { lossRate: P0.lossRate + 0.0005 }, { [P_CLEAN]: true });
    expect(out.refusals).toEqual([]);
    expect(out.patch.nights).toBe(P0.nights - 1);
    expect(out.patch.lossRate).toBeCloseTo(lossRateFromPClean(p, P0.nights - 1), 15);
    expect(out.patch.lossRate!).toBeGreaterThan(P0.lossRate);
    // q down: n up.
    const down = solve(P0, { lossRate: P0.lossRate - 0.0005 }, { [P_CLEAN]: true });
    expect(down.patch.nights).toBe(P0.nights + 1);
    expect(pOf({ ...P0, ...down.patch })).toBeCloseTo(p, 12);
  });

  it("clean season: with p and q locked, n cannot move; with p and n locked, q cannot", () => {
    const a = solve(P0, { nights: 25 }, { [P_CLEAN]: true, lossRate: true });
    expect(a.patch).toEqual({});
    expect(a.refusals).toMatchObject([{ key: "nights", reason: "clean-season", by: "lossRate" }]);
    const b = solve(P0, { lossRate: 0.031 }, { [P_CLEAN]: true, nights: true });
    expect(b.patch).toEqual({});
    expect(b.refusals).toMatchObject([{ key: "lossRate", by: "nights" }]);
  });

  it("clean season: with q locked, typing p (q solved from it) is refused", () => {
    const out = solve(P0, { lossRate: lossRateFromPClean(0.6, P0.nights) }, { lossRate: true }, "link", true, P_CLEAN);
    expect(out.patch).toEqual({});
    expect(out.refusals).toMatchObject([{ key: "lossRate", reason: "locked", by: "lossRate" }]);
  });

  it("market: with q locked, Fair market is refused, the market key with it", () => {
    const fair = { market: "fair" as const, lossRate: breakEvenLossRate(P0.gain) };
    const out = solve(P0, fair, { lossRate: true }, "switch", true);
    expect(out.patch).toEqual({});
    expect(out.refusals.map((r) => `${r.key}:${r.by}`).sort()).toEqual(["lossRate:lossRate", "market:lossRate"]);
  });

  it("market: with the market locked on Fair, a change of b re-solves q, and a change of q is refused", () => {
    const fairDeck: Params = { ...P0, market: "fair", lossRate: breakEvenLossRate(P0.gain) };
    expect(effectiveMarket(fairDeck)).toBe("fair");
    const b = solve(fairDeck, { gain: 0.05 }, { market: true });
    expect(b.refusals).toEqual([]);
    expect(b.patch.gain).toBe(0.05);
    expect(b.patch.lossRate).toBeCloseTo(0.05 / 1.05, 15);
    const q = solve(fairDeck, { lossRate: 0.03 }, { market: true });
    expect(q.patch).toEqual({});
    expect(q.refusals).toMatchObject([{ key: "lossRate", reason: "market", by: "market", detail: expect.stringContaining("Fair market") }]);
    // The switch itself is locked too.
    expect(solve(fairDeck, { market: "discussion", lossRate: P0.lossRate }, { market: true }, "switch", true).patch).toEqual({});
  });

  it("market: on the Discussion case, a change of n re-solves q to a 55% clean season", () => {
    const out = solve(P0, { nights: 30 }, { market: true });
    expect(out.patch.lossRate).toBeCloseTo(lossRateFromPClean(DISCUSSION_P_CLEAN, 30), 15);
    expect(solve(P0, { gain: 0.05 }, { market: true }).patch).toEqual({ gain: 0.05 });
  });

  it("market and clean season both locked on Fair: b cannot move (no whole n keeps p)", () => {
    const fairDeck: Params = { ...P0, market: "fair", lossRate: breakEvenLossRate(P0.gain) };
    const out = solve(fairDeck, { gain: 0.05 }, { market: true, [P_CLEAN]: true });
    expect(out.patch).toEqual({});
    expect(out.refusals[0]).toMatchObject({ key: "gain" });
  });

  it("calendar: a locked share holds while the other unlocked shares renormalise to a sum of 1", () => {
    const out = solve(P0, { calShare0: 0.4 }, { calShare2: true });
    expect(out.refusals).toEqual([]);
    const next = { ...P0, ...out.patch };
    expect(next.calShare2).toBe(P0.calShare2);
    expect(next.calShare0).toBe(0.4);
    const sum = CALENDAR_SHARE_KEYS.reduce((s, k) => s + next[k], 0);
    expect(sum).toBeCloseTo(1, 12);
    // The others keep their proportions: 0.25 : 0.15 : 0.1 : 0.05 scaled into 0.4.
    expect(next.calShare1).toBeCloseTo((0.25 / 0.55) * 0.4, 12);
    expect(next.calShare5).toBeCloseTo((0.05 / 0.55) * 0.4, 12);
    // At most what the locked ones leave.
    const big = solve(P0, { calShare0: 1 }, { calShare2: true });
    expect({ ...P0, ...big.patch }.calShare0).toBeCloseTo(0.8, 12);
    // With every other share locked, the edit is refused.
    const all = solve(P0, { calShare0: 0.3 }, { calShare1: true, calShare2: true, calShare3: true, calShare4: true, calShare5: true });
    expect(all.patch).toEqual({});
    expect(all.refusals).toMatchObject([{ key: "calShare0", reason: "calendar" }]);
  });
});

type Seen = { name: string; payload: any };
function recorder() {
  const bus = createBus<KitEvents>();
  const seen: Seen[] = [];
  bus.onAny((name, payload) => seen.push({ name, payload }));
  return { bus, seen, of: (n: string) => seen.filter((s) => s.name === n).map((s) => s.payload) };
}
function makeStore(bus?: Bus<any>, storageKey = "locks-test") {
  return createAppStore<Params, Datasets>({ schema: SCHEMA, datasets: { empty: EMPTY_DATASETS, sanitize: sanitizeDatasets }, storageKey, version: 6, presets: PRESET_CATALOG, planner: plannerFor(SWEEPS), constraints: CONSTRAINTS, bus });
}

describe("the store's locks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lockParam emits param:locked; a locked parameter refuses every change path, out loud", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    const q0 = s().params.lossRate;
    s().lockParam("lossRate", true);
    s().lockParam("lossRate", true); // already locked: nothing
    expect(of("param:locked")).toEqual([{ key: "lossRate", locked: true }]);
    s().setParam("lossRate", 0.031); // by hand (typing, wheel, arrows, drag)
    s().setParam("lossRate", q0); // even "no change" is an attempt
    s().setParams({ lossRate: 0.032 }, { sweep: true }); // a sweep tick
    s().setParams({ lossRate: 0.0305 }, { source: "link", via: P_CLEAN }); // the clean-season field
    s().applyStory("chain-sweep", { id: "worse", label: "What if q is really 3.2%?", params: { lossRate: 0.032 } }); // a story
    s().setParams({ market: "fair", lossRate: breakEvenLossRate(s().params.gain) }, { source: "switch" }); // the market switch
    expect(s().params.lossRate).toBe(q0);
    expect(s().params.market).toBe(P0.market);
    expect(s().overrides["chain-sweep"]).toBeUndefined();
    expect(of("param:changed")).toEqual([]);
    expect(of("story:applied")).toEqual([]);
    expect(of("param:refused").map((e) => `${e.key}:${e.source}:${e.by}`)).toEqual(["lossRate:hand:lossRate", "lossRate:hand:lossRate", "lossRate:sweep:lossRate", "lossRate:link:lossRate", "lossRate:story:lossRate", "market:switch:lossRate", "lossRate:switch:lossRate"]);
    expect(of("param:refused")[0]).toEqual({ key: "lossRate", reason: "locked", source: "hand", attempted: 0.031, by: "lossRate" });
    // The story chip knows before it is clicked.
    expect(s().storyRefusals("chain-sweep", { id: "worse", label: "x", params: { lossRate: 0.032 } })[0]).toMatchObject({ key: "lossRate", by: "lossRate" });
    s().lockParam("lossRate", false);
    expect(of("param:locked").slice(-1)[0]).toEqual({ key: "lossRate", locked: false });
    s().setParam("lossRate", 0.031);
    expect(s().params.lossRate).toBe(0.031);
  });

  it("locked p, then a change of n re-solves q in the store (and the market switch is refused whole)", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    const p = pOf(s().params);
    s().lockParam(P_CLEAN, true);
    s().setParam("nights", 24);
    expect(s().params.nights).toBe(24);
    expect(pOf(s().params)).toBeCloseTo(p, 12);
    expect(of("param:changed").map((e) => `${e.key}:${e.source}`)).toEqual(["lossRate:hand", "nights:hand"]);
    s().setParams({ market: "fair", lossRate: breakEvenLossRate(s().params.gain) }, { source: "switch" });
    expect(s().params.nights).toBe(24);
    expect(of("param:refused").every((e) => e.by === P_CLEAN)).toBe(true);
    // Undo goes back through the relation: p still holds.
    s().undo();
    expect(s().params.nights).toBe(P0.nights);
    expect(pOf(s().params)).toBeCloseTo(p, 12);
  });

  it("a run on a parameter that becomes locked stops (reason lock); a locked one is never swept", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().startSweep("nights");
    expect(s().runs.nights).toBeTruthy();
    s().lockParam("nights", true);
    expect(s().runs.nights).toBeUndefined();
    expect(of("sweep:stopped")).toEqual([{ key: "nights", reason: "lock" }]);
    // Ctrl+Enter on a locked parameter: nothing runs, a refusal says so.
    s().toggleSweep("nights");
    expect(s().runs.nights).toBeUndefined();
    expect(of("param:refused").slice(-1)[0]).toMatchObject({ key: "nights", source: "sweep", by: "nights" });
    expect(of("sweep:started")).toHaveLength(1);
  });

  it("a run whose next value a new lock refuses stops too (q swept, market locked on Fair)", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().setParams({ market: "fair", lossRate: breakEvenLossRate(s().params.gain) }, { source: "switch" });
    s().startSweep("lossRate", "optimistic-to-break-even");
    expect(s().runs.lossRate).toBeTruthy();
    s().lockParam("market", true);
    expect(s().runs.lossRate).toBeUndefined();
    expect(of("sweep:stopped").slice(-1)[0]).toEqual({ key: "lossRate", reason: "lock" });
    // And a run that would start into a refusal does not start.
    s().startSweep("lossRate", "optimistic-to-break-even");
    expect(s().runs.lossRate).toBeUndefined();
    expect(of("param:refused").slice(-1)[0]).toMatchObject({ key: "lossRate", source: "sweep", by: "market" });
  });

  it("a sweep tick a lock refuses stops its run", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().startSweep("gain");
    s().lockParam("lossRate", true); // b may still move: q is not tied to b without a market lock
    expect(s().runs.gain).toBeTruthy();
    // A tick on a parameter locked behind the run's back (the engine checks every value).
    store.setState({ locks: { ...s().locks, gain: true } });
    s().setParams({ gain: 0.04 }, { sweep: true });
    expect(s().runs.gain).toBeUndefined();
    expect(of("sweep:stopped").slice(-1)[0]).toEqual({ key: "gain", reason: "lock" });
  });

  it("the replayer never plans a locked parameter", () => {
    const planned: string[] = [];
    const planner = plannerFor(SWEEPS);
    const store = createAppStore<Params, Datasets>({ schema: SCHEMA, datasets: { empty: EMPTY_DATASETS, sanitize: sanitizeDatasets }, storageKey: "locks-planner", version: 6, presets: PRESET_CATALOG, planner: (key, preset, at, params) => (planned.push(key), planner(key, preset, at, params)), constraints: CONSTRAINTS });
    const s = () => store.getState();
    s().lockParam("lossRate", true);
    s().startSweep("lossRate");
    s().toggleSweep("lossRate");
    s().startSweep("lossRate", "optimistic-to-break-even");
    expect(planned).toEqual([]);
    expect(s().runs).toEqual({});
    s().lockParam("lossRate", false);
    s().startSweep("lossRate");
    expect(planned).toEqual(["lossRate"]);
    expect(s().runs.lossRate).toBeTruthy();
  });

  it("with p locked, q cannot be swept (its values would not hold) while a sweep on n re-solves q at every value", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    const p = pOf(s().params);
    s().lockParam(P_CLEAN, true);
    s().startSweep("lossRate", "optimistic-to-break-even");
    expect(s().runs.lossRate).toBeUndefined();
    expect(of("param:refused").slice(-1)[0]).toMatchObject({ key: "lossRate", source: "sweep", by: P_CLEAN, reason: "clean-season", detail: expect.stringContaining("whole nights") });
    s().startSweep("nights");
    expect(s().runs.nights).toBeTruthy();
    s().setParams({ nights: 27 }, { sweep: true });
    expect(s().runs.nights).toBeTruthy();
    expect(s().params.nights).toBe(27);
    expect(pOf(s().params)).toBeCloseTo(p, 12);
  });

  it("a refused value in a tick of two runs stops only its own run", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().startSweep("gain");
    s().startSweep("nights");
    store.setState({ locks: { gain: true } });
    s().setParams({ gain: 0.04, nights: 26 }, { sweep: true });
    expect(s().runs.gain).toBeUndefined();
    expect(s().runs.nights).toBeTruthy();
    expect(s().params.nights).toBe(26);
    expect(s().params.gain).toBe(P0.gain);
    expect(of("sweep:stopped")).toEqual([{ key: "gain", reason: "lock" }]);
  });

  it("↺ before sweep puts back each unlocked parameter and keeps a locked one", () => {
    const store = makeStore();
    const s = () => store.getState();
    s().startSweep("gain");
    s().startSweep("nights");
    s().setParams({ gain: 0.05, nights: 30 }, { sweep: true });
    s().pauseAll();
    // Locked behind the paused run's back: ↺ keeps it, the other goes back.
    store.setState({ locks: { gain: true } });
    s().restoreSweep();
    expect(s().params.gain).toBe(0.05);
    expect(s().params.nights).toBe(P0.nights);
  });

  it("undo, reset and Reset chart edits keep a locked value", () => {
    const store = makeStore();
    const s = () => store.getState();
    s().setParam("lossRate", 0.031);
    s().lockParam("lossRate", true);
    s().undo();
    expect(s().params.lossRate).toBe(0.031);
    s().setParam("nights", 30);
    s().resetParams();
    expect(s().params.lossRate).toBe(0.031);
    expect(s().params.nights).toBe(P0.nights);
  });

  it("locks persist, export with the version, and an import keeps a locked value and adds the file's locks", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) });
    const { bus, of } = recorder();
    const store = makeStore(bus, "locks-persist");
    const s = () => store.getState();
    s().lockParam("lossRate", true);
    s().lockParam(P_CLEAN, true);
    expect(JSON.parse(mem.get("locks-persist")!).locks).toEqual({ lossRate: true, [P_CLEAN]: true });
    // A reload reads them back (and drops what it does not know).
    mem.set("locks-persist", JSON.stringify({ ...JSON.parse(mem.get("locks-persist")!), locks: { lossRate: true, [P_CLEAN]: true, bogus: true, nights: "yes" } }));
    const again = makeStore(undefined, "locks-persist");
    expect(again.getState().locks).toEqual({ lossRate: true, [P_CLEAN]: true });
    const file = s().exportState();
    expect(file.version).toBe(6);
    expect(file.locks).toEqual({ lossRate: true, [P_CLEAN]: true });
    // Import a file that moves q and n and locks seasons: q is kept, n with p locked re-solves… q is locked too, so n stays.
    const q0 = s().params.lossRate;
    const incoming = { ...file, params: { ...file.params, lossRate: 0.04, seasons: 7, nights: 30 }, locks: { seasons: true } };
    expect(s().importState(JSON.stringify(incoming)).ok).toBe(true);
    expect(s().params.lossRate).toBe(q0);
    expect(s().params.seasons).toBe(7);
    expect(s().params.nights).toBe(P0.nights);
    expect(s().locks).toEqual({ lossRate: true, [P_CLEAN]: true, seasons: true });
    expect(of("param:refused").map((e) => `${e.key}:${e.source}`)).toEqual(["nights:import", "lossRate:import"]);
    expect(of("param:locked").slice(-1)[0]).toEqual({ key: "seasons", locked: true });
    // An older export without locks keeps the ones in place.
    const { locks: _drop, ...old } = s().exportState();
    expect(s().importState(JSON.stringify({ ...old, version: 5 })).ok).toBe(true);
    expect(Object.keys(s().locks)).toHaveLength(3);
    // Forget everything clears them, each said on the bus.
    s().resetEverything();
    expect(s().locks).toEqual({});
    expect(of("param:locked").filter((e) => !e.locked).map((e) => e.key).sort()).toEqual(["lossRate", P_CLEAN, "seasons"].sort());
  });

  it("unlockAll, and a refusal carries the lock and why", () => {
    const { bus, of } = recorder();
    const store = makeStore(bus);
    const s = () => store.getState();
    s().setParams({ market: "fair", lossRate: breakEvenLossRate(s().params.gain) }, { source: "switch" });
    s().lockParam("market", true);
    s().setParam("lossRate", 0.03);
    expect(of("param:refused").slice(-1)[0]).toMatchObject({ key: "lossRate", reason: "market", by: "market", source: "hand", detail: expect.stringContaining("q = b ÷ (1 + b)") });
    s().setParam("gain", 0.05);
    expect(s().params.lossRate).toBeCloseTo(0.05 / 1.05, 15);
    s().unlockAll();
    expect(s().locks).toEqual({});
    expect(s().lockLabel(P_CLEAN)).toBe("Clean season (Coin)");
    expect(s().checkChange({ lossRate: 0.03 }).refusals).toEqual([]);
  });
});

describe("the locks' words", () => {
  it("name the parameter and say how to unlock it", () => {
    const base = { key: "lossRate", source: "hand" as const, keyLabel: "Loss rate per name", byLabel: "Loss rate per name" };
    expect(LOCK_COPY.refused(base)).toBe("Loss rate per name is locked. Unlock it in the deck to change it.");
    expect(LOCK_COPY.refused({ ...base, source: "sweep" })).toMatch(/^Loss rate per name is locked, so the replayer leaves it alone\. Unlock it in the deck to change it\.$/);
    expect(LOCK_COPY.refused({ ...base, source: "import", kept: "2.94%" })).toBe("Loss rate per name is locked: the import kept 2.94%. Unlock it in the deck to change it.");
    expect(LOCK_COPY.refused({ ...base, by: "market", byLabel: "Market", detail: "on Fair market, q = b ÷ (1 + b)" })).toBe("Loss rate per name cannot move: Market is locked (on Fair market, q = b ÷ (1 + b)). Unlock it in the deck to change it.");
    expect(LOCK_COPY.locked("Loss rate per name", "2.94%")).toMatch(/^Loss rate per name is locked at 2\.94%\./);
    expect(lockValueText("lossRate", P0)).toBe("2.94%");
    expect(lockValueText(P_CLEAN, P0)).toBe("55%");
    expect(lockValueText("market", P0)).toMatch(/^Discussion case/);
  });

  it("the Guide's Parameters section has a Locks part listing every relation", () => {
    const params = GUIDE_SECTIONS.find((g) => g.id === "parameters")!;
    expect(params.body).toEqual(expect.arrayContaining(LOCKS_GUIDE));
    const table = LOCKS_GUIDE.find((b) => b.kind === "table" && b.head[0] === "Relation");
    expect(table && table.kind === "table" ? table.rows.map((r) => r[0]) : []).toEqual(["Clean season", "Market", "Calendar shares", "Sweeps"]);
  });
});
