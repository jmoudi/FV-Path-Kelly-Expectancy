import { describe, expect, it } from "vitest";
import { deckLayout } from "@app/deck/layout";
import { deckDefinitions, deckFigureRows, deckLegend, deckStatus } from "@app/deck/status";
import { DEFAULT_PARAMS } from "@app/params/params";
import { inputConfig } from "@kit/inputs/schema";
import { PARAM_BY_KEY, PARAM_DEFS } from "@app/params/schema";
import { buildAll } from "@app/scenarios";

describe("deck layout from the schema", () => {
  const layout = deckLayout();

  it("puts eight fields in three groups in row 1, in the spec's order", () => {
    expect(layout.row.map((g) => g.caption)).toEqual(["Per event", "Per season", "Sizing"]);
    expect(layout.row.map((g) => g.keys)).toEqual([
      ["lossRate", "gain", "altLossRate"],
      ["nights", "names", "sharedOutcome"],
      ["riskPerNight", "seasons"],
    ]);
  });

  it("keeps four fields on a phone", () => {
    expect(layout.phone).toEqual(["lossRate", "gain", "names", "riskPerNight"]);
  });

  it("gives the drawer its input sections with full headings", () => {
    expect(layout.drawer.map((g) => [g.title, g.keys])).toEqual([
      ["Event", ["lossRate", "gain", "altLossRate"]],
      ["Season", ["nights", "names", "sharedOutcome"]],
      ["Sizing", ["riskPerNight", "seasons", "thresholdBelow"]],
      ["Shared risk", ["volShock", "volShockShare"]],
      ["Calibration band", ["eventsPerYear", "zSigma"]],
    ]);
  });

  it("labels the row with words and symbols, never a bare symbol or a word as a symbol", () => {
    const labels = layout.row.flatMap((g) => g.keys).map((k) => [PARAM_BY_KEY[k].shortLabel ?? PARAM_BY_KEY[k].label, PARAM_BY_KEY[k].short ?? ""].join(" ").trim());
    expect(labels).toEqual(["Loss rate per name q", "Gain per unit risked b", "Optimistic loss rate", "Nights n", "Names a night k", "Shared-cause nights c", "At risk a night", "Seasons chained N"]);
  });

  it("tiers: the optimistic rate stays secondary, shared-cause nights is a deck input", () => {
    expect(PARAM_BY_KEY.altLossRate.tier).toBe("secondary");
    expect(PARAM_BY_KEY.sharedOutcome.tier).toBe("primary");
  });

  it("gives seeds, caps and path counts plain boxes", () => {
    for (const k of ["seed", "maxCompositions", "mcPaths"]) expect(inputConfig(PARAM_BY_KEY[k]).slider).toBe(false);
    expect(inputConfig(PARAM_BY_KEY.lossRate).slider).toBe(true);
  });
});

describe("deck status from the view-model", () => {
  const deck = buildAll(DEFAULT_PARAMS, { record: [], moves: [] }).deck;

  it("describes your policy with the four figures of row 2", () => {
    const s = deckStatus(deck, DEFAULT_PARAMS);
    expect(s.lead.title).toBe("Spread + reserve");
    expect(s.lead.detail).toBe("3 names, 50% a night");
    expect(s.status.map((f) => f.label)).toEqual(["EV per season", "median after 4 seasons", "P(below 0.50×)", "ruin"]);
    expect(s.status.map((f) => f.value)).toEqual([deck.yours.text.ev, deck.yours.text.median, deck.yours.text.pBelow, deck.yours.text.ruin]);
    // The figures are ink; the policy's colour is only the identity dot before the lead.
    expect(s.status.every((f) => !("color" in f))).toBe(true);
    expect(s.lead.color).toBe("var(--c)");
    expect(s.note).toBe(deck.coin.text);
    expect(s.note).toMatch(/^Coin: clean season 55% · ruin 45%$/);
  });

  it("keeps its labels before the first build", () => {
    const s = deckStatus(null, DEFAULT_PARAMS);
    expect(s.lead.detail).toBe("3 names, 50% a night");
    expect(s.status.map((f) => f.value)).toEqual(["", "", "", ""]);
  });

  it("names every policy in the legend, in order, with its colour", () => {
    expect(deckLegend.map((l) => [l.label, l.color])).toEqual([
      ["Coin", "var(--a)"],
      ["Spread", "var(--b)"],
      ["Spread + reserve", "var(--c)"],
    ]);
  });

  it("fills the drawer's figure table and definitions", () => {
    const rows = deckFigureRows(deck);
    expect(rows.length).toBe(deck.figures.length);
    // A row that belongs to one policy carries its colour (a dot before the label); robust risk belongs to none.
    expect(rows.find((r) => r.id === "clean")?.color).toBe("var(--a)");
    expect(rows.find((r) => r.id === "robust")?.color).toBeUndefined();
    expect(rows.some((r) => /edge/i.test(r.label))).toBe(false);
    const defs = deckDefinitions(deck, PARAM_DEFS);
    expect(defs.map((d) => d.term)).toContain("Loss rate per name q");
    expect(defs.map((d) => d.term)).toContain("Expected value per season");
  });
});
