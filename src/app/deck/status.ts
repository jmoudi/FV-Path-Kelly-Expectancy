/**
 * The deck's figures as the kit frame's props: the status row (your policy, the
 * muted Coin line, the legend) and the drawer's figure table and definitions.
 * Values come formatted from the view-model (DeckView); before the first build the
 * labels are there and the values wait.
 */
import type { Definition, Figure, FigureRow, LegendItem, StatusLead } from "@kit/ui/deck";
import type { ParamDef } from "@app/params/schema";
import type { Params } from "@app/params/params";
import { POLICY_LEGEND, POLICY_META, YOUR_POLICY, policyDetail } from "@app/model/policies";
import { x2 } from "@kit/charts/numbers";
import { viewHref } from "@kit/ui/route";
import type { DeckView } from "./deckView";

/** The view that explains each deck figure: its label links there (row 2 and the drawer's figure table). */
const FIGURE_VIEWS: Record<string, string> = {
  ev: "replay-quantiles",
  median: "chained-outcomes",
  below: "chained-outcomes",
  ruin: "chained-outcomes",
  clean: "clean-season-curve",
  premium: "move-vs-wing",
  "median-spread": "season-shape",
  growth: "sizing-grid",
  "median-growth": "chained-outcomes",
  robust: "sizing-grid",
  "median-N": "chained-outcomes",
};
const figureHref = (id: string): string | undefined => (FIGURE_VIEWS[id] ? viewHref(FIGURE_VIEWS[id]) : undefined);

/** The CSS colour of a palette role ("c" → "var(--c)"); the theme sets the variables. */
export const roleColor = (role: string | undefined): string | undefined => (role ? `var(--${role})` : undefined);

export interface DeckStatus {
  lead: StatusLead;
  status: Figure[];
  note: string;
}

/** Row 2: "Spread + reserve · 3 names, 50% a night — EV per season +9.4% · median after 4 seasons 1.09× · P(below 0.50×) 7% · ruin 0%", then the Coin line. */
export function deckStatus(deck: DeckView | null, p: Params): DeckStatus {
  const meta = POLICY_META[deck?.yours.id ?? YOUR_POLICY];
  const color = roleColor(deck?.yours.color ?? meta.color);
  const y = deck?.yours;
  const N = y?.seasons ?? p.seasons;
  const threshold = y?.threshold ?? p.thresholdBelow;
  const seasons = `${N} season${N === 1 ? "" : "s"}`;
  const below = `P(below ${x2(threshold)})`;
  const lead: StatusLead = {
    title: y?.name ?? meta.name,
    detail: y?.detail ?? policyDetail(meta.id, p),
    color,
    tooltip: "Your policy: the figures beside it describe it. The other two policies are in the legend and in the full deck.",
  };
  const status: Figure[] = [
    { id: "ev", label: "EV per season", value: y?.text.ev ?? "", title: "Expected value per season: mean season end − 1. The average over a pool of replays, not what one tranche earns." },
    { id: "median", label: `median after ${seasons}`, value: y?.text.median ?? "", title: `The season end that half of the paths beat after ${seasons} chained without refilling.` },
    { id: "below", label: below, value: y?.text.pBelow ?? "", title: `Probability of ending below ${x2(threshold)} of the starting tranche after ${seasons}.` },
    { id: "ruin", label: "ruin", value: y?.text.ruin ?? "", title: `Probability that the tranche is wiped out within ${seasons}.` },
  ].map((f) => ({ ...f, href: figureHref(f.id) }));
  const note = deck?.coin.text ?? `${POLICY_META.coin.name}: clean season … · ruin …`;
  return { lead, status, note };
}

/** The persistent mini-legend: one swatch per policy, from the single source of names and colours. */
export const deckLegend: LegendItem[] = POLICY_LEGEND.map((m) => ({ id: m.id, label: m.name, color: `var(--${m.color})` }));

/** The drawer's figure table, every policy named. The help node is added by the React adapter. */
export function deckFigureRows(deck: DeckView | null): (Omit<FigureRow, "help"> & { helpText: string })[] {
  return (deck?.figures ?? []).map((f) => ({ id: f.id, label: f.label, basis: f.basis, value: f.value, color: roleColor(f.color), helpText: f.help, href: figureHref(f.id) }));
}

/** "q: expected loss …" under the term "Loss rate per name q" reads "Expected loss …". */
function withoutTermPrefix(def: string, d: ParamDef): string {
  for (const head of [d.short, d.label]) {
    if (head && def.startsWith(`${head}: `)) {
      const rest = def.slice(head.length + 2);
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return def;
}

/** The drawer's definitions: the figures first, then the inputs that carry one. */
export function deckDefinitions(deck: DeckView | null, defs: readonly ParamDef[]): Definition[] {
  const inputs = defs.filter((d) => d.definition).map((d) => ({ term: d.short ? `${d.label} ${d.short}` : d.label, def: withoutTermPrefix(d.definition!, d) }));
  return [...(deck?.definitions ?? []), ...inputs];
}
