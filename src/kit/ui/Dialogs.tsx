import { useEffect, useRef, useState } from "react";
import { useKit, useKitCopy } from "@kit/state/context";
import { copyText, saveText } from "./download";
import { QuickSettings } from "./SettingsBody";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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
      <div className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button type="button" className="btn quiet small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Save, copy or load the whole state as one JSON file. Shared by the dialog and the settings page. */
export function ImportExportBody() {
  const copy = useKitCopy();
  const exportState = useKit((s) => s.exportState);
  const importState = useKit((s) => s.importState);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const json = () => JSON.stringify(exportState(), null, 2);
  return (
    <div className="io">
      <p>The whole state travels as one JSON file: every parameter, chart edit, sweep preset and link, the imported data and the default backend.</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => void saveText(`${copy.exportFilePrefix}-${new Date().toISOString().slice(0, 10)}.json`, json()).then((how) => setMsg({ ok: how !== "none", text: how === "download" ? "Saved." : how === "clipboard" ? "Downloads are blocked here, so it was copied to the clipboard." : "Could not save." }))}>
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
      <textarea className="json" id="import-text" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"params": { ... }, "overrides": { ... }}' aria-label="State JSON" />
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
    </div>
  );
}

export function ImportExportDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Import and export" onClose={onClose}>
      <ImportExportBody />
    </Modal>
  );
}

/** The reduced settings: default backend, drag sensitivity, sweep rate, reset. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <QuickSettings />
      <p className="caption">
        Presets, the engine, your data, import and export and the hotkeys are on the{" "}
        <a href="#settings" onClick={onClose}>
          full settings page
        </a>
        .
      </p>
    </Modal>
  );
}
