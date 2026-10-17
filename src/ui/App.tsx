import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { DeckBar } from "./DeckBar";
import { DataDialog, ImportExportDialog, SettingsDialog } from "./Dialogs";
import { ErrorBoundary } from "./ErrorBoundary";
import { useRoute } from "./route";
import { Section } from "./Section";
import { SettingsBody } from "./SettingsBody";
import { useBuild } from "./useBuild";
import { useSweepEngine, useSweepHotkeys } from "./useSweeps";
import { ViewPage } from "./ViewPage";

function useScrollSpy(ids: string[], enabled: boolean): string {
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!enabled || !("IntersectionObserver" in window)) return;
    const els = ids.map((id) => document.getElementById(`s-${id}`)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace(/^s-/, ""));
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids, enabled]);
  return active;
}

export function App() {
  const params = useStore((s) => s.params);
  const datasets = useStore((s) => s.datasets);
  const resetEverything = useStore((s) => s.resetEverything);
  const { result, pending, error } = useBuild(params, datasets);
  const [dialog, setDialog] = useState<"io" | "settings" | "data" | null>(null);
  const route = useRoute();
  const ids = useMemo(() => result?.scenarios.map((s) => s.id) ?? [], [result]);
  const active = useScrollSpy(ids, route.page === "tour");
  useSweepEngine();
  useSweepHotkeys();

  // Scroll to a section when the hash names one (after the sections exist).
  useEffect(() => {
    if (route.page !== "tour" || !route.section || !result) return;
    document.getElementById(`s-${route.section}`)?.scrollIntoView({ block: "start" });
  }, [route, result]);
  useEffect(() => {
    if (route.page !== "tour") window.scrollTo(0, 0);
  }, [route]);

  const scenarios = result?.scenarios ?? [];

  // Alt+← / Alt+→ walk the views; from the tour they open the first or last one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const flat = scenarios.flatMap((s) => s.views.map((v) => v.id));
      if (!flat.length) return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const i = route.page === "view" ? flat.indexOf(route.id) : dir === 1 ? -1 : 0;
      location.hash = `#view/${flat[(i + dir + flat.length) % flat.length]}`;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenarios, route]);

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
        <a className="brand" href="#tour">
          Tranche Replay
        </a>
        <nav className="topnav" aria-label="Pages">
          <a href="#tour" className={route.page === "tour" ? "on" : undefined}>
            Tour
          </a>
          <details className="menu">
            <summary className={route.page === "view" ? "on" : undefined}>Views ▾</summary>
            <div className="menu-panel">
              {scenarios.map((s) => (
                <div key={s.id} className="menu-group">
                  <div className="menu-title">{s.title}</div>
                  {s.views.map((v) => (
                    <a key={v.id} href={`#view/${v.id}`} className={route.page === "view" && route.id === v.id ? "on" : undefined} onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}>
                      {v.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <a href="#settings" className={route.page === "settings" ? "on" : undefined}>
            Settings
          </a>
        </nav>
        <div className="topbar-tools">
          <button type="button" className="btn small quiet" onClick={() => setDialog("data")} title="Import a trade log or realized moves">
            Data
          </button>
          <button type="button" className="btn small quiet" onClick={() => setDialog("io")}>
            Import / export
          </button>
          <button type="button" className="btn small quiet" onClick={() => setDialog("settings")} title="Quick settings">
            ⚙
          </button>
        </div>
      </header>
      <DeckBar deck={result?.deck ?? null} pending={pending} />

      {route.page === "settings" ? (
        <div className="page">
          <h2 className="page-title">Settings</h2>
          <SettingsBody full />
        </div>
      ) : route.page === "view" ? (
        <div className="page">{result ? <ViewPage scenarios={scenarios} viewId={route.id} /> : <div className="caption">Computing…</div>}</div>
      ) : (
        <div className="shell">
          <nav className="rail" aria-label="Sections">
            <div className="rail-title">Tour</div>
            {scenarios.map((s) => (
              <a key={s.id} href={`#s-${s.id}`} className={active === s.id ? "on" : undefined}>
                <span className="n">{String(s.number).padStart(2, "0")}</span>
                <span>{s.title}</span>
              </a>
            ))}
          </nav>
          <main className="main">
            {error && <div className="caption" style={{ color: "var(--loss)" }}>The model could not run: {error}</div>}
            <div style={{ opacity: pending ? 0.72 : 1, transition: "opacity 0.15s", display: "grid", gap: 56, gridTemplateColumns: "minmax(0,1fr)" }}>
              {result ? scenarios.map((s) => <Section key={s.id} view={s} />) : !error && <div className="caption">Computing every section…</div>}
            </div>
          </main>
        </div>
      )}
      {dialog === "io" && <ImportExportDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "data" && <DataDialog onClose={() => setDialog(null)} />}
    </ErrorBoundary>
  );
}
