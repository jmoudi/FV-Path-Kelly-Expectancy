import { afterEach, describe, expect, it, vi } from "vitest";
import { anchorValue, deltaText, sweepContext, sweepFormat, valueText } from "@app/params/sweepAnchors";
import { BuildQueue, SettleTracker } from "@kit/build/coalesce";
import { WheelAccumulator, wheelAllowed } from "@kit/inputs/wheelGate";
import { committed, due, startCursor } from "@kit/sweeps/runner";
import { breakEvenLossRate } from "@app/model/binary";
import { DEFAULT_PARAMS, type Params } from "@app/params/params";
import { PARAM_BY_KEY } from "@app/params/schema";
import { describePreset, planSweep, resolveRange, valueAt, type SweepContext } from "@kit/sweeps/engine";
import { migratePresetId, sanitizePreset, sanitizePresets } from "@kit/sweeps/sanitize";
import { DEFAULT_PRESETS, PRESET_CATALOG } from "@app/params/presets";
import type { SweepPreset } from "@kit/sweeps/types";
import { buildAll } from "@app/scenarios";

const preset = (id: string) => DEFAULT_PRESETS.find((p) => p.id === id)!;
const P = DEFAULT_PARAMS;
const q0 = P.lossRate; // 2.945%, the discussion case
const be = breakEvenLossRate(P.gain); // 3.3816%

/** The context the app builds for a parameter, with a stand-in deck for the model anchors. */
function ctxFor(key: keyof Params, params: Params = P, origin?: number, current?: number): SweepContext {
  const deck = { robust: { risk: 0.38, growth: 0.02 }, nightKelly: { risk: 0.39, growth: 0.02 } } as never;
  const v = params[key] as number;
  return sweepContext(PARAM_BY_KEY[key], { params, origin: origin ?? v, current: current ?? origin ?? v, deck });
}

describe("anchors", () => {
  it("resolve q's anchors from the parameters: optimistic, deck, break-even", () => {
    const src = { params: P, origin: q0, deck: null };
    expect(anchorValue("optimistic", src)).toBe(0.0252);
    expect(anchorValue("deck", src)).toBe(q0);
    expect(anchorValue("break-even", src)).toBeCloseTo(0.035 / 1.035, 12);
    expect(anchorValue("robust", src)).toBeUndefined();
  });
  it("an anchor range spans optimistic to break-even on q, and falls back to min/max elsewhere", () => {
    const range = preset("optimistic-to-break-even").range;
    const onQ = resolveRange(range, ctxFor("lossRate"));
    expect(onQ.lo).toBe(0.0252);
    expect(onQ.hi).toBeCloseTo(be, 12);
    expect(onQ.loLabel).toBe("optimistic");
    expect(onQ.hiLabel).toBe("break-even");
    const onGain = resolveRange(range, ctxFor("gain"));
    expect([onGain.lo, onGain.hi]).toEqual([PARAM_BY_KEY.gain.min, PARAM_BY_KEY.gain.max]);
    expect(onGain.loLabel).toBe("min");
  });
  it("the risk a night has robust, Kelly and deck anchors from the last build", () => {
    const spots: SweepPreset = { ...preset("three-spots"), scenarios: [{ anchor: { id: "robust", fallback: "min" }, at: 0, holdMs: 1000 }, { anchor: { id: "kelly", fallback: "current" }, at: 0, holdMs: 1000 }, { anchor: { id: "deck", fallback: "current" }, at: 0, holdMs: 1000 }] };
    expect(planSweep(spots, ctxFor("riskPerNight")).values).toEqual([0.38, 0.39, 0.5]);
  });
});

describe("plans", () => {
  it("optimistic → break-even on q: 0.05 pp steps from the optimistic rate, ending exactly at break-even", () => {
    const plan = planSweep(preset("optimistic-to-break-even"), ctxFor("lossRate"));
    expect(plan.values[0]).toBe(0.0252);
    expect(plan.values[1]).toBeCloseTo(0.0257, 12);
    expect(plan.values[plan.values.length - 1]).toBeCloseTo(be, 9);
    expect(plan.count).toBe(18);
    expect(plan.holds.every((h) => h === 400)).toBe(true);
    // Every step is 0.05 pp except the last, which lands on break-even.
    for (let i = 1; i < plan.values.length - 1; i++) expect(plan.values[i] - plan.values[i - 1]).toBeCloseTo(0.0005, 9);
  });
  it("around the current value: ± 20% of the schema range, clamped, ping-ponging without repeating the ends", () => {
    const plan = planSweep(preset("around-current"), ctxFor("lossRate"));
    const span = PARAM_BY_KEY.lossRate.max - PARAM_BY_KEY.lossRate.min;
    expect(plan.lo).toBeCloseTo(q0 - 0.2 * span, 9);
    expect(plan.hi).toBeCloseTo(q0 + 0.2 * span, 9);
    expect(plan.values.length).toBe(2 * plan.count - 2);
    const atRisk = planSweep(preset("around-current"), ctxFor("riskPerNight", { ...P, riskPerNight: 0.9 }));
    expect(atRisk.hi).toBe(1);
  });
  it("integer inputs step in whole units", () => {
    const plan = planSweep(preset("around-current"), ctxFor("names"));
    expect(plan.values).toEqual([2, 3, 4, 3]);
    const nights = planSweep(preset("three-spots"), ctxFor("nights"));
    expect(nights.values).toEqual([5, 20, 60]);
  });
});

describe("valueAt: phase offset from the current value", () => {
  const loop = preset("optimistic-to-break-even");
  it("starts at the current value and moves on from it, not from the bottom of the range", () => {
    const c = ctxFor("lossRate");
    expect(valueAt(loop, c, 0)).toBe(q0);
    expect(valueAt(loop, c, 399)).toBe(q0);
    // 2.945% sits between 2.92% and 2.97% on the lattice from 2.52%: the first change goes up to 2.97%.
    expect(valueAt(loop, c, 400)).toBeCloseTo(0.0297, 9);
    expect(valueAt(loop, c, 800)).toBeCloseTo(0.0302, 9);
  });
  it("wraps from break-even back to the optimistic rate", () => {
    const c = ctxFor("lossRate");
    const plan = planSweep(loop, c);
    const stepsToTop = plan.values.length - 1 - plan.start;
    expect(valueAt(loop, c, stepsToTop * 400)).toBeCloseTo(be, 9);
    expect(valueAt(loop, c, (stepsToTop + 1) * 400)).toBe(0.0252);
    // One full cycle later it is back on the same lattice value.
    expect(valueAt(loop, c, (stepsToTop + 1 + plan.values.length) * 400)).toBe(0.0252);
  });
  it("a run below the range enters it at its bottom", () => {
    const c = ctxFor("lossRate", { ...P, lossRate: 0.01 });
    expect(valueAt(loop, c, 0)).toBe(0.01);
    expect(valueAt(loop, c, 400)).toBe(0.0252);
  });
  it("a ping-pong that starts at the top comes down", () => {
    const pp: SweepPreset = { ...loop, kind: "pingpong" };
    const c = ctxFor("lossRate", { ...P, lossRate: be }, be);
    expect(valueAt(pp, c, 0)).toBeCloseTo(be, 12);
    expect(valueAt(pp, c, 400)).toBeLessThan(be);
  });
  it("three spots on q start on the deck's spot and go on to break-even, then the optimistic rate", () => {
    const spots = preset("three-spots");
    const c = ctxFor("lossRate");
    const plan = planSweep(spots, c);
    // Anchors are used exactly, so "deck" is the deck's own q and nothing moves at the start.
    expect(plan.values).toEqual([0.0252, q0, be]);
    expect(plan.start).toBe(1);
    expect(plan.jumpTo).toBeNull();
    expect(valueAt(spots, c, 1999)).toBe(q0);
    expect(valueAt(spots, c, 2000)).toBeCloseTo(be, 9);
    expect(valueAt(spots, c, 4000)).toBe(0.0252);
  });
  it("switching presets mid-run keeps 'current' at the pre-sweep value but starts from where the input is", () => {
    const spots = preset("three-spots");
    const c = ctxFor("lossRate", P, q0, 0.031);
    const plan = planSweep(spots, c);
    expect(plan.values[1]).toBe(q0);
    expect(plan.jumpTo).toBe(q0);
  });
});

describe("descriptions in the input's units", () => {
  it("print steps as deltas in the input's units and sub-second intervals in ms", () => {
    const def = PARAM_BY_KEY.lossRate;
    const text = describePreset(preset("optimistic-to-break-even"), ctxFor("lossRate"), sweepFormat(def));
    expect(text).toBe("loops from optimistic 2.52% to break-even 3.38%, step 0.05 pp every 400 ms (18 values)");
    // The old formatter printed the range's bottom plus the step ("2.53% per 0.3s").
    expect(text).not.toMatch(/per 0\.\ds/);
  });
  it("spots read their anchors and hold times in seconds", () => {
    const text = describePreset(preset("three-spots"), ctxFor("lossRate"), sweepFormat(PARAM_BY_KEY.lossRate));
    expect(text).toBe(`holds optimistic 2.52%, deck ${valueText(PARAM_BY_KEY.lossRate, q0)}, break-even 3.38%, 2 s each`);
    const n = describePreset(preset("three-spots"), ctxFor("nights"), sweepFormat(PARAM_BY_KEY.nights));
    expect(n).toBe("holds min 5, current 20, max 60, 2 s each");
  });
  it("around the current value reads ± in the input's units", () => {
    const text = describePreset(preset("around-current"), ctxFor("names"), sweepFormat(PARAM_BY_KEY.names));
    expect(text).toBe("ping-pongs ± 1 name around 3 (2 to 4), step 1 name every 300 ms (3 values)");
    const risk = describePreset(preset("around-current"), ctxFor("riskPerNight"), sweepFormat(PARAM_BY_KEY.riskPerNight));
    expect(risk).toContain("± 19 pp around 50% (31% to 69%)");
  });
  it("deltas: percentage points for rates, nouns for counts", () => {
    expect(deltaText(PARAM_BY_KEY.lossRate, 0.0005)).toBe("0.05 pp");
    expect(deltaText(PARAM_BY_KEY.riskPerNight, 0.1)).toBe("10 pp");
    expect(deltaText(PARAM_BY_KEY.nights, 5)).toBe("5 nights");
    expect(deltaText(PARAM_BY_KEY.names, 1)).toBe("1 name");
    expect(valueText(PARAM_BY_KEY.riskPerNight, 0.5)).toBe("50%");
  });
  it("drag sensitivity is set in units per 100 px for the deck's inputs", () => {
    expect(PARAM_BY_KEY.lossRate.input?.perHundredPx).toBe(0.0025);
    expect(PARAM_BY_KEY.gain.input?.perHundredPx).toBe(0.0025);
    expect(PARAM_BY_KEY.nights.input?.perHundredPx).toBe(5);
    expect(PARAM_BY_KEY.names.input?.perHundredPx).toBe(1);
    expect(PARAM_BY_KEY.riskPerNight.input?.perHundredPx).toBe(0.1);
    expect(PARAM_BY_KEY.seasons.input?.perHundredPx).toBe(1);
  });
});

describe("saved presets", () => {
  it("replace the old defaults and keep a reader's own preset with its step as a share of the range", () => {
    const old = [
      { id: "loop-full", name: "Loop the whole range", kind: "loop", range: { mode: "full" }, stepFraction: 0.02, intervalMs: 300, smooth: true, scenarios: [] },
      { id: "bounce-mid", name: "Oscillate in the middle band", kind: "pingpong", range: { mode: "fraction", lo: 0.3, hi: 0.7 }, stepFraction: 0.02, intervalMs: 250, smooth: true, scenarios: [] },
      { id: "p-abc123", name: "Mine", kind: "pingpong", range: { mode: "absolute", lo: 0.02, hi: 0.03 }, stepFraction: 0.1, intervalMs: 500, smooth: false, scenarios: [] },
    ];
    const out = sanitizePresets(old, PRESET_CATALOG);
    expect(out.map((p) => p.id)).toEqual(["optimistic-to-break-even", "around-current", "p-abc123"]);
    expect(out[2]).toEqual({ id: "p-abc123", name: "Mine", kind: "pingpong", range: { mode: "absolute", lo: 0.02, hi: 0.03 }, step: { size: 0.1, unit: "share" }, intervalMs: 500, scenarios: [] });
    expect(migratePresetId("loop-full", PRESET_CATALOG)).toBe("optimistic-to-break-even");
    expect(migratePresetId("p-abc123", PRESET_CATALOG)).toBe("p-abc123");
  });
  it("round-trip the new format, anchors included", () => {
    for (const p of DEFAULT_PRESETS) expect(sanitizePreset(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(sanitizePreset({ id: "x", range: { mode: "anchors", lo: { id: "bad id!" }, hi: { id: "max" } } })?.range).toEqual({ mode: "full" });
  });
});

describe("frame-locked runner", () => {
  it("does not advance before the previous value's build has rendered, then holds it", () => {
    let renderedAt = -Infinity;
    const settled = (t: number) => renderedAt >= t;
    const c = startCursor(0);
    expect(due(c, 399, 400, settled)).toBe(false);
    expect(due(c, 400, 400, settled)).toBe(true);
    committed(c, 400);
    // The build for the commit has not rendered: wait, however long the hold.
    expect(due(c, 900, 400, settled)).toBe(false);
    renderedAt = 410; // the request made after the commit rendered
    // Seen rendered at 1000 after 600 ms; a build slower than the hold means the next
    // commit may go at once: this value stays on screen while the next one builds.
    expect(due(c, 1000, 400, settled)).toBe(true);
    expect(c.shownAt).toBe(1000);
  });
  it("commits ahead by the build latency so each value is on screen about its hold", () => {
    let renderedAt = -Infinity;
    const settled = (t: number) => renderedAt >= t;
    const c = startCursor(0);
    committed(c, 0);
    renderedAt = 1;
    expect(due(c, 100, 400, settled)).toBe(false); // seen rendered at 100: latency 100
    expect(due(c, 399, 400, settled)).toBe(false);
    expect(due(c, 400, 400, settled)).toBe(true); // 100 + 400 − 100 lead: the next value renders near 500
  });
  it("moves on after the timeout when a build never reports back", () => {
    const c = startCursor(0);
    committed(c, 0);
    expect(due(c, 3999, 400, () => false)).toBe(false);
    expect(due(c, 4000, 400, () => false)).toBe(false);
    expect(c.shownAt).toBe(4000);
    expect(due(c, 4400, 400, () => false)).toBe(true);
  });
});

describe("build queue", () => {
  it("keeps one request in flight and only the newest waiting, and shows every answer newer than the last shown", () => {
    const sent: number[] = [];
    let t = 0;
    const q = new BuildQueue<string>((d) => sent.push(d.id), () => ++t);
    const a = q.request("a");
    q.request("b");
    const c = q.request("c");
    expect(sent).toEqual([a]);
    // The old rule dropped this answer because a newer request existed; now it is shown.
    expect(q.answer(a).show).toBe(true);
    expect(sent).toEqual([a, c]);
    expect(q.pending).toBe(true);
    const ans = q.answer(c);
    expect(ans.show).toBe(true);
    expect(ans.requestedAt).toBe(3);
    expect(q.pending).toBe(false);
  });
  it("the settle tracker answers 'has a build requested after t rendered'", () => {
    const s = new SettleTracker<number>();
    expect(s.settledSince(10)).toBe(false);
    s.markRendered(12, 1);
    expect(s.settledSince(10)).toBe(true);
    expect(s.settledSince(13)).toBe(false);
    expect(s.latest).toBe(1);
  });
});

describe("wheel gate", () => {
  it("leaves the wheel to the page over an unfocused field until the pointer has rested 400 ms", () => {
    expect(wheelAllowed({ focused: false, hoverSince: 1000, now: 1010, lastScrollAt: -Infinity })).toBe(false);
    expect(wheelAllowed({ focused: false, hoverSince: 1000, now: 1400, lastScrollAt: -Infinity })).toBe(true);
    expect(wheelAllowed({ focused: false, hoverSince: null, now: 5000, lastScrollAt: -Infinity })).toBe(false);
    expect(wheelAllowed({ focused: true, hoverSince: null, now: 5000, lastScrollAt: 4999 })).toBe(true);
  });
  it("a page scroll restarts the hover clock", () => {
    expect(wheelAllowed({ focused: false, hoverSince: 0, now: 1000, lastScrollAt: 900 })).toBe(false);
    expect(wheelAllowed({ focused: false, hoverSince: 0, now: 1300, lastScrollAt: 900 })).toBe(true);
  });
  it("steps once per mouse notch and once per notch's worth of trackpad travel", () => {
    const w = new WheelAccumulator(50);
    expect(w.push({ deltaY: -100 })).toBe(1);
    expect(w.push({ deltaY: 100 })).toBe(-1);
    expect(w.push({ deltaY: -20 })).toBe(0);
    expect(w.push({ deltaY: -20 })).toBe(0);
    expect(w.push({ deltaY: -20 })).toBe(1);
  });
});

describe("buildAll with `only`", () => {
  it("builds the deck figures, the Desk and the named scenario only", () => {
    const full = buildAll(P, { record: [], moves: [] });
    expect(full.partial).toBeUndefined();
    const id = full.scenarios[0].id;
    const part = buildAll({ ...P, lossRate: 0.03 }, { record: [], moves: [] }, { only: [id] });
    expect(part.partial).toEqual([id]);
    expect(part.scenarios.map((s) => s.id)).toEqual([id]);
    expect(part.deck.pClean).toBeCloseTo(Math.pow(0.97, 20), 12);
    expect(part.desk).toBeTruthy();
  });
});

describe("store: sweep runs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  function memoryStorage(init: Record<string, string> = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), dump: () => Object.fromEntries(m) };
  }

  it("a run starts from the current value; stop keeps the value; ↺ and undo put back the pre-sweep value; ticks are not saved", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const { useStore } = await import("@app/store");
    await import("@kit/sweeps/useSweeps"); // registers the planner
    const s = () => useStore.getState();
    s().setActiveInput("lossRate");
    s().startSweep("lossRate", "optimistic-to-break-even");
    const run = s().runs.lossRate;
    expect(run.origin).toBe(q0);
    expect(run.plan?.values[run.index]).toBeCloseTo(0.0292, 9);
    const saved = JSON.parse(storage.getItem("tranche-replay:v1")!);
    expect(saved.runs).toEqual([{ key: "lossRate", presetId: "optimistic-to-break-even", origin: q0 }]);
    // A tick: not history, not saved.
    s().setParams({ lossRate: 0.0302 }, { sweep: true });
    expect(JSON.parse(storage.getItem("tranche-replay:v1")!).params.lossRate).toBe(q0);
    s().stopSweep("lossRate");
    expect(s().params.lossRate).toBe(0.0302);
    expect(JSON.parse(storage.getItem("tranche-replay:v1")!).params.lossRate).toBe(0.0302);
    expect(s().sweepOrigins.lossRate).toBe(q0);
    s().restoreSweep("lossRate");
    expect(s().params.lossRate).toBe(q0);
    // Undo after a stop goes back through the stop value to before the sweep.
    s().startSweep("lossRate");
    s().setParams({ lossRate: 0.0312 }, { sweep: true });
    s().stopSweep("lossRate");
    s().undo();
    expect(s().params.lossRate).toBe(q0);
  });

  it("a reload in the middle of a run restores the pre-sweep value", async () => {
    const stored = { version: 4, params: { ...P, lossRate: 0.0322, gain: 0.04 }, runs: [{ key: "lossRate", presetId: "optimistic-to-break-even", origin: 0.0281 }] };
    vi.stubGlobal("localStorage", memoryStorage({ "tranche-replay:v1": JSON.stringify(stored) }));
    const { useStore } = await import("@app/store");
    expect(useStore.getState().params.lossRate).toBe(0.0281);
    expect(useStore.getState().params.gain).toBe(0.04);
    expect(useStore.getState().runs).toEqual({});
  });

  it("a hand edit of the swept input stops its run", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const { useStore } = await import("@app/store");
    await import("@kit/sweeps/useSweeps");
    const s = () => useStore.getState();
    s().startSweep("lossRate", "around-current");
    s().setParam("lossRate", 0.03);
    expect(s().runs.lossRate).toBeUndefined();
    expect(s().params.lossRate).toBe(0.03);
  });
});
