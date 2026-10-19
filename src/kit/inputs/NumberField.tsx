import { useState, type ReactNode } from "react";
import { SyntheticNumber, type SyntheticEmpty } from "./SyntheticNumber";
import type { InputConfig, Unit } from "./schema";
import { perHundredPxOf } from "./paramSettings";
import { useKit, useKitApi } from "@kit/state/context";
import { useBusEvent } from "@kit/events/react";
import { useSweepTrack } from "@kit/sweeps/useSweeps";

export { perHundredPxOf };

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
  /** An empty box with a placeholder (a setting left at its default); see SyntheticNumber. */
  empty?: SyntheticEmpty;
  /** The sign after the number instead of the unit's ("pp" for a step of a percentage). */
  suffix?: string;
}

/**
 * The synthetic number input wired to the app: the active-input highlight, the global
 * drag setting, and the sweep marker, band and tick of the run that drives it.
 * The field itself is the kit's SyntheticNumber.
 */
export function NumberField(p: NumberFieldProps) {
  const api = useKitApi();
  const dragSensitivity = useKit((s) => s.ui.dragSensitivity);
  const isActive = useKit((s) => !!p.inputKey && s.activeInput === p.inputKey);
  const setActiveInput = useKit((s) => s.setActiveInput);
  const track = useSweepTrack(p.inputKey, isActive);
  // Locks: a locked parameter's field is read-only; every refusal of its changes shows the kept value and shakes it.
  const locked = useKit((s) => !!p.inputKey && !!s.locks?.[p.inputKey]);
  const [refusals, setRefusals] = useState(0);
  useBusEvent("param:refused", (e) => {
    if (p.inputKey && e.key === p.inputKey) setRefusals((n) => n + 1);
  });
  const activate = () => {
    if (p.inputKey && api.getState().activeInput !== p.inputKey) setActiveInput(p.inputKey);
  };
  return (
    <SyntheticNumber
      id={p.id}
      dataKey={p.inputKey}
      label={p.label}
      extra={p.extra}
      strip={p.strip}
      value={p.value}
      min={p.min}
      max={p.max}
      step={p.step}
      unit={p.unit}
      config={{ slider: p.config.slider, perHundredPx: perHundredPxOf(p.config, p.min, p.max), wheelStep: p.config.wheelStep, decimals: p.config.decimals, fineStep: p.config.fineStep }}
      empty={p.empty}
      suffix={p.suffix}
      onChange={p.onChange}
      compact={p.compact}
      ariaLabel={p.ariaLabel}
      defaultValue={p.defaultValue}
      active={isActive}
      onActivate={activate}
      run={track.run}
      band={track.band}
      tick={track.tick}
      dragScale={dragSensitivity}
      locked={locked}
      refusals={refusals}
    />
  );
}
