import { useEffect, useRef, useState } from "react";
import { BACKEND_INFO } from "../charts/registry";
import type { BackendId } from "../charts/spec";
import { PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { copyText, saveText } from "./download";
import { ParamInput } from "./ParamInput";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{title}</h3>
          <button type="button" className="btn quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ImportExportDialog({ onClose }: { onClose: () => void }) {
  const exportState = useStore((s) => s.exportState);
  const importState = useStore((s) => s.importState);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const json = () => JSON.stringify(exportState(), null, 2);
  return (
    <Modal title="Import and export" onClose={onClose}>
      <p>The whole state travels as one JSON file: every parameter, every chart edit, and the default backend. Paste a file here, or save the current one.</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => void saveText(`tranche-replay-${new Date().toISOString().slice(0, 10)}.json`, json()).then((how) => setMsg({ ok: how !== "none", text: how === "download" ? "Saved." : how === "clipboard" ? "Downloads are blocked here, so it was copied to the clipboard." : "Could not save." }))}>
          Save current state
        </button>
        <button type="button" className="btn" onClick={() => void copyText(json()).then((ok) => setMsg({ ok, text: ok ? "Copied to the clipboard." : "Clipboard blocked; use the text box." }))}>
          Copy JSON
        </button>
        <button type="button" className="btn" onClick={() => setText(json())}>
          Show in the box
        </button>
      </div>
      <h4>Import</h4>
      <textarea id="import-text" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"params": { ... }, "overrides": { ... }}' aria-label="State JSON" />
      <div className="row">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const r = importState(text);
            setMsg(r.ok ? { ok: true, text: "Imported. Every section is recomputed." } : { ok: false, text: r.error });
          }}
          disabled={!text.trim()}
        >
          Import from the box
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Open a file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.text().then((t) => {
              setText(t);
              const r = importState(t);
              setMsg(r.ok ? { ok: true, text: `Imported ${file.name}.` } : { ok: false, text: r.error });
            });
            e.target.value = "";
          }}
        />
        {msg && <span className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
      </div>
    </Modal>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const defaultBackend = useStore((s) => s.defaultBackend);
  const setDefaultBackend = useStore((s) => s.setDefaultBackend);
  const clearAllOverrides = useStore((s) => s.clearAllOverrides);
  const resetParams = useStore((s) => s.resetParams);
  const overrides = useStore((s) => s.overrides);
  const edited = Object.keys(overrides).length;
  const [confirm, setConfirm] = useState<"charts" | "params" | null>(null);
  const advanced = PARAM_DEFS.filter((d) => d.tier === "advanced");
  return (
    <Modal title="Switchboard and settings" onClose={onClose}>
      <p>Every chart is a renderer-agnostic definition routed through one of these backends. Pick the default here; override it per chart with the ⚙ button on any card.</p>
      <div className="backend-cards">
        {(["echarts", "plotly", "vega"] as BackendId[]).map((b) => (
          <button key={b} type="button" className={`backend-card${defaultBackend === b ? " on" : ""}`} onClick={() => setDefaultBackend(b)}>
            <b>{BACKEND_INFO[b].label}</b>
            <span>{BACKEND_INFO[b].blurb}</span>
          </button>
        ))}
      </div>
      <h4>Chart edits</h4>
      <div className="row">
        <span style={{ color: "var(--ink-2)", fontSize: "var(--fs-ui)" }}>{edited === 0 ? "No chart has been edited." : `${edited} chart${edited === 1 ? "" : "s"} carry edits.`}</span>
        {confirm === "charts" ? (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                clearAllOverrides();
                setConfirm(null);
              }}
            >
              Yes, reset every chart
            </button>
            <button type="button" className="btn quiet" onClick={() => setConfirm(null)}>
              Keep them
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={edited === 0} onClick={() => setConfirm("charts")}>
            Reset all chart edits
          </button>
        )}
      </div>
      <h4>Parameters</h4>
      <div className="row">
        {confirm === "params" ? (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                resetParams();
                setConfirm(null);
              }}
            >
              Yes, back to the discussion's inputs
            </button>
            <button type="button" className="btn quiet" onClick={() => setConfirm(null)}>
              Keep mine
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirm("params")}>
            Reset every parameter to the discussion's inputs
          </button>
        )}
      </div>
      <h4>Engine</h4>
      <div className="params-compact" style={{ padding: 0 }}>
        {advanced.map((d) => (
          <ParamInput key={d.key} k={d.key} compact />
        ))}
      </div>
    </Modal>
  );
}
