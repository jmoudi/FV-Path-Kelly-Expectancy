# kit/build

Off-thread build scaffolding, independent of what is built.

- `BuildQueue<Req>`: at most one request in flight, only the newest waiting; every
  answer newer than the last one shown is shown (a stream of requests renders each
  answer as it lands). `fail()` hands back the newest unanswered request for an inline
  fallback.
- `SettleTracker<R>`: the page marks each shown answer as rendered with the time its
  request was made; `settledSince(t)` answers "has a build requested after t rendered?",
  which is what a frame-locked sweep waits on.

What the app supplies: the `send` that posts to its worker (or runs inline), and the
place that marks an answer rendered (after the commit, in the next animation frame).
In this app: `src/ui/useBuild.ts`, which also sends `only` (the scenarios on screen)
while a sweep runs.
