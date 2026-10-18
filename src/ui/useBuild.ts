import { useEffect, useRef, useState } from "react";
import { BuildQueue, SettleTracker, type Dispatch } from "../kit/build/coalesce";
import type { Datasets, Params } from "../model/params";
import { useStore } from "../state/store";
import { buildAll, type BuildResult } from "../viewmodel";
import { allCharts } from "../viewmodel/types";

interface State {
  result: BuildResult | null;
  pending: boolean;
  error: string | null;
  /** How many answers have been shown; bumps once per rendered build. */
  settled: number;
}

interface Request {
  params: Params;
  datasets: Datasets;
  /** During a sweep: the scenarios on screen. */
  only?: string[];
}

/** How long the very first build may take before the worker is presumed blocked by the host. */
const STARTUP_GRACE_MS = 6000;

/**
 * The rendered signal a frame-locked sweep waits on: marked in the animation frame
 * after each shown answer has been committed, with the time its request was made,
 * and holding the last result (the sweep's anchors read its deck figures).
 */
export const buildSettled = new SettleTracker<BuildResult>();

/**
 * What a sweep builds besides the deck figures and the Desk: the scenario of the view
 * in the address (#view/<id>), every tour section on screen, and every scenario with
 * a chart card on screen (the Desk's heatmap).
 */
export function sweepScope(last: BuildResult | null): string[] {
  if (!last || typeof document === "undefined") return [];
  const ids = new Set<string>();
  const view = /^#?view\/([\w-]+)/.exec(location.hash)?.[1];
  const vh = window.innerHeight;
  const onScreen = (el: Element | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < vh;
  };
  for (const s of last.scenarios) {
    if (view && (s.id === view || s.views.some((v) => v.id === view))) ids.add(s.id);
    else if (onScreen(document.getElementById(`s-${s.id}`))) ids.add(s.id);
    else if (allCharts(s).some((c) => onScreen(document.getElementById(`chart-${c.id}`)))) ids.add(s.id);
  }
  return [...ids];
}

/** A partial answer replaces the scenarios it built and keeps the others as they were last shown. */
export function mergeResult(prev: BuildResult | null, next: BuildResult): BuildResult {
  if (!next.partial || !prev) return next;
  const fresh = new Map(next.scenarios.map((s) => [s.id, s]));
  const scenarios = prev.scenarios.map((s) => fresh.get(s.id) ?? s);
  for (const s of next.scenarios) if (!prev.scenarios.some((x) => x.id === s.id)) scenarios.push(s);
  return { ...next, scenarios };
}

/**
 * Builds every section off the main thread. Falls back to an inline build only when
 * the worker cannot start or never answers its first request; a slow build is not a
 * failure.
 *
 * Requests coalesce (at most one in flight, only the newest waits) and every answer
 * newer than the last one shown is rendered, so a sweep or a fast drag shows each
 * build as it lands. While a sweep runs, a request builds only the deck figures, the
 * Desk and the scenarios on screen; when it stops, one full build follows.
 */
export function useBuild(params: Params, datasets: Datasets): State {
  const [state, setState] = useState<State>({ result: null, pending: true, error: null, settled: 0 });
  const sweeping = useStore((s) => Object.values(s.runs).some((r) => r.startedAt != null));
  const workerRef = useRef<Worker | null>(null);
  const failedRef = useRef(false);
  const answeredRef = useRef(false);
  const queueRef = useRef<BuildQueue<Request> | null>(null);
  /** The last result shown (partial answers merged in). */
  const lastRef = useRef<BuildResult | null>(null);
  /** The newest request made, re-sent when the queue is recreated. */
  const latestReqRef = useRef<Request | null>(null);
  /** The answer just shown, to mark as rendered after React commits it. */
  const toMarkRef = useRef<{ at: number; result: BuildResult | null } | null>(null);
  const prevRef = useRef<{ params: Params; datasets: Datasets } | null>(null);

  useEffect(() => {
    let disposed = false;
    const receive = (q: BuildQueue<Request>, id: number, out?: BuildResult, error?: string) => {
      if (disposed) return;
      const { show, requestedAt } = q.answer(id);
      if (!show) return;
      const pending = q.pending;
      if (out) {
        const merged = mergeResult(lastRef.current, out);
        lastRef.current = merged;
        toMarkRef.current = { at: requestedAt, result: merged };
        setState((s) => ({ result: merged, pending, error: null, settled: s.settled + 1 }));
      } else {
        toMarkRef.current = { at: requestedAt, result: null };
        setState((s) => ({ ...s, pending, error: error ?? "unknown error", settled: s.settled + 1 }));
      }
    };
    const runInline = (q: BuildQueue<Request>, d: Dispatch<Request>) => {
      // One frame later, so the input that caused it can paint first.
      window.setTimeout(() => {
        if (disposed) return;
        try {
          receive(q, d.id, buildAll(d.req.params, d.req.datasets, d.req.only ? { only: d.req.only } : {}));
        } catch (e) {
          receive(q, d.id, undefined, (e as Error).message);
        }
      }, 16);
    };
    const queue: BuildQueue<Request> = new BuildQueue<Request>((d) => {
      const w = workerRef.current;
      if (w && !failedRef.current) w.postMessage({ id: d.id, params: d.req.params, datasets: d.req.datasets, only: d.req.only });
      else runInline(queue, d);
    });
    const failOver = () => {
      failedRef.current = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      const lost = queue.fail();
      if (lost) queue.request(lost.req);
    };
    queueRef.current = queue;

    let watchdog = 0;
    if (!failedRef.current) {
      try {
        const w = new Worker(new URL("../viewmodel/worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<{ id: number; out?: BuildResult; error?: string }>) => {
          answeredRef.current = true;
          receive(queue, e.data.id, e.data.out, e.data.error);
        };
        w.onerror = () => {
          if (!disposed) failOver();
        };
        workerRef.current = w;
        // If the worker never answers its first request (blocked by the host), build inline.
        watchdog = window.setTimeout(() => {
          if (!disposed && !answeredRef.current && workerRef.current) failOver();
        }, STARTUP_GRACE_MS);
      } catch {
        failedRef.current = true;
        workerRef.current = null;
      }
    }
    if (latestReqRef.current) queue.request(latestReqRef.current);
    return () => {
      disposed = true;
      window.clearTimeout(watchdog);
      workerRef.current?.terminate();
      workerRef.current = null;
      if (queueRef.current === queue) queueRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { params, datasets };
    const inputsChanged = !prev || prev.params !== params || prev.datasets !== datasets;
    // Only the sweep state changed: starting needs nothing; stopping needs one full build if the last was partial.
    if (!inputsChanged && (sweeping || !latestReqRef.current?.only)) return;
    const req: Request = { params, datasets, ...(sweeping ? { only: sweepScope(lastRef.current) } : {}) };
    latestReqRef.current = req;
    const q = queueRef.current;
    if (!q) return;
    q.request(req);
    setState((s) => (s.pending ? s : { ...s, pending: true }));
  }, [params, datasets, sweeping]);

  // After React has committed a shown answer (charts update in their own effects, which run first), mark it rendered.
  useEffect(() => {
    const m = toMarkRef.current;
    if (!m) return;
    toMarkRef.current = null;
    requestAnimationFrame(() => buildSettled.markRendered(m.at, m.result));
  }, [state.settled]);

  return state;
}
