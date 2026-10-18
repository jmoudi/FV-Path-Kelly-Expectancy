import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hrefFor, parseHash, type RouteConfig } from "@kit/ui/route";
import { GuideFrame, inline } from "@kit/ui/GuideFrame";
import { GUIDE_LEDE, GUIDE_SECTIONS } from "@app/data/copy/guide";
import { clampTyped, effectiveSettings, patchParamSetting, quantize, sanitizeParamSetting, sanitizeParamSettings, schemaSettings, stepOnGrid } from "@kit/inputs/paramSettings";
import { PARAM_BY_KEY, SCHEMA } from "@app/data/schema";
import { DEFAULT_PARAMS } from "@app/data/params";
import type { SweepPreset } from "@kit/sweeps/types";

const q = PARAM_BY_KEY.lossRate;
const KEY = "tranche-replay:v1";

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** A preset that loops q from the optimistic rate to break-even in 0.25 pp steps. */
const QUARTER: SweepPreset = {
  id: "quarter-pp",
  name: "Quarter points",
  kind: "loop",
  range: { mode: "anchors", lo: { id: "optimistic", fallback: "min" }, hi: { id: "break-even", fallback: "max" } },
  step: { size: 0.0025, unit: "units" },
  intervalMs: 300,
  scenarios: [],
};

const diffs = (v: number[]) => v.slice(1).map((x, i) => Number((x - v[i]).toPrecision(6)));

describe("effective parameter settings", () => {
  it("default to the schema's step and input block", () => {
    expect(schemaSettings(q)).toEqual({ step: 0.0005, fineStep: 0.0001, wheelStep: 0.0005, dragPerHundredPx: 0.0025, decimals: 2, slider: true });
    expect(schemaSettings(PARAM_BY_KEY.nights)).toMatchObject({ step: 1, fineStep: 1, wheelStep: 1, dragPerHundredPx: 5, decimals: 0, slider: true });
    // The fine step is one the box can show: a fifth of 5 pp at no decimals is 1 pp; a fifth of 0.25 pp at two decimals.
    expect(schemaSettings(PARAM_BY_KEY.riskPerNight).fineStep).toBeCloseTo(0.01, 12);
    expect(schemaSettings(PARAM_BY_KEY.gain).fineStep).toBeCloseTo(0.0005, 12);
    expect(schemaSettings(PARAM_BY_KEY.eventsPerYear).fineStep).toBe(1);
    expect(schemaSettings(PARAM_BY_KEY.seed).slider).toBe(false);
  });

  it("a person's settings override the schema, and the wheel and fine step follow a new step", () => {
    const half = effectiveSettings(q, { step: 0.005 });
    expect(half.step).toBe(0.005);
    // The schema's wheel step (0.05 pp) is less than one step: one notch is one step, 0.5 pp.
    expect(half.wheelStep).toBe(0.005);
    expect(half.fineStep).toBeCloseTo(0.0005, 12);
    expect(half.decimals).toBe(2);
    expect(effectiveSettings(q, { wheelStep: 0.0012 }).wheelStep).toBeCloseTo(0.001, 12);
    expect(effectiveSettings(q, { decimals: 3, slider: false, dragPerHundredPx: 0.01, fineStep: 0.0002 })).toMatchObject({ decimals: 3, slider: false, dragPerHundredPx: 0.01, fineStep: 0.0002 });
    // A finer step than the schema's shows the decimals it needs.
    expect(effectiveSettings(q, { step: 0.00001 }).decimals).toBe(3);
  });
});

describe("the grid", () => {
  it("wheel and arrows land on multiples of the step, at least one step in the direction of the move", () => {
    expect(stepOnGrid(0.03, 0.005, 0.005, q.min, q.max)).toBe(0.035);
    expect(stepOnGrid(0.035, -0.005, 0.005, q.min, q.max)).toBe(0.03);
    // Off the grid, the first move lands on the nearest multiple in its direction.
    expect(stepOnGrid(DEFAULT_PARAMS.lossRate, 0.005, 0.005, q.min, q.max)).toBe(0.035);
    // 2.9448% + 0.05 pp is nearest 3.00%.
    expect(stepOnGrid(DEFAULT_PARAMS.lossRate, 0.0005, 0.0005, q.min, q.max)).toBe(0.03);
    expect(stepOnGrid(DEFAULT_PARAMS.lossRate, -0.0005, 0.0005, q.min, q.max)).toBe(0.029);
    // A move smaller than the grid still moves one grid point.
    expect(stepOnGrid(0.03, 0.0001, 0.005, q.min, q.max)).toBe(0.035);
    // Inside the range.
    expect(stepOnGrid(0.079, 0.005, 0.005, q.min, q.max)).toBe(q.max);
    expect(stepOnGrid(0.002, -0.005, 0.005, q.min, q.max)).toBe(q.min);
    expect(quantize(0.0312, 0.005, q.min, q.max)).toBe(0.03);
  });
  it("typed values are clamped, never put on the step", () => {
    expect(clampTyped(0.02947, q.min, q.max)).toBe(0.02947);
    expect(clampTyped(0.5, q.min, q.max)).toBe(q.max);
    expect(clampTyped(5.6, 5, 60, true)).toBe(6);
  });
});

describe("sanitizing parameter settings", () => {
  it("keeps known, valid settings of known numeric parameters only", () => {
    const clean = sanitizeParamSettings(
      {
        lossRate: { step: 0.005, fineStep: -1, wheelStep: "x", dragPerHundredPx: 0.01, decimals: 2.5, slider: false, colour: "red" },
        nights: { step: 2.4, decimals: 9 },
        market: { step: 1 },
        nonsense: { step: 1 },
        gain: { step: 0 },
      },
      SCHEMA,
    );
    expect(clean).toEqual({ lossRate: { step: 0.005, dragPerHundredPx: 0.01, slider: false }, nights: { step: 2 } });
    expect(sanitizeParamSettings("nope", SCHEMA)).toEqual({});
    expect(sanitizeParamSettings([1, 2], SCHEMA)).toEqual({});
    // Steps are capped at the parameter's range.
    expect(sanitizeParamSetting(q, { step: 1 })).toEqual({ step: q.max - q.min });
  });
  it("a patch sets values and clears nulls; nothing left is null", () => {
    expect(patchParamSetting(q, { step: 0.005, decimals: 3 }, { decimals: null, slider: false })).toEqual({ step: 0.005, slider: false });
    expect(patchParamSetting(q, { step: 0.005 }, { step: null })).toBeNull();
  });
});

describe("store: parameter settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("are saved, exported with the state (version 5) and come back on import", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const { useStore } = await import("@app/store");
    const s = () => useStore.getState();
    s().setParamSettings("lossRate", { step: 0.005, slider: false });
    s().setParamSettings("nights", { wheelStep: 5 });
    s().setParamSettings("market", { step: 1 });
    expect(s().paramSettings).toEqual({ lossRate: { step: 0.005, slider: false }, nights: { wheelStep: 5 } });
    expect(JSON.parse(storage.getItem(KEY)!).paramSettings).toEqual(s().paramSettings);
    const exported = s().exportState();
    expect(exported.version).toBe(5);
    expect(exported.paramSettings).toEqual({ lossRate: { step: 0.005, slider: false }, nights: { wheelStep: 5 } });

    // Reset one, then every one; parameter values are a separate thing.
    s().setParam("lossRate", 0.03);
    s().resetParams();
    expect(s().paramSettings.lossRate).toEqual({ step: 0.005, slider: false });
    s().resetParamSettings("lossRate");
    expect(Object.keys(s().paramSettings)).toEqual(["nights"]);
    s().resetParamSettings();
    expect(s().paramSettings).toEqual({});

    // Round trip; an invalid entry is dropped on import.
    const bad = { ...exported, paramSettings: { ...exported.paramSettings, gain: { step: -2 }, ghost: { step: 1 } } };
    expect(s().importState(JSON.stringify(bad)).ok).toBe(true);
    expect(s().paramSettings).toEqual({ lossRate: { step: 0.005, slider: false }, nights: { wheelStep: 5 } });
    // A file from before parameter settings existed keeps the current ones.
    const { paramSettings: _drop, ...v4 } = exported;
    void _drop;
    expect(s().importState(JSON.stringify({ ...v4, version: 4 })).ok).toBe(true);
    expect(s().paramSettings.lossRate).toEqual({ step: 0.005, slider: false });
    s().resetEverything();
    expect(s().paramSettings).toEqual({});
  });

  it("are read back, sanitized, after a reload", async () => {
    const saved = { version: 5, params: DEFAULT_PARAMS, paramSettings: { lossRate: { step: 0.005, decimals: 17 }, seed: { slider: true } } };
    vi.stubGlobal("localStorage", memoryStorage({ [KEY]: JSON.stringify(saved) }));
    const { useStore } = await import("@app/store");
    expect(useStore.getState().paramSettings).toEqual({ lossRate: { step: 0.005 }, seed: { slider: true } });
  });

  it("the replayer keeps its own step: a 0.5 pp manual step leaves a 0.25 pp preset's plan alone, and the wheel moves 0.5 pp", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const { useStore } = await import("@app/store");
    const s = () => useStore.getState();
    s().upsertPreset(QUARTER);
    s().startSweep("lossRate", QUARTER.id);
    const before = s().runs.lossRate.plan!;
    s().stopSweep("lossRate");
    s().restoreSweep("lossRate");

    s().setParamSettings("lossRate", { step: 0.005 });
    s().startSweep("lossRate", QUARTER.id);
    const after = s().runs.lossRate.plan!;
    expect(after).toEqual(before);
    expect(after.step).toBe(0.0025);
    // Every step is 0.25 pp except the last, which lands on break-even.
    expect(diffs(after.values).slice(0, -1).every((d) => d === 0.0025)).toBe(true);
    s().stopSweep("lossRate");

    // The shipped preset still steps 0.05 pp.
    s().startSweep("lossRate", "optimistic-to-break-even");
    const shipped = s().runs.lossRate.plan!;
    expect(shipped.step).toBe(0.0005);
    expect(diffs(shipped.values).slice(0, -1).every((d) => d === 0.0005)).toBe(true);
    s().stopSweep("lossRate");

    // The manual feel did change: one wheel notch is now 0.5 pp instead of 0.05 pp.
    const feel = effectiveSettings(q, s().paramSettings.lossRate);
    expect(schemaSettings(q).wheelStep).toBe(0.0005);
    expect(feel.wheelStep).toBe(0.005);
    expect(stepOnGrid(0.03, feel.wheelStep, feel.step, q.min, q.max)).toBe(0.035);
    expect(stepOnGrid(0.03, schemaSettings(q).wheelStep, schemaSettings(q).step, q.min, q.max)).toBe(0.0305);
  });
});

describe("the Guide", () => {
  const cfg: RouteConfig = { home: "desk", pages: ["desk", "explain", "settings", "guide"], aliases: { tour: "explain" }, sectionsPage: "explain" };
  it("has its own address, and one per section", () => {
    expect(parseHash("#guide", cfg)).toEqual({ page: "guide" });
    expect(parseHash("#guide/keys", cfg)).toEqual({ page: "guide", section: "keys" });
    expect(hrefFor({ page: "guide", section: "keys" }, cfg)).toBe("#guide/keys");
    // The built-in shapes and unknown pages are unchanged.
    expect(parseHash("#view/sizing-grid", cfg)).toEqual({ page: "view", id: "sizing-grid" });
    expect(parseHash("#s-wing", cfg)).toEqual({ page: "explain", section: "wing" });
    expect(parseHash("#nowhere/keys", cfg)).toEqual({ page: "desk" });
  });
  it("covers the ten sections, in order, and draws every block", () => {
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(["screen", "parameters", "editing", "parameter-settings", "replayer", "charts", "pages", "data", "keys", "builders"]);
    const html = renderToStaticMarkup(createElement(GuideFrame, { title: "Guide", lede: GUIDE_LEDE, sections: GUIDE_SECTIONS }));
    for (const s of GUIDE_SECTIONS) {
      expect(html).toContain(`id="g-${s.id}"`);
      expect(html).toContain(`href="#guide/${s.id}"`);
    }
    expect(html).toContain("<kbd>");
    expect(html).toContain("Settings for &lt;parameter&gt;");
    expect(html).not.toMatch(/\bedge\b/i);
  });
  it("reads inline code, terms and links", () => {
    const html = renderToStaticMarkup(createElement("p", null, inline("Press `Ctrl+Z`, see **stories** and [Keys](#guide/keys).")));
    expect(html).toBe('<p>Press <code>Ctrl+Z</code>, see <strong>stories</strong> and <a href="#guide/keys">Keys</a>.</p>');
  });
});
