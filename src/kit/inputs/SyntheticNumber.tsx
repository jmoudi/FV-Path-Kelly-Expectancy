import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { decimalsFor, fractionOf, fromDisplay, snapTo, suffix, toDisplay } from "./display";
import { lastPageScrollAt, watchPageScroll, WheelAccumulator, wheelAllowed } from "./wheelGate";
import "./number-field.css";

/** How one synthetic number field feels. */
export interface SyntheticConfig {
  /** Show the drag track beside the box. */
  slider: boolean;
  /** Drag sensitivity: input units per 100 px of pointer travel, however wide the track is drawn. */
  perHundredPx: number;
  /** Change per wheel notch; defaults to the step. */
  wheelStep?: number;
  /** Decimal places shown in the box, in display units. */
  decimals?: number;
}

/** A range drawn on the track (a sweep preset's span), with optional marks (its spots). */
export interface TrackBand {
  lo: number;
  hi: number;
  marks?: number[];
}

export interface SyntheticNumberProps {
  id: string;
  label?: ReactNode;
  /** Rendered after the label (help, badges). */
  extra?: ReactNode;
  /** Rendered under the field when it is active. */
  strip?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  /** "pct" | "pct2" | "x" | "int" | "sigma" | "ratio"; percent units are stored as shares. */
  unit: string;
  config: SyntheticConfig;
  onChange: (v: number) => void;
  compact?: boolean;
  ariaLabel?: string;
  /** Double-clicking the track returns to this value. */
  defaultValue?: number;
  /** The field is the active input (highlighted). */
  active?: boolean;
  /** Called when the field is focused, clicked or wheeled. */
  onActivate?: () => void;
  /** A sweep drives the field: the ▶ / ❚❚ marker, in a slot that is always reserved. */
  run?: "running" | "paused" | null;
  band?: TrackBand | null;
  /** The sweep's position, drawn as a tick on the band while it runs. */
  tick?: number | null;
  /** Multiplier on perHundredPx (a global drag setting). */
  dragScale?: number;
  /** Written to data-key on the root, for styling and tests. */
  dataKey?: string;
}

const DRAG_THRESHOLD_PX = 3;

/**
 * The synthetic number input: a text box that takes typing, the arrow keys and the
 * wheel, with a drag track beside it.
 *
 * - A click on the track focuses the field and does not move the value; dragging is
 *   relative, at `perHundredPx` input units per 100 px (Shift ×0.1); double-click
 *   returns to the default.
 * - The wheel changes the value only while the field is focused, or after the pointer
 *   has rested on it for 400 ms with no page scroll in progress; otherwise the page
 *   scrolls. Shift ×10, Alt ×0.1.
 * - The sweep marker sits inside the box in a reserved slot, so starting a sweep
 *   never shifts the layout; a sweep's range shows as a band on the track.
 */
export function SyntheticNumber(p: SyntheticNumberProps) {
  const decimals = decimalsFor(p.unit, p.step, p.config.decimals);
  const [text, setText] = useState(() => toDisplay(p.value, p.unit, decimals));
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState<number | null>(null);
  const committedText = useRef(text);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean; fine: boolean; pointer: number } | null>(null);
  const pendingCommit = useRef<{ raf: number; v: number } | null>(null);
  const hoverSince = useRef<number | null>(null);
  const wheel = useRef(new WheelAccumulator());

  // The latest props for the native listeners and the frame-throttled commit.
  const latest = useRef(p);
  latest.current = p;
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    if (!editing) {
      const t = toDisplay(p.value, p.unit, decimals);
      setText(t);
      committedText.current = t;
    }
    if (!drag.current && !pendingCommit.current) setLive(null);
  }, [p.value, p.unit, decimals, editing]);

  useEffect(
    () => () => {
      if (pendingCommit.current) cancelAnimationFrame(pendingCommit.current.raf);
    },
    [],
  );

  const snap = (v: number) => {
    const q = latest.current;
    return snapTo(v, q.min, q.max, q.step);
  };
  const commitNow = (v: number) => {
    const q = latest.current;
    const s = snap(v);
    if (s !== q.value) q.onChange(s);
  };
  /** Show the value at once and commit it at most once a frame. */
  const commitLive = (v: number) => {
    const s = snap(v);
    setLive(s);
    setText(toDisplay(s, latest.current.unit, decimals));
    if (pendingCommit.current) {
      pendingCommit.current.v = s;
      return;
    }
    const raf = requestAnimationFrame(() => {
      const c = pendingCommit.current;
      pendingCommit.current = null;
      if (c) commitNow(c.v);
    });
    pendingCommit.current = { raf, v: s };
  };
  const activate = () => latest.current.onActivate?.();

  // The wheel needs a non-passive native listener so it can keep the page from scrolling when it acts.
  useEffect(() => {
    watchPageScroll();
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const focused = !!document.activeElement && el.contains(document.activeElement);
      if (!wheelAllowed({ focused, hoverSince: hoverSince.current, now, lastScrollAt: lastPageScrollAt() })) {
        wheel.current.reset();
        return;
      }
      e.preventDefault();
      const steps = wheel.current.push(e);
      if (!steps) return;
      activate();
      const q = latest.current;
      const base = q.config.wheelStep ?? q.step;
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      commitLive((liveRef.current ?? q.value) + steps * base * mult);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decimals]);

  const perPx = () => {
    const q = latest.current;
    return (q.config.perHundredPx * (q.dragScale ?? 1)) / 100;
  };
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    activate();
    // A click focuses the field (the track is its slider) and leaves the value alone.
    trackRef.current?.focus({ preventScroll: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: liveRef.current ?? p.value, moved: false, fine: e.shiftKey, pointer: e.pointerId };
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x) <= DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      // Start measuring from where the drag began to move, so the threshold is not a jump.
      d.moved = true;
      d.x = e.clientX;
    }
    // Shift switches to fine mid-drag without a jump: re-base at the current position.
    if (e.shiftKey !== d.fine) {
      d.v = liveRef.current ?? d.v;
      d.x = e.clientX;
      d.fine = e.shiftKey;
    }
    const dx = e.clientX - d.x;
    commitLive(d.v + dx * perPx() * (d.fine ? 0.1 : 1));
  };
  const endDrag = () => {
    drag.current = null;
    if (!pendingCommit.current) setLive(null);
  };
  const onDoubleClick = () => {
    const q = latest.current;
    if (q.defaultValue == null) return;
    if (pendingCommit.current) {
      cancelAnimationFrame(pendingCommit.current.raf);
      pendingCommit.current = null;
    }
    setLive(null);
    // The default is exact (it need not sit on the step grid), so it bypasses the snap.
    const v = Math.max(q.min, Math.min(q.max, q.defaultValue));
    if (v !== q.value) q.onChange(v);
  };

  /** Arrow and page keys step the value; on the track (a slider) Home and End go to the ends, in the box they move the caret. */
  const stepKey = (e: RKeyboardEvent<HTMLElement>, onTrack: boolean): boolean => {
    const mult = e.shiftKey ? 10 : 1;
    let d = 0;
    if (e.key === "ArrowUp" || (onTrack && e.key === "ArrowRight")) d = p.step * mult;
    else if (e.key === "ArrowDown" || (onTrack && e.key === "ArrowLeft")) d = -p.step * mult;
    else if (e.key === "PageUp") d = p.step * 10;
    else if (e.key === "PageDown") d = -p.step * 10;
    else if (onTrack && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      commitNow(e.key === "Home" ? p.min : p.max);
      return true;
    }
    if (d === 0) return false;
    e.preventDefault();
    commitLive((live ?? p.value) + d);
    return true;
  };
  // Escape abandons the edit: the blur it causes must not commit the typed text.
  const cancelEdit = useRef(false);
  const onBoxKey = (e: RKeyboardEvent<HTMLInputElement>) => {
    if (stepKey(e, false)) return;
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    else if (e.key === "Escape") {
      cancelEdit.current = true;
      setText(committedText.current);
      (e.target as HTMLInputElement).blur();
    }
  };
  const onBlur = () => {
    setEditing(false);
    if (cancelEdit.current) {
      cancelEdit.current = false;
      setText(committedText.current);
      return;
    }
    if (text === committedText.current) return;
    const v = fromDisplay(text, p.unit);
    if (v == null) setText(committedText.current);
    else commitNow(v);
  };

  const shown = live ?? p.value;
  const frac = fractionOf(shown, p.min, p.max);
  const label = p.ariaLabel ?? (typeof p.label === "string" ? p.label : p.id);
  const band = p.band && Number.isFinite(p.band.lo) && Number.isFinite(p.band.hi) ? p.band : null;
  const bandLo = band ? fractionOf(Math.min(band.lo, band.hi), p.min, p.max) : 0;
  const bandHi = band ? fractionOf(Math.max(band.lo, band.hi), p.min, p.max) : 0;
  const running = p.run === "running";
  const paused = p.run === "paused";
  const cls = ["nf", p.compact && "compact", p.active && "active", running && "running", paused && "paused", band && "banded"].filter(Boolean).join(" ");

  return (
    <div
      ref={rootRef}
      className={cls}
      data-key={p.dataKey}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") hoverSince.current = performance.now();
      }}
      onPointerLeave={() => {
        hoverSince.current = null;
        wheel.current.reset();
      }}
    >
      {(p.label || p.extra) && (
        <div className="nf-label">
          {p.label && <span className="nf-label-text">{p.label}</span>}
          {p.extra}
        </div>
      )}
      <div className="nf-row">
        {p.config.slider && (
          <div
            ref={trackRef}
            className="nf-track"
            role="slider"
            aria-valuemin={p.min}
            aria-valuemax={p.max}
            aria-valuenow={shown}
            aria-valuetext={`${toDisplay(shown, p.unit, decimals)}${suffix(p.unit)}`}
            aria-label={label}
            tabIndex={0}
            onFocus={activate}
            onKeyDown={(e) => stepKey(e, true)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={onDoubleClick}
            title={p.defaultValue != null ? "Drag to change (Shift for fine), double-click for the default" : "Drag to change (Shift for fine)"}
          >
            {band && (
              <div className="nf-band" style={{ left: `${bandLo * 100}%`, width: `${Math.max(0, bandHi - bandLo) * 100}%` }} aria-hidden="true">
                {band.marks?.map((m, i) => <span key={i} className="nf-mark" style={{ left: `${bandHi > bandLo ? ((fractionOf(m, p.min, p.max) - bandLo) / (bandHi - bandLo)) * 100 : 0}%` }} />)}
              </div>
            )}
            <div className="nf-fill" style={{ width: `${frac * 100}%` }} />
            {p.tick != null && (running || paused) && <div className="nf-tick" style={{ left: `${fractionOf(p.tick, p.min, p.max) * 100}%` }} aria-hidden="true" />}
            <div className="nf-thumb" style={{ left: `${frac * 100}%` }} />
          </div>
        )}
        <span className="nf-boxwrap">
          <input
            id={p.id}
            className="nf-box"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={editing ? text : text + suffix(p.unit)}
            onFocus={() => {
              activate();
              setEditing(true);
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onBoxKey}
            aria-label={label}
          />
          {/* The marker is drawn in its reserved slot (number-field.css): ▶ running, ❚❚ paused. */}
          <span className="nf-run" data-run={running ? "running" : paused ? "paused" : undefined} aria-hidden={!running && !paused} title={running ? "sweep running" : paused ? "sweep paused" : undefined}>
            {(running || paused) && <span className="sr-only">{running ? "sweep running" : "sweep paused"}</span>}
          </span>
        </span>
      </div>
      {p.active && p.strip}
    </div>
  );
}
