import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  /** Pixels the pointer may wander from the popover before it closes. */
  leaveDistance?: number;
  label: string;
  children: ReactNode;
}

/**
 * A floating panel anchored to an element. It never changes the layout under it,
 * opens without animation, and closes when the pointer moves away, on Escape, or
 * on a click outside.
 */
export function Popover({ anchor, onClose, width = 400, leaveDistance = 120, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      let left = Math.min(r.right - w, vw - w - 8);
      if (left < 8) left = 8;
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const wantsBelow = below >= 240 || below >= above;
      const maxHeight = Math.max(160, (wantsBelow ? below : above) - 8);
      const top = wantsBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(maxHeight, 520));
      setPos({ left, top, maxHeight: Math.min(maxHeight, 520) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);

  useEffect(() => {
    let armed = false;
    const arm = window.setTimeout(() => (armed = true), 250);
    const onMove = (e: MouseEvent) => {
      if (!armed || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      if (anchor) {
        const a = anchor.getBoundingClientRect();
        const inAnchor = e.clientX >= a.left - 8 && e.clientX <= a.right + 8 && e.clientY >= a.top - 8 && e.clientY <= a.bottom + 8;
        if (inAnchor) return;
      }
      if (Math.hypot(dx, dy) > leaveDistance) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
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
  }, [anchor, leaveDistance, onClose]);

  if (!anchor || !pos) return null;
  return createPortal(
    <div ref={ref} className="popover" role="dialog" aria-label={label} style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight }}>
      {children}
    </div>,
    document.body,
  );
}
