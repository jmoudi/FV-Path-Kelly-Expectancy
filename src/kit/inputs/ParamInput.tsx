import { useMemo } from "react";
import { inputConfig } from "./schema";
import { useKit, useKitCopy, useSchema } from "@kit/state/context";
import { Help } from "@kit/ui/Help";
import { NumberField } from "./NumberField";
import { effectiveSettings } from "./paramSettings";
import { ParamSettingsButton } from "./ParamSettings";
import { LockToggle, useLocked, useRefusalShake } from "./locks";

/**
 * One parameter from the schema, rendered as the synthetic number input (or a select).
 * `bare` is the reduced deck's form: the word label and symbol, no help or badge.
 * `id` names the box when the same input is rendered twice (the deck's drawer); it
 * defaults to `param-<key>`. `withSettings` adds the "⚙" that opens the parameter's
 * settings (the drawer's fields).
 *
 * The field reads the parameter's effective settings: the person's own (the store's
 * `paramSettings`) over the schema's `input` defaults.
 *
 * Every field carries its padlock (kit/inputs/locks.tsx): on hover or focus, and in the
 * accent while the parameter is locked; the bare form shows it only then.
 */
export function ParamInput({ k, compact, bare, id, withSettings }: { k: string; compact?: boolean; bare?: boolean; id?: string; withSettings?: boolean }) {
  const schema = useSchema();
  const copy = useKitCopy();
  const def = schema.byKey[k];
  const boxId = id ?? `param-${k}`;
  const value = useKit((s) => s.params[k]);
  const setParam = useKit((s) => s.setParam);
  const user = useKit((s) => s.paramSettings?.[k]);
  const locked = useLocked(k);
  const feel = useMemo(() => (def.unit === "choice" ? null : effectiveSettings(def, user)), [def, user]);
  const badge = def.affectsAll && !bare ? <span className="badge-all" title={copy.affectsAllTitle}>{copy.affectsAllBadge}</span> : null;
  const selectRef = useRefusalShake<HTMLDivElement>((e) => e.key === k);

  if (def.unit === "choice" || !feel) {
    return (
      <div ref={selectRef} className={`param${compact ? " compact" : ""}${locked ? " locked" : ""}`}>
        {!bare && (
          <div className="param-label">
            <span>{def.label}</span>
            {badge}
            <Help text={def.help} />
            <LockToggle k={k} />
          </div>
        )}
        <select id={boxId} value={String(value)} onChange={(e) => setParam(k, e.target.value)} aria-label={def.label} title={locked ? "Locked: unlock it to change it" : undefined}>
          {def.choices?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const num = typeof value === "number" ? value : def.min;
  // Readable in both modes: the name, then the symbol the charts use.
  const label = (
    <>
      <span title={bare ? def.label : undefined}>{bare ? (def.shortLabel ?? def.label) : def.label}</span>
      {def.short && <span className="sym">{def.short}</span>}
    </>
  );
  return (
    <NumberField
      id={boxId}
      inputKey={k}
      label={label}
      value={num}
      min={def.min}
      max={def.max}
      step={feel.step}
      unit={def.unit}
      config={{ ...inputConfig(def), slider: feel.slider, perHundredPx: feel.dragPerHundredPx, wheelStep: feel.wheelStep, fineStep: feel.fineStep, decimals: feel.decimals }}
      onChange={(v) => setParam(k, v)}
      defaultValue={typeof schema.defaults[k] === "number" ? (schema.defaults[k] as number) : undefined}
      compact={compact || bare}
      extra={
        bare ? (
          <LockToggle k={k} onlyWhenLocked />
        ) : (
          <>
            {badge}
            <Help text={def.help} />
            <LockToggle k={k} />
            {withSettings && <ParamSettingsButton k={k} />}
          </>
        )
      }
      ariaLabel={def.label}
    />
  );
}
