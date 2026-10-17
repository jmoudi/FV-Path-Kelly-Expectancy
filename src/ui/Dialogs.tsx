import { useEffect, useRef, useState } from "react";
import { BACKEND_INFO } from "../charts/registry";
import type { BackendId } from "../charts/spec";
import { parseNumberList, recordStats } from "../model/calibration";
import { PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { pct2 } from "../viewmodel/derived";
import { copyText, saveText } from "./download";
import { ParamInput } from "./ParamInput";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
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
      <p>The whole state travels as one JSON file: every parameter, every chart edit, the imported data and the default backend. Paste a file here, or save the current one.</p>
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

function DatasetEditor({ kind, title, blurb, placeholder }: { kind: "record" | "moves"; title: string; blurb: string; placeholder: string }) {
  const values = useStore((s) => s.datasets[kind]);
  const setDataset = useStore((s) => s.setDataset);
  const gain = useStore((s) => s.params.gain);
  const z = useStore((s) => s.params.zSigma);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apply = (t: string, name?: string) => {
    const nums = parseNumberList(t);
    if (!nums.length) {
      setMsg("No numbers found.");
      return;
    }
    setDataset(kind, nums);
    setMsg(`Loaded ${nums.length} values${name ? ` from ${name}` : ""}.`);
  };
  const stats = kind === "record" && values.length ? recordStats(values, gain, z) : null;
  return (
    <div className="dataset">
      <h4>{title}</h4>
      <p>{blurb}</p>
      <div className="row" style={{ alignItems: "baseline" }}>
        <span className="caption">
          {values.length === 0
            ? "Nothing imported."
            : kind === "record" && stats
              ? `${values.length} events · effective rate ${pct2(stats.rate)} · band ${pct2(stats.interval[0])} to ${pct2(stats.interval[1])} (${stats.kind === "binary" ? "0/1 losses" : "P&L per max loss"})`
              : `${values.length} moves · mean ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}σ · beyond 2σ: ${pct2(values.filter((v) => v > 2).length / values.length)}`}
        </span>
        {values.length > 0 && (
          <button type="button" className="btn small quiet" onClick={() => setDataset(kind, [])}>
            Clear
          </button>
        )}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={`${title} values`} style={{ minHeight: 90 }} />
      <div className="row">
        <button type="button" className="btn primary small" disabled={!text.trim()} onClick={() => apply(text)}>
          Use these values
        </button>
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
          Open a file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/plain,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.text().then((t) => apply(t, file.name));
            e.target.value = "";
          }}
        />
        {msg && <span className="caption">{msg}</span>}
      </div>
    </div>
  );
}

export function DataDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Your data" onClose={onClose}>
      <p>Two imports feed the model. Both are one number per line (a CSV's last column is used). They are saved with the state and travel with the export.</p>
      <DatasetEditor
        kind="record"
        title="Trade log"
        blurb="Per-event outcomes. Either 0/1 with 1 = a full loss, or P&L per unit of max loss: a clean win is +b (0.035), a full loss −1, a partial loss in between. Section 3 shows the record's effective rate and band; section 8 weights its robust curve by the record's posterior."
        placeholder={"0\n0\n1\n0\n…"}
      />
      <DatasetEditor
        kind="moves"
        title="Realized moves"
        blurb="Realized earnings moves in priced sigmas, positive toward the short strike (one wing). Section 4 can use them as the empirical move distribution: pick “Imported moves” under Tune this section."
        placeholder={"0.4\n-1.2\n2.7\n…"}
      />
    </Modal>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
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
        <span style={{ color: "var(--ink-2)", fontSize: "var(--fs-ui)" }}>{edited === 0 ? "No chart has been edited." : `${edited} chart${edited === 1 ? "" : "s"} carry edits or stories.`}</span>
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
      <h4>Start over</h4>
      <div className="row">
        {confirm === "all" ? (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                resetEverything();
                setConfirm(null);
              }}
            >
              Yes, forget everything
            </button>
            <button type="button" className="btn quiet" onClick={() => setConfirm(null)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn quiet" onClick={() => setConfirm("all")}>
            Forget parameters, chart edits and imported data
          </button>
        )}
        <span className="caption">Opening the app with #reset in the address does the same.</span>
      </div>
    </Modal>
  );
}
