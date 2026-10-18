import type { ReactNode } from "react";
import { SyntheticNumber } from "../kit/inputs/SyntheticNumber";
import type { InputConfig, Unit } from "../model/params";
import { useStore } from "../state/store";
import { useSweepTrack } from "./useSweeps";

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

/**
 * Units per 100 px of drag. The schema sets it per parameter (`input.perHundredPx`);
 * where it does not, the old "pixels from the middle to an extreme" converts.
 */
export function perHundredPxOf(config: InputConfig, min: number, max: number): number {
  if (config.perHundredPx != null && config.perHundredPx > 0) return config.perHundredPx;
  const px = Math.max(40, config.sensitivityPx || 220);
  return (((max - min) / 2) * 100) / px;
}

/**
 * The synthetic number input wired to the app: the active-input highlight, the global
 * drag setting, and the sweep marker, band and tick of the run that drives it.
 * The field itself is the kit's SyntheticNumber.
 */
export function NumberField(p: NumberFieldProps) {
  const dragSensitivity = useStore((s) => s.ui.dragSensitivity);
  const isActive = useStore((s) => !!p.inputKey && s.activeInput === p.inputKey);
  const setActiveInput = useStore((s) => s.setActiveInput);
  const track = useSweepTrack(p.inputKey, isActive);
  const activate = () => {
    if (p.inputKey && useStore.getState().activeInput !== p.inputKey) setActiveInput(p.inputKey);
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
      config={{ slider: p.config.slider, perHundredPx: perHundredPxOf(p.config, p.min, p.max), wheelStep: p.config.wheelStep, decimals: p.config.decimals }}
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
    />
  );
}
