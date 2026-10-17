import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { buildAll } from "../viewmodel";
import { ControlDeck } from "./ControlDeck";
import { ImportExportDialog, SettingsDialog } from "./Dialogs";
import { Section } from "./Section";

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const els = ids.map((id) => document.getElementById(`s-${id}`)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace(/^s-/, ""));
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

export function App() {
  const params = useStore((s) => s.params);
  const deferred = useDeferredValue(params);
  const built = useMemo(() => buildAll(deferred), [deferred]);
  const [dialog, setDialog] = useState<"io" | "settings" | null>(null);
  const ids = useMemo(() => built.scenarios.map((s) => s.id), [built]);
  const active = useScrollSpy(ids);
  const stale = deferred !== params;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Tranche Replay
          <small>probability, sizing, and the tranche you actually own</small>
        </div>
        <div className="topbar-tools">
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
          <a href="#deck" className={active === "" ? "on" : undefined}>
            <span className="n">··</span>
            <span>Control deck</span>
          </a>
          {built.scenarios.map((s) => (
            <a key={s.id} href={`#s-${s.id}`} className={active === s.id ? "on" : undefined}>
              <span className="n">{String(s.number).padStart(2, "0")}</span>
              <span>{s.eyebrow}</span>
            </a>
          ))}
        </nav>
        <main className="main" style={{ opacity: stale ? 0.75 : 1, transition: "opacity 0.15s" }}>
          <ControlDeck derived={built.derived} />
          {built.scenarios.map((s) => (
            <Section key={s.id} view={s} />
          ))}
        </main>
      </div>
      {dialog === "io" && <ImportExportDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
    </>
  );
}
