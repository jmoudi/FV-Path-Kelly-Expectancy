import { formatNumber } from "@kit/charts/format";
import type { ChartSpec, Cell, ColumnSpec } from "@kit/charts/spec";

/**
 * The HTML-table backend: the numbers behind any chart, or a table spec on its own.
 * It fills the box it is given and scrolls inside it with the header kept in view, so
 * showing the numbers never changes the height of the chart it replaces.
 */
export function TableView({ spec }: { spec: ChartSpec }) {
  const cols: ColumnSpec[] = spec.columns?.length
    ? spec.columns
    : spec.kind === "xy"
      ? [{ field: spec.x.field }, ...spec.series.map((s) => ({ field: s.field }))]
      : spec.heat
        ? [{ field: spec.heat.xField }, { field: spec.heat.yField }, { field: spec.heat.valueField }]
        : spec.data.fields.map((f) => ({ field: f.name }));
  const fields = new Map(spec.data.fields.map((f) => [f.name, f]));
  const isText = (c: ColumnSpec) => spec.data.rows.some((r) => typeof r[c.field] === "string");
  const MAX_ROWS = 60;
  const stride = spec.kind === "xy" && spec.data.rows.length > MAX_ROWS ? Math.ceil(spec.data.rows.length / MAX_ROWS) : 1;
  const rows = stride > 1 ? spec.data.rows.filter((_, i) => i % stride === 0 || i === spec.data.rows.length - 1) : spec.data.rows;
  const same = (a: Cell, b: Cell) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
  return (
    <div className="table-wrap sticky" tabIndex={0} role="region" aria-label={`Numbers: ${spec.title}`}>
      <table className="table">
        {stride > 1 && <caption className="caption table-note">Every {stride}th row of {spec.data.rows.length}. The CSV export carries all of them.</caption>}
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.field} className={isText(c) ? "text" : undefined} scope="col">
                {c.label ?? fields.get(c.field)?.label ?? c.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={spec.highlightRow && same(r[spec.highlightRow.field], spec.highlightRow.value) ? "hl" : undefined}>
              {cols.map((c) => {
                const v = r[c.field];
                const fmt = c.format ?? fields.get(c.field)?.format;
                const cls = [isText(c) ? "text" : "", c.emphasize ? "emph" : "", c.color ? `role-${c.color}` : ""].filter(Boolean).join(" ") || undefined;
                return (
                  <td key={c.field} className={cls}>
                    {typeof v === "number" ? formatNumber(v, fmt) : (v ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
