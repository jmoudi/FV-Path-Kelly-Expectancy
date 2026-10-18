import { useEffect, useMemo, useState } from "react";
import { sectionNumber, viewMenu, viewOrder } from "../app/figures";
import { LinkGroups, MenuButton, MenuItems } from "../kit/ui/Menu";
import { useStore } from "../state/store";
import { DeckBar } from "./DeckBar";
import { DeskPage } from "./DeskPage";
import { DataDialog, ImportExportDialog, SettingsDialog } from "./Dialogs";
import { ErrorBoundary } from "./ErrorBoundary";
import { setViewOrder, stepView, useRoute, type Route } from "./route";
import { Section } from "./Section";
import { FullSettings } from "./SettingsBody";
import { useBuild } from "./useBuild";
import { isEditableTarget, useSweepEngine, useSweepHotkeys } from "./useSweeps";
import { ViewPage } from "./ViewPage";
import type { ScenarioView } from "../viewmodel/types";

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

type Dialog = "io" | "settings" | "data" | null;

/**
 * Plain [ and ] step to the previous or next view, in reading order, from any page.
 * Not while focus is in an editable field or a select (typing wins there), not with
 * Ctrl or ⌘ (those cycle sweep presets), and not while a dialog is open.
 */
function useViewKeys(blocked: boolean) {
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || (e.key !== "[" && e.key !== "]")) return;
      const el = document.activeElement;
      if (isEditableTarget(el) || el?.tagName === "SELECT") return;
      if (stepView(e.key === "]" ? 1 : -1)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked]);
}

/** The brand mark: the favicon's three bars, for the phone top bar. */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="var(--surface)" />
      <path d="M5 24h5v-8H5zM13.5 24h5V12h-5zM22 24h5V6h-5z" fill="var(--b)" />
    </svg>
  );
}

function TopBar({ route, scenarios, onDialog }: { route: Route; scenarios: ScenarioView[]; onDialog: (d: Dialog) => void }) {
  const currentView = route.page === "view" ? route.id : undefined;
  const groups = useMemo(() => viewMenu(scenarios, currentView), [scenarios, currentView]);
  const tools = [
    { id: "data", label: "Data", hint: "Import a trade log or realized moves", onSelect: () => onDialog("data") },
    { id: "io", label: "Import / export", hint: "The whole state as JSON", onSelect: () => onDialog("io") },
    { id: "settings", label: "Quick settings", hint: "Backend, drag, sweep rate, reset", onSelect: () => onDialog("settings") },
  ];
  return (
    <header className="topbar">
      <a className="brand" href="#desk" aria-label="Tranche Replay, the Desk">
        <BrandMark />
        <span className="brand-text">Tranche Replay</span>
      </a>
      <nav className="topnav" aria-label="Pages">
        <a href="#desk" className={`topnav-link${route.page === "desk" ? " on" : ""}`} aria-current={route.page === "desk" ? "page" : undefined}>
          Desk
        </a>
        <a href="#explain" className={`topnav-link${route.page === "explain" ? " on" : ""}`} aria-current={route.page === "explain" ? "page" : undefined}>
          Explain
        </a>
        <MenuButton label="Views ▾" current={route.page === "view"} panelClassName="views-menu" title="Every view, by section">
          {(close) => (
            <LinkGroups
              groups={groups}
              onPick={close}
              lead={
                <div className="k-link-group" role="group" aria-label="Desk">
                  <div className="k-link-group-title">Landing</div>
                  <a href="#desk" role="menuitem" className={route.page === "desk" ? "on" : undefined} onClick={close}>
                    Desk
                  </a>
                </div>
              }
            />
          )}
        </MenuButton>
        <a href="#settings" className={`topnav-link${route.page === "settings" ? " on" : ""}`} aria-current={route.page === "settings" ? "page" : undefined}>
          Settings
        </a>
      </nav>
      <div className="topbar-tools">
        <button type="button" className="btn small quiet" onClick={() => onDialog("data")} title="Import a trade log or realized moves">
          Data
        </button>
        <button type="button" className="btn small quiet" onClick={() => onDialog("io")} title="The whole state as one JSON file">
          Import / export
        </button>
        <button type="button" className="btn small quiet" onClick={() => onDialog("settings")} title="Quick settings" aria-label="Quick settings">
          ⚙
        </button>
      </div>
      <div className="topbar-more">
        <MenuButton label="⋯" ariaLabel="More tools" align="end" className="btn small quiet" panelClassName="more-menu">
          {(close) => <MenuItems items={tools} onPick={close} />}
        </MenuButton>
      </div>
    </header>
  );
}

export function App() {
  const params = useStore((s) => s.params);
  const datasets = useStore((s) => s.datasets);
  const resetEverything = useStore((s) => s.resetEverything);
  const { result, pending, error } = useBuild(params, datasets);
  const [dialog, setDialog] = useState<Dialog>(null);
  const route = useRoute();
  const scenarios = useMemo(() => result?.scenarios ?? [], [result]);
  const ids = useMemo(() => scenarios.map((s) => s.id), [scenarios]);
  const active = useScrollSpy(ids, route.page === "explain");
  useSweepEngine();
  useSweepHotkeys();
  useViewKeys(dialog != null);

  // The reading order of the views, for whichever key handler steps through them.
  useEffect(() => setViewOrder(viewOrder(scenarios)), [scenarios]);

  // Scroll to a section when the hash names one (after the sections exist).
  const hasResult = !!result;
  const section = route.page === "explain" ? route.section : undefined;
  useEffect(() => {
    if (!section || !hasResult) return;
    document.getElementById(`s-${section}`)?.scrollIntoView({ block: "start" });
  }, [section, hasResult]);
  useEffect(() => {
    if (route.page !== "explain" || !route.section) window.scrollTo(0, 0);
  }, [route]);

  return (
    <ErrorBoundary
      fallback={(err, retry) => (
        <div className="page">
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
      <TopBar route={route} scenarios={scenarios} onDialog={setDialog} />
      <DeckBar deck={result?.deck ?? null} pending={pending} />

      {error && <div className="page status-line err">The model could not run: {error}</div>}
      {route.page === "settings" ? (
        <div className="page">
          <h1 className="page-title">Settings</h1>
          <FullSettings />
        </div>
      ) : route.page === "view" ? (
        <div className="page">{result ? <ViewPage scenarios={scenarios} viewId={route.id} /> : <p className="status-line">Computing…</p>}</div>
      ) : route.page === "desk" ? (
        <div className="page">{result ? <DeskPage desk={result.desk} scenarios={scenarios} pending={pending} /> : <p className="status-line">Computing the desk…</p>}</div>
      ) : (
        <div className="shell">
          <nav className="rail" aria-label="Sections">
            <div className="rail-title">Explain</div>
            {scenarios.map((s) => (
              <a key={s.id} href={`#s-${s.id}`} className={active === s.id ? "on" : undefined}>
                <span className="n">{sectionNumber(s)}</span>
                <span>{s.title}</span>
              </a>
            ))}
          </nav>
          <main className={`main${pending ? " pending" : ""}`}>{result ? scenarios.map((s) => <Section key={s.id} view={s} />) : !error && <p className="status-line">Computing every section…</p>}</main>
        </div>
      )}
      {dialog === "io" && <ImportExportDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "data" && <DataDialog onClose={() => setDialog(null)} />}
    </ErrorBoundary>
  );
}
