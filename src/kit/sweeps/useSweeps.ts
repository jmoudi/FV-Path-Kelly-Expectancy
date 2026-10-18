import { useEffect, useMemo } from "react";
import type { TrackBand } from "@kit/inputs/SyntheticNumber";
import { committed, due, RUNNER_DEFAULTS, skipped, startCursor, type Cursor } from "./runner";
import { useKit, useKitApi, useKitSweeps } from "@kit/state/context";
import { nextIndex } from "./engine";
import { planWith } from "./adapter";
import type { SweepPlan } from "./types";
import { IS_MAC as mac } from "./hotkeys";
import { useBus } from "@kit/events/react";

// The key names live in a React-free module so copy can import them; re-exported here for the frames.
export { HOTKEY_HINTS } from "./hotkeys";

function holdOf(plan: SweepPlan, index: number): number {
  return plan.holds[Math.max(0, index)] ?? plan.holds[0] ?? 400;
}

/**
 * Drives every running sweep, locked to the page's frames: the next value is
 * committed only after the build for the previous one has rendered (useBuild's
 * `buildSettled`), and each value stays on screen at least its hold time, divided by
 * the sweep rate in Settings. Each committed value is announced as sweep:stepped on the
 * bus (the parameter itself as param:changed with source "sweep", by the store).
 */
export function useSweepEngine() {
  const api = useKitApi();
  const sweeps = useKitSweeps();
  const bus = useBus();
  useEffect(() => {
    let raf = 0;
    /** One cursor per running run, keyed by input; a new start or a resume gets a fresh one. */
    const cursors = new Map<string, { cursor: Cursor; startedAt: number }>();
    const settledSince = (t: number) => sweeps.settledSince(t);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = api.getState();
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
      const moves: [string, number, number][] = [];
      for (const r of running) {
        const plan = r.plan as SweepPlan;
        const current = s.params[r.key];
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
        moves.push([r.key, next, v]);
        if (v !== current) {
          patch[r.key] = v;
          committed(entry.cursor, now);
        } else skipped(entry.cursor, now);
      }
      for (const [k, i] of moves) s.setRunIndex(k, i);
      if (Object.keys(patch).length) s.setParams(patch, { sweep: true });
      for (const [key, index, value] of moves) bus.emit("sweep:stepped", { key, index, value });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [api, sweeps, bus]);
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
  const api = useKitApi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const primary = mac ? e.metaKey : e.ctrlKey;
      if (!primary || e.altKey) return;
      const s = api.getState();
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
  }, [api]);
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
  const sweeps = useKitSweeps();
  const run = useKit((s) => (inputKey ? s.runs[inputKey] : undefined));
  const linked = useKit((s) => (inputKey && active && !s.runs[inputKey] ? s.links[inputKey] : undefined));
  const preset = useKit((s) => (linked ? s.presets.find((p) => p.id === linked) : undefined));
  const params = useKit((s) => (preset ? s.params : null));
  const value = useKit((s) => (inputKey ? s.params[inputKey] : undefined));
  const preview = useMemo(() => (inputKey && preset && params ? planWith(sweeps, inputKey, preset, params) : null), [sweeps, inputKey, preset, params]);
  const plan = run?.plan ?? preview;
  return {
    run: run ? (run.startedAt != null ? "running" : "paused") : null,
    band: plan ? { lo: plan.lo, hi: plan.hi, marks: plan.marks.length ? plan.marks : undefined } : null,
    tick: run && typeof value === "number" ? value : null,
  };
}
