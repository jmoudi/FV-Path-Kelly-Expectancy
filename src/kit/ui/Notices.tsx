/**
 * The notice stack: every `notice` on the event bus shows bottom-right for its time
 * (6 s by default), newest at the bottom, at most `max` at once. A click on a notice
 * or Escape dismisses it (Escape takes every notice on screen and leaves the key to
 * whatever else handles it, so a drawer or a popover still closes too). Hovering or
 * focusing the stack holds it. A notice with the `id` of one on screen replaces it.
 * The only animation is opacity. Mount it once, anywhere under <KitProvider>.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusEvent } from "@kit/events/react";
import type { Notice } from "@kit/events/types";
import "./notices.css";

interface Shown extends Notice {
  uid: number;
  leaving: boolean;
}

const FADE_MS = 160;
export const NOTICE_TTL_MS = 6000;

/** The dismiss mark, drawn on the icons' 16-unit grid (kit/ui/Icon.tsx). */
function Cross() {
  return (
    <svg className="k-icon" width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function Notices({ max = 4, ttlMs = NOTICE_TTL_MS }: { max?: number; ttlMs?: number }) {
  const [items, setItems] = useState<Shown[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const timers = useRef(new Map<number, number>());
  const held = useRef(false);
  const seq = useRef(0);

  const clear = (uid: number) => {
    const t = timers.current.get(uid);
    if (t != null) window.clearTimeout(t);
    timers.current.delete(uid);
  };

  const dismiss = useCallback((uid: number) => {
    clear(uid);
    setItems((xs) => xs.map((x) => (x.uid === uid ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.uid !== uid)), FADE_MS);
  }, []);

  const arm = useCallback(
    (n: Shown) => {
      clear(n.uid);
      if (held.current) return;
      timers.current.set(n.uid, window.setTimeout(() => dismiss(n.uid), Math.max(1000, n.ttlMs ?? ttlMs)));
    },
    [dismiss, ttlMs],
  );

  useBusEvent("notice", (n) => {
    const shown: Shown = { ...n, uid: ++seq.current, leaving: false };
    // Functional, so two notices in one tick both land. The same id replaces the one on
    // screen; past the limit the oldest go at once (clearing a timer twice is harmless).
    setItems((now) => {
      const kept = now.filter((x) => !(n.id && x.id === n.id && !x.leaving));
      const next = [...kept, shown];
      const dropped = new Set([...now.filter((x) => !kept.includes(x)), ...next.slice(0, Math.max(0, next.length - max))].map((x) => x.uid));
      dropped.forEach(clear);
      return next.filter((x) => !dropped.has(x.uid));
    });
    arm(shown);
  });

  const any = items.some((x) => !x.leaving);
  useEffect(() => {
    if (!any) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") for (const x of itemsRef.current) if (!x.leaving) dismiss(x.uid);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [any, dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  const hold = (on: boolean) => {
    held.current = on;
    for (const x of itemsRef.current) {
      if (on) clear(x.uid);
      else if (!x.leaving) arm(x);
    }
  };

  return (
    <div className="k-notices" aria-label="Notices" onMouseEnter={() => hold(true)} onMouseLeave={() => hold(false)} onFocus={() => hold(true)} onBlur={() => hold(false)}>
      {items.map((n) => (
        <div key={n.uid} className={`k-notice ${n.kind}${n.leaving ? " leaving" : ""}`} role={n.kind === "error" ? "alert" : "status"} onClick={() => dismiss(n.uid)}>
          <span className="k-notice-text">{n.text}</span>
          <button type="button" className="k-notice-x" aria-label="Dismiss" title="Dismiss (click or Escape)" onClick={(e) => (e.stopPropagation(), dismiss(n.uid))}>
            <Cross />
          </button>
        </div>
      ))}
    </div>
  );
}
