import type { CSSProperties, ReactNode } from "react";

export interface GridColumn {
  id: string;
  label: string;
  /** A muted line under the label (the column's parameters). */
  sub?: string;
  /** A CSS colour for the label and, when highlighted, the values. */
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
  /** The headline cell of the group, set larger. */
  hero?: { row: string; column: string };
}

/**
 * A comparison grid: columns are alternatives, rows are figures, rows come in
 * titled groups. Values are tabular; the headline cell of each group is larger;
 * the highlighted column carries its colour. No boxes: rules are hairlines.
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
              <th key={c.id} scope="col" className={`k-grid-col${c.highlight ? " hl" : ""}`} style={c.tone ? ({ "--tone": c.tone } as CSSProperties) : undefined}>
                <span className="k-grid-name">{c.label}</span>
                {c.sub && <span className="k-grid-sub">{c.sub}</span>}
                {c.highlight && c.tag && <span className="k-grid-tag">{c.tag}</span>}
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
                  {r.href ? <a href={r.href}>{r.label}</a> : r.label}
                </th>
                {columns.map((c) => {
                  const cell = r.cells[c.id];
                  const hero = g.hero?.row === r.id && g.hero?.column === c.id;
                  return (
                    <td key={c.id} className={`k-grid-cell${hero ? " hero" : ""}${c.highlight ? " hl" : ""}`} style={c.highlight && c.tone ? ({ "--tone": c.tone } as CSSProperties) : undefined} title={cell?.title}>
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
