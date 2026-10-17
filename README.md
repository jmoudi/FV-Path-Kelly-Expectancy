# Tranche Replay

An interactive explainer for one trading discussion: a tranche of capital replayed
across earnings seasons, the reduction of a season to a coin flip, what the mean of
that coin measures, why the edge is expensive to calibrate, which per-event loss rate
belongs in the model, diversification within a night, shared causes, the two axes of
time and breadth, and chaining seasons.

Every number in the discussion is recomputed from the inputs in the control deck. Each
section carries more than one view of the same quantity (a primary chart, secondary
charts, a table) and a list of the figures the discussion quoted next to what the app
computes for them.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm test           # model tests against the discussion's figures
```

## How it is put together

The code is split so that the data, the chart definitions, and the renderers can each
be swapped without touching the others.

| Layer | Where | What it knows |
|---|---|---|
| Model | `src/model/` | Pure math. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample), correlation, Kelly sizing and the robust optimum averaged over a band of loss rates. No DOM, no chart library. |
| Parameters | `src/model/params.ts` | One typed object plus a schema with tiers: primary (control deck), secondary (tuned under a section), advanced (settings dialog). Imported datasets sit beside it. |
| View-model | `src/viewmodel/` | Turns model output into renderer-agnostic chart specs (`src/charts/spec.ts`): data table, mark, axes, series, annotations, stories. One file per section. Runs in a Web Worker (`worker.ts`) so sliders never block the page. |
| Axis resolution | `src/charts/resolve.ts` | Computes concrete domains, tick positions and tick labels once, so every backend draws the same ranges and puts reference lines in the same place. |
| Switchboard | `src/charts/registry.ts`, `src/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite, or an HTML table. Each backend is loaded on first use. |
| Authoring | `src/ui/Authoring.tsx`, stories in each spec | A story is a one-click re-definition of a chart (and sometimes of the deck), shown as chips under the chart title. The ⚙ panel edits the spec by hand (backend, mark, axis scale and domain in the axis's own units, x field, series visibility, mark and emphasis, extra columns, legend, height) and stores only the diff, keyed by chart id. |
| State | `src/state/store.ts` | Parameters, imported data, chart edits, default backend. Validated on load, persisted locally, exported and imported as one JSON file. `#reset` in the address clears it. |
| UI | `src/ui/` | Control deck, section layout, chart host, tables, dialogs. One dark theme, graphite, with three policy hues and two status colours. |

## Using the app

- **Deck bar.** Anchored under the top bar on every page. Collapsed: the six inputs in
  three groups (per event, per season, sizing) and two headline figures. Expanded
  (Deck ▾): full inputs with help, every figure, the definitions, and the sweep presets.
  A thin strip under it shows the active input's presets and run state.
- **Tour** is the guided single page: each section has a functional title, a one-line
  lede, the claim it defends in a boxed aside, an inputs bar, two headline figures, the
  primary chart, secondary charts, and expanders for tables, notes and the
  quoted-versus-recomputed figures.
- **Views** are the same charts split into 17 responsibilities (season outcomes,
  sizing grid, confidence band, candidate rates, …), each on its own page with the
  context beside it. Open them from the Views menu, the chips next to a section title,
  the ↗ on any chart, or Alt+← / Alt+→.
- **Inputs** are synthetic number fields: type, use the wheel (Shift ×10, Alt ×0.1),
  arrow keys, or drag the slider underneath. Dragging is relative and its feel is a
  per-parameter distance in pixels (`input.sensitivityPx` in the schema), scaled by a
  global sensitivity in Settings. Double-click a slider for the default. Focusing a
  field makes it the active input.
- **Sweeps** drive an input automatically from a saved preset: loop, ping-pong, or a
  list of spots with hold times; over the whole range, a fraction of it, or absolute
  values; with any step and interval, gliding or stepping. Presets are generic and
  linked per input; links are saved with the state. On the active input: Ctrl+Enter
  runs or pauses, Ctrl+. stops, Ctrl+[ and Ctrl+] switch presets, Ctrl+Shift+Enter
  pauses everything. Inputs that make no sense to sweep (seed, engine caps) are marked.
- **Undo.** Ctrl+Z / Ctrl+Shift+Z step through parameter changes, including the state
  before a sweep started.
- **Story chips** under a chart title re-define it in one click ("zoom on the range
  you cannot rule out", "what if q is really 3.2%?"). Clicking an active chip undoes it.
- **⚙ on any chart** opens the chart definition as a popover that leaves the layout
  alone and closes when the pointer moves away; **⊞** shows the numbers behind it.
- **Data** imports a trade log (0/1 losses or P&L per unit of max loss) and realized
  moves in priced sigmas. The record feeds calibration and the robust sizing curve;
  the moves can replace the Normal in the effective-loss-rate section.
- **Settings** exist as a quick dialog (⚙ in the top bar) and as a full page: default
  backend, sweep presets, engine, resets. **Import / export** moves the whole state as
  JSON.

## Conventions worth knowing

- Growth is reported as E[log end | the tranche survives], always next to the
  probability of ruin. The unconditional expectation is −∞ whenever ruin is possible.
- The effective loss rate of a wing is E[payout]/W. A fairly priced wing has
  effective rate c/W, which equals the break-even rate b/(1+b): any deck rate below
  it is a claim about the chain.
- The robust risk per night maximises growth averaged over loss rates drawn uniformly
  between the optimistic rate and break-even, or from a Beta posterior when a trade log
  is imported.

## The three policies

Every section compares the same three policies, derived from the deck:

- **A** one name, whole tranche (the coin)
- **B** k names, whole tranche (diversified, no reserve)
- **C** k names, the deck's share of the tranche (diversified, with reserve)
