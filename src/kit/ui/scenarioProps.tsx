/**
 * Adapters from a ScenarioView to the frames' small shapes: a KPI becomes a FigureItem,
 * a colour role a CSS colour, a section's views become links and menu groups.
 */

import { viewHref } from "./route";
import type { ColorRole } from "@kit/charts/spec";
import type { FigureItem, LinkGroup, LinkItem } from "./types";
import { Help } from "./Help";
import type { KPI, ScenarioView } from "@kit/charts/scenario";

/** Policy hues and the two status colours carry over; ink, muted and the ramps read as ink. */
export function toneOf(role: ColorRole | undefined): string | undefined {
  switch (role) {
    case "a":
    case "b":
    case "c":
    case "loss":
    case "good":
      return `var(--${role})`;
    default:
      return undefined;
  }
}

export function kpiItem(k: KPI): FigureItem {
  return { id: k.label, value: k.value, label: k.label, sub: k.sub, tone: toneOf(k.color), help: k.help ? <Help text={k.help} /> : undefined };
}

/** "03": the two-digit section number the prose refers to. */
export function sectionNumber(s: Pick<ScenarioView, "number">): string {
  return String(s.number).padStart(2, "0");
}

/** The section's own pages, as chips beside its eyebrow. */
export function viewChips(s: ScenarioView): LinkItem[] {
  return s.views.map((v) => ({ href: viewHref(v.id), label: v.title, title: v.blurb }));
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
    items: s.views.map((v) => ({ href: viewHref(v.id), label: v.title, title: v.blurb, current: v.id === currentView })),
  }));
}
