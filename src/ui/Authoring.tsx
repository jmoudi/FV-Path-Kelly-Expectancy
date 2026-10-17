import { useEffect, useState } from "react";
import { BACKEND_INFO } from "../charts/registry";
import { numericFields, toCsv, type BackendId, type ChartSpec, type Emphasis, type MarkType, type ScaleType, type SpecOverride } from "../charts/spec";
import { roleColor } from "../charts/theme";
import { useStore } from "../state/store";
import { copyText, saveText } from "./download";

const MARKS: MarkType[] = ["line", "step", "area", "bar", "scatter"];
const EMPH: Emphasis[] = ["strong", "normal", "muted"];
const BACKENDS: BackendId[] = ["echarts", "plotly", "vega", "table"];

interface Props {
  base: ChartSpec;
  spec: ChartSpec;
  override: SpecOverride | undefined;
  onClose: () => void;
}

/**
 * The in-GUI authoring layer. It edits the renderer-agnostic spec (axes, marks,
 * series, backend) and stores only the diff, so the base spec stays swappable.
 */
export function Authoring({ base, spec, override, onClose }: Props) {
  const setOverride = useStore((s) => s.setOverride);
  const clearOverride = useStore((s) => s.clearOverride);
  const defaultBackend = useStore((s) => s.defaultBackend);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
  const domainInput = (axis: "x" | "y", idx: 0 | 1) => {
    const cur = spec[axis].domain?.[idx];
    return (
      <input
        type="number"
        step="any"
        placeholder="auto"
        value={cur ?? ""}
        onChange={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          const d: [number | null, number | null] = [spec[axis].domain?.[0] ?? null, spec[axis].domain?.[1] ?? null];
          d[idx] = Number.isFinite(v as number) ? v : null;
          patch({ [axis]: { ...(override?.[axis] ?? {}), domain: d } });
        }}
        aria-label={`${axis} ${idx === 0 ? "min" : "max"}`}
      />
    );
  };

  return (
    <div className="authoring" role="dialog" aria-label={`Chart definition: ${base.title}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h5>Chart definition</h5>
        <button type="button" className="btn small quiet" onClick={onClose}>
          Close
        </button>
      </div>

      {base.stories && base.stories.length > 0 && (
        <div>
          <h5>Stories</h5>
          <div className="stories" style={{ marginTop: 6 }}>
            {base.stories.map((st) => (
              <button key={st.id} type="button" className="btn small" onClick={() => patch(st.patch)}>
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h5>Backend</h5>
        <div className="seg" style={{ marginTop: 6 }}>
          {BACKENDS.filter((b) => base.kind !== "table" || b === "table").map((b) => (
            <button key={b} type="button" className={activeBackend === b ? "on" : undefined} onClick={() => patch({ backend: b })} title={BACKEND_INFO[b].blurb}>
              {BACKEND_INFO[b].label}
            </button>
          ))}
        </div>
      </div>

      {base.kind === "xy" && (
        <>
          <div>
            <h5>Mark</h5>
            <div className="seg" style={{ marginTop: 6 }}>
              {MARKS.map((m) => (
                <button key={m} type="button" className={spec.mark === m ? "on" : undefined} onClick={() => patch({ mark: m })}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {(["x", "y"] as const).map((axis) => (
            <div key={axis}>
              <h5>{axis.toUpperCase()} axis</h5>
              <div className="row" style={{ marginTop: 6 }}>
                <label htmlFor={`${base.id}-${axis}-scale`}>scale</label>
                <div className="seg">
                  {(["linear", "log"] as ScaleType[]).map((s) => (
                    <button key={s} type="button" className={(spec[axis].scale ?? "linear") === s ? "on" : undefined} onClick={() => patch({ [axis]: { ...(override?.[axis] ?? {}), scale: s } })}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <label>domain</label>
                {domainInput(axis, 0)}
                <span style={{ color: "var(--muted)" }}>to</span>
                {domainInput(axis, 1)}
              </div>
              {axis === "x" && !base.x.categorical && fields.length > 1 && (
                <div className="row" style={{ marginTop: 6 }}>
                  <label htmlFor={`${base.id}-xfield`}>field</label>
                  <select id={`${base.id}-xfield`} value={spec.x.field} onChange={(e) => patch({ x: { ...(override?.x ?? {}), field: e.target.value, label: undefined } })}>
                    {fields.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}

          <div>
            <h5>Series</h5>
            {manySeries ? (
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{base.series.length} sampled paths. Change the count in Settings → Paths in fan charts.</p>
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
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                      </span>
                      <select value={emph} onChange={(e) => patch({ seriesEmphasis: { ...(override?.seriesEmphasis ?? {}), [s.field]: e.target.value as Emphasis } })} aria-label={`${label} emphasis`}>
                        {EMPH.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
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
                        const colors = ["ramp2", "ramp3", "ramp1", "ramp4"] as const;
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

          <div className="row">
            <label>
              <input type="checkbox" checked={!override?.hideAnnotations} onChange={(e) => patch({ hideAnnotations: !e.target.checked })} /> reference lines and labels
            </label>
          </div>
        </>
      )}

      <div className="row">
        <label htmlFor={`${base.id}-h`}>height</label>
        <input id={`${base.id}-h`} type="number" min={120} max={800} step={10} value={spec.height ?? 300} onChange={(e) => patch({ height: Number(e.target.value) })} />
        <span style={{ color: "var(--muted)" }}>px</span>
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
        {flash && <span style={{ color: "var(--good)", alignSelf: "center" }}>{flash}</span>}
      </div>
    </div>
  );
}
