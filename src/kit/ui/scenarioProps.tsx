/**
 * Adapters from a ScenarioView to the frames' small shapes: a KPI becomes a FigureItem,
 * a policy's colour role an identity dot, a section's views become links and menu groups.
 */

import { viewHref } from "./route";
import type { ColorRole } from "@kit/charts/spec";
import type { FigureItem, LinkGroup, LinkItem } from "./types";
import { Help } from "./Help";
import { plainText } from "./Link";
import type { KPI, ScenarioView } from "@kit/charts/scenario";

/**
 * A figure's identity dot: only the three policy roles have one (the figure belongs to
 * that policy). Status, ink and the ramps never colour a figure.
 */
export function dotOf(role: ColorRole | undefined): string | undefined {
  switch (role) {
    case "a":
    case "b":
    case "c":
      return `var(--${role})`;
    default:
      return undefined;
  }
}

export function kpiItem(k: KPI): FigureItem {
  return { id: k.label, value: k.value, label: k.label, sub: k.sub, dot: dotOf(k.color), help: k.help ? <Help text={k.help} /> : undefined };
}

/** The first of the section's views that shows its figure `index`: the page that explains it. */
export function viewOfKpi(s: ScenarioView, index: number): string | undefined {
  return s.views.find((v) => v.kpis?.includes(index))?.id;
}

/**
 * A section's figures as answer-strip items. `linkViews`: each label links to the view
 * that shows it (except `exceptView`, the page the strip is on). `idBase`: each figure
 * gets the DOM id `<idBase>-<index>`.
 */
export function kpiItems(s: ScenarioView, { linkViews = false, exceptView, idBase, indices }: { linkViews?: boolean; exceptView?: string; idBase?: string; indices?: number[] } = {}): FigureItem[] {
  return (indices ?? s.kpis.map((_, i) => i))
    .filter((i) => !!s.kpis[i])
    .map((i) => {
      const item = kpiItem(s.kpis[i]);
      const v = linkViews ? viewOfKpi(s, i) : undefined;
      if (v && v !== exceptView) item.href = viewHref(v);
      if (idBase) item.elId = `${idBase}-${i}`;
      return item;
    });
}

/** "03": the two-digit section number the prose refers to. */
export function sectionNumber(s: Pick<ScenarioView, "number">): string {
  return String(s.number).padStart(2, "0");
}

/** The section's own pages, as chips beside its eyebrow. */
export function viewChips(s: ScenarioView): LinkItem[] {
  return s.views.map((v) => ({ href: viewHref(v.id), label: v.title, title: plainText(v.blurb) }));
}

/** Every view in reading order: the order `[` and `]` step through. */
export function viewOrder(scenarios: ScenarioView[]): string[] {
  return scenarios.flatMap((s) => s.views.map((v) => v.id));
}

/** The Views menu: one group per section, titles read from the view-model. */
export function viewMenu(scenarios: ScenarioView[], currentView?: string): LinkGroup[] {
  return scenarios.map((s) => ({
    id: s.id,
    title: `${sectionNumber(s)} · ${s.title}`,
    items: s.views.map((v) => ({ href: viewHref(v.id), label: v.title, title: plainText(v.blurb), current: v.id === currentView })),
  }));
}
