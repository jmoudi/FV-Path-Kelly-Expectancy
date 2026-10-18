# kit/sweeps

Drive an input automatically from a saved preset, locked to the page's frames.

- `types.ts`: presets (loop, ping-pong,
  spots), ranges (whole, share, absolute, ± around the current value, two anchors),
  steps in the input's units or as a share of the range, plans, runs.
- `engine.ts`: `planSweep(preset, ctx)` resolves a preset for one input into
  values and holds, with the phase offset from the current value; `valueAt` is the ideal
  timeline; `describePreset(preset, ctx, fmt)` prints it in the input's units.
- `sanitize.ts`: validation and the migration of the old share-of-range format; the
  default presets and the legacy ids come in as a `PresetCatalog`.
- `runner.ts`: the frame-locked clock. `due(cursor, now, holdMs, settledSince)` says when
  to commit the next value: never before the last commit has rendered, and so that each
  value stays on screen about its hold.
- `adapter.ts`: the `SweepAdapter` interface, and `planWith`, `describeWith` and
  `plannerFor` (the store's planner) on top of it.
- `useSweeps.ts`: the engine hook that commits a running sweep's values (announcing each as `sweep:stepped` on the event bus; its cursors live inside the hook), and the hotkeys.
- `hotkeys.ts`: the keys' names (`HOTKEY_HINTS`, ⌘ or Ctrl), React-free so copy can import them.
- `SweepStrip.tsx` and `SweepPanel.tsx`: the strip under the deck and the preset editor.

A preset owns its step and its timing. The engine never reads parameter settings
(`kit/inputs/paramSettings.ts`, how a person edits a parameter by hand), and those never
read presets; the two share only the schema's range. A test holds a preset's plan
unchanged when the manual step changes (`tests/paramSettings.test.ts`).

What the app supplies: a `SweepAdapter` that gives a `SweepContext` per input (bounds,
default, the value before the run, the anchors its schema declares and a `resolve(id)`
for their values), a `SweepFormat` (value, delta, ms) and a `settledSince(t)` from its
build (see kit/build), plus a `PresetCatalog` for the store. In this app:
`src/app/sweeps.ts`, `src/app/sweepAnchors.ts` and `src/app/data/presets.ts`. Nothing here imports app code or
names a parameter.
