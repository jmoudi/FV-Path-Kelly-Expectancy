import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "./Link";
import type { FigureItem } from "./types";

/** One figure: the value large, tabular and in ink, the label small underneath (after a policy dot when it has one, a link when a view explains it), the basis muted. */
export function Figure({ item, hero }: { item: FigureItem; hero?: boolean }) {
  return (
    <div className={`k-fig${hero ? " hero" : ""}`} id={item.elId} role="group" aria-label={item.label}>
      <div className="k-fig-v" title={item.value}>
        {item.value}
      </div>
      <div className={`k-fig-l${item.dot ? " dot" : ""}`} style={item.dot ? ({ "--tone": item.dot } as CSSProperties) : undefined}>
        {item.href ? (
          <Link to={item.href} title="The view that explains this figure">
            {item.label}
          </Link>
        ) : (
          <span>{item.label}</span>
        )}
        {item.help}
      </div>
      {item.sub && <div className="k-fig-s">{item.sub}</div>}
    </div>
  );
}

/**
 * The answer strip under a section's lede: two or three numbers inline, no boxes.
 * The first is the hero; the rest are revealed inline by a text link. `after` sits on
 * the same footer line (a "scroll here" link down to the chart that draws them).
 */
export function AnswerStrip({ items, shown = 3, layout = "row", after }: { items: FigureItem[]; shown?: number; layout?: "row" | "column"; after?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const rest = items.length - shown;
  const visible = open || rest <= 0 ? items : items.slice(0, shown);
  return (
    <div className={`k-answers ${layout}`}>
      <div className="k-answer-row">
        {visible.map((f, i) => (
          <Figure key={f.id ?? f.label} item={f} hero={i === 0 && layout === "row"} />
        ))}
      </div>
      {(rest > 0 || after) && (
        <div className="k-answers-foot">
          {rest > 0 && (
            <button type="button" className="k-textlink" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Fewer figures" : `+${rest} more figure${rest === 1 ? "" : "s"}`}
            </button>
          )}
          {after}
        </div>
      )}
    </div>
  );
}
