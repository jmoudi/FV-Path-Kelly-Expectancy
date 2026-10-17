import { useEffect, useRef, useState } from "react";
import type { Datasets, Params } from "../model/params";
import { buildAll, type BuildResult } from "../viewmodel";

interface State {
  result: BuildResult | null;
  pending: boolean;
  error: string | null;
}

/**
 * Builds every section off the main thread. Falls back to an inline build when
 * workers are unavailable. Stale responses are dropped so the latest input wins.
 */
export function useBuild(params: Params, datasets: Datasets): State {
  const [state, setState] = useState<State>({ result: null, pending: true, error: null });
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const failedRef = useRef(false);

  useEffect(() => {
    if (failedRef.current) return;
    try {
      const w = new Worker(new URL("../viewmodel/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; out?: BuildResult; error?: string }>) => {
        if (e.data.id !== idRef.current) return;
        if (e.data.out) setState({ result: e.data.out, pending: false, error: null });
        else setState((s) => ({ ...s, pending: false, error: e.data.error ?? "unknown error" }));
      };
      w.onerror = () => {
        failedRef.current = true;
        w.terminate();
        workerRef.current = null;
        setState((s) => ({ ...s, pending: true }));
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
  }, []);

  useEffect(() => {
    const id = ++idRef.current;
    setState((s) => ({ ...s, pending: true }));
    const w = workerRef.current;
    if (w && !failedRef.current) {
      w.postMessage({ id, params, datasets });
      // If the worker never answers (blocked by the host), compute inline after a grace period.
      const t = window.setTimeout(() => {
        if (idRef.current !== id) return;
        setState((s) => {
          if (!s.pending) return s;
          failedRef.current = true;
          try {
            return { result: buildAll(params, datasets), pending: false, error: null };
          } catch (e) {
            return { ...s, pending: false, error: (e as Error).message };
          }
        });
      }, 4000);
      return () => window.clearTimeout(t);
    }
    // Inline fallback, deferred one frame so the input that caused it can paint first.
    const t = window.setTimeout(() => {
      if (idRef.current !== id) return;
      try {
        setState({ result: buildAll(params, datasets), pending: false, error: null });
      } catch (e) {
        setState((s) => ({ ...s, pending: false, error: (e as Error).message }));
      }
    }, 16);
    return () => window.clearTimeout(t);
  }, [params, datasets]);

  return state;
}
