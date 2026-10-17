import { useEffect, useRef, useState } from "react";
import type { Datasets, Params } from "../model/params";
import { buildAll, type BuildResult } from "../viewmodel";

interface State {
  result: BuildResult | null;
  pending: boolean;
  error: string | null;
}

interface Request {
  id: number;
  params: Params;
  datasets: Datasets;
}

/** How long the very first build may take before the worker is presumed blocked by the host. */
const STARTUP_GRACE_MS = 6000;

/**
 * Builds every section off the main thread. Falls back to an inline build only when
 * the worker cannot start or never answers its first request; a slow build is not a
 * failure. Requests coalesce: at most one is in flight, and while it runs only the
 * latest newer request is kept, so a sweep or a fast drag never queues stale work.
 */
export function useBuild(params: Params, datasets: Datasets): State {
  const [state, setState] = useState<State>({ result: null, pending: true, error: null });
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const failedRef = useRef(false);
  const answeredRef = useRef(false);
  const inFlightRef = useRef<number | null>(null);
  const queuedRef = useRef<Request | null>(null);

  const runInline = (req: Request) => {
    try {
      setState({ result: buildAll(req.params, req.datasets), pending: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, pending: false, error: (e as Error).message }));
    }
  };

  const post = (req: Request) => {
    const w = workerRef.current;
    if (!w) return;
    inFlightRef.current = req.id;
    w.postMessage(req);
  };

  useEffect(() => {
    if (failedRef.current) return;
    try {
      const w = new Worker(new URL("../viewmodel/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; out?: BuildResult; error?: string }>) => {
        answeredRef.current = true;
        inFlightRef.current = null;
        const q = queuedRef.current;
        if (q) {
          queuedRef.current = null;
          post(q);
        }
        if (e.data.id !== idRef.current) return;
        if (e.data.out) setState({ result: e.data.out, pending: false, error: null });
        else setState((s) => ({ ...s, pending: false, error: e.data.error ?? "unknown error" }));
      };
      w.onerror = () => {
        failedRef.current = true;
        w.terminate();
        workerRef.current = null;
        inFlightRef.current = null;
        const q = queuedRef.current;
        queuedRef.current = null;
        if (q) runInline(q);
      };
      workerRef.current = w;
    } catch {
      failedRef.current = true;
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = ++idRef.current;
    const req: Request = { id, params, datasets };
    setState((s) => ({ ...s, pending: true }));
    const w = workerRef.current;
    if (w && !failedRef.current) {
      if (inFlightRef.current != null) queuedRef.current = req;
      else post(req);
      if (answeredRef.current) return;
      // The first request only: if the worker never answers (blocked by the host), build inline.
      const t = window.setTimeout(() => {
        if (answeredRef.current || idRef.current !== id) return;
        failedRef.current = true;
        workerRef.current?.terminate();
        workerRef.current = null;
        runInline(req);
      }, STARTUP_GRACE_MS);
      return () => window.clearTimeout(t);
    }
    // Inline fallback, deferred one frame so the input that caused it can paint first.
    const t = window.setTimeout(() => {
      if (idRef.current !== id) return;
      runInline(req);
    }, 16);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, datasets]);

  return state;
}
