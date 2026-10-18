import { useEffect, useMemo } from "react";
import { sweepContext, sweepFormat } from "@app/params/sweepAnchors";
import type { TrackBand } from "@kit/inputs/SyntheticNumber";
import { committed, due, RUNNER_DEFAULTS, skipped, startCursor, type Cursor } from "@kit/sweeps/runner";
import { isSweepable } from "@kit/inputs/schema";
import { PARAM_BY_KEY } from "@app/params/schema";
import type { Params } from "@app/params/params";
import { registerSweepPlanner, useStore } from "../state/store";
import { describePreset, nextIndex, planSweep } from "@kit/sweeps/engine";
import type { SweepPlan, SweepPreset } from "@kit/sweeps/types";
import { buildSettled } from "./useBuild";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl";

export const HOTKEY_HINTS = {
  toggle: `${mod}+Enter`,
  stop: `${mod}+.`,
  prev: `${mod}+[`,
  next: `${mod}+]`,
  all: `${mod}+Shift+Enter`,
  undo: `${mod}+Z`,
  redo: `${mod}+Shift+Z`,
};

/** Resolve a preset for one input now: its anchors read the parameters and the deck figures of the last build. */
export function planFor(key: string, preset: SweepPreset, params: Params, at?: { origin: number; current: number }): SweepPlan | null {
  const def = PARAM_BY_KEY[key];
  if (!def || !isSweepable(def)) return null;
  const value = params[key as keyof Params];
  if (typeof value !== "number") return null;
  const origin = at?.origin ?? value;
  return planSweep(preset, sweepContext(def, { params, origin, current: at?.current ?? value, deck: buildSettled.latest?.deck ?? null }));
}

/** "loops from optimistic 2.52% to break-even 3.38%, step 0.05 pp every 400 ms (18 values)", for this input. */
export function describeFor(key: string, preset: SweepPreset, params: Params): string {
  const def = PARAM_BY_KEY[key];
  const value = params[key as keyof Params];
  if (!def || !isSweepable(def) || typeof value !== "number") return "";
  return describePreset(preset, sweepContext(def, { params, origin: value, deck: buildSettled.latest?.deck ?? null }), sweepFormat(def));
}

// Runs are planned when they start, by the store, through this.
registerSweepPlanner((key, preset, at) => planFor(key, preset, useStore.getState().params, at));

function holdOf(plan: SweepPlan, index: number): number {
  return plan.holds[Math.max(0, index)] ?? plan.holds[0] ?? 400;
}

/** One cursor per running run, keyed by input; a new start or a resume gets a fresh one. */
const cursors = new Map<string, { cursor: Cursor; startedAt: number }>();

/**
 * Drives every running sweep, locked to the page's frames: the next value is
 * committed only after the build for the previous one has rendered (useBuild's
 * `buildSettled`), and each value stays on screen at least its hold time, divided by
 * the sweep rate in Settings.
 */
export function useSweepEngine() {
  useEffect(() => {
    let raf = 0;
    const settledSince = (t: number) => buildSettled.settledSince(t);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useStore.getState();
      for (const [key, entry] of [...cursors]) {
        const r = s.runs[key];
        if (!r || r.startedAt == null || r.startedAt !== entry.startedAt) cursors.delete(key);
      }
      const running = Object.values(s.runs).filter((r) => r.startedAt != null && r.plan && r.plan.values.length);
      if (!running.length) return;
      const now = performance.now();
      const speed = Math.max(0.05, s.ui.sweepSpeed || 1);
      const opts = { ...RUNNER_DEFAULTS, minSpacingMs: 1000 / Math.max(1, s.ui.sweepHz) };
      const patch: Record<string, number> = {};
      const moves: [string, number][] = [];
      for (const r of running) {
        const plan = r.plan as SweepPlan;
        const current = s.params[r.key as keyof Params];
        let entry = cursors.get(r.key);
        if (!entry) {
          entry = { cursor: startCursor(now), startedAt: r.startedAt as number };
          cursors.set(r.key, entry);
          // A spot run that does not start on a spot goes to the nearest one at once.
          if (plan.jumpTo != null && r.index === plan.start && current !== plan.jumpTo) {
            patch[r.key] = plan.jumpTo;
            committed(entry.cursor, now);
            continue;
          }
        }
        if (!due(entry.cursor, now, holdOf(plan, r.index) / speed, settledSince, opts)) continue;
        const next = nextIndex(plan, r.index);
        const v = plan.values[next];
        moves.push([r.key, next]);
        if (v !== current) {
          patch[r.key] = v;
          committed(entry.cursor, now);
        } else skipped(entry.cursor, now);
      }
      for (const [k, i] of moves) s.setRunIndex(k, i);
      if (Object.keys(patch).length) s.setParams(patch as Partial<Params>, { sweep: true });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Focus is in a field where the browser's own undo and typing belong. */
export function isEditableTarget(el: Element | null): boolean {
  if (!el || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(t);
  }
  return false;
}

/**
 * Global hotkeys acting on the active input. Plain [ and ] belong to view navigation
 * and Alt+arrows to the browser, so every binding here needs Ctrl (⌘ on a Mac).
 * Ctrl+Z / Ctrl+Shift+Z leave an editable text field to its native undo; elsewhere
 * Ctrl+Z puts a running or paused sweep's input back where it was before the sweep,
 * and otherwise steps back through parameter changes.
 */
export function useSweepHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const primary = mac ? e.metaKey : e.ctrlKey;
      if (!primary || e.altKey) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === "z" || (!mac && k === "y")) {
        if (isEditableTarget(document.activeElement)) return;
        e.preventDefault();
        const redo = k === "y" || e.shiftKey;
        if (redo) s.redo();
        else if (Object.keys(s.runs).length) s.restoreSweep();
        else s.undo();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        s.pauseAll();
        return;
      }
      const key = s.activeInput;
      if (e.key === "." || e.code === "Period") {
        e.preventDefault();
        if (key && s.runs[key]) s.stopSweep(key);
        else Object.keys(s.runs).forEach((r) => s.stopSweep(r));
        return;
      }
      if (!key) return;
      if (e.key === "Enter") {
        e.preventDefault();
        s.toggleSweep(key);
      } else if (e.code === "BracketLeft" || e.key === "[") {
        e.preventDefault();
        s.cyclePreset(key, -1);
      } else if (e.code === "BracketRight" || e.key === "]") {
        e.preventDefault();
        s.cyclePreset(key, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export interface SweepTrack {
  run: "running" | "paused" | null;
  band: TrackBand | null;
  tick: number | null;
}

/**
 * What a field's track draws: while a sweep drives it, the run's range as a band and
 * its position as a tick; while the field is active and has a linked preset, that
 * preset's range as a preview.
 */
export function useSweepTrack(inputKey: string | undefined, active: boolean): SweepTrack {
  const run = useStore((s) => (inputKey ? s.runs[inputKey] : undefined));
  const linked = useStore((s) => (inputKey && active && !s.runs[inputKey] ? s.links[inputKey] : undefined));
  const preset = useStore((s) => (linked ? s.presets.find((p) => p.id === linked) : undefined));
  const params = useStore((s) => (preset ? s.params : null));
  const value = useStore((s) => (inputKey ? s.params[inputKey as keyof Params] : undefined));
  const preview = useMemo(() => (inputKey && preset && params ? planFor(inputKey, preset, params) : null), [inputKey, preset, params]);
  const plan = run?.plan ?? preview;
  return {
    run: run ? (run.startedAt != null ? "running" : "paused") : null,
    band: plan ? { lo: plan.lo, hi: plan.hi, marks: plan.marks.length ? plan.marks : undefined } : null,
    tick: run && typeof value === "number" ? value : null,
  };
}
