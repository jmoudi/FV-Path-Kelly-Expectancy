import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { InputConfig, Unit } from "../model/params";
import { useStore } from "../state/store";

export interface NumberFieldProps {
  id: string;
  /** Store key used for the active-input highlight and sweep links. */
  inputKey?: string;
  label?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: Unit;
  config: InputConfig;
  onChange: (v: number) => void;
  compact?: boolean;
  /** Rendered after the label (help, badges). */
  extra?: ReactNode;
  /** Rendered under the field when it is the active input. */
  strip?: ReactNode;
  ariaLabel?: string;
  /** Double-clicking the slider returns to this value. */
  defaultValue?: number;
}

function decimalsFor(unit: Unit, step: number, override?: number): number {
  if (override != null) return override;
  const s = unit === "pct" || unit === "pct2" ? step * 100 : step;
  if (s >= 1) return 0;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(s))));
}

function toDisplay(v: number, unit: Unit, decimals: number): string {
  const x = unit === "pct" || unit === "pct2" ? v * 100 : v;
  return x.toFixed(decimals).replace(/\.?0+$/, (m) => (decimals > 0 && m.startsWith(".") ? "" : m.includes(".") ? "" : m));
}

function fromDisplay(s: string, unit: Unit): number | null {
  const n = Number(s.replace(",", ".").replace(/[%×σ\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return unit === "pct" || unit === "pct2" ? n / 100 : n;
}

function suffix(unit: Unit): string {
  switch (unit) {
    case "pct":
    case "pct2":
      return "%";
    case "x":
      return "×";
    case "sigma":
      return "σ";
    default:
      return "";
  }
}

function snap(v: number, min: number, max: number, step: number): number {
  const s = step > 0 ? step : 1;
  const r = min + Math.round((v - min) / s) * s;
  return Math.max(min, Math.min(max, Number(r.toPrecision(12))));
}

/**
 * The synthetic number input: a text box that takes the wheel and the arrow keys,
 * with a drag slider underneath. Dragging is relative and its feel is a physical
 * distance (pixels from the middle to an extreme) set per parameter, not a share of
 * the rendered width. A click without a drag jumps to the clicked position.
 */
export function NumberField(p: NumberFieldProps) {
  const dragSensitivity = useStore((s) => s.ui.dragSensitivity);
  const activeInput = useStore((s) => s.activeInput);
  const setActiveInput = useStore((s) => s.setActiveInput);
  const run = useStore((s) => (p.inputKey ? s.runs[p.inputKey] : undefined));
  const decimals = decimalsFor(p.unit, p.step, p.config.decimals);
  const [text, setText] = useState(() => toDisplay(p.value, p.unit, decimals));
  const [editing, setEditing] = useState(false);
  const committed = useRef(text);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const liveTimer = useRef<number | null>(null);
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    if (!editing) {
      const t = toDisplay(p.value, p.unit, decimals);
      setText(t);
      committed.current = t;
    }
    setLive(null);
  }, [p.value, p.unit, decimals, editing]);

  const commit = (v: number) => {
    const s = snap(v, p.min, p.max, p.step);
    if (s !== p.value) p.onChange(s);
  };
  const commitLive = (v: number) => {
    const s = snap(v, p.min, p.max, p.step);
    setLive(s);
    setText(toDisplay(s, p.unit, decimals));
    if (liveTimer.current) window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => commit(s), 90);
  };
  const activate = () => {
    if (p.inputKey && activeInput !== p.inputKey) setActiveInput(p.inputKey);
  };

  // The wheel must be a non-passive native listener, or the page scrolls as well.
  const boxRef = useRef<HTMLInputElement>(null);
  const wheelState = useRef({ live, value: p.value });
  wheelState.current = { live, value: p.value };
  useEffect(() => {
    const els: HTMLElement[] = [];
    if (boxRef.current) els.push(boxRef.current);
    if (trackRef.current) els.push(trackRef.current);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      activate();
      const base = p.config.wheelStep ?? p.step;
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const dir = e.deltaY < 0 ? 1 : -1;
      const cur = wheelState.current.live ?? wheelState.current.value;
      commitLive(cur + dir * base * mult);
    };
    els.forEach((el) => el.addEventListener("wheel", onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener("wheel", onWheel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.config.wheelStep, p.step, p.min, p.max, p.inputKey]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    activate();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: live ?? p.value, moved: false };
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 2) d.moved = true;
    if (!d.moved) return;
    const half = (p.max - p.min) / 2;
    const sens = Math.max(40, p.config.sensitivityPx * dragSensitivity);
    const fine = e.shiftKey ? 0.1 : 1;
    commitLive(d.v + (dx / sens) * half * fine);
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A plain click jumps to the clicked position; the second click of a double-click does not.
    if (!d.moved && trackRef.current && e.detail < 2) {
      const r = trackRef.current.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
      commitLive(p.min + f * (p.max - p.min));
    }
  };
  const onDoubleClick = () => {
    if (p.defaultValue == null) return;
    if (liveTimer.current) window.clearTimeout(liveTimer.current);
    setLive(null);
    // The default is exact (it need not sit on the step grid), so it bypasses the snap.
    const v = Math.max(p.min, Math.min(p.max, p.defaultValue));
    if (v !== p.value) p.onChange(v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mult = e.shiftKey ? 10 : 1;
    let d = 0;
    if (e.key === "ArrowUp") d = p.step * mult;
    else if (e.key === "ArrowDown") d = -p.step * mult;
    else if (e.key === "PageUp") d = p.step * 10;
    else if (e.key === "PageDown") d = -p.step * 10;
    else if (e.key === "Home") {
      e.preventDefault();
      commit(p.min);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      commit(p.max);
      return;
    } else if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
      return;
    } else if (e.key === "Escape") {
      setText(committed.current);
      setEditing(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (d !== 0) {
      e.preventDefault();
      commitLive((live ?? p.value) + d);
    }
  };
  const onBlur = () => {
    setEditing(false);
    if (text === committed.current) return;
    const v = fromDisplay(text, p.unit);
    if (v == null) setText(committed.current);
    else commit(v);
  };

  const shown = live ?? p.value;
  const frac = p.max > p.min ? Math.min(1, Math.max(0, (shown - p.min) / (p.max - p.min))) : 0;
  const isActive = !!p.inputKey && activeInput === p.inputKey;
  const running = !!run && run.startedAt != null;
  const paused = !!run && run.startedAt == null;

  return (
    <div className={`nf${p.compact ? " compact" : ""}${isActive ? " active" : ""}${running ? " running" : ""}${paused ? " paused" : ""}`} data-key={p.inputKey}>
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
            aria-label={p.ariaLabel ?? (typeof p.label === "string" ? p.label : p.id)}
            tabIndex={-1}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onDoubleClick={onDoubleClick}
            title={p.defaultValue != null ? "Drag to change, double-click for the default" : "Drag to change"}
          >
            <div className="nf-fill" style={{ width: `${frac * 100}%` }} />
            <div className="nf-thumb" style={{ left: `${frac * 100}%` }} />
          </div>
        )}
        <input
          ref={boxRef}
          id={p.id}
          className="nf-box"
          type="text"
          inputMode="decimal"
          value={editing ? text : text + suffix(p.unit)}
          onFocus={() => {
            activate();
            setEditing(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKey}
          aria-label={p.ariaLabel ?? (typeof p.label === "string" ? p.label : p.id)}
        />
        {(running || paused) && <span className="nf-run" title={running ? "sweep running" : "sweep paused"}>{running ? "▶" : "❚❚"}</span>}
      </div>
      {isActive && p.strip}
    </div>
  );
}
