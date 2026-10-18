# kit/sweeps

Drive an input automatically from a saved preset, locked to the page's frames.

- `src/sweeps/types.ts` (moves here in the restructure): presets (loop, ping-pong,
  spots), ranges (whole, share, absolute, ± around the current value, two anchors),
  steps in the input's units or as a share of the range, plans, runs.
- `src/sweeps/engine.ts`: `planSweep(preset, ctx)` resolves a preset for one input into
  values and holds, with the phase offset from the current value; `valueAt` is the ideal
  timeline; `describePreset(preset, ctx, fmt)` prints it in the input's units.
- `src/sweeps/sanitize.ts`: validation and the migration of the old share-of-range format.
- `runner.ts`: the frame-locked clock. `due(cursor, now, holdMs, settledSince)` says when
  to commit the next value: never before the last commit has rendered, and so that each
  value stays on screen about its hold.

What the app supplies: a `SweepContext` per input (bounds, default, the value before the
run, the anchors its schema declares and a `resolve(id)` for their values), a
`SweepFormat` (value, delta, ms), a store that holds runs, and a `settledSince(t)` from
its build (see kit/build). Nothing here imports app code or names a parameter.
