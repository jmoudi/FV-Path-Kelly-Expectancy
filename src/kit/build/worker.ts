/// <reference lib="webworker" />
/**
 * The worker side of a build: the app's worker entry calls defineBuildWorker once with
 * its build function. Requests carry an id, the app's input and an optional `only` list
 * (during a sweep: the scenarios on screen); answers carry the id back with the output
 * or an error message. No React, no DOM.
 */

export interface BuildOptions {
  /** Build only these scenarios (plus what the app always builds). Omitted: everything. */
  only?: string[];
}

export interface BuildRequest<I> {
  id: number;
  input: I;
  only?: string[];
}

export type BuildResponse<O> = { id: number; out: O; error?: undefined } | { id: number; out?: undefined; error: string };

export function defineBuildWorker<I, O>(build: (input: I, opts: BuildOptions) => O): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = (e: MessageEvent<BuildRequest<I>>) => {
    const { id, input, only } = e.data;
    try {
      const out = build(input, only ? { only } : {});
      scope.postMessage({ id, out } satisfies BuildResponse<O>);
    } catch (err) {
      scope.postMessage({ id, error: (err as Error).message } satisfies BuildResponse<O>);
    }
  };
}
