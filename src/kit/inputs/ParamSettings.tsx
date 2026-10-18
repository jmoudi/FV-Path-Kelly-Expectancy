/**
 * The editors of parameter settings (kit/inputs/paramSettings.ts): the "⚙" beside a
 * field that opens "Settings for <parameter>" in a popover, and the table of every
 * parameter for the Settings page. Both edit the store's `paramSettings` and show the
 * schema's defaults as placeholders; a blank box is the default. Nothing here touches
 * the sweeps: a preset keeps its own step and timing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useKit, useSchema } from "@kit/state/context";
import { Icon } from "@kit/ui/Icon";
import { Popover } from "@kit/ui/Popover";
import { Link } from "@kit/ui/Link";
import { toDisplay, suffix as unitSuffix } from "./display";
import { Num } from "./Num";
import { effectiveSettings, hasSettings, schemaSettings, type ParamSettingKey, type ParamSettings as Settings } from "./paramSettings";
import { Segmented } from "@kit/ui/Settings";
import type { ParamDef } from "./schema";
import "./param-settings.css";

type NumericKey = Exclude<ParamSettingKey, "slider">;

/** What each setting is called, and the hint under its name in the popover. */
export const SETTING_TEXT: Record<ParamSettingKey, { label: string; hint: string }> = {
  step: { label: "Step", hint: "wheel, arrows and drag land on its multiples" },
  fineStep: { label: "Fine step", hint: "the step with Shift held" },
  wheelStep: { label: "Wheel step", hint: "one notch, a whole number of steps" },
  dragPerHundredPx: { label: "Drag per 100 px", hint: "× the drag sensitivity in Settings" },
  decimals: { label: "Decimals", hint: "shown in the box" },
  slider: { label: "Slider", hint: "the drag track beside the box" },
};

const NUMERIC: NumericKey[] = ["step", "fineStep", "wheelStep", "dragPerHundredPx", "decimals"];
const isPercent = (unit: string) => unit === "pct" || unit === "pct2";

/** The sign after a change of this parameter: "pp" for a percentage, the unit's sign otherwise. */
function deltaSign(def: ParamDef<any>): string {
  return isPercent(def.unit) ? " pp" : unitSuffix(def.unit);
}

/** Digits a value needs in display units (2 for 0.05 pp, 0 for 5 nights), at most 5. */
function digitsOf(v: number, unit: string): number {
  const x = Math.abs(isPercent(unit) ? v * 100 : v);
  for (let d = 0; d < 5; d++) {
    const s = x * Math.pow(10, d);
    if (Math.abs(s - Math.round(s)) < 1e-6 * Math.max(1, s)) return d;
  }
  return 5;
}

/** "0.05 pp", "5", "0.25σ": a step-like setting as its placeholder reads. */
function deltaText(def: ParamDef<any>, v: number): string {
  return `${toDisplay(v, def.unit, digitsOf(v, def.unit))}${deltaSign(def)}`;
}

/** "0.1% – 8%", "5 – 60": the schema's range in the parameter's units. */
export function rangeText(def: ParamDef<any>): string {
  const d = Math.max(digitsOf(def.min, def.unit), digitsOf(def.max, def.unit));
  const sign = unitSuffix(def.unit);
  return `${toDisplay(def.min, def.unit, d)}${sign} – ${toDisplay(def.max, def.unit, d)}${sign}`;
}

/** "step 0.05 pp · drag 0.25 pp": the defaults a parameter sets for itself, said once per row of the table (the rest follow from the step). */
export function defaultsText(def: ParamDef<any>): string {
  const d = schemaSettings(def);
  return `step ${deltaText(def, d.step)} · drag ${deltaText(def, d.dragPerHundredPx)}${d.slider ? "" : " · no slider"}`;
}

/**
 * One setting's box (or the slider's choice) for one parameter. In the popover the slider
 * is a select; in the table a three-way switch (default · on · off).
 */
function SettingField({ def, which, user, idBase, inTable }: { def: ParamDef<any>; which: ParamSettingKey; user: Settings | undefined; idBase: string; inTable?: boolean }) {
  const setParamSettings = useKit((s) => s.setParamSettings);
  const key = def.key;
  // What a blank box stands for: the value this setting resolves to without the person's own.
  const fallback = useMemo(() => {
    const rest: Settings = { ...(user ?? {}) };
    delete rest[which];
    return effectiveSettings(def, rest);
  }, [def, user, which]);
  const text = SETTING_TEXT[which];
  const id = `${idBase}-${which}`;
  const aria = `${text.label} for ${def.label}`;
  if (which === "slider") {
    const v = user?.slider;
    if (inTable)
      return (
        <Segmented<"" | "on" | "off">
          ariaLabel={aria}
          value={v == null ? "" : v ? "on" : "off"}
          options={[
            { value: "", label: "default", title: `The parameter's default: ${fallback.slider ? "on" : "off"}` },
            { value: "on", label: "on" },
            { value: "off", label: "off" },
          ]}
          onChange={(x) => setParamSettings(key, { slider: x === "" ? null : x === "on" })}
        />
      );
    return (
      <select id={id} className="k-ps-select" value={v == null ? "" : v ? "on" : "off"} aria-label={aria} onChange={(e) => setParamSettings(key, { slider: e.target.value === "" ? null : e.target.value === "on" })}>
        <option value="">default ({fallback.slider ? "on" : "off"})</option>
        <option value="on">on</option>
        <option value="off">off</option>
      </select>
    );
  }
  const value = user?.[which] ?? null;
  if (which === "decimals") {
    return <Num id={id} value={value} emptyHint={String(fallback.decimals)} emptyBase={fallback.decimals} min={0} max={6} step={1} unit="int" slider={false} ariaLabel={aria} onChange={(v) => setParamSettings(key, { decimals: v })} />;
  }
  const int = def.unit === "int";
  const span = def.max - def.min;
  // The settings box itself moves in fifths of the schema step (whole units for a count).
  const quantum = int ? 1 : Number((def.step / 5).toPrecision(12));
  const base = fallback[which];
  const shown = value ?? base;
  return (
    <Num
      id={id}
      value={value}
      emptyHint={deltaText(def, base)}
      emptyBase={base}
      min={quantum}
      max={span > 0 ? span : quantum * 1000}
      step={quantum}
      unit={def.unit}
      decimals={Math.max(digitsOf(shown, def.unit), digitsOf(quantum, def.unit))}
      suffix={deltaSign(def)}
      slider={false}
      ariaLabel={aria}
      onChange={(v) => setParamSettings(key, { [which]: v })}
    />
  );
}

/** The six settings of one parameter, labelled, with Reset: the popover's body. */
export function ParamSettingsFields({ k, onClose }: { k: string; onClose?: () => void }) {
  const schema = useSchema();
  const def = schema.byKey[k];
  const user = useKit((s) => s.paramSettings?.[k]);
  const resetParamSettings = useKit((s) => s.resetParamSettings);
  if (!hasSettings(def)) return null;
  const changed = !!user && Object.keys(user).length > 0;
  return (
    <div className="k-ps" role="group" aria-label={`Settings for ${def.label}`}>
      <div className="k-ps-head">
        <h4 className="k-ps-title">
          Settings for {def.label}
          {def.short && <span className="sym"> {def.short}</span>}
        </h4>
        {onClose && (
          <button type="button" className="btn small quiet" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="k-ps-note">How it moves when you edit it by hand. A blank box is the default it shows. Sweeps keep their own step.</p>
      <div className="k-ps-grid">
        {[...NUMERIC, "slider" as const].map((which) => (
          <div key={which} className="k-ps-row">
            <label className="k-ps-label" htmlFor={`ps-${k}-${which}`}>
              <span>{SETTING_TEXT[which].label}</span>
              <span className="k-ps-hint">{SETTING_TEXT[which].hint}</span>
            </label>
            <div className="k-ps-control">
              <SettingField def={def} which={which} user={user} idBase={`ps-${k}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="k-ps-foot">
        <button type="button" className="btn small" disabled={!changed} onClick={() => resetParamSettings(k)}>
          Reset
        </button>
        <span className="caption">
          Range {rangeText(def)} · every parameter: <Link to="#settings">Settings</Link>
        </span>
      </div>
    </div>
  );
}

/**
 * The "⚙" beside a field's label: visible on hover or focus of the field (always on a
 * touch screen), it opens "Settings for <parameter>" in a popover beside the field (a
 * bottom sheet on a narrow screen), so the field stays in view.
 */
export function ParamSettingsButton({ k }: { k: string }) {
  const schema = useSchema();
  const def = schema.byKey[k];
  const changed = useKit((s) => !!s.paramSettings?.[k]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // The popover sits beside the whole field (on the side with more room), so the field stays in view to try the new feel.
  const [field, setField] = useState<HTMLElement | null>(null);
  // Escape closes the popover first: a drawer around the field must not close with it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!hasSettings(def)) return null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`k-ps-gear${changed ? " changed" : ""}`}
        aria-label={`Settings for ${def.label}`}
        aria-expanded={open}
        title={changed ? `Settings for ${def.label} (changed)` : `Settings for ${def.label}: step, wheel, drag, decimals, slider`}
        onClick={() => {
          setField(ref.current?.closest<HTMLElement>(".nf") ?? null);
          setOpen((v) => !v);
        }}
      >
        <Icon name="settings" size={12} />
      </button>
      {open && (
        <Popover anchor={ref.current} beside={field} onClose={() => setOpen(false)} label={`Settings for ${def.label}`} width={360} id={`ps-pop-${k}`}>
          <ParamSettingsFields k={k} onClose={() => setOpen(false)} />
        </Popover>
      )}
    </>
  );
}

/** "Reset all" with a confirm step. */
function ResetAll() {
  const count = useKit((s) => Object.keys(s.paramSettings ?? {}).length);
  const resetParamSettings = useKit((s) => s.resetParamSettings);
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button type="button" className="btn small" disabled={!count} onClick={() => setConfirm(true)}>
        {count ? `Reset all (${count} changed)` : "Reset all"}
      </button>
    );
  return (
    <span className="row">
      <button
        type="button"
        className="btn small primary"
        onClick={() => {
          resetParamSettings();
          setConfirm(false);
        }}
      >
        Yes, every parameter back to its defaults
      </button>
      <button type="button" className="btn small quiet" onClick={() => setConfirm(false)}>
        Keep them
      </button>
    </span>
  );
}

/** Every numeric parameter's settings in one table: name, symbol, range, the six settings, a reset per row. */
export function ParamSettingsTable() {
  const schema = useSchema();
  const all = useKit((s) => s.paramSettings);
  const resetParamSettings = useKit((s) => s.resetParamSettings);
  const defs = schema.defs.filter(hasSettings);
  const cols: ParamSettingKey[] = [...NUMERIC, "slider"];
  return (
    <div className="k-ps-table-wrap">
      <table className="k-ps-table">
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            <th scope="col">Range and defaults</th>
            {cols.map((c) => (
              <th key={c} scope="col">
                {SETTING_TEXT[c].label}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">Reset</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {defs.map((def) => {
            const user = all?.[def.key];
            return (
              <tr key={def.key} className={user ? "changed" : undefined} data-key={def.key}>
                <th scope="row" className="k-ps-name">
                  <span>{def.label}</span>
                  {def.short && <span className="sym">{def.short}</span>}
                </th>
                {/* The range, and the defaults said once: the boxes stay empty until a setting is the person's own. */}
                <td className="k-ps-range">
                  <span>{rangeText(def)}</span>
                  <span className="k-ps-defaults">{defaultsText(def)}</span>
                </td>
                {cols.map((c) => (
                  <td key={c} data-label={SETTING_TEXT[c].label} className={c === "slider" ? "k-ps-slider" : undefined}>
                    <SettingField def={def} which={c} user={user} idBase={`pst-${def.key}`} inTable />
                  </td>
                ))}
                {/* Reset shows only on a row that has settings of its own; the slot stays, so nothing moves. */}
                <td className="k-ps-reset">
                  <button type="button" className="btn small quiet" disabled={!user} onClick={() => resetParamSettings(def.key)} aria-label={`Reset the settings for ${def.label}`}>
                    Reset
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="k-ps-foot">
        <ResetAll />
      </div>
    </div>
  );
}
