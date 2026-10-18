import type { Unit } from "../model/params";
import { NumberField } from "./NumberField";

/**
 * A plain synthetic number input for settings and editors that are not deck
 * parameters: same box, wheel and drag feel, with the slider on where a range exists.
 * Drag speed is `perHundredPx` units per 100 px; by default ten steps, or a third of
 * the range when that is less.
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
}) {
  if (value == null && placeholder != null) {
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
  return (
    <div className="nf-with-clear">
      <NumberField id={id} label={label} value={value ?? min} min={min} max={max} step={step} unit={unit} config={{ slider, sensitivityPx: 200, perHundredPx: drag, decimals }} onChange={(v) => onChange(v)} compact />
      {placeholder != null && (
        <button type="button" className="chip tiny" onClick={() => onChange(null)} title="Back to automatic">
          auto
        </button>
      )}
    </div>
  );
}
