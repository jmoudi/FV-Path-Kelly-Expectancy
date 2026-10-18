/// <reference lib="webworker" />
/** The build worker's entry. Imports nothing that touches React or the DOM. */
import { defineBuildWorker } from "@kit/build/worker";
import { buildAll, type BuildInput, type BuildResult } from "@app/scenarios";

defineBuildWorker<BuildInput, BuildResult>(({ params, datasets }, opts) => buildAll(params, datasets, opts));
