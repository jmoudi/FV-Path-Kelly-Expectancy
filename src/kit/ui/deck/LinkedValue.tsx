import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export interface LinkedValueProps {
  /** id of the box (box mode, or text mode while editing). */
  id?: string;
  /**
   * "text": read-only text whose value turns into a box on click (Enter or leaving
   * the box commits, Escape cancels). "box": always a box, for a full field.
   */
  mode?: "text" | "box";
  /** Before the value in text mode, e.g. "=". */
  prefix?: ReactNode;
  /** The value as displayed, unit included: "55%". */
  value: string;
  /** After the value in text mode: "clean season (Coin)". */
  suffix?: ReactNode;
  /** What the box holds while editing, without the unit: "55.0". */
  editText: string;
  /** Shown after the number in the box: "%". */
  unit?: string;
  /** Takes the typed text; returns false to reject it (the box then shows the old value). */
  onCommit: (text: string) => boolean;
  /** CSS colour of the value in text mode. */
  color?: string;
  title?: string;
  ariaLabel: string;
  /** Extra class on the box (box mode), to match the app's input boxes. */
  boxClassName?: string;
}

/**
 * A derived figure that can also be typed: shown as text ("= 55% clean season"), or
 * as a box, and on commit handed back to the app, which solves its inputs from it.
 */
export function LinkedValue(p: LinkedValueProps) {
  const mode = p.mode ?? "text";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.editText);
  const boxRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setText(p.editText);
  }, [p.editText, editing]);
  useEffect(() => {
    if (editing && mode === "text") boxRef.current?.select();
  }, [editing, mode]);

  const finish = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      setText(p.editText);
      return;
    }
    if (text.trim() === p.editText) return;
    if (!p.onCommit(text)) setText(p.editText);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      boxRef.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      boxRef.current?.blur();
    }
  };

  const box = (
    <input
      ref={boxRef}
      id={p.id}
      className={mode === "text" ? "lv-edit" : `lv-box${p.boxClassName ? ` ${p.boxClassName}` : ""}`}
      type="text"
      inputMode="decimal"
      value={editing ? text : `${p.editText}${p.unit ?? ""}`}
      onFocus={() => {
        setText(p.editText);
        setEditing(true);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onKeyDown={onKey}
      aria-label={p.ariaLabel}
      title={p.title}
      autoFocus={mode === "text"}
    />
  );

  if (mode === "box") return box;
  return (
    <span className="lv" style={p.color ? ({ "--tone": p.color } as CSSProperties) : undefined}>
      {p.prefix != null && <span className="lv-prefix">{p.prefix}</span>}
      {editing ? (
        <span className="lv-editing">
          {box}
          {p.unit && <span className="lv-unit">{p.unit}</span>}
        </span>
      ) : (
        <button type="button" className="lv-value" onClick={() => setEditing(true)} title={p.title} aria-label={`${p.ariaLabel}: ${p.value}`}>
          {p.value}
        </button>
      )}
      {p.suffix != null && <span className="lv-suffix">{p.suffix}</span>}
    </span>
  );
}
