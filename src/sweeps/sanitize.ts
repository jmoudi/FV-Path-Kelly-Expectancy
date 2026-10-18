/**
 * Validation of saved and imported presets, with the migration from the format
 * that spoke in shares of the schema range (stepFraction, smooth): the three old
 * default presets are replaced by the new defaults, and a preset the reader made
 * keeps its range and spots, with its step read as a share of the range it sweeps.
 */
import { DEFAULT_PRESETS, LEGACY_PRESET_IDS, clonePreset, defaultPresets, isBuiltinAnchor, type AnchorRef, type BuiltinAnchor, type SweepPreset, type SweepRange, type SweepSpot, type SweepStep } from "./types";

const ID = /^[\w-]{1,64}$/;

const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function anchorRef(v: unknown, fallback: BuiltinAnchor): AnchorRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID.test(o.id)) return null;
  const fb = typeof o.fallback === "string" && isBuiltinAnchor(o.fallback) ? o.fallback : fallback;
  return { id: o.id, fallback: fb };
}

function range(v: unknown): SweepRange {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  switch (r.mode) {
    case "fraction":
      return { mode: "fraction", lo: num(r.lo, 0, 1, 0.25), hi: num(r.hi, 0, 1, 0.75) };
    case "absolute":
      return { mode: "absolute", lo: num(r.lo, -1e12, 1e12, 0), hi: num(r.hi, -1e12, 1e12, 1) };
    case "around":
      return { mode: "around", half: num(r.half, 0, 1e12, 0.2), unit: r.unit === "units" ? "units" : "share" };
    case "anchors": {
      const lo = anchorRef(r.lo, "min");
      const hi = anchorRef(r.hi, "max");
      return lo && hi ? { mode: "anchors", lo, hi } : { mode: "full" };
    }
    default:
      return { mode: "full" };
  }
}

function step(v: unknown, legacyFraction: unknown): SweepStep {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const unit = o.unit === "share" ? "share" : "units";
    return { size: num(o.size, 1e-9, 1e12, unit === "share" ? 0.05 : 1), unit };
  }
  // The old format's step was a share of the resolved range.
  return { size: num(legacyFraction, 0.001, 1, 0.05), unit: "share" };
}

function spots(v: unknown, holdDefault = 2000): SweepSpot[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .slice(0, 32)
    .map((s) => {
      const a = anchorRef(s.anchor, "current");
      const out: SweepSpot = { at: num(s.at, -1e12, 1e12, 0.5), holdMs: num(s.holdMs, 50, 600_000, holdDefault) };
      if (a) out.anchor = a;
      return out;
    });
}

/** Whether a saved preset is in the format that spoke in shares of the schema range. */
export function isLegacyPreset(o: Record<string, unknown>): boolean {
  return !("step" in o) && ("stepFraction" in o || "smooth" in o);
}

export function sanitizePreset(input: unknown): SweepPreset | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID.test(o.id)) return null;
  // The old defaults drove q past break-even and started from the bottom of the range: replace them.
  if (isLegacyPreset(o) && LEGACY_PRESET_IDS[o.id]) {
    const replacement = DEFAULT_PRESETS.find((p) => p.id === LEGACY_PRESET_IDS[o.id as string]);
    return replacement ? clonePreset(replacement) : null;
  }
  const kind = o.kind === "loop" || o.kind === "pingpong" || o.kind === "scenarios" ? o.kind : "loop";
  return {
    id: o.id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.slice(0, 80) : o.id,
    kind,
    range: range(o.range),
    step: step(o.step, o.stepFraction),
    intervalMs: num(o.intervalMs, 50, 600_000, 400),
    scenarios: spots(o.scenarios),
  };
}

/** A list of presets; an empty or missing list gives the defaults. Duplicate ids keep the first. */
export function sanitizePresets(input: unknown): SweepPreset[] {
  if (!Array.isArray(input)) return defaultPresets();
  const seen = new Set<string>();
  const out: SweepPreset[] = [];
  for (const raw of input) {
    const p = sanitizePreset(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.length ? out : defaultPresets();
}

/** A link saved against an old default preset follows it to its replacement. */
export function migratePresetId(id: string): string {
  return LEGACY_PRESET_IDS[id] ?? id;
}
