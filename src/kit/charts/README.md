# kit/charts

Generic chart helpers. Nothing here knows about tranches, seasons or policies; the
files take numbers, positions and boxes, and the chart spec types from
`src/charts/spec.ts`.

- `bars.ts`: the bar plan every backend follows. `planBars` decides group / overlay /
  stack (series that never share a position are overlaid, not grouped) and a px
  thickness that never overruns neighbouring positions; `shiftByPx`, `toPx`,
  `spanOfPx` convert px to axis units on linear and log axes; `stackBases`;
  `stepVertices` for "after" and "middle" steps.
- `collide.ts`: `placeLabels` puts labels at the first free candidate position (or the
  least bad one); `estimateTextWidth` is deterministic so every backend agrees.
- `probe.ts`: the `RenderProbe` a backend reports about what it drew, `exposeProbe` to
  attach it to the element it drew into, `BarAccumulator` for bar geometry.
- `parity.ts`: `compareProbes(reference, other)` lists every disagreement.

Using it in another explainer: resolve your specs with `src/charts/resolve.ts`
(`resolveChart`), let each backend draw from the resolved chart, expose a probe per
mounted chart, and run `scripts/parity.mjs` against your own views (it reads the
view ids and chart specs from the view-model through Vite).
