import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, plainText, resolveLink, rich } from "@kit/ui/Link";
import { anchorHref, matchHash, partElementId, type RouteConfig } from "@kit/ui/route";
import { SectionFrame } from "@kit/ui/SectionFrame";
import { kpiItems } from "@kit/ui/scenarioProps";
import { buildAll } from "@app/scenarios";
import { DEFAULT_PARAMS } from "@app/params/params";
import { EMPTY_DATASETS } from "@app/params/datasets";
import { PARAM_DEFS } from "@app/params/schema";
import { GUIDE_LEDE, GUIDE_SECTIONS } from "@app/copy/guide";
import { deckFigureRows, deckStatus } from "@app/deck/status";
import type { ScenarioView } from "@app/scenarios/types";

/** This app's routes (App.tsx). */
const cfg: RouteConfig = { home: "desk", pages: ["desk", "explain", "settings", "guide"], aliases: { tour: "explain" }, sectionsPage: "explain" };

describe("Link resolves route and in-page targets", () => {
  it("tells a jump within the open page from a switch to another page", () => {
    // Another section of Explain, from Explain: scroll there, the part's element named.
    expect(resolveLink("#s-wing", cfg, "#explain")).toEqual({ kind: "route", hash: "#s-wing", route: { page: "explain", section: "wing" }, samePage: true, elementId: "s-wing" });
    expect(resolveLink("#s-wing", cfg, "#s-binary")).toMatchObject({ kind: "route", samePage: true, elementId: "s-wing" });
    // The same section from a view page: the router switches pages, then the section is revealed.
    expect(resolveLink("#s-wing", cfg, "#view/season-outcomes")).toMatchObject({ kind: "route", samePage: false, elementId: "s-wing" });
    // A guide section from the guide, and from the Desk.
    expect(resolveLink("#guide/keys", cfg, "#guide/replayer")).toMatchObject({ kind: "route", samePage: true, elementId: "guide-keys" });
    expect(resolveLink("#guide/keys", cfg, "#desk")).toMatchObject({ kind: "route", samePage: false, elementId: "guide-keys" });
    // Views: the same view is the same page, another view is not; a view has no part.
    expect(resolveLink("#view/sizing-grid", cfg, "#view/sizing-grid")).toEqual({ kind: "route", hash: "#view/sizing-grid", route: { page: "view", id: "sizing-grid" }, samePage: true });
    expect(resolveLink("#view/sizing-grid", cfg, "#view/season-outcomes")).toMatchObject({ kind: "route", samePage: false });
    expect(resolveLink("#view/sizing-grid", cfg, "#view/season-outcomes")).not.toHaveProperty("elementId");
    // A whole page, an alias, the empty hash (the home page).
    expect(resolveLink("#settings", cfg, "#desk")).toMatchObject({ kind: "route", route: { page: "settings" }, samePage: false });
    expect(resolveLink("#tour", cfg, "#s-wing")).toMatchObject({ kind: "route", route: { page: "explain" }, samePage: true });
    expect(resolveLink("#desk", cfg, "")).toMatchObject({ kind: "route", samePage: true });
  });

  it("reads #el-<id> and words that are no route as anchors on the open page, and anything else as external", () => {
    expect(resolveLink(anchorHref("chart-binary-curve"), cfg, "#explain")).toEqual({ kind: "anchor", elementId: "chart-binary-curve" });
    expect(resolveLink("#el-guide-pages-links", cfg, "#guide")).toEqual({ kind: "anchor", elementId: "guide-pages-links" });
    expect(resolveLink("#chart-binary-curve", cfg, "#explain")).toEqual({ kind: "anchor", elementId: "chart-binary-curve" });
    expect(resolveLink("https://example.org/a", cfg, "#explain")).toEqual({ kind: "external", href: "https://example.org/a" });
    // Without routes registered, a hash is a route on another page (the router decides).
    expect(resolveLink("#s-wing", null, "#explain")).toEqual({ kind: "route", hash: "#s-wing", route: null, samePage: false });
    // An anchor in the address is no page: a route from there is a switch.
    expect(resolveLink("#s-wing", cfg, "#el-chart-x")).toMatchObject({ samePage: false });
  });

  it("names a route's part by one convention and keeps #el- out of the router", () => {
    expect(partElementId({ page: "explain", section: "wing" }, cfg)).toBe("s-wing");
    expect(partElementId({ page: "guide", section: "keys" }, cfg)).toBe("guide-keys");
    expect(partElementId({ page: "desk" }, cfg)).toBeUndefined();
    expect(matchHash("#el-chart-x", cfg)).toBeNull();
    expect(matchHash("#nowhere", cfg)).toBeNull();
    expect(matchHash("", cfg)).toEqual({ page: "desk" });
  });

  it("renders underlined text links, plain ones for rails and chips, and marks external ones", () => {
    expect(renderToStaticMarkup(createElement(Link, { to: "#view/sizing-grid" }, "How much to risk a night"))).toBe('<a href="#view/sizing-grid" class="k-link">How much to risk a night</a>');
    expect(renderToStaticMarkup(createElement(Link, { to: "#s-wing", variant: "plain", className: "on" }, "04"))).toBe('<a href="#s-wing" class="on">04</a>');
    expect(renderToStaticMarkup(createElement(Link, { to: "https://example.org" }, "source"))).toBe('<a href="https://example.org" class="k-link" target="_blank" rel="noopener noreferrer">source<span aria-hidden="true"> ↗</span></a>');
  });

  it("renders inline markup in copy strings and strips it for plain text", () => {
    const text = "See [Section 02](#s-mean-median), `#reset` and {{c:Spread + reserve}}.";
    expect(renderToStaticMarkup(createElement("p", null, rich(text)))).toBe('<p>See <a href="#s-mean-median" class="k-link">Section 02</a>, <code>#reset</code> and <span class="dot k-named" style="--tone:var(--c)">Spread + reserve</span>.</p>');
    expect(plainText(text)).toBe("See Section 02, #reset and Spread + reserve.");
    expect(rich("No markup here.")).toBe("No markup here.");
  });

  it("gives every section, its heading and each figure an id, and links the inputs caption", () => {
    const html = renderToStaticMarkup(
      createElement(SectionFrame, {
        id: "s-x",
        eyebrow: "Section 01",
        chips: [{ href: "#view/v", label: "A view" }],
        title: "X",
        answers: [{ value: "1", label: "One", elId: "s-x-fig-0", href: "#view/v" }],
        inputs: createElement("span", null, "field"),
        inputsHref: "#guide/parameter-settings",
        primary: [],
      }),
    );
    expect(html).toContain('id="s-x"');
    expect(html).toContain('id="s-x-h"');
    expect(html).toContain('id="s-x-fig-0"');
    expect(html).toContain('<a href="#view/v" class="k-link" title="The view that explains this figure">One</a>');
    expect(html).toContain('<a href="#view/v" class="k-chip-link"');
    expect(html).toMatch(/class="k-caption k-inputs-caption"><a href="#guide\/parameter-settings" class="k-link"[^>]*>Inputs for this section<\/a>/);
  });
});

/** Every copy string of a section that the page renders with inline markup. */
function richCopy(s: ScenarioView): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, t: unknown) => typeof t === "string" && out.push({ where, text: t });
  push(`${s.id}.claim`, s.claim);
  push(`${s.id}.lede`, s.lede);
  s.kpis.forEach((k) => push(`${s.id}.kpi`, k.help));
  s.notes.forEach((n) => push(`${s.id}.note`, n.body));
  s.views.forEach((v) => push(`${s.id}.view`, v.blurb));
  s.actions?.forEach((a) => push(`${s.id}.action`, a.hint));
  s.sourceFigures?.forEach((q) => [q.label, q.why].forEach((t) => push(`${s.id}.figure`, t)));
  for (const c of [...s.primary, ...s.secondary, ...s.tables]) push(`${c.id}.caption`, c.caption);
  return out;
}

/** Every string a Guide section shows. */
function guideCopy(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [{ where: "guide.lede", text: GUIDE_LEDE }];
  for (const s of GUIDE_SECTIONS)
    for (const b of s.body) {
      const where = `guide.${s.id}`;
      if (b.kind === "p" || b.kind === "h" || b.kind === "callout") out.push({ where, text: b.text });
      else if (b.kind === "list") b.items.forEach((text) => out.push({ where, text }));
      else if (b.kind === "table") [...b.head, ...b.rows.flat(), b.caption ?? ""].forEach((text) => out.push({ where, text }));
    }
  return out;
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

describe("the copy links what it names", () => {
  const built = buildAll(DEFAULT_PARAMS, EMPTY_DATASETS);
  const sections = new Map(built.scenarios.map((s) => [s.id, s]));
  const views = new Set(built.scenarios.flatMap((s) => s.views.map((v) => v.id)));
  const guideIds = GUIDE_SECTIONS.map((s) => s.id);
  const appCopy = [...built.scenarios.flatMap(richCopy), ...PARAM_DEFS.map((d) => ({ where: `param.${d.key}`, text: d.help ?? "" })), ...built.deck.figures.map((f) => ({ where: `deck.${f.id}`, text: f.help }))];

  it("turns every Section NN reference into a link to that section", () => {
    let links = 0;
    for (const { where, text } of appCopy) {
      // No section number outside a link.
      expect(text.replace(LINK, "").match(/\b[Ss]ections? \d{2}\b/), `${where}: ${text}`).toBeNull();
      for (const [, label, to] of text.matchAll(LINK)) {
        const s = /^#s-([\w-]+)$/.exec(to);
        if (!s) continue;
        links++;
        const target = sections.get(s[1]);
        expect(target, `${where}: ${to}`).toBeTruthy();
        // The number in the label is the target's ("Sections [03](#s-calibration)" too).
        const n = /(\d{2})/.exec(label);
        if (n) expect(Number(n[1]), `${where}: ${label} → ${to}`).toBe(target!.number);
      }
    }
    expect(links).toBeGreaterThanOrEqual(14);
  });

  it("points every link in the copy and the Guide at something that exists", () => {
    const guideAnchors = new Set(GUIDE_SECTIONS.flatMap((s) => s.body.filter((b) => b.kind === "h").map((b) => `guide-${s.id}-${(b as { text: string }).text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`)));
    let checked = 0;
    for (const { where, text } of [...appCopy, ...guideCopy()])
      for (const [, , to] of text.matchAll(LINK)) {
        checked++;
        const r = matchHash(to, cfg);
        if (/^#el-/.test(to)) expect(guideAnchors.has(to.slice(4)), `${where}: ${to}`).toBe(true);
        else if (r?.page === "view") expect(views.has(r.id!), `${where}: ${to}`).toBe(true);
        else if (r?.page === "explain" && r.section) expect(sections.has(r.section), `${where}: ${to}`).toBe(true);
        else if (r?.page === "guide" && r.section) expect(guideIds, `${where}: ${to}`).toContain(r.section);
        else expect(r, `${where}: ${to}`).not.toBeNull();
      }
    expect(checked).toBeGreaterThanOrEqual(35);
  });

  it("numbers the Guide's own cross-references by its sections", () => {
    for (const { where, text } of guideCopy()) {
      expect(text.replace(LINK, "").match(/\bsection \d+\b/), `${where}: ${text}`).toBeNull();
      for (const [, label, to] of text.matchAll(LINK)) {
        const g = /^#guide\/([\w-]+)$/.exec(to);
        const n = /^section (\d+)$/.exec(label);
        if (g && n) expect(guideIds.indexOf(g[1]) + 1, `${where}: ${label} → ${to}`).toBe(Number(n[1]));
      }
    }
  });

  it("links the deck's figures and the sections' figure labels to the views that explain them", () => {
    const status = deckStatus(built.deck, DEFAULT_PARAMS).status;
    const rows = deckFigureRows(built.deck);
    for (const f of [...status, ...rows]) {
      expect(f.href, f.id).toMatch(/^#view\//);
      expect(views.has(f.href!.slice(6)), f.href).toBe(true);
    }
    const binary = sections.get("binary")!;
    const items = kpiItems(binary, { linkViews: true, idBase: "s-binary-fig" });
    expect(items[0]).toMatchObject({ href: "#view/season-outcomes", elId: "s-binary-fig-0" });
    // On a view page the figures are that view's own: no link back to it.
    expect(kpiItems(binary, { indices: [0, 4] }).every((i) => i.href === undefined)).toBe(true);
  });
});
