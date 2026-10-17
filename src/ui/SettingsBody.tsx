import { useState } from "react";
import { BACKEND_INFO } from "../charts/registry";
import type { BackendId } from "../charts/spec";
import { PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { ParamInput } from "./ParamInput";
import { SweepPanel } from "./SweepPanel";

/** The settings content, shared by the dialog (reduced) and the full page. */
export function SettingsBody({ full }: { full: boolean }) {
  const defaultBackend = useStore((s) => s.defaultBackend);
  const setDefaultBackend = useStore((s) => s.setDefaultBackend);
  const clearAllOverrides = useStore((s) => s.clearAllOverrides);
  const resetParams = useStore((s) => s.resetParams);
  const resetEverything = useStore((s) => s.resetEverything);
  const overrides = useStore((s) => s.overrides);
  const edited = Object.keys(overrides).length;
  const [confirm, setConfirm] = useState<"charts" | "params" | "all" | null>(null);
  const advanced = PARAM_DEFS.filter((d) => d.tier === "advanced");
  return (
    <div className={`settings${full ? " full" : ""}`}>
      <section>
        <h4>Chart backends</h4>
        <p>Every chart is a renderer-agnostic definition routed through one of these. Pick the default here; override it per chart with ⚙ on any card.</p>
        <div className="backend-cards">
          {(["echarts", "plotly", "vega"] as BackendId[]).map((b) => (
            <button key={b} type="button" className={`backend-card${defaultBackend === b ? " on" : ""}`} onClick={() => setDefaultBackend(b)}>
              <b>{BACKEND_INFO[b].label}</b>
              <span>{BACKEND_INFO[b].blurb}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="caption">{edited === 0 ? "No chart has been edited." : `${edited} chart${edited === 1 ? "" : "s"} carry edits or stories.`}</span>
          {confirm === "charts" ? (
            <>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  clearAllOverrides();
                  setConfirm(null);
                }}
              >
                Yes, reset every chart
              </button>
              <button type="button" className="btn small quiet" onClick={() => setConfirm(null)}>
                Keep them
              </button>
            </>
          ) : (
            <button type="button" className="btn small" disabled={edited === 0} onClick={() => setConfirm("charts")}>
              Reset all chart edits
            </button>
          )}
        </div>
      </section>

      <section>
        <SweepPanel />
      </section>

      <section>
        <h4>Engine</h4>
        <div className="params-compact" style={{ padding: 0 }}>
          {advanced.map((d) => (
            <ParamInput key={d.key} k={d.key} compact />
          ))}
        </div>
      </section>

      <section>
        <h4>Parameters and saved state</h4>
        <div className="row">
          {confirm === "params" ? (
            <>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  resetParams();
                  setConfirm(null);
                }}
              >
                Yes, back to the discussion's inputs
              </button>
              <button type="button" className="btn small quiet" onClick={() => setConfirm(null)}>
                Keep mine
              </button>
            </>
          ) : (
            <button type="button" className="btn small" onClick={() => setConfirm("params")}>
              Reset every parameter to the discussion's inputs
            </button>
          )}
          {confirm === "all" ? (
            <>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  resetEverything();
                  setConfirm(null);
                }}
              >
                Yes, forget everything
              </button>
              <button type="button" className="btn small quiet" onClick={() => setConfirm(null)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn small quiet" onClick={() => setConfirm("all")}>
              Forget parameters, chart edits, presets and imported data
            </button>
          )}
        </div>
        <p className="caption">Opening the app with #reset in the address does the same.</p>
      </section>
    </div>
  );
}
