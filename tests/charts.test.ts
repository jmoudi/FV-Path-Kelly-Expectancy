import { describe, expect, it } from "vitest";
import { tickMultiple, tickPercent } from "../src/charts/format";
import { linearTicks, logTicks, resolveAxes } from "../src/charts/resolve";
import { applyOverride, f, sanitizeOverride, table, type ChartSpec } from "../src/charts/spec";
import { DEFAULT_PARAMS, EMPTY_DATASETS } from "../src/model/params";
import { buildAll } from "../src/viewmodel";

const spec: ChartSpec = {
  id: "t",
  title: "t",
  kind: "xy",
  data: table(
    [f("q", "q", "pct2"), f("p", "p", "pct1"), f("m", "m", "x")],
    [
      { q: 0.01, p: 0.8, m: 1.6 },
      { q: 0.03, p: 0.5, m: 1.0 },
      { q: 0.05, p: 0.3, m: 0.6 },
    ],
  ),
  mark: "line",
  x: { field: "q" },
  y: { field: "p" },
  series: [{ field: "p", color: "a" }],
  annotations: [{ kind: "hline", y: 0.95, text: "x" }],
};

describe("tick formats", () => {
  it("are the shortest exact decimals", () => {
    expect(tickPercent(0.003)).toBe("0.3%");
    expect(tickPercent(0.0294)).toBe("2.94%");
    expect(tickPercent(0.2)).toBe("20%");
    expect(tickPercent(0.00001)).toBe("0.001%");
    expect(tickMultiple(1.5)).toBe("1.5×");
    expect(tickMultiple(2)).toBe("2×");
    expect(tickMultiple(-0.2)).toBe("");
  });
  it("produce nice tick positions", () => {
    expect(linearTicks(0, 1, 6)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(logTicks(0.001, 1)).toEqual([0.001, 0.01, 0.1, 1]);
  });
});

describe("resolved axes", () => {
  it("fill open domains from data and annotations", () => {
    const axes = resolveAxes(spec);
    expect(axes.x.min).toBe(0.01);
    expect(axes.x.max).toBe(0.05);
    expect(axes.y.min).toBe(0);
    expect(axes.y.max).toBeGreaterThanOrEqual(0.95);
    expect(axes.y.labels).toContain("0%");
  });
  it("honour explicit domains and log scales", () => {
    const axes = resolveAxes({ ...spec, x: { field: "q", domain: [0.001, 0.1], scale: "log" } });
    expect(axes.x.min).toBe(0.001);
    expect(axes.x.max).toBe(0.1);
    expect(axes.x.ticks[0]).toBe(0.001);
  });
});

describe("overrides", () => {
  it("drop malformed input instead of breaking the page", () => {
    expect(sanitizeOverride({ extraSeries: 5, backend: "foo", height: "x" })).toBeNull();
    expect(sanitizeOverride({ backend: "plotly", extraSeries: [{ field: "m", color: "b" }, { field: 3 }], height: 20 })).toEqual({ backend: "plotly", extraSeries: [{ field: "m", color: "b" }] });
  });
  it("apply replacement annotations and extra series", () => {
    const out = applyOverride(spec, { hiddenSeries: ["p"], extraSeries: [{ field: "m", color: "b" }], annotations: [{ kind: "hline", y: 1 }] });
    expect(out.series.map((s) => s.field)).toEqual(["m"]);
    expect(out.annotations).toEqual([{ kind: "hline", y: 1 }]);
  });
  it("never let a log axis start at zero", () => {
    const out = applyOverride(spec, { y: { scale: "log", domain: [0, 1] } });
    expect(out.y.domain?.[0]).toBeNull();
  });
});

describe("the whole build", () => {
  it("produces eight sections with charts, tables and recomputed figures", () => {
    const { deck, scenarios } = buildAll(DEFAULT_PARAMS, EMPTY_DATASETS);
    expect(scenarios).toHaveLength(8);
    for (const s of scenarios) {
      expect(s.primary.length + s.secondary.length).toBeGreaterThanOrEqual(2);
      expect(s.tables.length).toBeGreaterThanOrEqual(1);
      expect(s.kpis.length).toBeGreaterThanOrEqual(2);
      for (const c of [...s.primary, ...s.secondary, ...s.tables]) expect(c.data.rows.length).toBeGreaterThan(0);
    }
    expect(deck.pClean).toBeCloseTo(0.55, 2);
    expect(deck.robust.risk).toBeGreaterThan(0.2);
  });
  it("survives the degenerate decks", () => {
    for (const patch of [{ names: 1 }, { riskPerNight: 1 }, { seasons: 1 }, { nights: 5, names: 6 }, { lossRate: 0.08 }, { lossRate: 0.001 }]) {
      const { scenarios } = buildAll({ ...DEFAULT_PARAMS, ...patch }, EMPTY_DATASETS);
      expect(scenarios).toHaveLength(8);
      for (const s of scenarios) for (const k of s.kpis) expect(k.value).not.toMatch(/NaN|Infinity/);
    }
  });
  it("uses imported data", () => {
    const record = Array.from({ length: 120 }, (_, i) => (i % 40 === 0 ? 1 : 0));
    const moves = Array.from({ length: 300 }, (_, i) => Math.sin(i) * 2.5);
    const { deck, scenarios } = buildAll({ ...DEFAULT_PARAMS, moveDist: "empirical" }, { record, moves });
    expect(deck.recordEvents).toBe(120);
    expect(deck.bandLabel).toMatch(/record/);
    const wing = scenarios.find((s) => s.id === "wing")!;
    expect(wing.primary[0].subtitle).toMatch(/imported/);
  });
});
