import { describe, expect, it } from "vitest";
import { tickMultiple, tickPercent } from "../src/charts/format";
import { linearTicks, logTicks, resolveAxes } from "../src/charts/resolve";
import { applyOverride, f, sanitizeOverride, table, type ChartSpec, type Story } from "../src/charts/spec";
import { breakEvenLossRate } from "../src/model/binary";
import { DEFAULT_PARAMS, EMPTY_DATASETS } from "../src/model/params";
import { useStore } from "../src/state/store";
import { buildAll } from "../src/viewmodel";
import { fmtMs, formatNumber, MINUS, pct1, signedPct1, signedPp, smallPct, x2 } from "../src/viewmodel/derived";
import type { ScenarioView } from "../src/viewmodel/types";

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

describe("the one number formatter", () => {
  it("always prints the typographic minus", () => {
    expect(MINUS).toBe("−");
    expect(signedPct1(-0.042)).toBe("−4.2%");
    expect(signedPct1(0.094)).toBe("+9.4%");
    expect(signedPct1(0)).toBe("0.0%");
    expect(pct1(-0.042)).toBe("−4.2%");
    expect(x2(-0.5)).toBe("−0.50×");
    expect(signedPp(0.0044)).toBe("+0.44 pp");
    expect(signedPp(-0.0044)).toBe("−0.44 pp");
    expect(formatNumber(-0.042, "pct1")).toBe("−4.2%");
    expect(formatNumber(-1234, "int")).toBe("−1,234");
    expect(formatNumber(-2.5e-7, "sci")).toBe("−2.5e−7");
    expect(formatNumber(-Infinity)).toBe("−∞");
    expect(smallPct(0.00051)).toBe("0.051%");
    expect(smallPct(1e-8)).toBe("< 0.0001%");
    for (const s of [signedPct1(-0.1), pct1(-0.1), x2(-1), formatNumber(-3, "num"), formatNumber(-3), smallPct(-0.002)]) expect(s).not.toMatch(/-/);
  });
  it("prints sub-second intervals in milliseconds", () => {
    expect(fmtMs(250)).toBe("250 ms");
    expect(fmtMs(2000)).toBe("2 s");
    expect(fmtMs(1500)).toBe("1.5 s");
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

/** Every string a section shows, with where it came from. */
function allText(s: ScenarioView): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, t: unknown) => {
    if (typeof t === "string") out.push({ where, text: t });
  };
  push(`${s.id}.title`, s.title);
  push(`${s.id}.claim`, s.claim);
  push(`${s.id}.lede`, s.lede);
  s.kpis.forEach((k) => [k.label, k.value, k.sub, k.help].forEach((t) => push(`${s.id}.kpi`, t)));
  s.notes.forEach((n) => [n.title, n.body].forEach((t) => push(`${s.id}.note`, t)));
  s.views.forEach((v) => [v.title, v.blurb].forEach((t) => push(`${s.id}.view`, t)));
  s.actions?.forEach((a) => [a.label, a.hint, a.warning].forEach((t) => push(`${s.id}.action`, t)));
  s.sourceFigures?.forEach((q) => [q.label, q.computed, q.why].forEach((t) => push(`${s.id}.figure`, t)));
  for (const c of [...s.primary, ...s.secondary, ...s.tables]) {
    [c.title, c.subtitle, c.caption].forEach((t) => push(`${c.id}`, t));
    c.series.forEach((se) => push(`${c.id}.series`, se.label));
    c.annotations?.forEach((a) => push(`${c.id}.annotation`, a.text));
    c.data.fields.forEach((fl) => push(`${c.id}.field`, fl.label));
    c.stories?.forEach((st) => [st.label, st.narrative, st.badge].forEach((t) => push(`${c.id}.story`, t)));
  }
  return out;
}

describe("the whole build", () => {
  const built = buildAll(DEFAULT_PARAMS, EMPTY_DATASETS);
  const { deck, desk, scenarios } = built;

  it("produces eight sections with charts, tables and recomputed figures", () => {
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

  it("names policies without letters and never claims an edge", () => {
    const letters = /\b(polic(y|ies)|of|and|median|mean|ruin)\s[ABC]\b|\b[ABC]:\s|\b[ABC],\s(mean|median)|\bA and B\b/;
    const texts = [...scenarios.flatMap(allText), ...deck.figures.flatMap((fg) => [fg.label, fg.basis, fg.help].map((text) => ({ where: "deck", text }))), ...deck.definitions.flatMap((df) => [df.term, df.def].map((text) => ({ where: "deck", text })))];
    expect(texts.length).toBeGreaterThan(300);
    for (const t of texts) {
      expect(t.text, t.where).not.toMatch(letters);
      expect(t.text.replace(/not an information edge/g, ""), `${t.where}: ${t.text}`).not.toMatch(/\bedge\b/i);
      expect(t.text, t.where).not.toMatch(/(^|[\s(=·])-\d/);
      expect(t.text, t.where).not.toMatch(/honest|gnaw|most likely live|never own|climbs the same stairs|cheap for what it buys/i);
    }
  });

  it("titles the views as the trader's questions and keeps their ids", () => {
    const titles = Object.fromEntries(scenarios.flatMap((s) => s.views.map((v) => [v.id, v.title])));
    expect(titles).toMatchObject({
      "season-outcomes": "Where a season ends",
      "clean-season-curve": "The one curve the coin reduces to",
      "replay-quantiles": "What the mean means",
      pooling: "What a pool of tranches would earn",
      "events-needed": "How long until my record proves q",
      sampling: "How wide the record's error bar is",
      "confidence-band": "Which rates my record cannot rule out",
      "move-vs-wing": "Which loss rate to plug in",
      "wing-rates": "Breach, effective and full-gap rates",
      "season-shape": "What spreading buys",
      "single-name-mix": "What single-name nights cost",
      "shared-causes": "When shared causes ruin you",
      "vol-shock": "When volatility shocks everything at once",
      "grid-and-path": "Time and breadth as two axes",
      "kelly-breadth": "How much to risk per name",
      "sizing-grid": "How much to risk a night",
      "chained-outcomes": "Four seasons later",
    });
    for (const s of scenarios) expect(s.lede).toMatch(/\?/);
  });

  it("renames the figures and adds median growth per season", () => {
    const labels = scenarios.flatMap((s) => s.kpis.map((k) => k.label));
    expect(labels).toContain("Expected value per season");
    expect(labels).toContain("Premium over fair per event");
    expect(labels.filter((l) => l.startsWith("Log growth of surviving paths")).length).toBeGreaterThanOrEqual(3);
    expect(labels.filter((l) => l.startsWith("Median growth per season")).length).toBeGreaterThanOrEqual(2);
    expect(labels.some((l) => /^Edge/.test(l))).toBe(false);
    const chaining = scenarios.find((s) => s.id === "chaining")!;
    const mg = chaining.kpis.find((k) => k.label.startsWith("Median growth per season"))!;
    expect(mg.value).toBe(signedPct1(Math.pow(deck.chained.reserve.median, 1 / DEFAULT_PARAMS.seasons) - 1));
    // The log growth of surviving paths is always shown next to ruin.
    for (const k of scenarios.flatMap((s) => s.kpis).filter((k) => k.label.startsWith("Log growth of surviving paths"))) expect(k.sub).toMatch(/ruin/);
  });

  it("opens the wing section with effective rate = deck q and fair pricing as the first action", () => {
    const wing = scenarios.find((s) => s.id === "wing")!;
    expect(wing.kpis[0].label).toBe("Effective rate");
    expect(wing.kpis[0].sub).toMatch(/^= deck q/);
    expect(wing.kpis[1].label).toBe("Premium over fair per event");
    expect(wing.kpis[1].value).toBe("+0.44 pp");
    expect(wing.kpis[1].color).toBeUndefined();
    expect(wing.actions![0].label).toMatch(/^Use the chain's fair rate c ÷ W = 3\.38%/);
    expect(wing.actions![0].patch).toEqual({ market: "fair", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) });
    expect(wing.actions!.some((a) => /^Plug the wing's effective rate/.test(a.label))).toBe(false);
    const payout = wing.secondary.find((c) => c.id === "wing-payout")!;
    expect(payout.x.domain).toEqual([DEFAULT_PARAMS.strikeDistance - 1, DEFAULT_PARAMS.strikeDistance + DEFAULT_PARAMS.wingWidth + 1]);
  });

  it("lists every quoted figure with an agrees flag and a reason when it disagrees", () => {
    for (const s of scenarios) {
      expect(s.sourceFigures!.length).toBeGreaterThanOrEqual(3);
      for (const q of s.sourceFigures!) {
        expect(q.quoted).not.toBe("—");
        expect(typeof q.agrees).toBe("boolean");
        if (!q.agrees) expect(q.why, q.label).toBeTruthy();
      }
    }
    const disagreeing = scenarios.flatMap((s) => s.sourceFigures!.filter((q) => !q.agrees).map((q) => q.label));
    // The known differences, and only those, at the discussion's own inputs.
    expect(disagreeing.sort()).toEqual(
      ["A 4× loss rate on a fifth of the games", "Cost of the idle capacity", "Four seasons, 3 names half the tranche: 10th percentile", "Trades to tell a 60% win rate from 50%, 2σ apart"].sort(),
    );
    const cor = scenarios.find((s) => s.id === "correlation")!.sourceFigures!;
    expect(cor.map((q) => q.quoted)).toEqual(expect.arrayContaining(["0.05% → 0.17%", "≈ 8³ ≈ 470×", "q³ ≈ 0.003%", "1.2% / 3.0% / 11%"]));
    const cal = scenarios.find((s) => s.id === "calibration")!;
    const rows = cal.tables[0].data.rows.map((r) => String(r.question));
    expect(rows.filter((r) => /60% win-rate/.test(r))).toHaveLength(1);
    expect(rows.filter((r) => /5% test with 80% power/.test(r))).toHaveLength(2);
    // The deck has moved: the figures that depend on q flag it and say why.
    const moved = buildAll({ ...DEFAULT_PARAMS, lossRate: 0.0252 }, EMPTY_DATASETS).scenarios.find((s) => s.id === "mean-median")!;
    const q = moved.sourceFigures!.find((x) => x.label === "Mean, 1 name")!;
    expect(q.agrees).toBe(false);
    expect(q.why).toMatch(/q 2\.52% \(quoted at 2\.94%\)/);
  });

  it("shows the shared-cause figures against c = 2% when the deck has c = 0", () => {
    const cor = scenarios.find((s) => s.id === "correlation")!;
    expect(cor.kpis[0].sub).toBe("independent → at c = 2%");
    expect(cor.kpis[1].value).toMatch(/0\.051% → 1\.22%/);
    const withC = buildAll({ ...DEFAULT_PARAMS, sharedOutcome: 0.05 }, EMPTY_DATASETS).scenarios.find((s) => s.id === "correlation")!;
    expect(withC.kpis[0].sub).toBe("independent → your c 5.00%");
  });

  it("specifies the chart changes the review asked for", () => {
    const binary = scenarios.find((s) => s.id === "binary")!;
    expect(binary.primary[0].orientation).toBe("horizontal");
    expect(binary.primary[0].height).toBe(140);
    const chaining = scenarios.find((s) => s.id === "chaining")!;
    const curve = chaining.secondary.find((c) => c.id === "chain-curve")!;
    expect(curve.mark).toBe("step");
    const band = curve.series.find((se) => se.band)!;
    expect(band.band).toBe("p25Reserve");
    expect(curve.data.fields.map((fl) => fl.name)).toEqual(expect.arrayContaining(["p25Reserve", "p75Reserve", "p25Spread", "p75Spread"]));
    for (const r of curve.data.rows) expect(r.p25Reserve as number).toBeLessThanOrEqual(r.p75Reserve as number);
    const mix = scenarios.find((s) => s.id === "diversification")!.secondary.find((c) => c.id === "div-mix")!;
    expect(mix.y.scale).toBe("log");
    for (const r of mix.data.rows) for (const k of ["ruinFull", "ruinCapped"]) if (r[k] != null) expect(r[k] as number).toBeGreaterThan(0);
    // Subtitles carry the encoding, not a sentence.
    for (const s of scenarios) for (const c of [...s.primary, ...s.secondary]) expect(c.subtitle, c.id).toMatch(/^x /);
  });

  it("keeps only trader questions as stories, each with an answer and a badge when it moves the deck", () => {
    const stories: { chart: string; story: Story }[] = scenarios.flatMap((s) => [...s.primary, ...s.secondary].flatMap((c) => (c.stories ?? []).map((story) => ({ chart: c.id, story }))));
    expect(stories.length).toBeGreaterThanOrEqual(12);
    const labels = stories.map((x) => x.story.label);
    expect(labels).toEqual(expect.arrayContaining(["Half my nights have one name", "The chain is right: q = break-even", "Two names share a cause on 5% of nights", "I widen the wing to 1σ"]));
    for (const { chart, story } of stories) {
      expect(story.narrative, `${chart}/${story.id}`).toBeTruthy();
      expect(story.label, `${chart}/${story.id}`).not.toMatch(/^(Linear|Log |Render|Outline|Zoom|Draw another|Another draw|Hide |Medians only|Include )/);
      expect(story.params?.seed, `${chart}/${story.id}`).toBeUndefined();
      if (story.params) expect(story.badge, `${chart}/${story.id}`).toMatch(/^moves deck: /);
      else expect(story.badge).toBeUndefined();
      // A display-only patch (axis scale or backend alone) is not a story.
      if (story.patch && !story.params) expect(Object.keys(story.patch).some((k) => ["extraSeries", "hiddenSeries", "annotations"].includes(k)), `${chart}/${story.id}`).toBe(true);
    }
  });

  it("builds the Desk grid, verdict and market state", () => {
    expect(desk.policies.map((x) => x.name)).toEqual(["Coin", "Spread", "Spread + reserve"]);
    expect(desk.policies.find((x) => x.yours)!.id).toBe("reserve");
    expect(desk.groups.map((g) => g.id)).toEqual(["season", "chained"]);
    expect(desk.groups[1].title).toBe("4 seasons");
    for (const g of desk.groups) {
      expect(g.rows.map((r) => r.id)).toEqual(["mean", "median", "p10", "pBelow", "ruin"]);
      expect(g.hero).toEqual({ row: "median", policy: "reserve" });
      for (const r of g.rows) {
        expect(r.viewId).toBeTruthy();
        for (const id of ["coin", "spread", "reserve"] as const) expect(r.cells[id].text).not.toMatch(/NaN|-/);
      }
    }
    const season = desk.groups[0];
    expect(season.rows[0].cells.coin.value).toBeCloseTo(1.095, 2);
    expect(season.rows[0].cells.spread.value).toBeCloseTo(1.095, 2);
    expect(season.rows[1].cells.coin.value).toBeCloseTo(1.99, 2);
    expect(season.rows[1].cells.spread.value).toBeCloseTo(0.88, 1);
    expect(season.rows[4].cells.coin.value).toBeCloseTo(0.45, 2);
    expect(season.rows[3].label).toBe("P(below 0.50×)");
    const chained = desk.groups[1];
    expect(chained.rows[0].cells.reserve.value).toBeCloseTo(1.2, 1);
    expect(chained.rows[1].cells.reserve.value).toBeGreaterThan(1.03);
    expect(chained.rows[1].cells.reserve.value).toBeLessThan(1.15);
    expect(chained.rows[1].cells.coin.value).toBe(0);
    expect(chained.rows[3].cells.reserve.text).toBe("7%");
    expect(desk.calibration.sentence).toMatch(/^80 events a year separate 2\.52% from 3\.38% in about 19 years/);
    expect(desk.calibration.viewId).toBe("events-needed");
    expect(desk.sizing.chartId).toBe("chain-heat");
    expect(desk.sizing.ratioToKelly).toBeCloseTo(1.28, 2);
    expect(desk.sizing.zeroPremium).toBe(false);
    expect(desk.market.actual).toBe("discussion");
    expect(desk.market.line).toMatch(/not an information edge/);
    expect(desk.market.sizingNote).toBe("");
    // Fair pricing: zero premium, growth-optimal risk 0, and the sizing note.
    const fair = buildAll({ ...DEFAULT_PARAMS, market: "fair", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) }, EMPTY_DATASETS);
    expect(fair.desk.market.actual).toBe("fair");
    expect(fair.desk.market.zeroPremium).toBe(true);
    expect(fair.desk.sizing.nightKelly).toBe(0);
    expect(fair.desk.sizing.ratioToKelly).toBeNull();
    // The band still reaches the optimistic rate, so the averaged curve keeps its peak.
    expect(fair.desk.sizing.robust).toBeGreaterThan(0.2);
    expect(fair.desk.sizing.text).toMatch(/^At zero premium the growth-optimal risk is 0/);
    expect(fair.deck.market.premium).toBeCloseTo(0, 9);
    const sizing = fair.scenarios.find((s) => s.id === "chaining")!;
    expect(sizing.kpis[0].sub).toMatch(/growth-optimal risk is 0/);
    // With the whole band at or past break-even nothing grows anywhere.
    const dead = buildAll({ ...DEFAULT_PARAMS, market: "fair", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain), altLossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) }, EMPTY_DATASETS);
    expect(dead.desk.sizing.robust).toBe(0);
  });

  it("gives the deck row 2 and the drawer what they need", () => {
    expect(deck.yours.name).toBe("Spread + reserve");
    expect(deck.yours.label).toBe("Spread + reserve (3 names, 50% a night)");
    expect(deck.yours.text.median).toBe("1.09×");
    expect(deck.yours.text.pBelow).toBe("7%");
    expect(deck.yours.text.ruin).toBe("0%");
    expect(deck.yours.evPerSeason).toBeCloseTo(deck.season.reserve.mean - 1, 12);
    expect(deck.coin.text).toBe("Coin: clean season 55% · ruin 45%");
    expect(deck.legend.map((l) => l.name)).toEqual(["Coin", "Spread", "Spread + reserve"]);
    expect(deck.figures.map((fg) => fg.id)).toEqual(expect.arrayContaining(["clean", "ev", "premium", "growth", "median-growth", "robust"]));
    expect(deck.figures.find((fg) => fg.id === "ev")!.value).toBe("+9.4%");
    expect(deck.definitions.map((df) => df.term)).toEqual(expect.arrayContaining(["Expected value per season", "Log growth of surviving paths", "Median growth per season"]));
    // Compatibility aliases for the current deck bar.
    expect(deck.seasonB).toBe(deck.season.spread);
    expect(deck.chainedC).toBe(deck.chained.reserve);
    expect(deck.growthC).toBe(deck.growthYours);
  });

  it("survives the degenerate decks", () => {
    for (const patch of [{ names: 1 }, { riskPerNight: 1 }, { seasons: 1 }, { nights: 5, names: 6 }, { lossRate: 0.08 }, { lossRate: 0.001 }, { lossRate: breakEvenLossRate(0.035) }, { zSigma: 3, seasons: 8, wingWidth: 1, sharedOutcome: 0.05 }]) {
      const { scenarios: ss, desk: dk } = buildAll({ ...DEFAULT_PARAMS, ...patch }, EMPTY_DATASETS);
      expect(ss).toHaveLength(8);
      for (const s of ss) for (const k of s.kpis) expect(k.value).not.toMatch(/NaN|Infinity/);
      for (const g of dk.groups) for (const r of g.rows) for (const c of Object.values(r.cells)) expect(c.text).not.toMatch(/NaN/);
      for (const s of ss) for (const c of [...s.primary, ...s.secondary]) for (const st of c.stories ?? []) expect(st.narrative).not.toMatch(/NaN/);
    }
  });

  it("uses imported data", () => {
    const record = Array.from({ length: 120 }, (_, i) => (i % 40 === 0 ? 1 : 0));
    const moves = Array.from({ length: 300 }, (_, i) => Math.sin(i) * 2.5);
    const out = buildAll({ ...DEFAULT_PARAMS, moveDist: "empirical" }, { record, moves });
    expect(out.deck.recordEvents).toBe(120);
    expect(out.deck.bandLabel).toMatch(/record/);
    const wing = out.scenarios.find((s) => s.id === "wing")!;
    expect(wing.primary[0].subtitle).toMatch(/imported/);
  });
});

describe("story rules in the store", () => {
  const opt: Story = { id: "opt", label: "What if the loss rate is the optimistic one?", params: { lossRate: 0.0252 }, badge: "moves deck: q 2.94% → 2.52%" };
  const worse: Story = { id: "worse", label: "What if q is really 3.2%?", params: { lossRate: 0.032 } };
  const two: Story = { id: "two", label: "Two names share a cause on 5% of nights", params: { sharedOutcome: 0.05 } };
  const zoom: Story = { id: "mean", label: "Where does the mean season cross 1×?", patch: { hiddenSeries: ["pClean"] } };

  it("keeps one deck-moving story active at a time and restores what the other moved", () => {
    const s = useStore.getState();
    s.resetEverything();
    s.clearAllOverrides();
    const q0 = useStore.getState().params.lossRate;
    s.applyStory("binary-outcomes", opt);
    expect(useStore.getState().params.lossRate).toBe(0.0252);
    expect(useStore.getState().overrides["binary-outcomes"]?.story).toBe("opt");
    expect(useStore.getState().storyPrev["binary-outcomes"]).toEqual({ lossRate: q0 });
    // A second deck-moving story on another chart turns the first off first.
    s.applyStory("chain-sweep", worse);
    const st = useStore.getState();
    expect(st.params.lossRate).toBe(0.032);
    expect(st.overrides["binary-outcomes"]).toBeUndefined();
    expect(st.storyPrev["binary-outcomes"]).toBeUndefined();
    expect(st.storyPrev["chain-sweep"]).toEqual({ lossRate: q0 });
    // Turning it off restores the original, not the first story's value.
    s.applyStory("chain-sweep", worse);
    expect(useStore.getState().params.lossRate).toBe(q0);
    expect(useStore.getState().overrides["chain-sweep"]).toBeUndefined();
    expect(useStore.getState().storyPrev).toEqual({});
  });

  it("snapshots different parameters across stories and undoes them all", () => {
    const s = useStore.getState();
    s.resetEverything();
    s.clearAllOverrides();
    const q0 = useStore.getState().params.lossRate;
    s.applyStory("binary-outcomes", opt);
    s.applyStory("cor-curve", two);
    let st = useStore.getState();
    expect(st.params.lossRate).toBe(q0);
    expect(st.params.sharedOutcome).toBe(0.05);
    expect(Object.keys(st.storyPrev)).toEqual(["cor-curve"]);
    // A display-only story on the same chart replaces the deck-moving one and restores its parameters.
    s.applyStory("cor-curve", zoom);
    st = useStore.getState();
    expect(st.params.sharedOutcome).toBe(0);
    expect(st.overrides["cor-curve"]?.story).toBe("mean");
    expect(st.storyPrev).toEqual({});
    s.applyStory("binary-outcomes", opt);
    s.clearAllOverrides();
    expect(useStore.getState().params.lossRate).toBe(q0);
    expect(useStore.getState().overrides).toEqual({});
  });

  it("persists the snapshot with the exported state and sanitizes it on import", () => {
    const s = useStore.getState();
    s.resetEverything();
    s.clearAllOverrides();
    const q0 = useStore.getState().params.lossRate;
    s.applyStory("binary-outcomes", opt);
    const exported = useStore.getState().exportState();
    expect(exported.version).toBe(4);
    expect(exported.storyPrev).toEqual({ "binary-outcomes": { lossRate: q0 } });
    // Round trip: the snapshot comes back and undo still works.
    s.resetEverything();
    expect(useStore.getState().storyPrev).toEqual({});
    const res = useStore.getState().importState(JSON.stringify(exported));
    expect(res.ok).toBe(true);
    expect(useStore.getState().params.lossRate).toBe(0.0252);
    expect(useStore.getState().storyPrev).toEqual({ "binary-outcomes": { lossRate: q0 } });
    useStore.getState().applyStory("binary-outcomes", opt);
    expect(useStore.getState().params.lossRate).toBe(q0);
    // A snapshot whose chart carries no story, or with unknown keys, is dropped.
    const bad = { ...exported, overrides: {}, storyPrev: { "binary-outcomes": { lossRate: q0 }, "x y": { lossRate: 1 }, "chain-sweep": { nonsense: 3 } } };
    expect(useStore.getState().importState(JSON.stringify(bad)).ok).toBe(true);
    expect(useStore.getState().storyPrev).toEqual({});
    useStore.getState().resetEverything();
  });
});
