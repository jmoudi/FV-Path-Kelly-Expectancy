import { useCallback, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { DeckProps, DeckText, DrawerSection } from "./types";
import { useMedia } from "./useMedia";
import { Link } from "../Link";

const DEFAULT_TEXT: DeckText = {
  expand: "Full deck ▾",
  collapse: "Collapse ▴",
  allInputs: "All inputs",
  drawerTitle: "Full deck",
  computing: "…",
};

const tone = (color?: string): CSSProperties | undefined => (color ? ({ "--tone": color } as CSSProperties) : undefined);

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && typeof el.closest === "function" && !!el.closest("input, textarea, select, [contenteditable='true']");
}

/**
 * Report the reduced bar's rendered height in a CSS variable on <html> (so sticky
 * offsets elsewhere can read it), and mark the groups that start a wrapped line so
 * their separator hairline is not drawn at the line's start.
 */
function useBarMetrics(ref: RefObject<HTMLElement>, heightVar: string, hidden: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (hidden || !el) {
      root.style.setProperty(heightVar, "0px");
      return;
    }
    const measure = () => {
      root.style.setProperty(heightVar, `${Math.ceil(el.getBoundingClientRect().height)}px`);
      let prevTop = Number.NEGATIVE_INFINITY;
      el.querySelectorAll<HTMLElement>(".dkb-group").forEach((g, i) => {
        const top = g.offsetTop;
        if (i > 0 && top > prevTop + 2) g.dataset.wrapStart = "";
        else delete g.dataset.wrapStart;
        prevTop = top;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, heightVar, hidden]);
  useEffect(() => () => document.documentElement.style.setProperty(heightVar, "0px"), [heightVar]);
}

function SectionBody({ s }: { s: DrawerSection }): ReactNode {
  switch (s.kind) {
    case "fields":
      return (
        <div className="dkb-sec-fields">
          {s.fields.map((f) => (
            <div key={f.id} className="dkb-sec-field">
              {f.node}
              {f.below}
            </div>
          ))}
        </div>
      );
    case "figures":
      return (
        <table className="dkb-ftable">
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <span className={`dkb-flabel${r.color ? " dot" : ""}`} style={tone(r.color)}>
                    {r.href ? <Link to={r.href}>{r.label}</Link> : <span>{r.label}</span>}
                    {r.help}
                  </span>
                  {r.basis && <span className="dkb-fbasis">{r.basis}</span>}
                </th>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "definitions":
      return (
        <dl className="dkb-defs">
          {s.items.map((it) => (
            <div key={it.term}>
              <dt>{it.term}</dt>
              <dd>{it.def}</dd>
            </div>
          ))}
        </dl>
      );
    case "custom":
      return s.node;
  }
}

/**
 * The deck frame: a reduced bar of two rows under the top bar, and a drawer.
 *
 * Row 1 holds the input groups, set apart by distance and a hairline, each under a
 * caption; groups wrap whole when the row is too narrow. Row 2 is the status line:
 * the lead (its colour as a dot before the name), the figures (value over label, in
 * ink), a muted note over the mini-legend, the reserved strip slot, and the toggle.
 * The drawer is a right-hand panel from under the top bar to the bottom of the
 * viewport that scrolls on its own and leaves the page live; on a phone it is a
 * bottom sheet opened by "All inputs". Escape closes.
 */
export function Deck(props: DeckProps) {
  const { groups, lead, status, note, legend, chips, strip, stripIdle = false, drawer, drawerTop, expanded, onExpandedChange, hidden = false, pending = false, heightVar = "--deck-h", phoneQuery = "(max-width: 700px)" } = props;
  const t = { ...DEFAULT_TEXT, ...props.text };
  const phone = useMedia(phoneQuery);
  const barRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const captionId = useId();
  useBarMetrics(barRef, heightVar, hidden);

  const close = useCallback(() => {
    const hadFocus = !!drawerRef.current && drawerRef.current.contains(document.activeElement);
    onExpandedChange(false);
    if (hadFocus) toggleRef.current?.focus({ preventScroll: true });
  }, [onExpandedChange]);

  useEffect(() => {
    if (!expanded || hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isEditable(e.target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, hidden, close]);

  useEffect(() => {
    if (expanded && !hidden) drawerRef.current?.focus({ preventScroll: true });
  }, [expanded, hidden]);

  if (hidden) return null;
  const hasContext = !!note || legend.length > 0;

  return (
    <>
      <div ref={barRef} className="dkb" data-pending={pending ? "" : undefined} data-expanded={expanded ? "" : undefined}>
        <div className="dkb-row dkb-inputs">
          {groups.map((g) => (
            // Spare width goes to the groups in proportion to their fields, so every field grows alike.
            <section key={g.id} className="dkb-group" style={{ flexGrow: g.fields.length }} aria-labelledby={`${captionId}-${g.id}`}>
              <div className="dkb-caption" id={`${captionId}-${g.id}`}>
                {g.caption}
              </div>
              <div className="dkb-fields">
                {g.fields.map((f) => (
                  <div key={f.id} className="dkb-field" data-phone={f.phone ? "" : undefined}>
                    {f.node}
                    {f.below && <div className="dkb-below">{f.below}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="dkb-row dkb-status">
          {lead && (
            <div className="dkb-lead" title={lead.tooltip}>
              <span className={`dkb-lead-title${lead.color ? " dot" : ""}`} style={tone(lead.color)}>
                {lead.title}
              </span>
              {lead.detail && <span className="dkb-lead-detail">{lead.detail}</span>}
            </div>
          )}
          <dl className="dkb-figs">
            {status.map((f) => (
              <div key={f.id} className="dkb-fig" title={f.title}>
                <dt>{f.href ? <Link to={f.href}>{f.label}</Link> : f.label}</dt>
                <dd>{f.value || t.computing}</dd>
              </div>
            ))}
          </dl>
          {hasContext && (
            <div className="dkb-context">
              {note && <div className="dkb-note">{note}</div>}
              {legend.length > 0 && (
                <ul className="dkb-legend" aria-label="Legend">
                  {legend.map((l) => (
                    <li key={l.id} style={{ "--swatch": l.color } as CSSProperties}>
                      {l.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {chips && <div className="dkb-chips">{chips}</div>}
          <div className="dkb-strip" data-idle={stripIdle ? "" : undefined}>
            {strip}
          </div>
          <button ref={toggleRef} type="button" className="dkb-btn dkb-toggle" aria-expanded={expanded} aria-controls={expanded ? drawerId : undefined} onClick={() => (expanded ? close() : onExpandedChange(true))}>
            {phone ? t.allInputs : expanded ? t.collapse : t.expand}
          </button>
        </div>
      </div>
      {expanded &&
        createPortal(
          <>
            <div className="dkb-backdrop" aria-hidden="true" onClick={close} />
            <aside ref={drawerRef} id={drawerId} className="dkb-drawer" data-pending={pending ? "" : undefined} aria-label={t.drawerTitle} tabIndex={-1}>
              <header className="dkb-drawer-head">
                <div className="dkb-drawer-bar">
                  <span className="dkb-drawer-title">{t.drawerTitle}</span>
                  <button type="button" className="dkb-btn" onClick={close} aria-controls={drawerId} aria-expanded="true">
                    {t.collapse}
                  </button>
                </div>
                {drawerTop && <div className="dkb-drawer-top">{drawerTop}</div>}
              </header>
              <div className="dkb-drawer-body">
                {drawer.map((s) => (
                  <section key={s.id} className="dkb-sec" aria-labelledby={`${drawerId}-${s.id}`}>
                    <h2 className="dkb-sec-h" id={`${drawerId}-${s.id}`}>
                      {s.title}
                    </h2>
                    {s.blurb && <p className="dkb-sec-blurb">{s.blurb}</p>}
                    <SectionBody s={s} />
                    {s.note && <div className="dkb-sec-note">{s.note}</div>}
                  </section>
                ))}
              </div>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
