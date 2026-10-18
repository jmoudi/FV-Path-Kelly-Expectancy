import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LinkGroup } from "./types";

interface MenuButtonProps {
  /** What the button shows ("Views ▾", "⋯"). */
  label: ReactNode;
  /** Accessible name when the label is a glyph. */
  ariaLabel?: string;
  title?: string;
  className?: string;
  /** Extra class on the floating panel (its width lives in CSS). */
  panelClassName?: string;
  /** Align the panel's left edge with the button ("start") or its right edge ("end"). */
  align?: "start" | "end";
  /** Marks the button as the current page's menu. */
  current?: boolean;
  /** The panel content; call close() after an item is chosen. */
  children: (close: () => void) => ReactNode;
}

/**
 * A button that opens a floating panel rendered through a portal into <body>, so no
 * container's overflow can clip it. Closes on Escape, an outside click, a route change
 * (hashchange) and when an item calls close(). Opens instantly, no animation.
 */
export function MenuButton({ label, ariaLabel, title, className, panelClassName, align = "start", current, children }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!b) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = panel ? panel.offsetWidth : 0;
      let left = align === "end" ? b.right - w : b.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const top = b.bottom + 6;
      setPos({ left, top, maxHeight: Math.max(160, vh - top - 12) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onHash = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("hashchange", onHash);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" className={`k-menu-button${current ? " on" : ""}${className ? ` ${className}` : ""}`} aria-haspopup="true" aria-expanded={open} aria-label={ariaLabel} title={title} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} className={`k-menu-panel${panelClassName ? ` ${panelClassName}` : ""}`} role="menu" style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: -9999, top: 0, visibility: "hidden" }}>
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Groups of links laid out in columns: the Views menu. */
export function LinkGroups({ groups, onPick, lead }: { groups: LinkGroup[]; onPick: () => void; lead?: ReactNode }) {
  return (
    <div className="k-link-groups">
      {lead}
      {groups.map((g) => (
        <div key={g.id} className="k-link-group" role="group" aria-label={g.title}>
          <div className="k-link-group-title">{g.title}</div>
          {g.items.map((it) => (
            <a key={it.href} href={it.href} role="menuitem" className={it.current ? "on" : undefined} aria-current={it.current ? "page" : undefined} title={it.title} onClick={onPick}>
              {it.label}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A plain vertical list of actions: the "⋯" menu. */
export function MenuItems({ items, onPick }: { items: { id: string; label: string; onSelect: () => void; hint?: string }[]; onPick: () => void }) {
  return (
    <div className="k-menu-items">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          className="k-menu-item"
          onClick={() => {
            onPick();
            it.onSelect();
          }}
        >
          <span>{it.label}</span>
          {it.hint && <span className="k-menu-hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
