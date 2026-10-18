import type { CSSProperties, ReactNode } from "react";
import { Link } from "./Link";

export interface GridColumn {
  id: string;
  label: string;
  /** A muted line under the label (the column's parameters). */
  sub?: string;
  /** The column's identity colour (e.g. "var(--a)"): an 8px dot before the label. Values stay ink. */
  tone?: string;
  /** The reader's own column. */
  highlight?: boolean;
  /** A word shown with a highlighted column, e.g. "yours". */
  tag?: string;
}

export interface GridCell {
  text: string;
  title?: string;
}

export interface GridRow {
  id: string;
  label: string;
  /** Where the row is explained; the label becomes a link. */
  href?: string;
  cells: Record<string, GridCell>;
}

export interface GridGroup {
  id: string;
  title: string;
  rows: GridRow[];
  /** The headline row of the group, set larger in every column. */
  hero?: { row: string };
}

/**
 * A comparison grid: columns are alternatives, rows are figures, rows come in
 * titled groups. Values are tabular; the headline row of each group is larger; the
 * highlighted column reads in ink against the others' secondary ink, under a rule.
 * Colour appears only as the identity dot before each column's name. No boxes: rules
 * are hairlines.
 */
export function DeskGrid({ columns, groups, caption, busy }: { columns: GridColumn[]; groups: GridGroup[]; caption?: ReactNode; busy?: boolean }) {
  return (
    <div className={`k-grid-wrap${busy ? " busy" : ""}`}>
      <table className="k-grid">
        {caption && <caption className="k-grid-caption">{caption}</caption>}
        <colgroup>
          <col className="k-grid-labels" />
          {columns.map((c) => (
            <col key={c.id} className={c.highlight ? "hl" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="k-grid-corner">
              <span className="sr-only">Figure</span>
            </th>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={`k-grid-col${c.highlight ? " hl" : ""}`}>
                <span className={`k-grid-name${c.tone ? " dot" : ""}`} style={c.tone ? ({ "--tone": c.tone } as CSSProperties) : undefined}>
                  {c.label}
                </span>
                {c.sub && <span className="k-grid-sub">{c.sub}</span>}
                {/* The tag line is reserved in every header, so the names line up. */}
                <span className="k-grid-tag">{c.highlight && c.tag ? c.tag : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id}>
            <tr className="k-grid-group">
              <th scope="rowgroup" colSpan={columns.length + 1}>
                {g.title}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="k-grid-label">
                  {r.href ? <Link to={r.href}>{r.label}</Link> : r.label}
                </th>
                {columns.map((c) => {
                  const cell = r.cells[c.id];
                  const hero = g.hero?.row === r.id;
                  return (
                    <td key={c.id} className={`k-grid-cell${hero ? " hero" : ""}${c.highlight ? " hl" : ""}`} title={cell?.title}>
                      {cell?.text ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
