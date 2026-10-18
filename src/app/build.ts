/** How this explainer builds: the worker entry next to this file, the same build inline, and the rendered signal. */
import { SettleTracker } from "@kit/build/coalesce";
import type { UseBuildConfig } from "@kit/build/useBuild";
import { buildAll, type BuildInput, type BuildResult } from "@app/scenarios";

/**
 * The rendered signal a frame-locked sweep waits on, holding the last result (the
 * sweep anchors read its deck figures). Was `buildSettled` in src/ui/useBuild.ts.
 */
export const BUILD_SETTLED = new SettleTracker<BuildResult>();

export const BUILD: UseBuildConfig<BuildInput, BuildResult> = {
  // Keep the URL a relative string literal next to import.meta.url: Vite finds and bundles workers only in that form (an alias does not work here).
  createWorker: () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  build: ({ params, datasets }, opts) => buildAll(params, datasets, opts),
  settled: BUILD_SETTLED,
};
