import type { Unit } from "./schema";
import { NumberField } from "./NumberField";

/**
 * A plain synthetic number input for settings and editors that are not deck
 * parameters: same box, wheel and drag feel, with the slider on where a range exists.
 * Drag speed is `perHundredPx` units per 100 px; by default ten steps, or a third of
 * the range when that is less.
 *
 * Two ways to allow "no value": `placeholder` shows a button ("auto") that sets a
 * value on click; `emptyHint` shows an empty box with the hint as its placeholder
 * (a setting left at its default), which typing, the wheel or the arrows fill
 * (starting from `emptyBase`) and clearing empties again.
 */
export function Num({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit = "ratio",
  slider = true,
  decimals,
  perHundredPx,
  placeholder,
  emptyHint,
  emptyBase,
  suffix,
  ariaLabel,
}: {
  id: string;
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  step: number;
  unit?: Unit;
  slider?: boolean;
  decimals?: number;
  /** Drag sensitivity in units per 100 px. */
  perHundredPx?: number;
  /** Allow an empty value (e.g. "auto") via the clear button. */
  placeholder?: string;
  /** Allow an empty value shown as an empty box with this placeholder (the default it stands for). */
  emptyHint?: string;
  /** The value an empty box stands for: where the wheel and the arrows start. */
  emptyBase?: number;
  /** The sign after the number instead of the unit's. */
  suffix?: string;
  ariaLabel?: string;
}) {
  if (value == null && placeholder != null && emptyHint == null) {
    return (
      <div className="nf compact">
        {label && (
          <div className="nf-label">
            <span className="nf-label-text">{label}</span>
          </div>
        )}
        <div className="nf-row">
          <button type="button" className="nf-box as-button" onClick={() => onChange(min + (max - min) / 2)} title="Click to set a value">
            {placeholder}
          </button>
        </div>
      </div>
    );
  }
  const span = max - min;
  const drag = perHundredPx ?? (Number.isFinite(span) && span > 0 ? Math.min(10 * step, span / 3) : 10 * step);
  const empty = emptyHint != null ? { active: value == null, placeholder: emptyHint, onClear: () => onChange(null) } : undefined;
  const shown = value ?? emptyBase ?? min;
  return (
    <div className="nf-with-clear">
      <NumberField id={id} label={label} value={shown} min={min} max={max} step={step} unit={unit} config={{ slider, sensitivityPx: 200, perHundredPx: drag, decimals }} onChange={(v) => onChange(v)} compact empty={empty} suffix={suffix} ariaLabel={ariaLabel} />
      {placeholder != null && emptyHint == null && (
        <button type="button" className="chip tiny" onClick={() => onChange(null)} title="Back to automatic">
          auto
        </button>
      )}
    </div>
  );
}
