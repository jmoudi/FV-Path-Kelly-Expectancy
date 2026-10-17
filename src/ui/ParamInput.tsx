import { DEFAULT_PARAMS, inputConfig, PARAM_BY_KEY, type Params } from "../model/params";
import { useStore } from "../state/store";
import { Help } from "./Help";
import { NumberField } from "./NumberField";

/** One parameter from the schema, rendered as the synthetic number input (or a select). */
export function ParamInput({ k, compact, bare }: { k: keyof Params; compact?: boolean; bare?: boolean }) {
  const def = PARAM_BY_KEY[k];
  const value = useStore((s) => s.params[k]);
  const setParam = useStore((s) => s.setParam);
  const badge = def.affectsAll && !bare ? <span className="badge-all" title="This input enters the deck's policies, so every section moves with it.">all sections</span> : null;

  if (def.unit === "choice") {
    return (
      <div className={`param${compact ? " compact" : ""}`}>
        {!bare && (
          <div className="param-label">
            <span>{def.label}</span>
            {badge}
            <Help text={def.help} />
          </div>
        )}
        <select id={`param-${k}`} value={String(value)} onChange={(e) => setParam(k, e.target.value as Params[typeof k])} aria-label={def.label}>
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
  const label = bare ? (
    <span className="nf-short" title={def.label}>
      {def.short ?? def.label}
    </span>
  ) : (
    <>
      <span>{def.label}</span>
      {def.short && <span className="sym">{def.short}</span>}
    </>
  );
  return (
    <NumberField
      id={`param-${k}`}
      inputKey={k}
      label={label}
      value={num}
      min={def.min}
      max={def.max}
      step={def.step}
      unit={def.unit}
      config={inputConfig(def)}
      onChange={(v) => setParam(k, v as Params[typeof k])}
      defaultValue={typeof DEFAULT_PARAMS[k] === "number" ? (DEFAULT_PARAMS[k] as number) : undefined}
      compact={compact || bare}
      extra={
        bare ? undefined : (
          <>
            {badge}
            <Help text={def.help} />
          </>
        )
      }
      ariaLabel={def.label}
    />
  );
}
