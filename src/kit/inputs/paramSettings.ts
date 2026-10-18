/**
 * Parameter settings: how a person edits one parameter by hand (the quantum of the
 * wheel, the arrow keys and the drag; the fine step with Shift; the wheel step; the
 * drag speed; the decimals shown; whether the slider shows). The schema's `input`
 * block gives the defaults; a person's settings, kept in the store, override them.
 *
 * They are not the replayer's: a sweep preset owns its own step and timing, and the
 * sweep engine never reads these. The only thing the two share is the schema's range.
 *
 * Also here, the grid arithmetic the synthetic number field uses: values land on
 * multiples of the step (counted from zero, inside the range); typed values are
 * clamped and never rounded to the step.
 *
 * No React, no DOM: the build worker may import this file.
 */
import { decimalsFor } from "./display";
import { inputConfig, type InputConfig, type ParamDef, type Schema } from "./schema";

/** One person's settings for one parameter. Every field is optional; a missing one takes the default. */
export interface ParamSettings {
  /** The quantum of the wheel, the arrow keys and the drag, in the parameter's units. */
  step?: number;
  /** The quantum with Shift held. */
  fineStep?: number;
  /** One wheel notch, in the parameter's units (rounded to a whole number of steps, at least one). */
  wheelStep?: number;
  /** Drag speed: the parameter's units per 100 px of pointer travel (× the global drag sensitivity). */
  dragPerHundredPx?: number;
  /** Decimal places shown in the box, in display units. */
  decimals?: number;
  /** Show the drag slider beside the box. */
  slider?: boolean;
}

export type ParamSettingKey = keyof ParamSettings;

/** The six settings, in the order the editors list them. */
export const PARAM_SETTING_KEYS: readonly ParamSettingKey[] = ["step", "fineStep", "wheelStep", "dragPerHundredPx", "decimals", "slider"];

/** What applies now: every setting resolved (a person's value, else the schema's, else the derived default). */
export interface EffectiveParamSettings {
  step: number;
  fineStep: number;
  wheelStep: number;
  dragPerHundredPx: number;
  decimals: number;
  slider: boolean;
}

/** parameter key -> the settings a person changed. */
export type ParamSettingsMap = Partial<Record<string, ParamSettings>>;

/** A patch for setParamSettings: a value sets the setting, null or undefined clears it (back to the default). */
export type ParamSettingsPatch = { [K in ParamSettingKey]?: ParamSettings[K] | null };

const isPercent = (unit: string) => unit === "pct" || unit === "pct2";

/** Units per 100 px of drag from an input config: `perHundredPx`, or the old "pixels from the middle to an extreme". */
export function perHundredPxOf(config: InputConfig, min: number, max: number): number {
  if (config.perHundredPx != null && config.perHundredPx > 0) return config.perHundredPx;
  const px = Math.max(40, config.sensitivityPx || 220);
  return (((max - min) / 2) * 100) / px;
}

/** Decimal places a step needs to show exactly, in display units (2 for 0.25 pp or 0.25σ, 0 for 5 pp), at most 4. */
export function stepDecimals(unit: string, step: number): number {
  if (unit === "int" || !(step > 0)) return 0;
  const x = isPercent(unit) ? step * 100 : step;
  for (let d = 0; d < 4; d++) {
    const s = x * Math.pow(10, d);
    if (Math.abs(s - Math.round(s)) < 1e-6 * Math.max(1, s)) return d;
  }
  return 4;
}

/** Two significant digits: a derived drag speed reads as 6.8 pp, not 6.81818 pp. */
function twoDigits(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return v;
  return Number(v.toPrecision(2));
}

/** One unit of the last decimal the box shows, in the parameter's units (0.01 pp for a percentage at 2 decimals). */
export function displayUnit(unit: string, decimals: number): number {
  const u = Math.pow(10, -Math.max(0, decimals));
  return isPercent(unit) ? u / 100 : u;
}

function wholeMultiple(x: number, of: number): boolean {
  if (!(of > 0) || x < of * (1 - 1e-9)) return false;
  const r = x / of;
  return Math.abs(r - Math.round(r)) < 1e-6;
}

/** The fine step a parameter gets by default: the first of step ÷ 10, ÷ 5, ÷ 2 the box can show exactly, else the step. */
export function defaultFineStep(unit: string, step: number, decimals: number): number {
  if (unit === "int") return Math.max(1, Math.round(step / 10));
  const du = displayUnit(unit, decimals);
  for (const d of [10, 5, 2]) {
    const f = Number((step / d).toPrecision(12));
    if (wholeMultiple(f, du)) return f;
  }
  return step;
}

/** The wheel step as it acts: a whole number of steps, at least one. */
export function wheelOnGrid(wheelStep: number, step: number): number {
  if (!(step > 0)) return wheelStep;
  const n = Math.max(1, Math.round(wheelStep / step));
  return Number((n * step).toPrecision(12));
}

/**
 * Resolve every setting of one parameter: the person's value where set, else the
 * schema's `input` default, else a default derived from the (resolved) step.
 */
export function effectiveSettings(def: ParamDef<any>, user?: ParamSettings | null): EffectiveParamSettings {
  const cfg = inputConfig(def);
  const u = user ?? {};
  const int = def.unit === "int";
  const schemaStep = def.step > 0 ? def.step : 1;
  const step = u.step ?? schemaStep;
  // The schema's decimals, else as many as its step needs; more only when a finer step needs them.
  const schemaDecimals = cfg.decimals ?? Math.max(decimalsFor(def.unit, schemaStep), stepDecimals(def.unit, schemaStep));
  const decimals = u.decimals ?? (int ? 0 : Math.max(schemaDecimals, stepDecimals(def.unit, step)));
  const fineStep = u.fineStep ?? cfg.fineStep ?? defaultFineStep(def.unit, step, decimals);
  const wheelStep = wheelOnGrid(u.wheelStep ?? cfg.wheelStep ?? step, step);
  // An explicit drag speed as given; one derived from the old "pixels to an extreme" at two significant digits.
  const dragPerHundredPx = u.dragPerHundredPx ?? (cfg.perHundredPx != null && cfg.perHundredPx > 0 ? cfg.perHundredPx : twoDigits(perHundredPxOf(cfg, def.min, def.max)));
  const slider = u.slider ?? cfg.slider;
  return { step, fineStep, wheelStep, dragPerHundredPx, decimals, slider };
}

/** The settings with no person's values: what the schema and the derived defaults give. */
export function schemaSettings(def: ParamDef<any>): EffectiveParamSettings {
  return effectiveSettings(def, null);
}

/** Parameters that take settings: every numeric one (a choice is a select). */
export function hasSettings(def: ParamDef<any> | undefined): def is ParamDef<any> {
  return !!def && def.unit !== "choice";
}

/**
 * One parameter's settings from untrusted input: known fields only; steps and the
 * drag speed positive and finite, within the parameter's range (whole numbers for an
 * integer parameter); decimals a whole number 0–6; slider a boolean. Null when
 * nothing valid is left.
 */
export function sanitizeParamSetting(def: ParamDef<any>, input: unknown): ParamSettings | null {
  if (!hasSettings(def) || !input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const span = def.max - def.min;
  const int = def.unit === "int";
  const out: ParamSettings = {};
  const quantum = (v: unknown): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
    const x = int ? Math.round(v) : v;
    if (int ? x < 1 : span > 0 && x < span * 1e-6) return undefined;
    return span > 0 ? Math.min(x, span) : x;
  };
  const step = quantum(src.step);
  if (step != null) out.step = step;
  const fine = quantum(src.fineStep);
  if (fine != null) out.fineStep = fine;
  const wheel = quantum(src.wheelStep);
  if (wheel != null) out.wheelStep = wheel;
  const d = src.dragPerHundredPx;
  if (typeof d === "number" && Number.isFinite(d) && d > 0 && !(span > 0 && (d < span * 1e-6 || d > span * 10))) out.dragPerHundredPx = d;
  const dec = src.decimals;
  if (typeof dec === "number" && Number.isInteger(dec) && dec >= 0 && dec <= 6) out.decimals = dec;
  if (typeof src.slider === "boolean") out.slider = src.slider;
  return Object.keys(out).length ? out : null;
}

/** Every parameter's settings from untrusted input (a saved or imported state): known parameters only. */
export function sanitizeParamSettings(input: unknown, schema: Schema<any>): Record<string, ParamSettings> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, ParamSettings> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const def = schema.byKey[k];
    if (!def) continue;
    const clean = sanitizeParamSetting(def, v);
    if (clean) out[k] = clean;
  }
  return out;
}

/** Apply a patch to one parameter's settings: values set, null or undefined clear; null when nothing is left. */
export function patchParamSetting(def: ParamDef<any>, prev: ParamSettings | undefined, patch: ParamSettingsPatch): ParamSettings | null {
  const merged: Record<string, unknown> = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) delete merged[k];
    else merged[k] = v;
  }
  return sanitizeParamSetting(def, merged);
}

// ---------------------------------------------------------------------------
// The grid: where the wheel, the arrow keys and the drag land.
// ---------------------------------------------------------------------------

const tidy = (v: number) => Number(v.toPrecision(12));
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The nearest multiple of `grid` (counted from zero), inside [min, max]. */
export function quantize(v: number, grid: number, min: number, max: number): number {
  if (!(grid > 0)) return clamp(v, min, max);
  return clamp(tidy(Math.round(v / grid) * grid), min, max);
}

/**
 * Move by `delta` and land on the grid: the multiple of `grid` nearest to v + delta,
 * but always at least one grid point in the direction of the move (so a delta smaller
 * than the grid still moves, and a value off the grid lands on it). Inside [min, max].
 */
export function stepOnGrid(v: number, delta: number, grid: number, min: number, max: number): number {
  if (delta === 0) return clamp(v, min, max);
  if (!(grid > 0)) return clamp(tidy(v + delta), min, max);
  const dir = Math.sign(delta);
  let t = Math.round((v + delta) / grid) * grid;
  const e = grid * 1e-9;
  if ((t - v) * dir <= e) t = dir > 0 ? (Math.floor(v / grid + 1e-9) + 1) * grid : (Math.ceil(v / grid - 1e-9) - 1) * grid;
  return clamp(tidy(t), min, max);
}

/** What a typed value becomes: clamped to the range, whole for an integer parameter, never rounded to the step. */
export function clampTyped(v: number, min: number, max: number, integer = false): number {
  return clamp(integer ? Math.round(v) : v, min, max);
}
