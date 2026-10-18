import { describe, expect, it } from "vitest";
import { tickMultiple, tickPercent } from "@kit/charts/format";
import { linearTicks, logTicks, resolveAxes } from "@kit/charts/resolve";
import { applyOverride, f, sanitizeOverride, table, type ChartSpec, type Story } from "@kit/charts/spec";
import { breakEvenLossRate } from "@app/model/binary";
import { DEFAULT_PARAMS } from "@app/params/params";
import { EMPTY_DATASETS } from "@app/params/datasets";
import { useStore } from "@app/store";
import { buildAll } from "@app/scenarios";
import { fmtMs, pct1, probPct, signedPct1, signedPp, smallPct, x2 } from "@kit/charts/numbers";
import { formatNumber, MINUS } from "@kit/charts/format";
import type { ScenarioView } from "@app/scenarios/types";

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
    // One rule for a row of probabilities: whole percent at 1% and up, two figures below, zero as 0%.
    expect([0.45, 0.0703, 0.0137, 0.0051, 0.00051, 0.00204, 0].map(probPct)).toEqual(["45%", "7%", "1%", "0.51%", "0.051%", "0.20%", "0%"]);
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
    expect(desk.sizing.noPremium).toBe(false);
    expect(desk.market.actual).toBe("discussion");
    // One sentence states the premium; the "not an information edge" line is its own sentence beside it.
    expect(desk.market.line).toBe("The chain pays +0.44 pp premium over fair per event at the deck's q.");
    expect(desk.market.line).not.toMatch(/edge/);
    expect(desk.market.sizingNote).toBe("");
    // Fair pricing: zero premium, growth-optimal risk 0, and the sizing note.
    const fair = buildAll({ ...DEFAULT_PARAMS, market: "fair", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) }, EMPTY_DATASETS);
    expect(fair.desk.market.actual).toBe("fair");
    expect(fair.desk.market.zeroPremium).toBe(true);
    expect(fair.desk.market.line).toBe("The chain pays 0.00 pp premium: fair pricing.");
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
    // q above the fair rate: a negative premium, said as one, never as "fair pricing".
    const past = buildAll({ ...DEFAULT_PARAMS, market: "custom", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) + 0.003 }, EMPTY_DATASETS);
    expect(past.desk.market.zeroPremium).toBe(false);
    expect(past.desk.market.noPremium).toBe(true);
    expect(past.desk.market.line).not.toMatch(/fair pricing/i);
    expect(past.desk.market.line).toMatch(/^The chain pays −0\.30 pp premium over fair per event at the deck's q/);
    expect(past.desk.sizing.noPremium).toBe(true);
    expect(past.desk.sizing.text).toMatch(/^With a negative premium the growth-optimal risk is 0/);
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

// ---------------------------------------------------------------------------
// Chart rendering: orientation, bars, bands, label collisions, parity, palette.
// ---------------------------------------------------------------------------
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planBars, stepVertices } from "@kit/charts/bars";
import { estimateTextWidth, overlaps, placeLabels } from "@kit/charts/collide";
import { compareProbes } from "@kit/charts/parity";
import { BarAccumulator, type RenderProbe } from "@kit/charts/probe";
import { buildOption } from "@kit/charts/backends/echarts";
import { buildFigure } from "@kit/charts/backends/plotlyFigure";
import { bandPoints, barPoints, linePoints } from "@kit/charts/backends/types";
import { buildVegaSpec } from "@kit/charts/backends/vegaSpec";
import { formatNumber as chartFormat, tickMultiple as tickX, tickPercent as tickPct, tickPlain } from "@kit/charts/format";
import { legendLayout, resolveChart } from "@kit/charts/resolve";
import { THEME, barFill } from "@kit/charts/theme";
import { formatNumber as appFormat } from "@kit/charts/format";
import { TableView } from "@kit/ui/TableView";
import { Figure } from "@kit/ui/AnswerStrip";
import { DeskGrid } from "@kit/ui/DeskGrid";
import { kpiItem } from "@kit/ui/scenarioProps";
import { readFileSync } from "node:fs";

describe("chart rendering", () => {
  const { scenarios } = buildAll(DEFAULT_PARAMS, EMPTY_DATASETS);
  const charts = scenarios.flatMap((s) => [...s.primary, ...s.secondary]);
  const chart = (id: string) => charts.find((c) => c.id === id)!;
  const xy = charts.filter((c) => c.kind === "xy");

  it("formats chart numbers exactly like the app's one formatter, with U+2212", () => {
    for (const v of [-0.042, -1234.5, -2.5e-7, 0.0294, 1.0947, -3, 0, -Infinity, 12.3456])
      for (const fmt of ["pct", "pct1", "pct2", "pct3", "x", "x2", "int", "num", "sci", "auto"] as const) expect(chartFormat(v, fmt), `${v} ${fmt}`).toBe(appFormat(v, fmt));
    expect(tickPct(-0.05)).toBe("−5%");
    expect(tickPlain(-2.5)).toBe("−2.5");
    expect(tickX(2)).toBe("2×");
    for (const s of [chartFormat(-0.1, "pct1"), tickPct(-0.001), tickPlain(-1500)]) expect(s).not.toMatch(/-/);
  });

  it("draws the single-name outcomes as two horizontal bars with a mean line, 140px high", () => {
    const spec = chart("binary-outcomes");
    const rc = resolveChart(spec, 900);
    expect(rc.horizontal).toBe(true);
    // Probability runs along the bottom, the season end up the side.
    expect(rc.h.field).toBe("clean");
    expect([rc.h.min, rc.h.max]).toEqual([0, 1]);
    expect(rc.v.field).toBe("end");
    expect(rc.v.ticks).toEqual([0, 1, 2]);
    // The two series never share a position, so they are overlaid at their own ends.
    expect(rc.bars).toMatchObject({ mode: "overlay", thicknessPx: 22, offsetsPx: { ruin: 0, clean: 0 } });
    expect(barPoints(spec, rc, spec.series[0]).map((b) => [b.shifted, b.value])).toEqual([[0, expect.closeTo(0.45, 2)]]);
    expect(barPoints(spec, rc, spec.series[1]).map((b) => b.shifted)).toEqual([expect.closeTo(1.99, 2)]);
    // The mean, placed on the season-end axis, becomes a horizontal line.
    const mean = rc.annotations.find((a) => a.text?.startsWith("mean"))!;
    expect(mean.kind).toBe("hline");
    expect(mean.y).toBeCloseTo(1.0947, 3);
    // ECharts: value axes both ways, bars drawn as placed rectangles, no legend.
    const opt = buildOption(spec, 900, 210) as { xAxis: { type: string }; yAxis: { type: string; min: number }; series: { type: string; id: string }[]; legend: { show: boolean } };
    expect(opt.xAxis.type).toBe("value");
    expect(opt.yAxis).toMatchObject({ type: "value", min: -0.5 });
    expect(opt.series.filter((s) => s.type === "custom").map((s) => s.id)).toEqual(["ruin", "clean"]);
    expect(opt.legend.show).toBe(false);
    // Plotly: horizontal bars, overlaid (not grouped), with an explicit width.
    const fig = buildFigure(spec, 900);
    expect(fig.layout.barmode).toBe("overlay");
    const bars = fig.data.filter((t) => t.type === "bar");
    expect(bars.map((t) => t.orientation)).toEqual(["h", "h"]);
    for (const t of bars) expect(t.width as number).toBeGreaterThan(0);
    expect((bars[1].y as number[])[0]).toBeCloseTo(1.99, 2);
    // Vega-Lite: each bar layer carries its own rows, so it cannot draw nothing.
    const vl = buildVegaSpec(spec, 900).vl as { layer: { mark: { type: string; orient?: string }; data: { values: unknown[] } }[]; height: number };
    const barLayers = vl.layer.filter((l) => l.mark.type === "bar");
    expect(barLayers).toHaveLength(2);
    for (const l of barLayers) {
      expect(l.mark.orient).toBe("horizontal");
      expect(l.data.values).toHaveLength(1);
    }
    expect(vl.height).toBe(140);
  });

  it("groups bars that share positions and keeps edge bars whole", () => {
    const pmf = chart("cal-pmf-year");
    const rc = resolveChart(pmf, 900);
    expect(rc.bars!.mode).toBe("group");
    expect(rc.bars!.offsetsPx.opt).toBeLessThan(0);
    expect(rc.bars!.offsetsPx.be).toBeGreaterThan(0);
    // The zero-loss bar sits at the axis start: the axis widens so it shows in full.
    expect(rc.axes.x.min).toBeLessThan(0);
    expect(rc.axes.x.ticks[0]).toBe(0);
    expect(buildFigure(pmf, 900).layout.barmode).toBe("overlay");
    // Bars never overlap their neighbours, whatever the hint.
    const plan = planBars(
      [
        { key: "a", positions: [0, 1, 2] },
        { key: "b", positions: [0, 1, 2] },
      ],
      { axis: { min: 0, max: 2, scale: "linear", categorical: false }, axisPx: 40, thicknessPx: 30 },
    );
    expect(plan.thicknessPx! * 2 + 1).toBeLessThanOrEqual(20);
    expect(
      planBars(
        [
          { key: "a", positions: [0] },
          { key: "b", positions: [1] },
        ],
        { axis: { min: 0, max: 1, scale: "linear", categorical: false }, axisPx: 400 },
      ).mode,
    ).toBe("overlay");
    expect(
      planBars(
        [
          { key: "a", positions: ["x", "y"] },
          { key: "b", positions: ["x"] },
        ],
        { axis: { min: 0, max: 2, scale: "linear", categorical: true }, axisPx: 400 },
      ),
    ).toMatchObject({ mode: "group", thicknessPx: null });
  });

  it("draws the chained mean and median as centred steps with a 25–75% band", () => {
    const spec = chart("chain-curve");
    expect(spec.step).toBe("middle");
    const rc = resolveChart(spec, 600);
    const median = spec.series.find((s) => s.field === "medianReserve")!;
    const pts = linePoints(spec, rc, median);
    // Each season owns a flat step centred on it: two vertices per season.
    expect(pts).toHaveLength(2 * spec.data.rows.length);
    expect(pts[0][0]).toBeCloseTo(0.5, 9);
    expect(pts[1][0]).toBeCloseTo(1.5, 9);
    expect(pts[0][1]).toBe(pts[1][1]);
    expect(
      stepVertices(
        [
          [1, 2],
          [2, 3],
        ],
        "after",
      ),
    ).toEqual([
      [1, 2],
      [2, 2],
      [2, 3],
    ]);
    const band = spec.series.find((s) => s.band)!;
    const polys = bandPoints(spec, rc, band);
    expect(polys).toHaveLength(1);
    expect(polys[0].length).toBe(4 * spec.data.rows.length);
    // Every backend fills it.
    const opt = buildOption(spec, 600) as { series: { id: string; type: string }[] };
    expect(opt.series[0]).toMatchObject({ id: "p75Reserve~band", type: "custom" });
    expect(buildFigure(spec, 600).data[0]).toMatchObject({ meta: "p75Reserve~band", fill: "toself" });
    const vl = buildVegaSpec(spec, 600).vl as { layer: { mark: { type: string }; encoding: Record<string, unknown> }[] };
    expect(vl.layer[0].mark.type).toBe("area");
    expect(vl.layer[0].encoding.y2).toEqual({ field: "lo" });
    // An area mark is one fill, not one per row (which an `order` channel would cause).
    for (const c of xy)
      for (const l of (buildVegaSpec(c, 600).vl as { layer: { mark: { type: string }; encoding?: Record<string, unknown> }[] }).layer) if (l.mark.type === "area") expect(l.encoding?.order, c.id).toBeUndefined();
  });

  it("keeps vertical-line labels closer than 14px at opposite ends and stacks horizontal ones", () => {
    const base: ChartSpec = {
      id: "t",
      title: "t",
      kind: "xy",
      data: table(
        [f("x", "x"), f("y", "y")],
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ),
      mark: "line",
      x: { field: "x", domain: [0, 1] },
      y: { field: "y", domain: [0, 1] },
      series: [{ field: "y", color: "a" }],
      height: 300,
      annotations: [
        { kind: "vline", x: 0.5, text: "first line" },
        { kind: "vline", x: 0.51, text: "second line" },
        { kind: "vline", x: 0.52, text: "third line" },
        { kind: "hline", y: 0.5, text: "upper level", at: "start" },
        { kind: "hline", y: 0.49, text: "lower level", at: "start" },
      ],
    };
    const rc = resolveChart(base, 900);
    const [v1, v2, v3, h1, h2] = rc.annotations.map((a) => a.label!);
    expect(v1.anchor).toBe("top");
    expect(v2.anchor).toBe("bottom");
    expect(v3.anchor).toBe("top");
    expect(h1.anchor).toBe("left");
    expect(h2.anchor).toBe("left");
    const boxes = rc.annotations.map((a) => a.label!.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j], 0), `${i} ${j}`).toBe(false);
    // The second horizontal label went above or below the first one's level, not onto it.
    expect(Math.abs(h1.box.y0 - h2.box.y0)).toBeGreaterThanOrEqual(16);
    // The placer itself.
    const placed = placeLabels(
      [
        [{ box: { x0: 0, y0: 0, x1: 10, y1: 10 }, value: "a" }],
        [
          { box: { x0: 5, y0: 5, x1: 15, y1: 15 }, value: "b1" },
          { box: { x0: 20, y0: 0, x1: 30, y1: 10 }, value: "b2" },
        ],
      ],
      { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(placed.map((p) => p.value)).toEqual(["a", "b2"]);
    expect(estimateTextWidth("mmm")).toBeGreaterThan(estimateTextWidth("iii"));
  });

  it("places every annotation label of every chart without overlaps, at desktop and phone widths", () => {
    for (const width of [900, 420])
      for (const c of xy) {
        const boxes = resolveChart(c, width)
          .annotations.filter((a) => a.label)
          .map((a) => ({ text: a.text, box: a.label!.box }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i].box, boxes[j].box, 0), `${c.id} @${width}: "${boxes[i].text}" / "${boxes[j].text}"`).toBe(false);
      }
  });

  it("wraps legends into rows above the plot on narrow screens", () => {
    const names = ["Spread + reserve, 25th to 75th percentile", "Spread, mean", "Spread, median", "Spread + reserve, mean", "Spread + reserve, median"];
    expect(legendLayout(names, 1300)).toEqual({ flowRows: 1, columns: 5, gridRows: 1 });
    const narrow = legendLayout(names, 300);
    expect(narrow.flowRows).toBeGreaterThan(2);
    expect(narrow.columns).toBe(1);
    expect(narrow.gridRows).toBe(5);
    expect(resolveChart(chart("chain-curve"), 400).legend!.flowRows).toBeGreaterThan(1);
  });

  it("builds every chart in every backend without losing a mark", () => {
    for (const width of [900, 400])
      for (const c of charts.filter((x) => x.kind === "xy" || x.kind === "heatmap")) {
        const opt = buildOption(c, width) as { series: unknown[] };
        expect(opt.series.length, c.id).toBeGreaterThan(0);
        const fig = buildFigure(c, width);
        const vl = buildVegaSpec(c, width).vl as { layer: { data?: { values: unknown[] } }[] };
        if (c.kind === "heatmap") continue;
        const rc = resolveChart(c, width);
        for (const s of c.series) {
          const n = (s.mark ?? c.mark) === "bar" ? barPoints(c, rc, s).length : linePoints(c, rc, s).length;
          expect(
            fig.data.find((t) => t.meta === s.field),
            `${c.id}/${s.field} plotly`,
          ).toBeTruthy();
          const layer = vl.layer.find((l) => (l.data?.values as { __key?: string }[] | undefined)?.[0]?.__key === s.field);
          if (n > 0) expect(layer?.data?.values.length, `${c.id}/${s.field} vega`).toBe(n);
        }
      }
  });

  it("uses the rates palette: optimistic green, deck ink, break-even red", () => {
    // A gap between two rates ("optimistic vs break-even") is neither rate and stays neutral.
    const role = (t: string) =>
      / vs /.test(t) ? null : /^(optimistic|true rate .*\(optimistic\))/.test(t) ? "good" : /^(break-even|fair \/ break-even|fair c ÷ W|true rate .*\(break-even\))/.test(t) ? "loss" : /^deck q/.test(t) ? "ink" : null;
    let checked = 0;
    for (const c of xy) {
      for (const s of c.series) {
        const want = s.label ? role(s.label) : null;
        if (!want) continue;
        expect(s.color, `${c.id}: ${s.label}`).toBe(want);
        checked++;
      }
      for (const a of c.annotations ?? []) {
        const want = a.text ? role(a.text) : null;
        if (!want) continue;
        expect(a.color, `${c.id}: ${a.text}`).toBe(want);
        checked++;
      }
      // Ink is not black on the graphite theme.
      expect(c.subtitle ?? "", c.id).not.toMatch(/\bblack\b/);
    }
    expect(checked).toBeGreaterThanOrEqual(12);
    // The neutral accent for claims and asides exists as a role and is not a policy hue.
    expect(THEME.roles.ink2).toBe(THEME.ink2);
    expect(THEME.roles.ink2).not.toBe(THEME.roles.c);
  });

  it("holds the colour-role policy: policy trio, status pair, neutral ramps, a cream accent outside the charts", () => {
    // The decided values (the review's colour-role policy, section C).
    expect(THEME.roles).toMatchObject({ a: "#dfa54d", b: "#63cfe9", c: "#8976cd", loss: "#df6768", good: "#5cb572", ink2: "#b4bac1", ramp1: "#e4e8ed", ramp2: "#babec3", ramp3: "#8f9397", ramp4: "#66696d" });
    expect([THEME.surface, THEME.raised, THEME.raised2, THEME.hairline, THEME.grid, THEME.ink2]).toEqual(["#1a1d21", "#22262b", "#2a2f35", "#30363d", "#1f2226", "#b4bac1"]);
    expect(THEME.diverging).toEqual(["#ad4b4b", "#733a39", "#27292c", "#2f5838", "#38804b"]);
    expect(THEME.sequential).toEqual(["#202429", "#393e42", "#54595e", "#767b80", "#9a9fa5", "#bfc5ca"]);
    expect(THEME.binary).toEqual(["#2a2f35", "#df6768"]);
    expect(THEME.accent).toBe("#e8e1a3");
    // The accent is chrome only: no chart role carries it, and the ramps are grey (no policy hue).
    expect(Object.values(THEME.roles).map((h) => h.toLowerCase())).not.toContain(THEME.accent);
    const chroma = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    };
    for (const h of [THEME.roles.ramp1, THEME.roles.ramp2, THEME.roles.ramp3, THEME.roles.ramp4, ...THEME.sequential]) expect(chroma(h), h).toBeLessThan(0.06);
    // Status bars fill at most 0.6; an ink bar is drawn in secondary ink, never as a white slab.
    expect(barFill("loss", 1)).toBe("rgba(223,103,104,0.6)");
    expect(barFill("good", 0.5)).toBe("rgba(92,181,114,0.3)");
    expect(barFill("ink", 1)).toBe("rgba(180,186,193,1)");
    // Hero figures are never painted: a KPI's colour may only name the policy it belongs to.
    for (const sc of scenarios) for (const k of sc.kpis) expect(["a", "b", "c", "ink", undefined], `${sc.id}: ${k.label}`).toContain(k.color);
    // A transition between two policies ("Coin → Spread") belongs to neither.
    for (const sc of scenarios) for (const k of sc.kpis) if (/→/.test(k.value)) expect(k.color, `${sc.id}: ${k.label}`).toBeUndefined();
    // The heat map: square cells on a 1px page seam, your cell outlined in ink.
    const heat = buildOption(chart("chain-heat"), 900) as { series: { id: string; itemStyle: { borderColor: string; borderWidth: number; borderRadius: number } }[] };
    expect(heat.series[0].itemStyle).toMatchObject({ borderColor: THEME.page, borderWidth: 1, borderRadius: 0 });
    expect(heat.series[1].itemStyle).toMatchObject({ borderColor: THEME.ink, borderRadius: 0 });
    // No plaid: grid lines across the value axis only.
    const line = buildOption(chart("binary-curve"), 900) as { xAxis: { splitLine: { show: boolean } }; yAxis: { splitLine: { show: boolean } } };
    expect([line.xAxis.splitLine.show, line.yAxis.splitLine.show]).toEqual([false, true]);
    // A fan's sampled paths give no hover readout.
    expect(chart("binary-fan").series.every((x) => x.tooltip === false)).toBe(true);
    // Subtitles say the encoding: a chart with a legend repeats no colour key in prose.
    for (const c of xy) if (resolveChart(c, 900).legend) expect(c.subtitle ?? "", c.id).not.toMatch(/\b(red|green|white|violet|amber|cyan|grey|blue)\b/);
  });

  it("keeps policy colours off figures and grid cells: values are ink, a policy shows as a dot", () => {
    // Markup: no inline colour on a figure value or a grid cell, the identity colour on the dot only.
    const fig = renderToStaticMarkup(createElement(Figure, { item: { value: "55%", label: "Clean season (Coin)", dot: "var(--a)" }, hero: true }));
    expect(fig).toMatch(/<div class="k-fig-v"[^>]*>55%<\/div>/);
    expect(fig).not.toMatch(/class="k-fig-v"[^>]*style=/);
    expect(fig).toMatch(/class="k-fig-l dot" style="--tone:var\(--a\)"/);
    expect(kpiItem({ label: "Break-even", value: "3.38%", color: "loss" }).dot).toBeUndefined();
    expect(kpiItem({ label: "Clean season (Coin)", value: "55%", color: "a" }).dot).toBe("var(--a)");
    const grid = renderToStaticMarkup(
      createElement(DeskGrid, {
        columns: [
          { id: "coin", label: "Coin", tone: "var(--a)" },
          { id: "reserve", label: "Spread + reserve", tone: "var(--c)", highlight: true, tag: "your policy" },
        ],
        groups: [{ id: "g", title: "One season", hero: { row: "median" }, rows: [{ id: "median", label: "Median", cells: { coin: { text: "1.99×" }, reserve: { text: "0.98×" } } }] }],
      }),
    );
    expect(grid).not.toMatch(/<td[^>]*style=/);
    expect([...grid.matchAll(/class="k-grid-cell hero[^"]*"/g)]).toHaveLength(2);
    expect([...grid.matchAll(/class="k-grid-tag"/g)]).toHaveLength(2);
    // Stylesheets: the value rules read ink tokens only, and the policy-tied accent alias is gone.
    // Read as text (the test runner turns imported CSS into empty modules).
    const css = ["../src/kit/ui/theme.css", "../src/kit/ui/kit.css", "../src/kit/ui/deck/deck.css", "../src/kit/inputs/number-field.css"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    // Every block whose selector list ends in this selector, bodies joined.
    const rule = (sel: string) => {
      const bodies = [...css.matchAll(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "g"))].map((m) => m[2]);
      expect(bodies.length, sel).toBeGreaterThan(0);
      return bodies.join("\n");
    };
    for (const sel of [".k-fig-v", ".dkb-fig dd", ".dkb-ftable td", ".k-grid-cell", ".k-grid-cell.hl", ".dkb-lead-title", ".k-grid-name", ".lv-value"]) {
      const body = rule(sel);
      expect(body, sel).toMatch(/\bcolor: var\(--(ink|ink-2)\);/);
      expect(body, sel).not.toMatch(/var\(--(a|b|c|loss|good|tone)\b/);
    }
    for (const sel of [".dkb-fig dd", ".dkb-ftable td"]) expect(rule(sel), sel).toMatch(/font-family: var\(--font-ui\)/);
    expect(css).not.toMatch(/--accent-2/);
    expect(css).not.toMatch(/rgba\(18, 20, 22/);
  });

  it("shows a horizontal bar chart's numbers in the table by position", () => {
    const html = renderToStaticMarkup(createElement(TableView, { spec: chart("binary-outcomes") }));
    const heads = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(heads).toEqual(["Season end, tranche units", "Ruin", "Clean season"]);
    expect(html).toContain("1.99×");
  });

  it("compares render probes and names every disagreement", () => {
    const ref: RenderProbe = {
      backend: "echarts",
      kind: "xy",
      horizontal: true,
      h: { kind: "linear", min: 0, max: 1 },
      v: { kind: "category", categories: ["a", "b"] },
      series: [{ key: "s", kind: "bar", count: 2, extent: 1, center: 0.5 }],
      lines: 1,
      areas: 0,
      dots: 0,
      labels: 2,
    };
    expect(compareProbes(ref, { ...ref, backend: "plotly" })).toEqual([]);
    const bad = compareProbes(ref, { ...ref, horizontal: false, h: { kind: "linear", min: 0, max: 1.2 }, v: { kind: "category", categories: ["b", "a"] }, series: [{ key: "s", kind: "bar", count: 1, extent: 0.4, center: 0.8 }], labels: 1 });
    expect(bad.map((d) => d.what)).toEqual(["bar orientation", "horizontal axis range", "vertical axis categories", "annotation labels", "series s bars", "series s bar length", "series s bar position"]);
    // A bar the library clipped away does not count.
    const acc = new BarAccumulator(100, 100);
    acc.add(50, 50);
    acc.add(50, 140);
    expect(acc.extent()).toBe(0.5);
    expect(acc.center()).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Residuals of the adversarial verification: market line, stories after a reload,
// copy as statements of fact, the quoted row, chart titles and label clamping.
// ---------------------------------------------------------------------------
import { activeStoryOf, STORY_LABEL_MAX, STORY_NARRATIVE_MAX } from "@kit/charts/spec";

describe("stories keep their question and answer with the override", () => {
  const worse: Story = { id: "worse", label: "What if q is really 3.2%?", narrative: "At your 50% a night the log growth of surviving paths is −1.2% a season instead of +1.6%.", params: { lossRate: 0.032 }, badge: "moves deck: q 2.94% → 3.20%" };

  it("lets the sanitizer keep a story's label and answer, only beside its id, cut to length", () => {
    expect(sanitizeOverride({ story: "worse", storyLabel: "What if q is really 3.2%?", storyNarrative: "An answer." })).toEqual({ story: "worse", storyLabel: "What if q is really 3.2%?", storyNarrative: "An answer." });
    // Without a story id the text has nothing to belong to; non-strings and blanks are dropped.
    expect(sanitizeOverride({ storyLabel: "x", storyNarrative: "y" })).toBeNull();
    expect(sanitizeOverride({ story: "s", storyLabel: 3, storyNarrative: "  " })).toEqual({ story: "s" });
    const long = sanitizeOverride({ story: "s", storyLabel: "q".repeat(500), storyNarrative: "a".repeat(5000) })!;
    expect(long.storyLabel!.length).toBe(STORY_LABEL_MAX);
    expect(long.storyNarrative!.length).toBe(STORY_NARRATIVE_MAX);
  });

  it("saves the label and answer when a story is applied, drops them on a hand edit, and round-trips them", () => {
    const s = useStore.getState();
    s.resetEverything();
    s.applyStory("chain-sweep", worse);
    expect(useStore.getState().overrides["chain-sweep"]).toEqual({ story: "worse", storyLabel: worse.label, storyNarrative: worse.narrative });
    const exported = useStore.getState().exportState();
    s.resetEverything();
    expect(useStore.getState().importState(JSON.stringify(exported)).ok).toBe(true);
    expect(useStore.getState().overrides["chain-sweep"]).toEqual({ story: "worse", storyLabel: worse.label, storyNarrative: worse.narrative });
    // A hand edit of the chart is no longer the story: its text goes with it.
    useStore.getState().setOverride("chain-sweep", { height: 300 });
    expect(useStore.getState().overrides["chain-sweep"]).toEqual({ height: 300 });
    useStore.getState().resetEverything();
  });

  it("shows the saved copy when the chart no longer offers the story, and the saved answer for a deck-moving one", () => {
    const override = { story: "worse", storyLabel: worse.label, storyNarrative: worse.narrative };
    // Not offered any more: the saved copy, pressed with its answer.
    expect(activeStoryOf("worse", [], override, true)).toEqual({ id: "worse", label: worse.label, narrative: worse.narrative });
    // Offered again with text rebuilt from the moved deck: a deck-moving story keeps the answer it gave.
    const rebuilt: Story = { ...worse, narrative: "At q = 3.20% and your 50% a night the log growth of surviving paths is −1.2% a season." };
    expect(activeStoryOf("worse", [rebuilt], override, true)!.narrative).toBe(worse.narrative);
    expect(activeStoryOf("worse", [rebuilt], override, true)!.params).toEqual(worse.params);
    // A display-only story follows the deck: the fresh text wins.
    const zoom: Story = { id: "uncapped", label: "What does the capital ceiling cost?", narrative: "fresh" };
    expect(activeStoryOf("uncapped", [zoom], { story: "uncapped", storyLabel: zoom.label, storyNarrative: "saved" }, false)!.narrative).toBe("fresh");
    // A state saved before stories carried their text, for a story no longer offered: nothing to show but undo.
    expect(activeStoryOf("worse", [], { story: "worse" }, true)).toBeUndefined();
  });

  it("keeps offering the questions whose answer moves the deck to their own value", () => {
    const storiesOf = (params: typeof DEFAULT_PARAMS, chartId: string) =>
      buildAll(params, EMPTY_DATASETS)
        .scenarios.flatMap((x) => [...x.primary, ...x.secondary])
        .find((c) => c.id === chartId)!
        .stories!.map((st) => st.id);
    expect(storiesOf({ ...DEFAULT_PARAMS, lossRate: 0.032, market: "custom" }, "chain-sweep")).toContain("worse");
    expect(storiesOf({ ...DEFAULT_PARAMS, lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain), market: "fair" }, "chain-sweep")).toContain("be");
    expect(storiesOf({ ...DEFAULT_PARAMS, sharedOutcome: 0.05 }, "cor-curve")).toContain("five");
    // At its own value the answer says so instead of comparing a number with itself.
    const at = buildAll({ ...DEFAULT_PARAMS, lossRate: 0.032, market: "custom" }, EMPTY_DATASETS).scenarios.flatMap((x) => [...x.primary, ...x.secondary]).find((c) => c.id === "chain-sweep")!;
    expect(at.stories!.find((st) => st.id === "worse")!.narrative).toMatch(/^At q = 3\.20% and your 50% a night/);
  });
});

describe("copy and figures the verification flagged", () => {
  const built = buildAll(DEFAULT_PARAMS, EMPTY_DATASETS);
  const scen = (id: string) => built.scenarios.find((s) => s.id === id)!;
  const chartOf = (id: string) => built.scenarios.flatMap((s) => [...s.primary, ...s.secondary]).find((c) => c.id === id)!;

  it("keeps the names-per-night subtitle to the encoding and states where the cap binds in the caption", () => {
    const c = chartOf("axes-breadth");
    expect(c.title).toBe("Log growth per season by names per night");
    expect(c.subtitle).toMatch(/capped once k·f\* passes 100%$/);
    expect(c.subtitle).not.toMatch(/binds|does not bind/);
    expect(c.caption).toBe("The cap does not bind at the deck's rate; it binds from 4 names at the optimistic rate.");
    const view = scen("chaining").views.find((v) => v.id === "sizing-grid")!;
    expect(view.blurb).toMatch(/^Log growth per season by risk a night/);
  });

  it("states facts in the claims and note titles instead of telling the reader what to feel", () => {
    const div = scen("diversification");
    expect(div.claim).toBe("Spreading a night over names leaves the mean unchanged and changes survivability.");
    expect(div.notes.map((n) => n.title)).toContain("Same mean, less variance");
    const chain = scen("chaining");
    expect(chain.claim).toMatch(/peaks at 38% a night; at the deck's rate alone it peaks at 39%\.$/);
    for (const s of built.scenarios) for (const t of [s.claim, ...s.notes.map((n) => n.title)]) expect(t, s.id).not.toMatch(/free lunch|\bSit where\b|becomes your number/i);
  });

  it("says the zero-premium sentence on the per-name Kelly figure under fair pricing", () => {
    expect(scen("axes").kpis[0].sub).toBe("p − q/b at the deck's q");
    const fair = buildAll({ ...DEFAULT_PARAMS, market: "fair", lossRate: breakEvenLossRate(DEFAULT_PARAMS.gain) }, EMPTY_DATASETS).scenarios.find((s) => s.id === "axes")!;
    expect(fair.kpis[0].value).toBe("0%");
    expect(fair.kpis[0].sub).toMatch(/At zero premium the growth-optimal risk is 0/);
  });

  it("lists the nights the expected hits erase as a quoted-vs-recomputed row", () => {
    const row = scen("chaining").sourceFigures!.find((q) => /hits erase/.test(q.label))!;
    expect(row.quoted).toBe("roughly 19 of the season's 20");
    expect(row.computed).toBe("19 of 20");
    expect(row.agrees).toBe(true);
    // The derivation note quotes the same number.
    expect(scen("chaining").notes.find((n) => n.title === "Recovering from one partial hit")!.body).toMatch(/take back roughly 19 of the season's 20 nights/);
    const moved = buildAll({ ...DEFAULT_PARAMS, lossRate: 0.0252 }, EMPTY_DATASETS).scenarios.find((s) => s.id === "chaining")!.sourceFigures!.find((q) => /hits erase/.test(q.label))!;
    expect(moved.computed).toBe("17 of 20");
    expect(moved.agrees).toBe(false);
    expect(moved.why).toMatch(/q 2\.52%/);
  });

  it("draws the three coin lines on the NAV chart in the Coin's colour, told apart by dash", () => {
    const nav = chartOf("chain-nav");
    const coins = nav.series.filter((s) => /^coin\d$/.test(s.field));
    // Ordered scenarios of one policy: the policy's colour, dotted · solid · dashed (p 50% · 55% · 60%).
    expect(coins.map((s) => s.color)).toEqual(["a", "a", "a"]);
    expect(coins.map((s) => s.dash ?? false)).toEqual(["dot", false, true]);
    expect(nav.series.find((s) => s.field === "yours")!.color).toBe("c");
    expect(nav.subtitle).toMatch(/Coin at p 50%, 55%, 60%/);
  });

  it("slides a long point label inside a narrow plot instead of over the axis labels", () => {
    const band = chartOf("cal-band");
    for (const width of [368, 420, 900]) {
      const rc = resolveChart(band, width);
      const a = rc.annotations.find((x) => x.text?.startsWith("band clears break-even"))!;
      expect(a.label, `@${width}`).toBeTruthy();
      // Never left of the plot, where the y-axis labels are.
      expect(a.label!.box.x0, `@${width}`).toBeGreaterThanOrEqual(0);
      // Estimated wider than a phone's plot (the estimate errs wide), it starts at the plot's left edge.
      if (a.label!.box.x1 - a.label!.box.x0 > rc.plot.width) expect(a.label!.box.x0, `@${width}`).toBe(0);
      else expect(a.label!.box.x1, `@${width}`).toBeLessThanOrEqual(rc.plot.width);
    }
  });
});
