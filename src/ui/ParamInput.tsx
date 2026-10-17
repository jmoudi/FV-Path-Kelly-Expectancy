import { useEffect, useRef, useState } from "react";
import { PARAM_BY_KEY, type ParamDef, type Params } from "../model/params";
import { useStore } from "../state/store";
import { Help } from "./Help";

function toDisplay(def: ParamDef, v: number): string {
  switch (def.unit) {
    case "pct":
      return (v * 100).toFixed(2).replace(/\.?0+$/, "");
    case "pct2":
      return (v * 100).toFixed(2);
    case "int":
      return String(Math.round(v));
    case "x":
    case "sigma":
    case "ratio":
      return v.toFixed(2);
    default:
      return String(v);
  }
}
function fromDisplay(def: ParamDef, s: string): number | null {
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return def.unit === "pct" || def.unit === "pct2" ? n / 100 : n;
}
function unitSuffix(def: ParamDef): string {
  switch (def.unit) {
    case "pct":
    case "pct2":
      return "%";
    case "x":
      return "×";
    case "sigma":
      return "σ";
    default:
      return "";
  }
}

/** One parameter: label with help, a slider, and a typed number. */
export function ParamInput({ k, compact }: { k: keyof Params; compact?: boolean }) {
  const def = PARAM_BY_KEY[k];
  const value = useStore((s) => s.params[k]);
  const setParam = useStore((s) => s.setParam);
  const [text, setText] = useState(() => (typeof value === "number" ? toDisplay(def, value) : String(value)));
  const [live, setLive] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const committed = useRef(text);

  useEffect(() => {
    if (typeof value === "number") {
      const t = toDisplay(def, value);
      setText(t);
      committed.current = t;
    }
    setLive(null);
  }, [value, def]);

  const badge = def.affectsAll ? <span className="badge-all" title="This input enters the deck's policies, so every section moves with it.">all sections</span> : null;

  if (def.unit === "choice") {
    return (
      <div className="param">
        <div className="param-label">
          <span>{def.label}</span>
          {badge}
          <Help text={def.help} />
        </div>
        <select id={`param-${k}`} value={String(value)} onChange={(e) => setParam(k, e.target.value as Params[typeof k])}>
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
  const sliderValue = live ?? num;
  const commit = (v: number) => setParam(k, v as Params[typeof k]);
  const onSlide = (v: number) => {
    setLive(v);
    setText(toDisplay(def, v));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(v), 140);
  };
  const onBlur = () => {
    // Only commit when the typed text actually changed; re-rounding the display must not move the value.
    if (text === committed.current) return;
    const v = fromDisplay(def, text);
    if (v == null) setText(committed.current);
    else commit(v);
  };

  return (
    <div className={`param${compact ? " compact" : ""}`}>
      <div className="param-label">
        <span>{def.label}</span>
        {def.short && <span className="sym">{def.short}</span>}
        {badge}
        <Help text={def.help} />
      </div>
      <div className="param-row">
        <input
          id={`param-${k}-range`}
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={sliderValue}
          onChange={(e) => onSlide(Number(e.target.value))}
          aria-label={def.label}
        />
        <input
          id={`param-${k}`}
          className="param-num"
          type="text"
          inputMode="decimal"
          value={text + unitSuffix(def)}
          onChange={(e) => setText(e.target.value.replace(/[%×σ]/g, ""))}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={`${def.label}, typed value`}
        />
      </div>
    </div>
  );
}
