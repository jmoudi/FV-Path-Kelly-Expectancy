import { CrashScreen, useScrollSpy, useViewKeys } from "@kit/ui/Shell";
import { useEffect, useMemo, useState } from "react";
import { sectionNumber, viewMenu, viewOrder } from "@kit/ui/scenarioProps";
import { LinkGroups, MenuButton, MenuItems } from "@kit/ui/Menu";
import { useStore } from "@app/store";
import { DeckBar } from "@app/view/deck/DeckBar";
import { DeskPage } from "@app/view/desk/DeskPage";
import { DataDialog, DataSettings } from "@app/view/DataDialog";
import { ImportExportDialog, SettingsDialog } from "@kit/ui/Dialogs";
import { ErrorBoundary } from "@kit/ui/ErrorBoundary";
import { Icon } from "@kit/ui/Icon";
import { useRoute, type Route, type RouteConfig } from "@kit/ui/route";
import { Section } from "@kit/ui/Section";
import { FullSettings } from "@kit/ui/SettingsBody";
import { useBuild } from "@kit/build/useBuild";
import { BUILD } from "@app/build";
import { useSweepEngine, useSweepHotkeys } from "@kit/sweeps/useSweeps";
import { ViewPage } from "@kit/ui/ViewPage";
import { GuideFrame } from "@kit/ui/GuideFrame";
import { Notices } from "@kit/ui/Notices";
import { useAnnouncements } from "./announce";
import { GUIDE_LEDE, GUIDE_SECTIONS } from "@app/data/copy/guide";
import type { ScenarioView } from "@app/scenarios/types";

type Dialog = "io" | "settings" | "data" | null;

/** The brand mark: the favicon's three bars in ink (no policy colour), for the phone top bar. */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="var(--surface)" />
      <path d="M5 24h5v-8H5zM13.5 24h5V12h-5zM22 24h5V6h-5z" fill="var(--ink)" />
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
    { id: "guide", label: "Guide", hint: "How every control works", onSelect: () => (location.hash = "#guide") },
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
        <a href="#guide" className={`topnav-link topnav-guide${route.page === "guide" ? " on" : ""}`} aria-current={route.page === "guide" ? "page" : undefined}>
          Guide
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
          <Icon name="settings" size={15} />
        </button>
      </div>
      <div className="topbar-more">
        <MenuButton label={<Icon name="more" size={15} />} ariaLabel="More tools" align="end" className="btn small quiet" panelClassName="more-menu">
          {(close) => <MenuItems items={tools} onPick={close} />}
        </MenuButton>
      </div>
    </header>
  );
}

/** This explainer's pages; #view/<id> and #s-<id> are built in. */
const ROUTES: RouteConfig = { home: "desk", pages: ["desk", "explain", "settings", "guide"], aliases: { tour: "explain" }, sectionsPage: "explain" };

export function App() {
  const params = useStore((s) => s.params);
  const datasets = useStore((s) => s.datasets);
  const input = useMemo(() => ({ params, datasets }), [params, datasets]);
  const { result, pending, error } = useBuild(input, BUILD);
  const [dialog, setDialog] = useState<Dialog>(null);
  const route = useRoute(ROUTES);
  const scenarios = useMemo(() => result?.scenarios ?? [], [result]);
  const ids = useMemo(() => scenarios.map((s) => s.id), [scenarios]);
  const active = useScrollSpy(ids, route.page === "explain");
  useSweepEngine();
  useSweepHotkeys();
  // The reading order of the views, for [ and ].
  const order = useMemo(() => viewOrder(scenarios), [scenarios]);
  useViewKeys(dialog != null, order);
  // Imports and stories that move the deck, as notices (the kit's <Notices> shows them).
  useAnnouncements();

  // Scroll to a section when the hash names one (after the sections exist).
  const hasResult = !!result;
  const section = route.page === "explain" ? route.section : undefined;
  useEffect(() => {
    if (!section || !hasResult) return;
    document.getElementById(`s-${section}`)?.scrollIntoView({ block: "start" });
  }, [section, hasResult]);
  // A section in the address (#s-<id> on Explain, #guide/<id> on the Guide) scrolls there instead.
  useEffect(() => {
    if (!route.section) window.scrollTo(0, 0);
  }, [route]);

  return (
    <ErrorBoundary
      fallback={(err, retry) => <CrashScreen error={err} retry={retry} />}
    >
      <TopBar route={route} scenarios={scenarios} onDialog={setDialog} />
      <DeckBar deck={result?.deck ?? null} pending={pending} hidden={route.page === "settings" || route.page === "guide"} />

      {error && <div className="page status-line err">The model could not run: {error}</div>}
      {route.page === "settings" ? (
        <div className="page">
          <h1 className="page-title">Settings</h1>
          <p className="page-lede">
            How every control on these pages works, parameter settings and the replayer included, is in the <a href="#guide">Guide</a>.
          </p>
          <FullSettings data={<DataSettings />} />
        </div>
      ) : route.page === "guide" ? (
        <GuideFrame title="Guide" lede={GUIDE_LEDE} sections={GUIDE_SECTIONS} current={route.section} page="guide" />
      ) : route.page === "view" ? (
        <div className="page">{result ? <ViewPage scenarios={scenarios} viewId={route.id ?? ""} notFound={<>Pick one from the Views menu, or go back to the <a href="#desk">Desk</a>.</>} /> : <p className="status-line">Computing…</p>}</div>
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
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} guideHref="#guide" />}
      {dialog === "data" && <DataDialog onClose={() => setDialog(null)} />}
      <Notices />
    </ErrorBoundary>
  );
}
