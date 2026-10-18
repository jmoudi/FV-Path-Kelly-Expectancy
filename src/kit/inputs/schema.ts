/**
 * The parameter schema: what an explainer's inputs are, how they look, how far they go,
 * which tier, deck group and section they belong to, and which sweep anchors they
 * declare. Generic over the app's parameter object P; the app builds one instance
 * with createSchema and hands it to createAppStore and KitProvider.
 *
 * No React, no DOM: the build worker may import this file.
 */
import type { NumberFormat } from "@kit/charts/spec";
import type { AnchorDef } from "@kit/sweeps/types";

export type Tier = "primary" | "secondary" | "advanced";
export type Unit = "pct" | "pct2" | "x" | "int" | "sigma" | "ratio" | "choice";
export type ParamValue = number | string;
/**
 * The erased parameter type the kit's components see. `any`, not Record<string, any>:
 * `keyof P` makes ParamDef and Schema contravariant in P, so only `any` accepts every app's P.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyParams = any;
/** A parameter key of P (string keys only). */
export type ParamKey<P> = Extract<keyof P, string>;

/** Where an input sits in the deck beyond its group (tier 1 is the deck). */
export interface DeckPlacement {
  /** Shown in the reduced deck's first row, not only in the drawer. */
  row?: boolean;
  /** Kept in that row on a phone (≤ 700px), where the row holds four fields. */
  phone?: boolean;
}

/**
 * How the synthetic number input behaves for one parameter. The slider's feel is a
 * physical distance, not a share of its rendered width.
 */
export interface InputConfig {
  /** Show the drag slider under the box. */
  slider: boolean;
  /** Drag sensitivity in the input's own units per 100 px of pointer travel (Shift ×0.1). */
  perHundredPx?: number;
  /** What one unit of an integer input counts, for "1 name" / "5 nights" in sweep descriptions. */
  noun?: { one: string; many: string };
  /** Pixels of drag from the middle to either extreme; used only where perHundredPx is not set. */
  sensitivityPx: number;
  /** Change per wheel notch; defaults to the step. */
  wheelStep?: number;
  /** Decimal places shown in the box (in display units). */
  decimals?: number;

  // Parameter settings (kit/inputs/paramSettings.ts): the fields above are the defaults
  // a person's settings override; this one exists only as such a default.
  /** The quantum with Shift held; default: step ÷ 10 (or ÷ 5, ÷ 2) as far as the box can show it. */
  fineStep?: number;
}

export interface Choice {
  value: string;
  label: string;
}

export interface ParamDef<P extends object = AnyParams> {
  key: ParamKey<P>;
  label: string;
  /** The symbol the charts use ("q", "b"). */
  short?: string;
  /** A shorter name for tight places (the reduced deck); the label stays the full name. */
  shortLabel?: string;
  unit: Unit;
  min: number;
  max: number;
  step: number;
  tier: Tier;
  /** Which section the secondary input belongs to. */
  section?: string;
  /** Which deck group (drawer section) the input belongs to; the app names its groups. */
  group?: string;
  /** Its place in the reduced deck. */
  deck?: DeckPlacement;
  help: string;
  /** A one-line definition for the glossary in the expanded deck. */
  definition?: string;
  choices?: Choice[];
  /** The input also changes every section, not only its own. */
  affectsAll?: boolean;
  input?: Partial<InputConfig>;
  /** Whether a sweep preset may drive it. Engine settings and seeds are not swept. */
  sweepable?: boolean;
  /** Named points a sweep range or spot can refer to; the app computes their values. */
  anchors?: AnchorDef[];
}

export interface Schema<P extends object = AnyParams> {
  defs: ParamDef<P>[];
  byKey: Record<string, ParamDef<P>>;
  defaults: P;
  /** A full, valid parameter object: known keys only, numbers clamped to the range (ints rounded), choices validated. */
  sanitize(input: unknown): P;
  /** A partial patch: known keys only, finite numbers and valid choices; values are not clamped. */
  sanitizePatch(input: unknown): Partial<P> | null;
  /** What setParam stores: numbers clamped to the range and rounded for ints; anything else unchanged. */
  coerce(key: string, value: unknown): unknown;
}

export const DEFAULT_INPUT: InputConfig = { slider: true, sensitivityPx: 220 };

export function inputConfig(def: ParamDef<any>): InputConfig {
  return { ...DEFAULT_INPUT, ...(def.input ?? {}) };
}

export function isSweepable(def: ParamDef<any>): boolean {
  if (def.unit === "choice") return false;
  return def.sweepable ?? def.tier !== "advanced";
}

/** The number format that reads an input's unit back. */
export function formatForUnit(unit: Unit): NumberFormat {
  return unit === "pct" ? "pct1" : unit === "pct2" ? "pct2" : unit === "int" ? "int" : unit === "x" ? "x" : "num";
}

export function createSchema<P extends object>(init: { defs: ParamDef<P>[]; defaults: P }): Schema<P> {
  const { defs, defaults } = init;
  const byKey: Record<string, ParamDef<P>> = Object.fromEntries(defs.map((d) => [d.key, d]));

  const valid = (def: ParamDef<P>, v: unknown): ParamValue | undefined => {
    if (def.unit === "choice") return typeof v === "string" && def.choices?.some((c) => c.value === v) ? v : undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
      const clamped = Math.min(def.max, Math.max(def.min, v));
      return def.unit === "int" ? Math.round(clamped) : clamped;
    }
    return undefined;
  };

  return {
    defs,
    byKey,
    defaults,
    sanitize(input) {
      const out = { ...defaults } as Record<string, unknown>;
      if (!input || typeof input !== "object") return out as P;
      const src = input as Record<string, unknown>;
      for (const def of defs) {
        const v = valid(def, src[def.key]);
        if (v !== undefined) out[def.key] = v;
      }
      return out as P;
    },
    sanitizePatch(input) {
      if (!input || typeof input !== "object") return null;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        const def = byKey[k];
        if (!def) continue;
        if (def.unit === "choice") {
          if (typeof v === "string" && def.choices?.some((c) => c.value === v)) out[k] = v;
        } else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      }
      return Object.keys(out).length ? (out as Partial<P>) : null;
    },
    coerce(key, value) {
      const def = byKey[key];
      if (!def || def.unit === "choice" || typeof value !== "number") return value;
      const clamped = Math.min(def.max, Math.max(def.min, value));
      return def.unit === "int" ? Math.round(clamped) : clamped;
    },
  };
}
