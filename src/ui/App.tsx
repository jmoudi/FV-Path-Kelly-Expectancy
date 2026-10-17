import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { pct, pct1 } from "../viewmodel/derived";
import { ControlDeck } from "./ControlDeck";
import { DataDialog, ImportExportDialog, SettingsDialog } from "./Dialogs";
import { ErrorBoundary } from "./ErrorBoundary";
import { Section } from "./Section";
import { useBuild } from "./useBuild";

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState("deck");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const els = ["deck", ...ids.map((id) => `s-${id}`)].map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id === "deck" ? "deck" : hit.target.id.replace(/^s-/, ""));
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/** True while the control deck is scrolled out of view. */
function useDeckHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.getElementById("deck");
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => setHidden(!entries.some((e) => e.isIntersecting)), { rootMargin: "-60px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return hidden;
}

function MiniDeck() {
  const p = useStore((s) => s.params);
  const pClean = Math.pow(1 - p.lossRate, p.nights);
  return (
    <a href="#deck" className="minideck" title="Back to the control deck">
      <span>
        q <b>{pct(p.lossRate, 2)}</b>
      </span>
      <span>
        p <b>{pct(pClean)}</b>
      </span>
      <span>
        b <b>{pct1(p.gain)}</b>
      </span>
      <span>
        n <b>{p.nights}</b>
      </span>
      <span>
        k <b>{p.names}</b>
      </span>
      <span>
        risk <b>{pct(p.riskPerNight)}</b>
      </span>
      <span>
        N <b>{p.seasons}</b>
      </span>
      <span className="edit">edit deck</span>
    </a>
  );
}

export function App() {
  const params = useStore((s) => s.params);
  const datasets = useStore((s) => s.datasets);
  const resetEverything = useStore((s) => s.resetEverything);
  const { result, pending, error } = useBuild(params, datasets);
  const [dialog, setDialog] = useState<"io" | "settings" | "data" | null>(null);
  const ids = useMemo(() => result?.scenarios.map((s) => s.id) ?? [], [result]);
  const active = useScrollSpy(ids);
  const deckHidden = useDeckHidden();

  return (
    <ErrorBoundary
      fallback={(err, retry) => (
        <div className="shell" style={{ display: "block" }}>
          <div className="dialog" style={{ margin: "40px auto" }}>
            <h3>Something broke</h3>
            <p>{err.message}</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={retry}>
                Try again
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  resetEverything();
                  retry();
                }}
              >
                Reset the app's saved state
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <header className="topbar">
        <div className="brand">
          Tranche Replay
          <small>probability, sizing, and the tranche you actually own</small>
        </div>
        {deckHidden && <MiniDeck />}
        <div className="topbar-tools">
          <button type="button" className="btn quiet" onClick={() => setDialog("data")} title="Import a trade log or realized moves">
            Data
          </button>
          <button type="button" className="btn quiet" onClick={() => setDialog("io")}>
            Import / export
          </button>
          <button type="button" className="btn quiet" onClick={() => setDialog("settings")} title="Default backend, chart edits, engine">
            Settings
          </button>
        </div>
      </header>
      <div className="shell">
        <nav className="rail" aria-label="Sections">
          <div className="rail-title">Sections</div>
          <a href="#deck" className={active === "deck" ? "on" : undefined}>
            <span className="n">··</span>
            <span>Control deck</span>
          </a>
          {(result?.scenarios ?? []).map((s) => (
            <a key={s.id} href={`#s-${s.id}`} className={active === s.id ? "on" : undefined}>
              <span className="n">{String(s.number).padStart(2, "0")}</span>
              <span>{s.eyebrow}</span>
            </a>
          ))}
        </nav>
        <main className="main">
          <ControlDeck deck={result?.deck ?? null} pending={pending} />
          {error && <div className="caption" style={{ color: "var(--loss)" }}>The model could not run: {error}</div>}
          <div style={{ opacity: pending ? 0.72 : 1, transition: "opacity 0.15s", display: "grid", gap: 52, gridTemplateColumns: "minmax(0,1fr)" }}>
            {result ? result.scenarios.map((s) => <Section key={s.id} view={s} />) : !error && <div className="caption">Computing every section…</div>}
          </div>
        </main>
      </div>
      {dialog === "io" && <ImportExportDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "data" && <DataDialog onClose={() => setDialog(null)} />}
    </ErrorBoundary>
  );
}
