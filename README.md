# Tranche Replay

An interactive explainer for one trading discussion: a tranche of capital replayed
across earnings seasons, the reduction of a season to a coin flip, what the mean of
that coin measures, why the premium over fair is expensive to calibrate (and why the
60% symmetric system is cheap to calibrate), which per-event loss rate belongs in the
model and what the wing's width does to the season, diversification within a night,
shared causes, the two axes of time and breadth (the railroad schematic and a season
by the calendar), chaining seasons, and refilling the tranche from NAV.

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
npm run parity     # every chart × backend draws the same marks (see below)
```

### Backend parity

`npm run parity` (`scripts/parity.mjs`) builds the app, serves `dist/` with its own
`vite preview` on a free port in 4300–4399, and opens every view (`#view/<id>`, the
ids come from the view-model) once with ECharts, once with Plotly and once with
Vega-Lite as the default backend. Each backend exposes a probe on the element it drew
into that reads back, from the library's own model or DOM, what it actually drew:
bars (count, summed length, position, thickness), points and line vertices per
series, band and area fills, reference lines, dots, labels, heatmap cells and the
axis ranges. ECharts is the reference and is itself checked against the resolved
spec; any disagreement fails the run. Options: `--no-build`, `--only=<chart ids>`,
`--viewport=400x800`. It needs Playwright (resolved from the project,
`$PLAYWRIGHT_PATH` or the global npm root) and a Chromium at `$PARITY_CHROME`.

## How it is put together

The code is split so that the data, the chart definitions, and the renderers can each
be swapped without touching the others.

| Layer | Where | What it knows |
|---|---|---|
| Model | `src/model/` | Pure math. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample) with `ratioForLossRate`, correlation, Kelly sizing and the robust optimum averaged over a band of loss rates, the two growth figures (`growth.ts`). The discussion's remaining concepts each have a file: `nav.ts` (NAV log growth and the Kelly share of NAV when the tranche is refilled each season), `railroad.ts` (stations, tracks and track widths of the schematic), `calendar.ts` (names per night from a histogram, Kelly per name with the capital ceiling, the sampled and expected season), `wingSeason.ts` (the season-end distribution the wing's partial payout produces, and the share of bad seasons that are partial), `symmetric.ts` (the 60% symmetric-payoff system's season). `policies.ts` is the single source of the three policies' names and colours. No DOM, no chart library. |
| Parameters | `src/model/params.ts` | One typed object plus a schema with tiers: primary (control deck), secondary (tuned under a section), advanced (settings dialog). Includes the market switch (`market`: fair, discussion, custom) with `marketOf` / `marketPatch`. The wing's default realized ÷ priced sigma is solved at load so the wing's effective loss rate equals the deck's q. Imported datasets sit beside it. |
| View-model | `src/viewmodel/` | Turns model output into renderer-agnostic chart specs (`src/charts/spec.ts`): data table, mark, axes, series, annotations, stories. One file per section, plus `desk.ts` (the Desk's policy grid, sizing line, calibration verdict and market state) and `derived.ts` (shared derived state, the deck's figures, and the one number formatter: U+2212 minus everywhere, milliseconds under a second). Runs in a Web Worker (`worker.ts`) so sliders never block the page. |
| Axis resolution | `src/charts/resolve.ts` | `resolveChart` computes, once per render, everything a backend needs: domains, ticks and tick labels (ECharts uses them too, not its own), which axis is drawn where (`orientation: "horizontal"` puts the x field up the side), the bar plan, where each annotation label goes, and how the legend wraps. Every backend draws the same ranges, lines, labels and bars. |
| Chart kit | `src/kit/charts/` | Generic pieces with no domain knowledge: `bars.ts` (grouped when series share a position, overlaid when they never do, stacked on request; px thickness that never overruns its neighbours; axis ends widened so edge bars show whole; step vertices), `collide.ts` (greedy label placement), `probe.ts` and `parity.ts` (what a backend drew, and the comparison the parity script runs). |
| Switchboard | `src/charts/registry.ts`, `src/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite, or an HTML table. Each backend is loaded on first use. All three draw from the same point lists (`backends/types.ts`); the Plotly figure and the Vega-Lite spec are built by pure modules (`plotlyFigure.ts`, `vegaSpec.ts`) that the tests inspect without a DOM. |
| Figures | `src/charts/figures/` | Charts of kind `figure` (the railroad schematic, the season calendar) are drawn by a React SVG component from the registry in `index.ts`, sized to the width the host gives them, in the theme's colours. They are not backend-switchable: ⊞ shows their data table and ⚙ offers only the height. |
| Authoring | `src/ui/Authoring.tsx`, stories in each spec | A story is a trader's question ("Half my nights have one name", "The chain is right: q = break-even") with a one-line answer; when it moves the deck it carries a badge ("moves deck: q 2.94% → 2.52%"). Display choices (axis scales, backends, zooms) are not stories; they live in ⚙, which edits the spec by hand (backend, mark, axis scale and domain in the axis's own units, x field, series visibility, mark and emphasis, extra columns, legend, height) and stores only the diff, keyed by chart id. |
| State | `src/state/store.ts` | Parameters, imported data, chart edits, default backend, and the snapshot of parameters a story moved. Only one deck-moving story is active at a time: applying one turns the other off and restores its parameters. Validated on load, persisted locally, exported and imported as one JSON file (version 4). `#reset` in the address clears it. |
| Kit frames | `src/kit/ui/`, `src/kit/charts/` | Generic layout pieces that know nothing about tranches and take what they show through props: the section skeleton (`SectionFrame`), the answer strip, the footer line and its tabbed panel, the view page (`ViewFrame`), the comparison grid (`DeskGrid`), portal menus, settings groups and the hotkey legend, and the chart frame (`ChartFrame`: borderless, fixed plot box). Their CSS is `src/kit/ui/kit.css`; it reads only the theme's tokens. See `src/kit/ui/README.md`. |
| App adapters | `src/app/` | Turn this app's view-model into the kit's props: KPIs into figures, sections into chips and the Views menu, the DeskView into the grid (`src/app/desk/grid.ts`), a story's snapshot into its "moves deck" badge. |
| UI | `src/ui/` | The pages (Desk, Explain, view, Settings), the chart host, tables, dialogs, the deck. One dark theme, graphite (`theme.css`: colour tokens and a token-only type scale), with three policy hues and two status colours. |

## Using the app

- **Deck.** Anchored under the top bar on every page, two rows when reduced: the
  inputs in three groups set apart by distance (per event, per season, sizing), each
  with its name and symbol; then the six figures as one status line, the sweep strip
  for the active input, and the toggle. The full deck (Full deck ▾) is two columns:
  inputs as titled sections with help and the sweep presets on the left, the figures
  as a table and the definitions on the right.
- **Desk** (`#desk`, the landing page) answers "given my book, what happens?": the
  three policies side by side for one season and for N seasons (mean, median, 10th
  percentile, P(below threshold), ruin; each row links to the view that explains it),
  the sizing heatmap with your cell outlined beside the robust risk, the one-line
  calibration verdict, and the market switch.
- **Explain** (`#explain`; `#tour` and `#s-<section>` still work) is the guided single
  page. Each section, without boxes: an eyebrow with its number and its views, the
  title, the question it answers with the claim as a narrow aside beside it, two or
  three numbers inline, the section's own inputs as an open row above the chart they
  drive, the primary chart, the secondary charts in two columns, and one footer line
  ("Table · Derivations · Quoted vs recomputed (5)") that opens a fixed-height tabbed
  panel in place.
- **Views** are the same charts split into 19 responsibilities, each titled with the
  trader's question it answers ("How long until my record proves q", "How much to risk
  a night", …), on its own page with the context beside it. Open them from the Views
  menu, the links next to a section's number, or the ↗ on any chart; `[` and `]` step
  through them outside a text field.
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
- **Stories** under a chart title ask a trader's question in one click ("What if
  q is really 3.2%?", "I widen the wing to 1σ") and answer it in one line; when one
  moves the deck the line says so ("moves deck: q 2.94% → 2.52% · undo"). Clicking an
  active story, or undo, turns it off and puts back the deck parameters it moved.
- **Market.** "Fair market" sets q = b/(1+b) (zero premium; the growth-optimal risk is
  then 0 and sizing only changes the median, P(below threshold) and ruin). "Discussion
  case" sets q so that a clean coin season has probability 55%. Typing q makes it
  custom.
- **Charts** are borderless; their tools (↗ ⊞ ⚙) show on hover or keyboard focus.
  The plot box has the spec's height whatever it shows: **⊞** puts the numbers in the
  same box (sticky header, scrolling inside), and errors render there too. **⚙** opens
  the chart definition (display first: linear or log axes, mark, legend, reference
  lines; then ranges, series, backend, height) as a popover beside the chart on the
  side with more room, or above or below the plot when neither side has room, never
  over the plot; at 900px and below it is a bottom sheet. It leaves the layout alone
  and closes when the pointer moves away. The backend shows as a tag only when it is
  not the default or the chart is edited.
- **Data** imports a trade log (0/1 losses or P&L per unit of max loss) and realized
  moves in priced sigmas. The record feeds calibration and the robust sizing curve;
  the moves can replace the Normal in the effective-loss-rate section.
- **Settings.** The quick dialog (⚙ in the top bar) holds exactly the default
  backend, drag sensitivity, sweep rate and the resets. The full page (`#settings`)
  adds the sweep presets, the engine (engine, enumeration cap, Monte Carlo paths, seed,
  fan paths, as plain number boxes), your data, import and export, and the hotkey
  legend. **Import / export** moves the whole state as JSON. At 700px and below the
  top bar's Data, Import / export and ⚙ fold into one "⋯" menu.

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
- Rates palette: optimistic = green, deck = ink (near white on graphite), break-even =
  red, wherever those rates are a series or an annotation; a test holds every chart to
  it. Policy colours are reserved for policies; `ink2` is the neutral accent for asides.
- Chart conventions: bars on a numeric axis are drawn at their exact positions with a
  px thickness; annotation labels never overlap (vertical-line labels closer than 14px
  alternate top and bottom, horizontal-line labels stack, point labels move aside);
  legends wrap above the plot instead of printing over it; a step chart can change
  level after each point or midway (`step: "middle"`, each point owns a centred step);
  a series with `band` fills down to its lower edge. Chart numbers print through
  `src/charts/format.ts`, which matches the app's formatter, U+2212 minus included.
- **Refilling from NAV** makes a season a bet of a share f of NAV on the season-end
  multiple X; NAV grows at E[log(1 − f + f·X)] and the growth-optimal share is
  f* ≈ 2p − 1 for the coin (exactly p − (1 − p)/(X − 1) for a two-point season).
- **The season by wing width** (section 04) holds the effective rate at the deck's q
  for every width by solving realized ÷ priced per width, so the three cumulative
  curves share a mean and differ only in shape; "bad seasons that are partial" is
  P(0 < end < 1) ÷ P(end < 1).
- **The calendar** (section 07) draws 0–5 names a night from the six share inputs
  (scaled to 100%), sizes each name at f* = p − q/b capped at 1/names, and adds each
  night's expected log to the season; an empty night adds no term.
- **The symmetric system** (section 03) is n trades at win rate p and stake s, ending
  at (1 + s)^w (1 − s)^(n − w) with w binomial; its growth-optimal stake is 2p − 1.

## The three policies

Every section compares the same three policies, derived from the deck and named from
`src/model/policies.ts` (never by letter):

- **Coin** 1 name, whole tranche (amber)
- **Spread** k names, whole tranche, no reserve (cyan)
- **Spread + reserve** k names, the deck's share of the tranche a night (violet); the
  policy the reader holds
