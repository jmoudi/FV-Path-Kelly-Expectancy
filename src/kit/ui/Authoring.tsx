import { Fragment, useEffect, useRef, useState } from "react";
import { BACKEND_INFO } from "@kit/charts/registry";
import { resolveAxes } from "@kit/charts/resolve";
import { fieldFormat, numericFields, toCsv, type BackendId, type ChartSpec, type Emphasis, type MarkType, type NumberFormat, type ScaleType, type SpecOverride } from "@kit/charts/spec";
import { roleColor } from "@kit/charts/theme";
import type { Unit } from "@kit/inputs/schema";
import { useKit, useKitCopy } from "@kit/state/context";
import { copyText, saveText } from "./download";
import { Num } from "@kit/inputs/Num";

const MARKS: MarkType[] = ["line", "step", "area", "bar", "scatter"];
const EMPH: Emphasis[] = ["strong", "normal", "muted"];
const BACKENDS: BackendId[] = ["echarts", "plotly", "vega", "table"];

interface Props {
  base: ChartSpec;
  spec: ChartSpec;
  override: SpecOverride | undefined;
  onClose: () => void;
}

/** Domain inputs speak the axis's own units. */
function unitOf(fmt?: NumberFormat): Unit {
  if (fmt && fmt.startsWith("pct")) return "pct2";
  if (fmt === "x") return "x";
  if (fmt === "int") return "int";
  return "ratio";
}

/**
 * The chart-definition editor, shown in a popover. It edits the renderer-agnostic
 * spec (axes, marks, series, backend) and stores only the diff.
 */
export function Authoring({ base, spec, override, onClose }: Props) {
  const setOverride = useKit((s) => s.setOverride);
  const clearOverride = useKit((s) => s.clearOverride);
  const defaultBackend = useKit((s) => s.defaultBackend);
  const copy = useKitCopy();
  const [flash, setFlash] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  const patch = (p: SpecOverride) => setOverride(base.id, p);
  const say = (m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(null), 1600);
  };
  const fields = numericFields(base.data);
  const activeBackend = spec.backend ?? (base.kind === "table" ? "table" : defaultBackend);
  const hidden = new Set(override?.hiddenSeries ?? []);
  const manySeries = base.series.length > 8;
  const addable = fields.filter((f) => !base.series.some((s) => s.field === f.name) && f.name !== base.x.field && !(override?.extraSeries ?? []).some((e) => e.field === f.name));
  const resolved = base.kind === "xy" ? resolveAxes(spec) : null;

  const domainInput = (axis: "x" | "y", idx: 0 | 1) => {
    const fmt = spec[axis].format ?? fieldFormat(spec.data, spec[axis].field);
    const cur = spec[axis].domain?.[idx] ?? null;
    const ax = resolved ? resolved[axis] : null;
    const span = ax ? ax.max - ax.min : 1;
    const lo = ax ? ax.min - span : -1e9;
    const hi = ax ? ax.max + span : 1e9;
    return (
      <Num
        id={`${base.id}-${axis}-${idx}`}
        ariaLabel={`${axis} axis ${idx === 0 ? "from" : "to"}`}
        value={cur}
        placeholder="auto"
        min={spec[axis].scale === "log" ? Math.max(1e-9, lo) : lo}
        max={hi}
        step={span / 200}
        unit={unitOf(fmt)}
        slider={false}
        decimals={unitOf(fmt) === "pct2" ? 2 : 3}
        onChange={(v) => {
          const d: [number | null, number | null] = [spec[axis].domain?.[0] ?? null, spec[axis].domain?.[1] ?? null];
          d[idx] = v;
          patch({ [axis]: { ...(override?.[axis] ?? {}), domain: d } });
        }}
      />
    );
  };

  const scaleSeg = (axis: "x" | "y") => (
    <div className="seg" role="radiogroup" aria-label={`${axis.toUpperCase()} axis scale`}>
      {(["linear", "log"] as ScaleType[]).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={(spec[axis].scale ?? "linear") === s} className={(spec[axis].scale ?? "linear") === s ? "on" : undefined} onClick={() => patch({ [axis]: { ...(override?.[axis] ?? {}), scale: s } })}>
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="authoring" role="group" aria-label={`Chart definition: ${base.title}`} ref={rootRef}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h4 className="group-h">Chart definition</h4>
        <button type="button" className="btn small quiet" onClick={onClose}>
          Close
        </button>
      </div>

      {base.kind === "xy" && (
        <div>
          <h5>Display</h5>
          <div className="grid2" style={{ marginTop: 6 }}>
            <span>x axis</span>
            {scaleSeg("x")}
            <span>y axis</span>
            {scaleSeg("y")}
            <span>mark</span>
            <div className="seg" role="radiogroup" aria-label="Mark">
              {MARKS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={spec.mark === m} className={spec.mark === m ? "on" : undefined} onClick={() => patch({ mark: m })}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>
              <input type="checkbox" checked={!override?.hideAnnotations} onChange={(e) => patch({ hideAnnotations: !e.target.checked })} /> reference lines and labels
            </label>
            <label>
              <input type="checkbox" checked={spec.legend !== false} onChange={(e) => patch({ legend: e.target.checked })} /> legend
            </label>
          </div>
        </div>
      )}

      {base.kind === "xy" && (
        <div className="ranges">
          <h5>Axis ranges</h5>
          {/* One fixed grid: the axis, then "from" and "to" as column heads over their boxes; a row never wraps. */}
          <div className="range-grid">
            <span />
            <span className="range-h">from</span>
            <span className="range-h">to</span>
            {(["x", "y"] as const).map((axis) => (
              <Fragment key={axis}>
                <span className="range-axis">{axis} axis</span>
                <div className="range-cell">{domainInput(axis, 0)}</div>
                <div className="range-cell">{domainInput(axis, 1)}</div>
              </Fragment>
            ))}
          </div>
          {!base.x.categorical && fields.length > 1 && (
            <div className="row" style={{ marginTop: 6 }}>
              <label htmlFor={`${base.id}-xfield`}>x field</label>
              <select id={`${base.id}-xfield`} value={spec.x.field} onChange={(e) => patch({ x: { ...(override?.x ?? {}), field: e.target.value } })}>
                {fields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {base.kind === "xy" && (
        <div>
          <h5>Series</h5>
          {manySeries ? (
            <p className="muted" style={{ marginTop: 6 }}>{copy.manySeriesNote(base.series.length)}</p>
          ) : (
            <div className="series-list" style={{ marginTop: 6 }}>
              {base.series.map((s) => {
                const label = s.label ?? s.field;
                const emph = override?.seriesEmphasis?.[s.field] ?? s.emphasis ?? "normal";
                return (
                  <div key={s.field} className="series-row">
                    <input
                      type="checkbox"
                      checked={!hidden.has(s.field)}
                      onChange={(e) => {
                        const next = new Set(hidden);
                        if (e.target.checked) next.delete(s.field);
                        else next.add(s.field);
                        patch({ hiddenSeries: [...next] });
                      }}
                      aria-label={`show ${label}`}
                    />
                    <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                      <span className="swatch" style={{ background: roleColor(s.color) }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
                        {label}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <select value={override?.seriesMark?.[s.field] ?? s.mark ?? ""} onChange={(e) => patch({ seriesMark: { ...(override?.seriesMark ?? {}), [s.field]: (e.target.value || spec.mark) as MarkType } })} aria-label={`${label} mark`}>
                        <option value="">chart mark</option>
                        {MARKS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select value={emph} onChange={(e) => patch({ seriesEmphasis: { ...(override?.seriesEmphasis ?? {}), [s.field]: e.target.value as Emphasis } })} aria-label={`${label} emphasis`}>
                        {EMPH.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                );
              })}
              {(override?.extraSeries ?? []).map((e) => (
                <div key={e.field} className="series-row">
                  <input type="checkbox" checked onChange={() => patch({ extraSeries: (override?.extraSeries ?? []).filter((x) => x.field !== e.field) })} aria-label={`remove ${e.field}`} />
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="swatch" style={{ background: roleColor(e.color) }} />
                    <span>{base.data.fields.find((f) => f.name === e.field)?.label ?? e.field}</span>
                  </span>
                  <span className="backend-tag">added</span>
                </div>
              ))}
              {addable.length > 0 && (
                <div className="row" style={{ marginTop: 4 }}>
                  <label htmlFor={`${base.id}-add`}>add</label>
                  <select
                    id={`${base.id}-add`}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const colors = ["ramp2", "ramp3", "ramp1", "ink"] as const;
                      const color = colors[(override?.extraSeries?.length ?? 0) % colors.length];
                      patch({ extraSeries: [...(override?.extraSeries ?? []), { field: e.target.value, color }] });
                    }}
                  >
                    <option value="">a column from the data…</option>
                    {addable.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h5>Backend</h5>
        <div className="seg" style={{ marginTop: 6 }} role="radiogroup" aria-label="Backend">
          {BACKENDS.filter((b) => base.kind !== "table" || b === "table").map((b) => (
            <button key={b} type="button" role="radio" aria-checked={activeBackend === b} className={activeBackend === b ? "on" : undefined} onClick={() => patch({ backend: b })} title={BACKEND_INFO[b].blurb}>
              {BACKEND_INFO[b].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h5>Size</h5>
        <div style={{ marginTop: 6, maxWidth: 220 }}>
          <Num id={`${base.id}-h`} label="height (px)" value={spec.height ?? 300} min={120} max={800} step={10} unit="int" onChange={(v) => v != null && patch({ height: v })} />
        </div>
      </div>

      <div className="foot">
        <button type="button" className="btn small" onClick={() => void saveText(`${base.id}.csv`, toCsv(base.data), "text/csv").then((how) => say(how === "download" ? "Saved CSV" : how === "clipboard" ? "Copied CSV" : "Could not save"))}>
          Data as CSV
        </button>
        <button type="button" className="btn small" onClick={() => void copyText(JSON.stringify(spec, null, 2)).then((ok) => say(ok ? "Copied spec JSON" : "Clipboard blocked"))}>
          Copy spec JSON
        </button>
        <button
          type="button"
          className="btn small quiet"
          onClick={() => {
            clearOverride(base.id);
            say("Reset");
          }}
          disabled={!override}
        >
          Reset chart
        </button>
        {flash && <span className="flash">{flash}</span>}
      </div>
    </div>
  );
}
