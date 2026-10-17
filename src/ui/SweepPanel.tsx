import { useState } from "react";
import { formatNumber } from "../charts/format";
import { isSweepable, PARAM_BY_KEY, PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { describePreset } from "../sweeps/engine";
import type { SweepKind, SweepPreset } from "../sweeps/types";
import { Num } from "./Num";
import { HOTKEY_HINTS } from "./useSweeps";

function newId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create, edit, delete and link sweep presets. Lives in Settings and in the expanded
 * deck. Everything speaks in fractions of the linked input's range unless the range
 * is absolute, so one preset drives any input.
 */
export function SweepPanel({ compact }: { compact?: boolean }) {
  const presets = useStore((s) => s.presets);
  const links = useStore((s) => s.links);
  const runs = useStore((s) => s.runs);
  const activeInput = useStore((s) => s.activeInput);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const upsertPreset = useStore((s) => s.upsertPreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const linkPreset = useStore((s) => s.linkPreset);
  const toggleSweep = useStore((s) => s.toggleSweep);
  const stopSweep = useStore((s) => s.stopSweep);
  const [editing, setEditing] = useState<SweepPreset | null>(null);
  const def = activeInput ? PARAM_BY_KEY[activeInput] : undefined;
  const sweepable = !!def && isSweepable(def);
  const bounds = def && def.unit !== "choice" ? { min: def.min, max: def.max, step: def.step } : { min: 0, max: 1, step: 0.01 };
  const fmt = (v: number) => (def ? formatNumber(v, def.unit === "pct" ? "pct1" : def.unit === "pct2" ? "pct2" : def.unit === "int" ? "int" : def.unit === "x" ? "x" : "num") : v.toFixed(2));

  const startEdit = (p?: SweepPreset) =>
    setEditing(
      p
        ? { ...p, range: { ...p.range }, scenarios: p.scenarios.map((s) => ({ ...s })) }
        : { id: newId(), name: "New sweep", kind: "loop", range: { mode: "full" }, stepFraction: 0.02, intervalMs: 300, smooth: true, scenarios: [] },
    );

  return (
    <div className="sweeps">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          {!compact && <h4 style={{ margin: 0 }}>Sweep presets</h4>}
          <p className="caption" style={{ margin: "2px 0 0" }}>
            {!compact && "A preset drives an input automatically. "}
            Active input: <b>{def ? def.label : "none (focus an input)"}</b>
            {def && !sweepable ? " (not swept)" : ""}.
          </p>
        </div>
        <button type="button" className="btn small" onClick={() => startEdit()}>
          New preset
        </button>
      </div>

      <div className="preset-list">
        {presets.map((p) => {
          const linkedKeys = Object.entries(links)
            .filter(([, v]) => v === p.id)
            .map(([k]) => PARAM_BY_KEY[k]?.shortLabel ?? PARAM_BY_KEY[k]?.label ?? k);
          const isLinked = !!activeInput && links[activeInput] === p.id;
          const run = activeInput ? runs[activeInput] : undefined;
          return (
            <div key={p.id} className={`preset${isLinked ? " on" : ""}`}>
              <div className="preset-main">
                <b>{p.name}</b>
                <span className="caption">{describePreset(p, bounds, fmt)}</span>
                {linkedKeys.length > 0 && <span className="caption">linked to {linkedKeys.join(", ")}</span>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                {activeInput && sweepable && (
                  <>
                    <button type="button" className={`btn small${isLinked ? " primary" : ""}`} onClick={() => linkPreset(activeInput, isLinked ? null : p.id)}>
                      {isLinked ? "linked" : `link to ${def?.shortLabel ?? def?.label ?? "input"}`}
                    </button>
                    {isLinked && (
                      <button type="button" className="btn small" onClick={() => toggleSweep(activeInput)}>
                        {run && run.startedAt != null ? "pause" : run ? "resume" : "run"}
                      </button>
                    )}
                    {isLinked && run && (
                      <button type="button" className="btn small quiet" onClick={() => stopSweep(activeInput)}>
                        stop
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="btn small quiet" onClick={() => startEdit(p)}>
                  edit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <PresetEditor
          preset={editing}
          onChange={setEditing}
          onSave={() => {
            upsertPreset(editing);
            setEditing(null);
          }}
          onDelete={() => {
            deletePreset(editing.id);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
          isNew={!presets.some((p) => p.id === editing.id)}
        />
      )}

      {!compact && (
        <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ width: 220 }}>
            <Num id="ui-sweephz" label="commits per second while running" value={ui.sweepHz} min={1} max={30} step={1} unit="int" onChange={(v) => v != null && setUi({ sweepHz: v })} />
          </div>
          <div style={{ width: 220 }}>
            <Num id="ui-drag" label="drag sensitivity (× distance)" value={ui.dragSensitivity} min={0.25} max={4} step={0.25} decimals={2} onChange={(v) => v != null && setUi({ dragSensitivity: v })} />
          </div>
          <div className="caption" style={{ maxWidth: 420 }}>
            Hotkeys on the active input: {HOTKEY_HINTS.toggle} run or pause · {HOTKEY_HINTS.stop} stop · {HOTKEY_HINTS.prev} / {HOTKEY_HINTS.next} previous or next preset · {HOTKEY_HINTS.all} pause or resume everything · {HOTKEY_HINTS.undo} / {HOTKEY_HINTS.redo} undo and redo any input change · {HOTKEY_HINTS.views} previous or next view.
          </div>
        </div>
      )}
      {!compact && (
        <div className="caption">
          Linked inputs: {Object.keys(links).length === 0 ? "none" : Object.entries(links).map(([k, v]) => `${PARAM_DEFS.find((d) => d.key === k)?.label ?? k} → ${presets.find((p) => p.id === v)?.name ?? v}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function PresetEditor({ preset, onChange, onSave, onDelete, onCancel, isNew }: { preset: SweepPreset; onChange: (p: SweepPreset) => void; onSave: () => void; onDelete: () => void; onCancel: () => void; isNew: boolean }) {
  const set = (patch: Partial<SweepPreset>) => onChange({ ...preset, ...patch });
  const mode = preset.range.mode;
  const fraction = mode === "fraction";
  return (
    <div className="preset-editor">
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="mini-field">
          <span>name</span>
          <input type="text" value={preset.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="mini-field">
          <span>kind</span>
          <select value={preset.kind} onChange={(e) => set({ kind: e.target.value as SweepKind })}>
            <option value="loop">loop (wrap to the start)</option>
            <option value="pingpong">ping-pong (reverse at the ends)</option>
            <option value="scenarios">scenarios (hold a few spots)</option>
          </select>
        </label>
        <label className="mini-field">
          <span>range</span>
          <select value={mode} onChange={(e) => set({ range: e.target.value === "full" ? { mode: "full" } : { mode: e.target.value as "fraction" | "absolute", lo: e.target.value === "fraction" ? 0.25 : preset.range.lo ?? 0, hi: e.target.value === "fraction" ? 0.75 : preset.range.hi ?? 1 } })}>
            <option value="full">whole range of the input</option>
            <option value="fraction">part of the range (fractions)</option>
            <option value="absolute">absolute values of the input</option>
          </select>
        </label>
        {mode !== "full" && (
          <>
            <div style={{ width: 150 }}>
              <Num id={`pe-lo-${preset.id}`} label="from" value={preset.range.lo ?? 0} min={fraction ? 0 : -1e6} max={fraction ? 1 : 1e6} step={fraction ? 0.01 : 0.001} slider={fraction} decimals={fraction ? 2 : 4} onChange={(v) => v != null && set({ range: { ...preset.range, lo: v } })} />
            </div>
            <div style={{ width: 150 }}>
              <Num id={`pe-hi-${preset.id}`} label="to" value={preset.range.hi ?? 1} min={fraction ? 0 : -1e6} max={fraction ? 1 : 1e6} step={fraction ? 0.01 : 0.001} slider={fraction} decimals={fraction ? 2 : 4} onChange={(v) => v != null && set({ range: { ...preset.range, hi: v } })} />
            </div>
          </>
        )}
      </div>
      {preset.kind !== "scenarios" ? (
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 200 }}>
            <Num id={`pe-step-${preset.id}`} label="step, share of the range" value={preset.stepFraction} min={0.001} max={0.5} step={0.001} unit="pct2" decimals={1} onChange={(v) => v != null && set({ stepFraction: v })} />
          </div>
          <div style={{ width: 200 }}>
            <Num id={`pe-int-${preset.id}`} label="every (ms)" value={preset.intervalMs} min={10} max={10000} step={10} unit="int" onChange={(v) => v != null && set({ intervalMs: v })} />
          </div>
          <label className="mini-field check">
            <input type="checkbox" checked={preset.smooth} onChange={(e) => set({ smooth: e.target.checked })} /> glide between steps
          </label>
        </div>
      ) : (
        <div className="scenario-list">
          {preset.scenarios.map((sc, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 170 }}>
                <Num
                  id={`pe-at-${preset.id}-${i}`}
                  label={mode === "absolute" ? "value" : "position (0 to 1)"}
                  value={sc.at}
                  min={mode === "absolute" ? -1e6 : 0}
                  max={mode === "absolute" ? 1e6 : 1}
                  step={mode === "absolute" ? 0.001 : 0.01}
                  slider={mode !== "absolute"}
                  decimals={mode === "absolute" ? 4 : 2}
                  onChange={(v) => v != null && set({ scenarios: preset.scenarios.map((x, j) => (j === i ? { ...x, at: v } : x)) })}
                />
              </div>
              <div style={{ width: 170 }}>
                <Num id={`pe-hold-${preset.id}-${i}`} label="hold (ms)" value={sc.holdMs} min={50} max={60000} step={50} unit="int" onChange={(v) => v != null && set({ scenarios: preset.scenarios.map((x, j) => (j === i ? { ...x, holdMs: v } : x)) })} />
              </div>
              <button type="button" className="btn small quiet" onClick={() => set({ scenarios: preset.scenarios.filter((_, j) => j !== i) })}>
                remove
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set({ scenarios: [...preset.scenarios, { at: mode === "absolute" ? (preset.range.lo ?? 0) : 0.5, holdMs: 2000 }] })}>
            add a spot
          </button>
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small primary" onClick={onSave}>
          {isNew ? "Create" : "Save"}
        </button>
        <button type="button" className="btn small quiet" onClick={onCancel}>
          Cancel
        </button>
        {!isNew && (
          <button type="button" className="btn small quiet" onClick={onDelete} style={{ marginLeft: "auto", color: "var(--loss)" }}>
            Delete preset
          </button>
        )}
      </div>
    </div>
  );
}
