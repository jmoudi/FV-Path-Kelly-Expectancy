import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface PanelTab {
  id: string;
  label: string;
  /** Shown after the label in parentheses, e.g. the number of quoted figures. */
  count?: number;
  render: () => ReactNode;
}

/**
 * A footer line of text links ("Table · Derivations · Quoted vs recomputed (4)")
 * that opens one tabbed panel in its place. The panel has a fixed height and scrolls
 * inside, so opening it never grows with its content. Closed by default.
 */
export function TabbedPanel({ tabs, height, label = "More" }: { tabs: PanelTab[]; height?: number; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!tabs.length) return null;
  const text = (t: PanelTab) => (t.count != null ? `${t.label} (${t.count})` : t.label);
  const active = tabs.find((t) => t.id === open);

  if (!active) {
    return (
      <nav className="k-footer-links" aria-label={label}>
        {tabs.map((t, i) => (
          <Fragment key={t.id}>
            {i > 0 && (
              <span className="k-sep" aria-hidden="true">
                ·
              </span>
            )}
            <button type="button" className="k-textlink" aria-expanded={false} onClick={() => setOpen(t.id)}>
              {text(t)}
            </button>
          </Fragment>
        ))}
      </nav>
    );
  }

  const idx = tabs.indexOf(active);
  const onKey = (e: KeyboardEvent) => {
    // Plain arrows move between tabs, as a tab list does; modified arrows are left alone.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setOpen(tabs[next].id);
    tabRefs.current[next]?.focus();
  };
  return (
    <div className="k-tabpanel">
      <div className="k-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[i] = el)}
            type="button"
            role="tab"
            id={`${base}-t-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls={`${base}-p`}
            tabIndex={t.id === active.id ? 0 : -1}
            className={`k-tab${t.id === active.id ? " on" : ""}`}
            onClick={() => setOpen(t.id)}
          >
            {text(t)}
          </button>
        ))}
        <button type="button" className="k-tab-close" onClick={() => setOpen(null)} aria-label="Close the panel" title="Close">
          ×
        </button>
      </div>
      <div className="k-tabbody" role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-t-${active.id}`} tabIndex={0} style={height ? { height } : undefined}>
        {active.render()}
      </div>
    </div>
  );
}
