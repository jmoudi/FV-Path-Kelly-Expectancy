# Tranche Replay

An interactive explainer for one trading discussion: a tranche of capital replayed
across earnings seasons, the reduction of a season to a coin flip, what the mean of
that coin measures, why the premium over fair is expensive to calibrate, which
per-event loss rate belongs in the model, diversification within a night, shared
causes, the two axes of time and breadth, and chaining seasons.

The thesis the copy never contradicts: there is no informational or execution edge;
the only claim is sizing bets by their probability distributions in an efficient
market. The discussion's case (a 55% clean season, q = 2.94%) is an assumed risk
premium for selling tail insurance, not an information edge.

Every number in the discussion is recomputed from the inputs in the control deck. Each
section carries more than one view of the same quantity (a primary chart, secondary
charts, a table) and a list of every figure the discussion quoted next to what the app
computes for it, with an "agrees?" flag and a one-line reason when it does not.

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
| Model | `src/model/` | Pure math. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample) with `ratioForLossRate`, correlation, Kelly sizing and the robust optimum averaged over a band of loss rates, the two growth figures (`growth.ts`). `policies.ts` is the single source of the three policies' names and colours. No DOM, no chart library. |
| Parameters | `src/model/params.ts` | One typed object plus a schema with tiers: primary (control deck), secondary (tuned under a section), advanced (settings dialog). Includes the market switch (`market`: fair, discussion, custom) with `marketOf` / `marketPatch`. The wing's default realized ÷ priced sigma is solved at load so the wing's effective loss rate equals the deck's q. Imported datasets sit beside it. |
| View-model | `src/viewmodel/` | Turns model output into renderer-agnostic chart specs (`src/charts/spec.ts`): data table, mark, axes, series, annotations, stories. One file per section, plus `desk.ts` (the Desk's policy grid, sizing line, calibration verdict and market state) and `derived.ts` (shared derived state, the deck's figures, and the one number formatter: U+2212 minus everywhere, milliseconds under a second). Runs in a Web Worker (`worker.ts`) so sliders never block the page. |
| Axis resolution | `src/charts/resolve.ts` | Computes concrete domains, tick positions and tick labels once, so every backend draws the same ranges and puts reference lines in the same place. |
| Switchboard | `src/charts/registry.ts`, `src/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite, or an HTML table. Each backend is loaded on first use. |
| Authoring | `src/ui/Authoring.tsx`, stories in each spec | A story is a trader's question ("Half my nights have one name", "The chain is right: q = break-even") with a one-line answer; when it moves the deck it carries a badge ("moves deck: q 2.94% → 2.52%"). Display choices (axis scales, backends, zooms) are not stories; they live in ⚙, which edits the spec by hand (backend, mark, axis scale and domain in the axis's own units, x field, series visibility, mark and emphasis, extra columns, legend, height) and stores only the diff, keyed by chart id. |
| State | `src/state/store.ts` | Parameters, imported data, chart edits, default backend, and the snapshot of parameters a story moved. Only one deck-moving story is active at a time: applying one turns the other off and restores its parameters. Validated on load, persisted locally, exported and imported as one JSON file (version 4). `#reset` in the address clears it. |
| UI | `src/ui/` | Control deck, section layout, chart host, tables, dialogs. One dark theme, graphite, with three policy hues and two status colours. |

## Using the app

- **Deck.** Anchored under the top bar on every page, two rows when reduced: the
  inputs in three groups set apart by distance (per event, per season, sizing), each
  with its name and symbol; then the six figures as one status line, the sweep strip
  for the active input, and the toggle. The full deck (Full deck ▾) is two columns:
  inputs as titled sections with help and the sweep presets on the left, the figures
  as a table and the definitions on the right.
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
- **Story chips** under a chart title ask a trader's question in one click ("What if
  q is really 3.2%?", "I widen the wing to 1σ") and answer it in one line. Clicking an
  active chip undoes it, including the deck parameters it moved.
- **Market.** "Fair market" sets q = b/(1+b) (zero premium; the growth-optimal risk is
  then 0 and sizing only changes the median, P(below threshold) and ruin). "Discussion
  case" sets q so that a clean coin season has probability 55%. Typing q makes it
  custom.
- **⚙ on any chart** opens the chart definition as a popover that leaves the layout
  alone and closes when the pointer moves away; **⊞** shows the numbers behind it.
- **Data** imports a trade log (0/1 losses or P&L per unit of max loss) and realized
  moves in priced sigmas. The record feeds calibration and the robust sizing curve;
  the moves can replace the Normal in the effective-loss-rate section.
- **Settings** exist as a quick dialog (⚙ in the top bar) and as a full page: default
  backend, sweep presets, engine, resets. **Import / export** moves the whole state as
  JSON.

## Conventions worth knowing

- **Expected value per season** is mean − 1 (≈ 2p − 1): the average over a pool of
  independent replays, the same for Coin and Spread, and not what one tranche earns.
- **Premium over fair per event** is b/(1+b) − q: how far the deck's loss rate sits
  below the chain's fair rate. Deviations from fair are phrased as a premium the chain
  pays for tail insurance, never as an edge.
- **Log growth of surviving paths** is E[log end | the tranche survives], always shown
  next to P(ruin); the unconditional expectation is −∞ whenever ruin is possible.
  **Median growth per season** is median_N^(1/N) − 1, the rate the middle path
  compounds at; the two differ whenever the end distribution is skewed.
- The effective loss rate of a wing is E[payout]/W. A fairly priced wing has
  effective rate c/W, which equals the break-even rate b/(1+b). The default wing is
  solved so its effective rate equals the deck's q, and the section's first action
  takes the deck to the fair rate.
- The robust risk a night maximises growth averaged over loss rates drawn uniformly
  between the optimistic rate and break-even, or from a Beta posterior when a trade log
  is imported.
- Rates palette: optimistic = green, deck = ink, break-even = red. Policy colours are
  reserved for policies.

## The three policies

Every section compares the same three policies, derived from the deck and named from
`src/model/policies.ts` (never by letter):

- **Coin** 1 name, whole tranche (amber)
- **Spread** k names, whole tranche, no reserve (cyan)
- **Spread + reserve** k names, the deck's share of the tranche a night (violet); the
  policy the reader holds
