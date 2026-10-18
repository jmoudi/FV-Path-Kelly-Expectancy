/**
 * Adapters from this app's view-model to the kit's small shapes: a KPI becomes a
 * FigureItem, a colour role becomes a CSS colour, a section's views become links.
 */
import type { ColorRole } from "../charts/spec";
import type { FigureItem, LinkGroup, LinkItem } from "../kit/ui/types";
import { PARAM_BY_KEY, type Params, type Unit } from "../model/params";
import { Help } from "../ui/Help";
import { fmtInt, movesDeck, pct, pct2, typographic, x2 } from "../viewmodel/derived";
import type { KPI, ScenarioView } from "../viewmodel/types";

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
  return s.views.map((v) => ({ href: `#view/${v.id}`, label: v.title, title: v.blurb }));
}

/** Every view in reading order: the order `[` and `]` step through. */
export function viewOrder(scenarios: ScenarioView[]): string[] {
  return scenarios.flatMap((s) => s.views.map((v) => v.id));
}

function formatIn(unit: Unit, v: number): string {
  switch (unit) {
    case "pct":
      return pct(v);
    case "pct2":
      return pct2(v);
    case "int":
      return fmtInt(v);
    case "x":
      return x2(v);
    case "sigma":
      return typographic(`${v.toFixed(2)}σ`);
    default:
      return typographic(v.toFixed(2));
  }
}

/**
 * What an active story moved, from the snapshot the store took before it moved the
 * deck: "moves deck: q 2.94% → 2.52%". The rebuilt chart cannot say it, because its
 * spec is computed from the deck as it is now. Null when nothing numeric moved.
 */
export function movedBadge(before: Partial<Params> | undefined, now: Params): string | null {
  if (!before) return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(before)) {
    const def = PARAM_BY_KEY[k];
    const cur = now[k as keyof Params];
    if (!def || typeof v !== "number" || typeof cur !== "number" || v === cur) continue;
    parts.push(movesDeck(def.short ?? def.shortLabel ?? def.label, formatIn(def.unit, v), formatIn(def.unit, cur)).replace(/^moves deck: /, ""));
  }
  return parts.length ? `moves deck: ${parts.join(", ")}` : null;
}

/** The Views menu: one group per section, titles read from the view-model. */
export function viewMenu(scenarios: ScenarioView[], currentView?: string): LinkGroup[] {
  return scenarios.map((s) => ({
    id: s.id,
    title: `${sectionNumber(s)} · ${s.title}`,
    items: s.views.map((v) => ({ href: `#view/${v.id}`, label: v.title, title: v.blurb, current: v.id === currentView })),
  }));
}
