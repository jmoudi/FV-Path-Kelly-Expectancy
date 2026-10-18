import { useState } from "react";
import { perHundredPxOf } from "./NumberField";
import { inputConfig, isSweepable, PARAM_BY_KEY, PARAM_DEFS, type ParamDef, type Params } from "../model/params";
import { useStore } from "../state/store";
import { BUILTIN_ANCHORS, clonePreset, isBuiltinAnchor, type AnchorRef, type BuiltinAnchor, type SweepKind, type SweepPreset, type SweepRange, type SweepRangeMode, type SweepSpot } from "../sweeps/types";
import { Num } from "./Num";
import { describeFor, HOTKEY_HINTS } from "./useSweeps";

function newId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

/** The input a description speaks for: the active one, or the deck's loss rate. */
function subjectOf(activeInput: string | null): ParamDef {
  const d = activeInput ? PARAM_BY_KEY[activeInput] : undefined;
  return d && isSweepable(d) ? d : PARAM_BY_KEY.lossRate;
}

/** Every anchor a preset can name: the subject's own first, then the rest of the schema's, then the built-ins. */
function anchorChoices(subject: ParamDef): { id: string; label: string; own: boolean }[] {
  const own = (subject.anchors ?? []).map((a) => ({ id: a.id, label: a.label, own: true }));
  const others: { id: string; label: string; own: boolean }[] = [];
  for (const d of PARAM_DEFS) for (const a of d.anchors ?? []) if (!own.some((o) => o.id === a.id) && !others.some((o) => o.id === a.id)) others.push({ id: a.id, label: `${a.label} (${d.shortLabel ?? d.label})`, own: false });
  return [...own, ...BUILTIN_ANCHORS.map((b) => ({ id: b.id, label: b.label, own: true })), ...others];
}

/** A named anchor falls back to the built-in at the same end; "deck" to the current value. */
function refFor(id: string, end: "lo" | "hi" | "spot"): AnchorRef {
  if (isBuiltinAnchor(id)) return { id, fallback: id };
  const fallback: BuiltinAnchor = id === "deck" ? "current" : end === "lo" ? "min" : end === "hi" ? "max" : "current";
  return { id, fallback };
}

const RANGE_MODES: { mode: SweepRangeMode; label: string }[] = [
  { mode: "anchors", label: "between two anchors" },
  { mode: "around", label: "± around the current value" },
  { mode: "absolute", label: "between two values" },
  { mode: "fraction", label: "part of the input's range" },
  { mode: "full", label: "the whole range" },
];

function rangeFor(mode: SweepRangeMode, subject: ParamDef, value: number): SweepRange {
  switch (mode) {
    case "anchors": {
      const own = subject.anchors ?? [];
      return { mode, lo: refFor(own[0]?.id ?? "min", "lo"), hi: refFor(own[own.length - 1]?.id ?? "max", "hi") };
    }
    case "around":
      return { mode, half: 0.2, unit: "share" };
    case "absolute": {
      const half = (subject.max - subject.min) / 10;
      return { mode, lo: Math.max(subject.min, value - half), hi: Math.min(subject.max, value + half) };
    }
    case "fraction":
      return { mode, lo: 0.25, hi: 0.75 };
    default:
      return { mode: "full" };
  }
}

/**
 * Create, edit, delete and link sweep presets. Lives in Settings and in the full deck.
 * Each preset is described in the active input's own units ("step 0.05 pp every
 * 400 ms"), so it reads the same way it will run.
 */
export function SweepPanel({ compact }: { compact?: boolean }) {
  const presets = useStore((s) => s.presets);
  const links = useStore((s) => s.links);
  const runs = useStore((s) => s.runs);
  const params = useStore((s) => s.params);
  const activeInput = useStore((s) => s.activeInput);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const upsertPreset = useStore((s) => s.upsertPreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const linkPreset = useStore((s) => s.linkPreset);
  const toggleSweep = useStore((s) => s.toggleSweep);
  const stopSweep = useStore((s) => s.stopSweep);
  const [editing, setEditing] = useState<SweepPreset | null>(null);
  const activeDef = activeInput ? PARAM_BY_KEY[activeInput] : undefined;
  const sweepable = !!activeDef && isSweepable(activeDef);
  const subject = subjectOf(activeInput);

  const startEdit = (p?: SweepPreset) =>
    setEditing(p ? clonePreset(p) : { id: newId(), name: "New sweep", kind: "loop", range: { mode: "around", half: 0.1, unit: "share" }, step: { size: subject.step, unit: "units" }, intervalMs: 400, scenarios: [] });

  return (
    <div className="sweeps">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          {!compact && <h4 style={{ margin: 0 }}>Sweep presets</h4>}
          <p className="caption" style={{ margin: "2px 0 0" }}>
            {!compact && "A preset drives an input automatically, in the input's own units. "}
            Active input: <b>{activeDef ? activeDef.label : "none (focus an input)"}</b>
            {activeDef && !sweepable ? " (not swept)" : ""}
            {!sweepable && `; descriptions read for ${subject.label}`}.
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
                <span className="caption preset-desc">{describeFor(subject.key, p, params)}</span>
                {linkedKeys.length > 0 && <span className="caption">linked to {linkedKeys.join(", ")}</span>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                {activeInput && sweepable && (
                  <>
                    <button type="button" className={`btn small${isLinked ? " primary" : ""}`} onClick={() => linkPreset(activeInput, isLinked ? null : p.id)}>
                      {isLinked ? "linked" : `link to ${activeDef?.shortLabel ?? activeDef?.label ?? "input"}`}
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
          subject={subject}
          params={params}
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
            <Num id="ui-sweepspeed" label="sweep rate (× preset speed)" value={ui.sweepSpeed} min={0.25} max={4} step={0.25} decimals={2} onChange={(v) => v != null && setUi({ sweepSpeed: v })} />
          </div>
          <div style={{ width: 220 }}>
            <Num id="ui-sweephz" label="at most, values per second" value={ui.sweepHz} min={1} max={30} step={1} unit="int" onChange={(v) => v != null && setUi({ sweepHz: v })} />
          </div>
          <div style={{ width: 220 }}>
            <Num id="ui-drag" label="drag speed (× units per 100 px)" value={ui.dragSensitivity} min={0.25} max={4} step={0.25} decimals={2} onChange={(v) => v != null && setUi({ dragSensitivity: v })} />
          </div>
          <div className="caption" style={{ maxWidth: 460 }}>
            Hotkeys on the active input: {HOTKEY_HINTS.toggle} run or pause · {HOTKEY_HINTS.stop} stop and keep the value · {HOTKEY_HINTS.prev} / {HOTKEY_HINTS.next} previous or next preset · {HOTKEY_HINTS.all} pause or resume everything · {HOTKEY_HINTS.undo} put a swept input back where it was before the sweep, otherwise undo · {HOTKEY_HINTS.redo} redo · {HOTKEY_HINTS.views} previous or next view.
          </div>
        </div>
      )}
      {!compact && (
        <div className="caption">
          Linked inputs: {Object.keys(links).length === 0 ? "none" : Object.entries(links).map(([k, v]) => `${PARAM_BY_KEY[k]?.label ?? k} → ${presets.find((p) => p.id === v)?.name ?? v}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function PresetEditor({ preset, subject, params, onChange, onSave, onDelete, onCancel, isNew }: { preset: SweepPreset; subject: ParamDef; params: Params; onChange: (p: SweepPreset) => void; onSave: () => void; onDelete: () => void; onCancel: () => void; isNew: boolean }) {
  const set = (patch: Partial<SweepPreset>) => onChange({ ...preset, ...patch });
  const r = preset.range;
  const value = params[subject.key] as number;
  const anchors = anchorChoices(subject);
  const unitDrag = perHundredPxOf(inputConfig(subject), subject.min, subject.max);
  const inUnits = (id: string, label: string, v: number, onV: (v: number) => void, delta = false) => (
    <Num id={id} label={label} value={v} min={delta ? 0 : subject.min} max={delta ? subject.max - subject.min : subject.max} step={subject.step / (subject.unit === "int" ? 1 : 5)} unit={subject.unit} perHundredPx={unitDrag} onChange={(x) => x != null && onV(x)} />
  );
  const anchorSelect = (label: string, ref: AnchorRef, end: "lo" | "hi" | "spot", onRef: (a: AnchorRef) => void) => (
    <label className="mini-field">
      <span>{label}</span>
      <select value={ref.id} onChange={(e) => onRef(refFor(e.target.value, end))}>
        {!anchors.some((a) => a.id === ref.id) && <option value={ref.id}>{ref.id}</option>}
        {anchors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
  const spotSource = (sc: SweepSpot) => (sc.anchor ? sc.anchor.id : "__value");
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
            <option value="scenarios">spots (hold a few values)</option>
          </select>
        </label>
        {preset.kind !== "scenarios" && (
          <label className="mini-field">
            <span>range</span>
            <select value={r.mode} onChange={(e) => set({ range: rangeFor(e.target.value as SweepRangeMode, subject, value) })}>
              {RANGE_MODES.map((m) => (
                <option key={m.mode} value={m.mode}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {preset.kind !== "scenarios" && r.mode === "anchors" && (
          <>
            {anchorSelect("from", r.lo, "lo", (lo) => set({ range: { ...r, lo } }))}
            {anchorSelect("to", r.hi, "hi", (hi) => set({ range: { ...r, hi } }))}
          </>
        )}
        {preset.kind !== "scenarios" && r.mode === "around" && (
          <>
            <div style={{ width: 160 }}>
              {r.unit === "share" ? (
                <Num id={`pe-half-${preset.id}`} label="± share of the range" value={r.half} min={0} max={1} step={0.01} unit="pct" onChange={(v) => v != null && set({ range: { ...r, half: v } })} />
              ) : (
                inUnits(`pe-half-${preset.id}`, `± in ${subject.label.toLowerCase()} units`, r.half, (v) => set({ range: { ...r, half: v } }), true)
              )}
            </div>
            <label className="mini-field">
              <span>±, in</span>
              <select value={r.unit} onChange={(e) => set({ range: { ...r, unit: e.target.value as "share" | "units", half: e.target.value === "share" ? 0.2 : (subject.max - subject.min) * 0.2 } })}>
                <option value="share">share of the input's range</option>
                <option value="units">the input's units</option>
              </select>
            </label>
          </>
        )}
        {preset.kind !== "scenarios" && r.mode === "absolute" && (
          <>
            <div style={{ width: 160 }}>{inUnits(`pe-lo-${preset.id}`, "from", r.lo, (v) => set({ range: { ...r, lo: v } }))}</div>
            <div style={{ width: 160 }}>{inUnits(`pe-hi-${preset.id}`, "to", r.hi, (v) => set({ range: { ...r, hi: v } }))}</div>
          </>
        )}
        {preset.kind !== "scenarios" && r.mode === "fraction" && (
          <>
            <div style={{ width: 150 }}>
              <Num id={`pe-lo-${preset.id}`} label="from (share)" value={r.lo} min={0} max={1} step={0.01} unit="pct" onChange={(v) => v != null && set({ range: { ...r, lo: v } })} />
            </div>
            <div style={{ width: 150 }}>
              <Num id={`pe-hi-${preset.id}`} label="to (share)" value={r.hi} min={0} max={1} step={0.01} unit="pct" onChange={(v) => v != null && set({ range: { ...r, hi: v } })} />
            </div>
          </>
        )}
      </div>
      {preset.kind !== "scenarios" ? (
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 180 }}>
            {preset.step.unit === "units" ? (
              inUnits(`pe-step-${preset.id}`, "step", preset.step.size, (v) => set({ step: { ...preset.step, size: Math.max(v, 1e-9) } }), true)
            ) : (
              <Num id={`pe-step-${preset.id}`} label="step, share of the swept range" value={preset.step.size} min={0.005} max={0.5} step={0.005} unit="pct" decimals={1} onChange={(v) => v != null && set({ step: { ...preset.step, size: v } })} />
            )}
          </div>
          <label className="mini-field">
            <span>step, in</span>
            <select value={preset.step.unit} onChange={(e) => set({ step: e.target.value === "share" ? { size: 0.05, unit: "share" } : { size: subject.step, unit: "units" } })}>
              <option value="units">the input's units</option>
              <option value="share">share of the swept range</option>
            </select>
          </label>
          <div style={{ width: 170 }}>
            <Num id={`pe-int-${preset.id}`} label="each value at least (ms)" value={preset.intervalMs} min={50} max={10000} step={50} unit="int" onChange={(v) => v != null && set({ intervalMs: v })} />
          </div>
        </div>
      ) : (
        <div className="scenario-list">
          {preset.scenarios.map((sc, i) => {
            const update = (patch: Partial<SweepSpot>) => set({ scenarios: preset.scenarios.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="mini-field">
                  <span>spot {i + 1}</span>
                  <select
                    value={spotSource(sc)}
                    onChange={(e) => {
                      if (e.target.value === "__value") {
                        const { anchor: _drop, ...rest } = sc;
                        void _drop;
                        set({ range: { mode: "absolute", lo: subject.min, hi: subject.max }, scenarios: preset.scenarios.map((x, j) => (j === i ? { ...rest, at: value } : x)) });
                      } else update({ anchor: refFor(e.target.value, "spot") });
                    }}
                  >
                    {anchors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                    <option value="__value">a value…</option>
                  </select>
                </label>
                {!sc.anchor && (
                  <div style={{ width: 150 }}>
                    {preset.range.mode === "absolute" ? (
                      inUnits(`pe-at-${preset.id}-${i}`, "value", sc.at, (v) => update({ at: v }))
                    ) : (
                      <Num id={`pe-at-${preset.id}-${i}`} label="share of the range" value={sc.at} min={0} max={1} step={0.01} unit="pct" onChange={(v) => v != null && update({ at: v })} />
                    )}
                  </div>
                )}
                <div style={{ width: 150 }}>
                  <Num id={`pe-hold-${preset.id}-${i}`} label="hold (ms)" value={sc.holdMs} min={50} max={60000} step={50} unit="int" onChange={(v) => v != null && update({ holdMs: v })} />
                </div>
                <button type="button" className="btn small quiet" onClick={() => set({ scenarios: preset.scenarios.filter((_, j) => j !== i) })}>
                  remove
                </button>
              </div>
            );
          })}
          <button type="button" className="btn small" onClick={() => set({ scenarios: [...preset.scenarios, { anchor: refFor("current", "spot"), at: 0.5, holdMs: 2000 }] })}>
            add a spot
          </button>
        </div>
      )}
      <p className="caption preset-desc" style={{ margin: 0 }}>
        On {subject.label}: {describeFor(subject.key, preset, params)}. A named anchor an input lacks falls back to its min, current value or max.
      </p>
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
