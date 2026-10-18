import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderHandle } from "@kit/charts/backends/types";
import { FIGURE_DEFAULT_HEIGHT, figureFor } from "@kit/charts/figures/registry";
import { FigureFrame } from "@kit/charts/figures/FigureFrame";
import { loadBackend, BACKEND_INFO } from "@kit/charts/registry";
import { activeStoryOf, applyOverride, toCsv, type BackendId, type ChartSpec, type SpecOverride } from "@kit/charts/spec";
import { ChartFrame } from "@kit/charts/ChartFrame";
import { useKit, useKitCopy } from "@kit/state/context";
import { viewHref } from "./route";
import { Authoring } from "./Authoring";
import { saveText } from "./download";
import { ErrorBoundary } from "./ErrorBoundary";
import { Num } from "@kit/inputs/Num";
import { Icon } from "./Icon";
import { Popover } from "./Popover";
import { TableView } from "./TableView";
import { Link, rich } from "./Link";

/** The plot box's height: fixed by the spec, the same whatever the box shows. */
export function boxHeightOf(spec: ChartSpec): number {
  if (spec.kind === "figure") return spec.height ?? FIGURE_DEFAULT_HEIGHT;
  if (spec.kind === "table") return spec.height ?? 320;
  // The backends get the spec's plot height plus a band for axes and legend.
  return (spec.height ?? 300) + (spec.kind === "heatmap" ? 90 : 70);
}

/** Pixels at the top of the viewport covered by the sticky top bar and deck. */
function stickyInset(): number {
  let bottom = 0;
  for (const sel of [".topbar", ".dkb"]) {
    const el = document.querySelector(sel);
    if (el) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  }
  return Math.max(0, bottom);
}

/**
 * Renders one chart spec through the switchboard inside the kit's chart frame. Mounts
 * lazily when scrolled near the viewport, swaps backends on demand, shows the numbers
 * (⊞) inside the same plot box, and hosts the stories and the chart-definition popover.
 */
export function ChartHost({ spec: base, viewId, legendPeer }: { spec: ChartSpec; viewId?: string; legendPeer?: string[] }) {
  const clearOverride = useKit((s) => s.clearOverride);
  return (
    <ErrorBoundary
      fallback={(err, retry) => (
        <ChartFrame id={`chart-${base.id}`} title={base.title} subtitle={base.subtitle} boxHeight={boxHeightOf(base)}>
          <div className="k-chart-error" role="alert">
            <span>This chart could not render: {err.message}</span>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                clearOverride(base.id);
                retry();
              }}
            >
              Reset this chart
            </button>
          </div>
        </ChartFrame>
      )}
    >
      <ChartCard base={base} viewId={viewId} legendPeer={legendPeer} />
    </ErrorBoundary>
  );
}

function ChartCard({ base, viewId, legendPeer }: { base: ChartSpec; viewId?: string; legendPeer?: string[] }) {
  const copy = useKitCopy();
  const override = useKit((s) => s.overrides[base.id]);
  const clearOverride = useKit((s) => s.clearOverride);
  const defaultBackend = useKit((s) => s.defaultBackend);
  const authoringOpen = useKit((s) => s.authoringOpen);
  const setAuthoringOpen = useKit((s) => s.setAuthoringOpen);
  const applyStory = useKit((s) => s.applyStory);
  // Only the chart whose story moved the deck follows the parameters here.
  const before = useKit((s) => s.storyPrev[base.id]);
  const paramsNow = useKit((s) => (s.storyPrev[base.id] ? s.params : null));
  const spec = useMemo(() => applyOverride(base, override), [base, override]);
  // What the backend draws: the spec, with the legend rows of the chart beside it in a pair.
  // Keyed by the entries' text: the section hands over a new array on every render.
  const peerKey = legendPeer?.join("\u0000") ?? "";
  const drawn = useMemo(() => (peerKey ? { ...spec, legendPeer: peerKey.split("\u0000") } : spec), [spec, peerKey]);
  // A figure is drawn by the figure registry, never by a backend; ⊞ still shows its data.
  const isFigure = base.kind === "figure";
  const isTable = base.kind === "table";
  const backendId: BackendId = spec.backend ?? (isTable ? "table" : defaultBackend);
  const [tableView, setTableView] = useState(false);
  const effective: BackendId = tableView ? "table" : backendId;
  const mountsBackend = !isFigure && effective !== "table";

  const cardRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<RenderHandle | null>(null);
  const specRef = useRef(drawn);
  specRef.current = drawn;
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState<BackendId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || visible) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !mountsBackend) {
      handleRef.current?.dispose();
      handleRef.current = null;
      setMounted(null);
      return;
    }
    let cancelled = false;
    setError(null);
    loadBackend(effective as Exclude<BackendId, "table">)
      .then((b) => {
        if (cancelled || !plotRef.current) return;
        handleRef.current?.dispose();
        plotRef.current.innerHTML = "";
        try {
          handleRef.current = b.mount(plotRef.current, specRef.current);
          setMounted(effective);
        } catch (e) {
          setError((e as Error).message);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [visible, effective, mountsBackend]);

  useEffect(() => {
    if (!handleRef.current || mounted !== effective) return;
    try {
      handleRef.current.update(drawn);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [drawn, mounted, effective]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el || !("ResizeObserver" in window) || !mountsBackend) return;
    const ro = new ResizeObserver(() => handleRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [effective, mounted, mountsBackend]);

  const open = authoringOpen === base.id;
  useEffect(() => {
    if (open) setInset(stickyInset());
  }, [open]);
  const height = boxHeightOf(spec);
  const edited = !!override && !override.story;
  const activeStory = override?.story;
  const offered = base.stories ?? [];
  const story = activeStory ? activeStoryOf(activeStory, offered, override, !!before) : undefined;
  // The active story stays listed (pressed) even when the rebuilt spec no longer offers it.
  const stories = story ? (offered.some((st) => st.id === story.id) ? offered.map((st) => (st.id === story.id ? story : st)) : [...offered, story]) : offered;
  // The backend tag shows only when it says something: another backend than the default, or edits.
  const offDefault = !isFigure && !isTable && backendId !== defaultBackend;
  const tag = edited || offDefault ? `${isFigure ? "Figure" : BACKEND_INFO[backendId].label}${edited ? " · edited" : ""}` : null;

  const tools = (
    <>
      {viewId && (
        <Link to={viewHref(viewId)} variant="plain" className="icon-btn" title="Open this chart in its own view" aria-label="Open this chart in its own view">
          <Icon name="open" />
        </Link>
      )}
      {!isTable && (
        <button type="button" className={`icon-btn${tableView ? " on" : ""}`} title={tableView ? "Back to the chart" : "Show the numbers"} aria-label={tableView ? "Back to the chart" : "Show the numbers behind this chart"} aria-pressed={tableView} onClick={() => setTableView((v) => !v)}>
          <Icon name="table" />
        </button>
      )}
      <button ref={gearRef} type="button" className={`icon-btn${open || edited ? " on" : ""}`} title="Chart definition: display, axes, marks, backend" aria-label="Open the chart definition" aria-expanded={open} aria-controls={`authoring-${base.id}`} onClick={() => setAuthoringOpen(open ? null : base.id)}>
        <Icon name="settings" />
      </button>
    </>
  );

  const storyRow =
    stories.length > 0 ? (
      <div className="k-stories" role="group" aria-label="Questions this chart answers">
        {stories.map((st) => (
          <button key={st.id} type="button" className={`k-story${activeStory === st.id ? " on" : ""}`} aria-pressed={activeStory === st.id} onClick={() => applyStory(base.id, st)} title={(activeStory === st.id ? st.narrative : [st.narrative, st.badge].filter(Boolean).join(" · ")) || undefined}>
            {st.label}
          </button>
        ))}
      </div>
    ) : undefined;
  // The active story's answer and what it moved; "undo" turns it off and restores the deck.
  // A story the rebuilt chart no longer offers (its condition no longer holds) can still be undone.
  const badge = paramsNow ? copy.storyMoved(before, paramsNow) : null;
  const storyNote = activeStory ? (
    <>
      <span className="k-note-text" title={story?.narrative}>
        {story?.narrative ?? (story ? "" : "A question on this chart has set the deck.")}
      </span>
      {badge && <span className="k-chart-badge">{badge}</span>}
      <button type="button" className="k-textlink" onClick={() => applyStory(base.id, story ?? { id: activeStory, label: "" })}>
        undo
      </button>
    </>
  ) : undefined;

  let body;
  if (effective === "table") body = <TableView spec={spec} />;
  else if (isFigure)
    body = (
      <div className="k-plot">
        <FigureFrame spec={spec} Figure={figureFor(base)} height={height} />
      </div>
    );
  // `chart-plot` is the element the backend mounts into and hangs its probe on (scripts/parity.mjs reads it).
  else body = <div ref={plotRef} className={`k-plot chart-plot${mounted ? "" : " loading"}`} data-loading={error ? "" : `Loading ${BACKEND_INFO[effective].label}…`} role="img" aria-label={spec.title} />;

  const overlay = error ? (
    <div className="k-chart-error" role="alert">
      <span>Could not render: {error}</span>
      {override && (
        <button type="button" className="btn small" onClick={() => clearOverride(base.id)}>
          Reset this chart
        </button>
      )}
    </div>
  ) : undefined;

  const footer = spec.caption ? <span className="k-chart-caption">{rich(spec.caption)}</span> : undefined;

  return (
    <ChartFrame
      ref={cardRef}
      id={`chart-${base.id}`}
      className={edited ? "edited" : undefined}
      title={spec.title}
      subtitle={spec.subtitle}
      tools={tools}
      tag={tag}
      toolsPinned={open || tableView}
      stories={storyRow}
      storyNote={storyNote}
      boxHeight={height}
      boxMode={isTable ? "max" : "fixed"}
      boxRef={boxRef}
      overlay={overlay}
      footer={footer}
    >
      {body}
      {open && (
        <Popover
          id={`authoring-${base.id}`}
          anchor={gearRef.current}
          beside={cardRef.current}
          avoid={boxRef.current}
          insetTop={inset}
          onClose={() => setAuthoringOpen(null)}
          label={`Chart definition: ${base.title}`}
          width={isFigure ? 320 : 400}
        >
          {isFigure ? <FigureSettings base={base} spec={spec} override={override} onClose={() => setAuthoringOpen(null)} /> : <Authoring base={base} spec={spec} override={override} onClose={() => setAuthoringOpen(null)} />}
        </Popover>
      )}
    </ChartFrame>
  );
}

/** The chart definition of a figure: not backend-switchable, so only its height and its data. */
function FigureSettings({ base, spec, override, onClose }: { base: ChartSpec; spec: ChartSpec; override: SpecOverride | undefined; onClose: () => void }) {
  const setOverride = useKit((s) => s.setOverride);
  const clearOverride = useKit((s) => s.clearOverride);
  return (
    <div className="authoring" role="group" aria-label={`Figure: ${base.title}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h4 className="group-h">Figure</h4>
        <button type="button" className="btn small quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted">Drawn by the app, not by a chart backend, so only its height is editable here. ⊞ shows the numbers behind it.</p>
      <div>
        <h5>Size</h5>
        <div style={{ marginTop: 6, maxWidth: 220 }}>
          <Num id={`${base.id}-h`} label="height (px)" value={spec.height ?? FIGURE_DEFAULT_HEIGHT} min={160} max={800} step={10} unit="int" onChange={(v) => v != null && setOverride(base.id, { height: v })} />
        </div>
      </div>
      <div className="foot">
        <button type="button" className="btn small" onClick={() => void saveText(`${base.id}.csv`, toCsv(base.data), "text/csv")}>
          Data as CSV
        </button>
        <button type="button" className="btn small quiet" onClick={() => clearOverride(base.id)} disabled={!override}>
          Reset figure
        </button>
      </div>
    </div>
  );
}
