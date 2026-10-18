import { useState, type ReactNode } from "react";
import { BACKEND_INFO } from "@kit/charts/registry";
import type { BackendId } from "@kit/charts/spec";
import { KeyLegend, Segmented, SettingRow, SettingsGroup, SettingsLayout, type KeyBinding } from "./Settings";
import { useKit, useKitCopy, useSchema } from "@kit/state/context";
import { ImportExportBody } from "./Dialogs";
import { Num } from "@kit/inputs/Num";
import { ParamInput } from "@kit/inputs/ParamInput";
import { ParamSettingsTable } from "@kit/inputs/ParamSettings";
import { SweepPanel } from "@kit/sweeps/SweepPanel";
import { HOTKEY_HINTS } from "@kit/sweeps/useSweeps";

const BACKENDS: BackendId[] = ["echarts", "plotly", "vega"];

/** A reset with a confirm step. */
function ResetButton({ label, confirmLabel, keepLabel, onConfirm, disabled }: { label: string; confirmLabel: string; keepLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button type="button" className="btn small" disabled={disabled} onClick={() => setConfirm(true)}>
        {label}
      </button>
    );
  return (
    <span className="row">
      <button
        type="button"
        className="btn small primary"
        onClick={() => {
          onConfirm();
          setConfirm(false);
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn small quiet" onClick={() => setConfirm(false)}>
        {keepLabel}
      </button>
    </span>
  );
}

/** Default backend, and the feel of inputs and sweeps: shared by both views. */
function EverydayGroups({ compact }: { compact?: boolean }) {
  const defaultBackend = useKit((s) => s.defaultBackend);
  const setDefaultBackend = useKit((s) => s.setDefaultBackend);
  const ui = useKit((s) => s.ui);
  const setUi = useKit((s) => s.setUi);
  return (
    <>
      <SettingsGroup id="set-backend" title="Default backend" blurb={compact ? undefined : "Every chart is a renderer-agnostic definition routed through one of these. ⚙ on a chart overrides it for that chart."}>
        <Segmented<BackendId> ariaLabel="Default backend" options={BACKENDS.map((b) => ({ value: b, label: BACKEND_INFO[b].label, title: BACKEND_INFO[b].blurb }))} value={defaultBackend === "table" ? "echarts" : defaultBackend} onChange={setDefaultBackend} />
        <p className="caption">{BACKEND_INFO[defaultBackend].blurb}</p>
      </SettingsGroup>
      <SettingsGroup id="set-feel" title="Inputs and sweeps">
        <SettingRow label="Drag sensitivity" hint="× each input's units per 100 px of drag (Shift for fine)">
          <Num id="ui-drag" value={ui.dragSensitivity} min={0.25} max={4} step={0.25} decimals={2} slider={false} onChange={(v) => v != null && setUi({ dragSensitivity: v })} />
        </SettingRow>
        <SettingRow label="Sweep rate" hint="× each preset's speed: 2 shows every value half as long">
          <Num id="ui-sweepspeed" value={ui.sweepSpeed} min={0.25} max={4} step={0.25} decimals={2} slider={false} onChange={(v) => v != null && setUi({ sweepSpeed: v })} />
        </SettingRow>
        {!compact && (
          <SettingRow label="At most, values a second" hint="a cap on any sweep, whatever its preset and rate">
            <Num id="ui-sweephz" value={ui.sweepHz} min={1} max={30} step={1} unit="int" slider={false} onChange={(v) => v != null && setUi({ sweepHz: v })} />
          </SettingRow>
        )}
      </SettingsGroup>
    </>
  );
}

/** The resets, each with a confirm step: shared by both views. */
function ResetGroup({ compact }: { compact?: boolean }) {
  const clearAllOverrides = useKit((s) => s.clearAllOverrides);
  const resetParams = useKit((s) => s.resetParams);
  const resetEverything = useKit((s) => s.resetEverything);
  const edited = useKit((s) => Object.keys(s.overrides).length);
  const copy = useKitCopy();
  return (
    <>
      <SettingsGroup id="set-reset" title="Reset">
        <div className="reset-list">
          <ResetButton label={copy.resetParamsButton} confirmLabel={copy.resetParamsConfirm} keepLabel="Keep mine" onConfirm={resetParams} />
          <ResetButton label={edited ? `Reset chart edits (${edited})` : "No chart edits to reset"} confirmLabel="Yes, reset every chart" keepLabel="Keep them" onConfirm={clearAllOverrides} disabled={!edited} />
          <ResetButton label="Forget everything saved" confirmLabel="Yes, forget parameters, edits, presets and data" keepLabel="Keep it" onConfirm={resetEverything} />
        </div>
        {!compact && <p className="caption">Opening the app with #reset in the address forgets everything too.</p>}
      </SettingsGroup>
    </>
  );
}

/** The reduced settings in the ⚙ dialog: exactly the four everyday settings. */
export function QuickSettings() {
  return (
    <SettingsLayout compact>
      <EverydayGroups compact />
      <ResetGroup compact />
    </SettingsLayout>
  );
}

const KEYS: KeyBinding[] = [
  { keys: ["[", "]"], action: "Previous or next view", scope: "outside a text field" },
  { keys: [HOTKEY_HINTS.undo], action: "Undo a parameter change", scope: "outside a text field" },
  { keys: [HOTKEY_HINTS.redo], action: "Redo", scope: "outside a text field" },
  { keys: [HOTKEY_HINTS.toggle], action: "Run or pause the linked sweep", scope: "on the active input" },
  { keys: [HOTKEY_HINTS.stop], action: "Stop the sweep", scope: "on the active input" },
  { keys: [HOTKEY_HINTS.prev, HOTKEY_HINTS.next], action: "Previous or next preset", scope: "on the active input" },
  { keys: [HOTKEY_HINTS.all], action: "Pause or resume every sweep" },
  { keys: ["Esc"], action: "Close a popover, a menu, a dialog or the full deck" },
];

/** The full settings page: the four everyday settings plus presets, engine, data, state, hotkeys. */
export function FullSettings({ data }: { data?: ReactNode } = {}) {
  const schema = useSchema();
  const copy = useKitCopy();
  const engine = schema.defs.filter((d) => d.tier === "advanced");
  return (
    <SettingsLayout>
      <EverydayGroups />
      <SettingsGroup id="set-engine" title="Engine" blurb={copy.engineSettingsBlurb}>
        <div className="plain-params">
          {engine.map((d) => (
            <ParamInput key={d.key} k={d.key} compact />
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup id="set-keys" title="Hotkeys">
        <KeyLegend bindings={KEYS} />
      </SettingsGroup>
      {/* Parameter settings: how each parameter is edited by hand. Separate from the presets below, which keep their own step. */}
      <SettingsGroup id="set-params" title="Parameters" blurb="How each parameter moves when you edit it by hand: the step (the wheel, the arrow keys and the drag land on its multiples), the fine step with Shift, one wheel notch, the drag speed, the decimals shown and the slider. A blank box is the default: the line under the range gives it, and the box shows it while you work in its row. Sweep presets keep their own step and timing." wide>
        <ParamSettingsTable />
      </SettingsGroup>
      <SettingsGroup id="set-presets" title="Sweep presets" blurb="A preset drives the active input on its own, in the input's own units. Link one to an input, then run it from the deck's strip or with the hotkeys above." wide>
        <SweepPanel />
      </SettingsGroup>
      {data}
      <SettingsGroup id="set-io" title="Import and export">
        <ImportExportBody />
      </SettingsGroup>
      <ResetGroup />
    </SettingsLayout>
  );
}
