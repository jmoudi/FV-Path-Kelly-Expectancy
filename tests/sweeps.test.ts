import { describe, expect, it } from "vitest";
import { periodMs, resolveRange, snap, valueAt } from "../src/sweeps/engine";
import { DEFAULT_PRESETS, type SweepPreset } from "../src/sweeps/types";

const b = { min: 0, max: 1, step: 0.01 };

describe("sweep ranges", () => {
  it("resolve full, fractional and absolute ranges inside the bounds", () => {
    expect(resolveRange({ mode: "full" }, b)).toEqual([0, 1]);
    expect(resolveRange({ mode: "fraction", lo: 0.3, hi: 0.7 }, b)).toEqual([0.3, 0.7]);
    expect(resolveRange({ mode: "absolute", lo: -5, hi: 0.5 }, b)).toEqual([0, 0.5]);
    expect(resolveRange({ mode: "absolute", lo: 0.8, hi: 0.2 }, b)).toEqual([0.2, 0.8]);
  });
  it("snaps to the grid", () => {
    expect(snap(0.123, b)).toBe(0.12);
    expect(snap(2, b)).toBe(1);
  });
});

describe("sweep values", () => {
  const loop: SweepPreset = { id: "l", name: "l", kind: "loop", range: { mode: "full" }, stepFraction: 0.1, intervalMs: 1000, smooth: false, scenarios: [] };
  it("loop steps up and wraps", () => {
    expect(periodMs(loop)).toBe(10_000);
    expect(valueAt(loop, b, 0)).toBe(0);
    expect(valueAt(loop, b, 3000)).toBe(0.3);
    expect(valueAt(loop, b, 9999)).toBe(0.9);
    expect(valueAt(loop, b, 10_000)).toBe(0);
  });
  it("smooth loop glides between steps", () => {
    const v = valueAt({ ...loop, smooth: true }, b, 3500);
    expect(v).toBe(0.35);
  });
  it("pingpong comes back down", () => {
    const pp: SweepPreset = { ...loop, kind: "pingpong", smooth: true };
    expect(periodMs(pp)).toBe(20_000);
    expect(valueAt(pp, b, 10_000)).toBe(1);
    expect(valueAt(pp, b, 15_000)).toBe(0.5);
    expect(valueAt(pp, b, 20_000)).toBe(0);
  });
  it("scenarios hold each spot for its time", () => {
    const sc = DEFAULT_PRESETS.find((p) => p.id === "three-spots")!;
    expect(valueAt(sc, b, 0)).toBe(0.25);
    expect(valueAt(sc, b, 2500)).toBe(0.5);
    expect(valueAt(sc, b, 5999)).toBe(0.75);
    expect(valueAt(sc, b, 6000)).toBe(0.25);
  });
  it("absolute scenarios use the input's units", () => {
    const sc: SweepPreset = { ...DEFAULT_PRESETS[2], range: { mode: "absolute", lo: 0, hi: 1 }, scenarios: [{ at: 0.42, holdMs: 1000 }] };
    expect(valueAt(sc, b, 10)).toBe(0.42);
  });
});
