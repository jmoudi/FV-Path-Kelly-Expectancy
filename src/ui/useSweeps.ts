import { useEffect } from "react";
import { PARAM_BY_KEY, type Params } from "../model/params";
import { useStore } from "../state/store";
import { valueAt } from "../sweeps/engine";

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
  views: "Alt+← / Alt+→",
};

/** Drives every running sweep: reads the clock, computes values, commits at the configured rate. */
export function useSweepEngine() {
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      const s = useStore.getState();
      const running = Object.values(s.runs).filter((r) => r.startedAt != null);
      if (running.length) {
        const t = performance.now();
        if (t - last >= 1000 / Math.max(1, s.ui.sweepHz)) {
          last = t;
          const patch: Partial<Params> = {};
          for (const r of running) {
            const def = PARAM_BY_KEY[r.key];
            const preset = s.presets.find((p) => p.id === r.presetId);
            if (!def || !preset || def.unit === "choice") continue;
            const v = valueAt(preset, { min: def.min, max: def.max, step: def.step }, r.elapsedMs + (t - (r.startedAt as number)));
            if (v !== s.params[r.key as keyof Params]) (patch as Record<string, number>)[r.key] = v;
          }
          if (Object.keys(patch).length) s.setParams(patch, { history: false });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Global hotkeys acting on the active input. */
export function useSweepHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const primary = mac ? e.metaKey : e.ctrlKey;
      if (!primary) return;
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === "TEXTAREA") return;
      const s = useStore.getState();
      const key = s.activeInput;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        s.pauseAll();
        return;
      }
      if (!key) return;
      if (e.key === "Enter") {
        e.preventDefault();
        s.toggleSweep(key);
      } else if (e.key === ".") {
        e.preventDefault();
        s.stopSweep(key);
      } else if (e.key === "[") {
        e.preventDefault();
        s.cyclePreset(key, -1);
      } else if (e.key === "]") {
        e.preventDefault();
        s.cyclePreset(key, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
