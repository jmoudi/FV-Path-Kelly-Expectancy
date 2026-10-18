import { useEffect, useRef, useState } from "react";
import { useKit } from "@kit/state/context";
import { BuildQueue, type Dispatch, type SettleTracker } from "./coalesce";
import { mergeResult, sweepScope, type BuildOutput } from "./scope";
import type { BuildOptions, BuildResponse } from "./worker";

export interface UseBuildConfig<I, O extends BuildOutput> {
  /**
   * Starts the app's worker. Written in the app as
   *   () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
   * with a relative literal: Vite bundles a worker only from that exact form.
   */
  createWorker: () => Worker;
  /** The same build on the main thread: the fallback when the worker cannot start or never answers. */
  build: (input: I, opts: BuildOptions) => O;
  /** Marked once per shown answer, after it has rendered; the sweep runner and anchors read it. */
  settled: SettleTracker<O>;
  /** How long the very first build may take before the worker is presumed blocked by the host. */
  startupGraceMs?: number;
}

export interface BuildState<O> {
  result: O | null;
  pending: boolean;
  error: string | null;
  /** How many answers have been shown; bumps once per rendered build. */
  settled: number;
}

interface Request<I> {
  input: I;
  /** During a sweep: the scenarios on screen. */
  only?: string[];
}

/**
 * Builds every section off the main thread. Falls back to an inline build only when
 * the worker cannot start or never answers its first request; a slow build is not a
 * failure.
 *
 * Requests coalesce (at most one in flight, only the newest waits) and every answer
 * newer than the last one shown is rendered, so a sweep or a fast drag shows each
 * build as it lands. While a sweep runs, a request builds only what the app always
 * builds plus the scenarios on screen; when it stops, one full build follows.
 *
 * `input` must be memoised by the caller: a new identity is a new build.
 */
export function useBuild<I, O extends BuildOutput>(input: I, cfg: UseBuildConfig<I, O>): BuildState<O> {
  const [state, setState] = useState<BuildState<O>>({ result: null, pending: true, error: null, settled: 0 });
  const sweeping = useKit((s) => Object.values(s.runs).some((r) => r.startedAt != null));
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const workerRef = useRef<Worker | null>(null);
  const failedRef = useRef(false);
  const answeredRef = useRef(false);
  const queueRef = useRef<BuildQueue<Request<I>> | null>(null);
  /** The last result shown (partial answers merged in). */
  const lastRef = useRef<O | null>(null);
  /** The newest request made, re-sent when the queue is recreated. */
  const latestReqRef = useRef<Request<I> | null>(null);
  /** The answer just shown, to mark as rendered after React commits it. */
  const toMarkRef = useRef<{ at: number; result: O | null } | null>(null);
  const prevRef = useRef<I | null>(null);

  useEffect(() => {
    let disposed = false;
    const receive = (q: BuildQueue<Request<I>>, id: number, out?: O, error?: string) => {
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
    const runInline = (q: BuildQueue<Request<I>>, d: Dispatch<Request<I>>) => {
      // One frame later, so the input that caused it can paint first.
      window.setTimeout(() => {
        if (disposed) return;
        try {
          receive(q, d.id, cfgRef.current.build(d.req.input, d.req.only ? { only: d.req.only } : {}));
        } catch (e) {
          receive(q, d.id, undefined, (e as Error).message);
        }
      }, 16);
    };
    const queue: BuildQueue<Request<I>> = new BuildQueue<Request<I>>((d) => {
      const w = workerRef.current;
      if (w && !failedRef.current) w.postMessage({ id: d.id, input: d.req.input, only: d.req.only });
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
        const w = cfgRef.current.createWorker();
        w.onmessage = (e: MessageEvent<BuildResponse<O>>) => {
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
        }, cfgRef.current.startupGraceMs ?? 6000);
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
    prevRef.current = input;
    const inputsChanged = prev !== input;
    // Only the sweep state changed: starting needs nothing; stopping needs one full build if the last was partial.
    if (!inputsChanged && (sweeping || !latestReqRef.current?.only)) return;
    const req: Request<I> = { input, ...(sweeping ? { only: sweepScope(lastRef.current) } : {}) };
    latestReqRef.current = req;
    const q = queueRef.current;
    if (!q) return;
    q.request(req);
    setState((s) => (s.pending ? s : { ...s, pending: true }));
  }, [input, sweeping]);

  // After React has committed a shown answer (charts update in their own effects, which run first), mark it rendered.
  useEffect(() => {
    const m = toMarkRef.current;
    if (!m) return;
    toMarkRef.current = null;
    requestAnimationFrame(() => cfgRef.current.settled.markRendered(m.at, m.result));
  }, [state.settled]);

  return state;
}
