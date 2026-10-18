# kit/charts

Generic chart helpers. Nothing here knows about tranches, seasons or policies; the
files take numbers, positions and boxes, and the chart spec types from `spec.ts`.

- `spec.ts`: `ChartSpec` (data table, mark, axes, series, annotations, stories), the
  chart edits a reader makes in ⚙ (`SpecOverride`) and their sanitizer. An applied
  story is an override that also keeps the story's label and answer
  (`storyLabel`, `storyNarrative`), so `activeStoryOf` can show it pressed with its
  answer after a reload even when the rebuilt chart no longer offers it.
- `resolve.ts`: `resolveChart`, everything a backend needs, once per render.
- `registry.ts` and `backends/`: the switchboard to ECharts, Plotly, Vega-Lite or an
  HTML table, each loaded on first use, all drawing from the same point lists.
- `figures/`: the registry of SVG figure components (`registerFigures`, `figureFor`,
  `figureInfo`), `FigureFrame` and the draw-time `tokens.ts`.
- `theme.ts`: the palette (`THEME`; `configureTheme` replaces values before the first render).
- `format.ts` and `numbers.ts`: every printed number (U+2212 minus) and the text helpers.
- `scenario.ts`: `ScenarioView<P>`, what a scenario builder returns, with `quoted`,
  `near`, `movesDeck`, `allCharts`, `viewOfChart`.
- `ChartFrame.tsx`: the borderless frame with tools on hover and a plot box of fixed height.
- `bars.ts`: the bar plan every backend follows. `planBars` decides group / overlay /
  stack (series that never share a position are overlaid, not grouped) and a px
  thickness that never overruns neighbouring positions; `shiftByPx`, `toPx`,
  `spanOfPx` convert px to axis units on linear and log axes; `stackBases`;
  `stepVertices` for "after" and "middle" steps.
- `collide.ts`: `placeLabels` puts labels at the first free candidate position (or the
  least bad one); `estimateTextWidth` is deterministic so every backend agrees. The
  candidates (`resolve.ts`) end with the same spots slid inside the plot's width, so a
  long label on a narrow plot stays over the plot, not over the axis labels.
- `probe.ts`: the `RenderProbe` a backend reports about what it drew, `exposeProbe` to
  attach it to the element it drew into, `BarAccumulator` for bar geometry.
- `parity.ts`: `compareProbes(reference, other)` lists every disagreement.

Using it in another explainer: resolve your specs with `resolveChart`, let each backend draw from the resolved chart, expose a probe per
mounted chart, and run `scripts/parity.mjs` against your own views (it reads the
view ids and chart specs from the view-model through Vite).
