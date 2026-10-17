import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderHandle } from "../charts/backends/types";
import { loadBackend, BACKEND_INFO } from "../charts/registry";
import { applyOverride, type BackendId, type ChartSpec } from "../charts/spec";
import { useStore } from "../state/store";
import { Authoring } from "./Authoring";
import { ErrorBoundary } from "./ErrorBoundary";
import { Popover } from "./Popover";
import { TableView } from "./TableView";

/**
 * Renders one chart spec through the switchboard. Mounts lazily when scrolled
 * near the viewport, swaps backends on demand, and hosts the stories and the
 * chart-definition popover.
 */
export function ChartHost({ spec: base, viewId }: { spec: ChartSpec; viewId?: string }) {
  const clearOverride = useStore((s) => s.clearOverride);
  return (
    <ErrorBoundary
      fallback={(err, retry) => (
        <div className="chart-card" id={`chart-${base.id}`}>
          <div className="chart-head">
            <div className="t">
              <div className="chart-title">{base.title}</div>
              <div className="chart-sub">This chart could not render: {err.message}</div>
            </div>
          </div>
          <div className="actions">
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
        </div>
      )}
    >
      <ChartCard base={base} viewId={viewId} />
    </ErrorBoundary>
  );
}

function ChartCard({ base, viewId }: { base: ChartSpec; viewId?: string }) {
  const override = useStore((s) => s.overrides[base.id]);
  const defaultBackend = useStore((s) => s.defaultBackend);
  const authoringOpen = useStore((s) => s.authoringOpen);
  const setAuthoringOpen = useStore((s) => s.setAuthoringOpen);
  const applyStory = useStore((s) => s.applyStory);
  const spec = useMemo(() => applyOverride(base, override), [base, override]);
  const backendId: BackendId = spec.backend ?? (base.kind === "table" ? "table" : defaultBackend);
  const [tableView, setTableView] = useState(false);
  const effective: BackendId = tableView ? "table" : backendId;

  const cardRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<RenderHandle | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState<BackendId | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!visible || effective === "table") {
      handleRef.current?.dispose();
      handleRef.current = null;
      setMounted(null);
      return;
    }
    let cancelled = false;
    setError(null);
    loadBackend(effective)
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
  }, [visible, effective]);

  useEffect(() => {
    if (!handleRef.current || mounted !== effective) return;
    try {
      handleRef.current.update(spec);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [spec, mounted, effective]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el || !("ResizeObserver" in window) || effective === "table") return;
    const ro = new ResizeObserver(() => handleRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [effective, mounted]);

  const open = authoringOpen === base.id;
  const height = (spec.height ?? 300) + (base.kind === "heatmap" ? 90 : 70);
  const edited = !!override && !override.story;
  const activeStory = override?.story;
  const stories = base.stories ?? [];
  const story = stories.find((s) => s.id === activeStory);

  return (
    <div ref={cardRef} className={`chart-card${edited ? " edited" : ""}`} id={`chart-${base.id}`}>
      <div className="chart-head">
        <div className="t">
          <div className="chart-title">{spec.title}</div>
          {spec.subtitle && <div className="chart-sub">{spec.subtitle}</div>}
        </div>
        <div className="chart-tools">
          {viewId && (
            <a className="icon-btn" href={`#view/${viewId}`} title="Open this chart in its own view" aria-label="Open this chart in its own view">
              ↗
            </a>
          )}
          {base.kind !== "table" && (
            <button type="button" className={`icon-btn${tableView ? " on" : ""}`} title={tableView ? "Back to the chart" : "Show the numbers"} aria-label={tableView ? "Back to the chart" : "Show the numbers behind this chart"} aria-pressed={tableView} onClick={() => setTableView((v) => !v)}>
              ⊞
            </button>
          )}
          <button ref={gearRef} type="button" className={`icon-btn${open || edited ? " on" : ""}`} title="Chart definition: backend, axes, marks" aria-label="Open the chart definition" aria-expanded={open} onClick={() => setAuthoringOpen(open ? null : base.id)}>
            ⚙
          </button>
        </div>
      </div>
      {stories.length > 0 && (
        <div className="stories" role="group" aria-label="Stories">
          {stories.map((st) => (
            <button key={st.id} type="button" className={`chip${activeStory === st.id ? " on" : ""}`} onClick={() => applyStory(base.id, st)} title={st.narrative}>
              {st.label}
            </button>
          ))}
          {story?.narrative && <span className="story-narrative">{story.narrative}</span>}
        </div>
      )}
      {effective === "table" ? (
        <TableView spec={spec} />
      ) : (
        <div
          ref={plotRef}
          className={`chart-plot${mounted ? "" : " loading"}`}
          style={{ height }}
          data-loading={error ? `Could not render: ${error}` : `Loading ${BACKEND_INFO[effective].label}…`}
          role="img"
          aria-label={spec.title}
        />
      )}
      {(spec.caption || edited || effective !== "echarts") && (
        <div className="caption" style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          {spec.caption && <span>{spec.caption}</span>}
          <span className="backend-tag" style={{ marginLeft: "auto" }}>
            {BACKEND_INFO[effective].label}
            {edited ? " · edited" : ""}
          </span>
        </div>
      )}
      {open && (
        <Popover anchor={gearRef.current} onClose={() => setAuthoringOpen(null)} label={`Chart definition: ${base.title}`} width={420}>
          <Authoring base={base} spec={spec} override={override} onClose={() => setAuthoringOpen(null)} />
        </Popover>
      )}
    </div>
  );
}
