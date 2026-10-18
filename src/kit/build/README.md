# kit/build

Off-thread build scaffolding, independent of what is built.

- `BuildQueue<Req>`: at most one request in flight, only the newest waiting; every
  answer newer than the last one shown is shown (a stream of requests renders each
  answer as it lands). `fail()` hands back the newest unanswered request for an inline
  fallback.
- `SettleTracker<R>`: the page marks each shown answer as rendered with the time its
  request was made; `settledSince(t)` answers "has a build requested after t rendered?",
  which is what a frame-locked sweep waits on.

- `worker.ts`: `defineBuildWorker(build)` for the worker entry: it answers each
  request `{ id, input, only }` with `build(input, { only })`, or with the error.
- `useBuild.ts`: `useBuild(input, { createWorker, build, settled })` puts the two above
  together for a page: one request in flight through the queue, `only` (the scenarios on
  screen, `sweepScope`) while a sweep runs, partial answers merged into the last full
  one (`mergeResult`, both in `scope.ts`), an inline fallback when the worker does not
  answer in time, and each shown answer marked rendered after the commit.

What the app supplies: a worker entry that calls `defineBuildWorker`, the same build
function for the inline fallback, a `SettleTracker`, and `createWorker` written as
`() => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` with a
relative literal (Vite bundles a worker only from that form). The build's output is
`{ scenarios, partial? }` plus whatever else the app builds. In this app:
`src/app/build.ts` and `src/app/worker.ts`.
