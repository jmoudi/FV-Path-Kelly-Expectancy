import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** The control that opened the popover. */
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  /** Pixels the pointer may wander from the popover (or the card it edits) before it closes. */
  leaveDistance?: number;
  label: string;
  id?: string;
  /**
   * Place the popover beside this element (the card it edits) on the side with more
   * room, never over it. Without it the popover hangs under the anchor.
   */
  beside?: HTMLElement | null;
  /** When there is no room beside, keep clear of this element (the plot box): above or below it. */
  avoid?: HTMLElement | null;
  /** Pixels at the top of the viewport the popover keeps clear of (sticky bars). */
  insetTop?: number;
  /** At this viewport width and below the popover is a bottom sheet. */
  sheetBelow?: number;
  children: ReactNode;
}

/*
 * side   beside the card, on the side with more room
 * band   above or below the plot, wider and shorter (its content may lay out in columns)
 * hang   under the anchor (no card given)
 * sheet  a bottom sheet (narrow screens, or no room anywhere)
 */
type Placement = { mode: "side" | "band" | "hang"; left: number; top: number; width: number; maxHeight: number } | { mode: "sheet"; maxHeight: number };

const GAP = 12;
const MIN_SIDE = 320;
const MIN_TALL = 150;
const BAND_WIDTH = 760;

/**
 * A floating panel. It never changes the layout under it, opens without animation, and
 * closes when the pointer moves away, on Escape, or on a click outside. Beside a card it
 * sits on the side with more room; when neither side has room it sits above or below
 * the plot; on a narrow screen it is a bottom sheet.
 */
export function Popover({ anchor, onClose, width = 400, leaveDistance = 140, label, id, beside, avoid, insetTop = 0, sheetBelow = 900, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);

  // Keyboard focus goes back to where it was when the popover closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      if (prev && prev.isConnected && typeof prev.focus === "function") prev.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top0 = insetTop + 8;
      if (beside && vw <= sheetBelow) {
        setPos({ mode: "sheet", maxHeight: Math.round(vh * 0.6) });
        return;
      }
      if (beside) {
        const c = beside.getBoundingClientRect();
        const leftRoom = c.left - GAP - 8;
        const rightRoom = vw - c.right - GAP - 8;
        const right = rightRoom >= leftRoom;
        const room = Math.max(leftRoom, rightRoom);
        if (room >= MIN_SIDE) {
          const w = Math.min(width, room);
          const left = right ? c.right + GAP : c.left - GAP - w;
          const top = Math.min(Math.max(top0, c.top), Math.max(top0, vh - 8 - 360));
          setPos({ mode: "side", left, top, width: w, maxHeight: vh - top - 8 });
          return;
        }
        // No room beside the card: above or below the plot, aligned to the card's right edge.
        const a = (avoid ?? beside).getBoundingClientRect();
        const below = vh - a.bottom - GAP - 8;
        const above = a.top - GAP - top0;
        const w = Math.min(Math.max(width, BAND_WIDTH), c.width, vw - 16);
        const left = Math.max(8, Math.min(c.right - w, vw - w - 8));
        if (Math.max(below, above) >= MIN_TALL) {
          if (below >= above) setPos({ mode: "band", left, top: a.bottom + GAP, width: w, maxHeight: below });
          else {
            const h = Math.min(above, 560);
            setPos({ mode: "band", left, top: a.top - GAP - h, width: w, maxHeight: h });
          }
          return;
        }
        setPos({ mode: "sheet", maxHeight: Math.round(vh * 0.5) });
        return;
      }
      // Hanging under the anchor.
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, vw - 16);
      let left = Math.min(r.right - w, vw - w - 8);
      if (left < 8) left = 8;
      const below = vh - r.bottom - 12;
      const above = r.top - 12 - insetTop;
      const wantsBelow = below >= 240 || below >= above;
      const maxHeight = Math.min(520, Math.max(160, (wantsBelow ? below : above) - 8));
      const top = wantsBelow ? r.bottom + 6 : Math.max(top0, r.top - 6 - maxHeight);
      setPos({ mode: "hang", left, top, width: w, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, beside, avoid, width, insetTop, sheetBelow]);

  useEffect(() => {
    let armed = false;
    const arm = window.setTimeout(() => (armed = true), 250);
    const dist = (el: Element | null | undefined, x: number, y: number) => {
      if (!el) return Infinity;
      const r = el.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      return Math.hypot(dx, dy);
    };
    const onMove = (e: MouseEvent) => {
      if (!armed || !ref.current) return;
      // Pointing at the anchor or at the card being edited keeps the popover open.
      if (dist(anchor, e.clientX, e.clientY) <= 8 || dist(beside, e.clientX, e.clientY) === 0) return;
      if (dist(ref.current, e.clientX, e.clientY) > leaveDistance) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t) || beside?.contains(t)) return;
      onClose();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [anchor, beside, leaveDistance, onClose]);

  if (!anchor || !pos) return null;
  const style = pos.mode === "sheet" ? { maxHeight: pos.maxHeight } : { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight };
  return createPortal(
    <div ref={ref} id={id} className={`popover ${pos.mode}`} role="dialog" aria-label={label} style={style}>
      {children}
    </div>,
    document.body,
  );
}
