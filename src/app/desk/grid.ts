/**
 * The Desk's adapter: turns the DeskView (src/app/desk/desk.ts) into the kit's
 * comparison grid (src/kit/ui/DeskGrid.tsx): one column per policy, row groups for one
 * season and N seasons, each row label linked to the view that explains it.
 */
import type { GridColumn, GridGroup } from "@kit/ui/DeskGrid";
import type { DeskView } from "./desk";

export function deskColumns(desk: DeskView): GridColumn[] {
  return desk.policies.map((p) => ({ id: p.id, label: p.name, sub: p.detail, tone: `var(--${p.color})`, highlight: p.yours, tag: p.yours ? "your policy" : undefined }));
}

export function deskGroups(desk: DeskView): GridGroup[] {
  return desk.groups.map((g) => ({
    id: g.id,
    title: g.title,
    hero: { row: g.hero.row, column: g.hero.policy },
    rows: g.rows.map((r) => ({
      id: r.id,
      label: r.label,
      href: `#view/${r.viewId}`,
      cells: Object.fromEntries(Object.entries(r.cells).map(([pid, c]) => [pid, { text: c.text }])),
    })),
  }));
}
