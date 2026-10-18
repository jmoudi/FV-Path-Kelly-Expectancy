import { useRef, type KeyboardEvent } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  /** A second, smaller line: what choosing it sets ("q = 3.38%"). */
  hint?: string;
  title?: string;
}

export interface SegmentedProps<V extends string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
}

/** A segmented switch: one of a few states, as a radio group. Arrow keys move between options. */
export function Segmented<V extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const j = (i + dir + options.length) % options.length;
    onChange(options[j].value);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[j]?.focus();
  };
  return (
    <div ref={ref} className="seg-switch" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className={`seg-opt${on ? " on" : ""}`} onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)} title={o.title}>
            <span className="seg-label">{o.label}</span>
            {o.hint && <span className="seg-hint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
