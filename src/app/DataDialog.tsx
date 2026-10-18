/** This explainer's data imports, the trade log and the realized moves: in a dialog and on the settings page. */

import { SettingsGroup } from "@kit/ui/Settings";
import { useRef, useState } from "react";
import { parseNumberList, recordStats } from "@app/model/calibration";
import { useStore } from "@app/store";
import { pct2 } from "@kit/charts/numbers";
import { Modal } from "@kit/ui/Dialogs";

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

/** The trade log and the realized moves. Shared by the dialog and the settings page. */
export function DataBody() {
  return (
    <div className="datasets">
      <DatasetEditor
        kind="record"
        title="Trade log"
        blurb="Per-event outcomes. Either 0/1 with 1 = a full loss, or P&L per unit of max loss: a clean win is +b (0.035), a full loss −1, a partial loss in between. Calibration shows the record's effective rate and band; the sizing grid weights its robust curve by the record's posterior."
        placeholder={"0\n0\n1\n0\n…"}
      />
      <DatasetEditor
        kind="moves"
        title="Realized moves"
        blurb="Realized earnings moves in priced sigmas, positive toward the short strike (one wing). The effective-loss-rate section can use them as the empirical move distribution: pick “Imported moves” among its inputs."
        placeholder={"0.4\n-1.2\n2.7\n…"}
      />
    </div>
  );
}

export function DataDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Your data" onClose={onClose} wide>
      <p>Two imports feed the model. Both are one number per line (a CSV's last column is used). They are saved with the state and travel with the export.</p>
      <DataBody />
    </Modal>
  );
}

/** The data imports as a group of the full settings page. */
export function DataSettings() {
  return (
    <SettingsGroup id="set-data" title="Your data" blurb="Two imports feed the model, one number per line (a CSV's last column is used). They are saved with the state and travel with the export." wide>
      <DataBody />
    </SettingsGroup>
  );
}
