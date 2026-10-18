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

Every number in the discussion is recomputed from the inputs in the deck. Each section
carries more than one view of the same quantity (a primary chart, secondary charts, a
table) and a list of every figure the discussion quoted next to what the app computes
for it, with an "agrees?" flag and a one-line reason when it does not.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type check, then the static site in dist/
npm test           # model, chart, deck, sweep, parameter-settings and Guide tests
npm run parity     # every chart × backend draws the same marks (see below)
```

### Backend parity

`npm run parity` (`scripts/parity.mjs`) builds the app, serves `dist/` with its own
`vite preview` on a free port in 4300–4399, and opens every view (`#view/<id>`, the
ids come from the view-model) once with ECharts, once with Plotly and once with
Vega-Lite as the default backend. Each backend hangs a probe on the element it drew
into (`#chart-<id> .chart-plot`) that reads back, from the library's own model or DOM,
what it actually drew: bars (count, summed length, position, thickness), points and
line vertices per series, band and area fills, reference lines, dots, labels, heatmap
cells and the axis ranges. ECharts is the reference and is itself checked against the
resolved spec; any disagreement fails the run. Options: `--no-build`,
`--only=<chart ids>`, `--viewport=400x800`. It needs Playwright (resolved from the
project, `$PLAYWRIGHT_PATH` or the global npm root) and a Chromium at `$PARITY_CHROME`.

## How it is put together

Two layers, so that the next finance explainer can keep the first and rewrite only
the second:

- **`src/kit/`** is generic and knows nothing about tranches, seasons or wings: chart
  specs and their resolution, the three backends and the figure registry, the parameter
  schema and the synthetic input, the sweep engine and its presets, the store factory,
  the build worker scaffolding, and the page frames (deck, sections, view pages, the
  comparison grid, settings, dialogs, routes, theme). It is driven by props, by the
  schema, by a sweep adapter and by the copy it is given. `src/kit/README.md` lists its
  areas, where an app plugs in, and the checklist for a second explainer, with a worked
  sketch; each area has a short README of its own.
- **`src/app/`** is this explainer: the maths, the parameters and their schema, the
  scenario builders, the deck and Desk providers, the two SVG figures, the copy, and the
  wiring (`App.tsx`, `store.ts`, `build.ts`, `sweeps.ts`, `worker.ts`, `DataDialog.tsx`).
- **`src/main.tsx`** loads `theme.css` then `kit.css`, writes the palette into the CSS
  variables (`applyThemeVars`), registers the figures, and mounts `<App />` inside
  `<KitProvider store schema sweeps copy>`.

Nothing in `src/kit` imports `src/app`; this prints nothing:

    grep -rnE 'from "(@app/|(\.\./)+app/)|import\("@app/' src/kit

Imports across areas use the aliases `@kit/<area>/…` and `@app/<area>/…` (tsconfig
`paths` and vite `resolve.alias`, kept in step); inside one area they are relative. The
worker URL in `src/app/build.ts` stays a relative literal,
`new URL("./worker.ts", import.meta.url)`, because Vite bundles a worker only from that
form. Inside the app the data, the chart definitions and the renderers can each be
swapped without touching the others.

### The kit (`src/kit/`)

| Area | Where | What it does |
|---|---|---|
| Charts | `src/kit/charts/` | `ChartSpec` and chart edits (`spec.ts`): data table, mark, axes, series, annotations, stories. `resolveChart` (`resolve.ts`) computes, once per render, everything a backend needs: domains, ticks and tick labels, which axis is drawn where (`orientation: "horizontal"` puts the x field up the side), the bar plan (`bars.ts`: grouped when series share a position, overlaid when they never do, stacked on request; px thickness that never overruns its neighbours), where each annotation label goes (`collide.ts`), and how the legend wraps. `ChartFrame` is the borderless frame (tools on hover, a plot box of fixed height). `format.ts` prints every chart number (U+2212 minus everywhere, milliseconds under a second) and `numbers.ts` holds the text helpers (`pct`, `x2`, `signedPp`, …). `theme.ts` is the palette (`configureTheme` replaces it for another explainer). `scenario.ts` is `ScenarioView<P>`, the unit a scenario builder returns. See its README. |
| Switchboard | `src/kit/charts/registry.ts`, `src/kit/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite or an HTML table, each loaded on first use. All three draw from the same point lists (`backends/types.ts`); the Plotly figure and the Vega-Lite spec are built by pure modules (`plotlyFigure.ts`, `vegaSpec.ts`) that the tests inspect without a DOM. `probe.ts` and `parity.ts` record what a backend drew and run the comparison behind `npm run parity`. |
| Figures | `src/kit/charts/figures/` | Charts of kind `figure`, drawn by a React SVG component the app registers (`registerFigures` in `registry.ts`, before the first render), in a `FigureFrame` with the theme's `tokens.ts`. Not backend-switchable: ⊞ shows their data and ⚙ offers only the height. |
| Inputs | `src/kit/inputs/` | `ParamDef<P>` and `createSchema` (`schema.ts`: `byKey`, `sanitize`, `sanitizePatch`, `coerce`). `SyntheticNumber` (box, wheel, relative drag track, sweep band and tick, the run marker's reserved slot), the wheel gate, the display rules, `NumberField` (the field wired to the store and the sweeps), `Num`, `ParamInput`, and `number-field.css` (also the sweep strip's styles). Parameter settings: `paramSettings.ts` (the six settings, their resolution over the schema's `input` defaults, the sanitizer, and the grid the wheel, arrows and drag land on) and `ParamSettings.tsx` (the field's ⚙ popover and the Settings page's table, styled by `param-settings.css`). |
| Sweeps | `src/kit/sweeps/` | Presets, plans and their sanitizers (`types.ts`, `engine.ts`, `sanitize.ts`, over the app's `PresetCatalog`); the frame-locked sweep clock (`runner.ts`: the next value only after the last one rendered, each value on screen at least its interval); the driver and the hotkeys (`useSweeps.ts`); the strip and the preset editor (`SweepStrip`, `SweepPanel`); and the `SweepAdapter` (`adapter.ts`) through which they ask the app for an input's context, its format and whether a build has rendered. |
| State | `src/kit/state/` | `createAppStore(config)`: parameters with undo and redo, imported data, chart edits, default backend, presets and links, settings, parameter settings (`paramSettings`, `setParamSettings`, `resetParamSettings`; never read by the sweeps), and the snapshot of parameters a story moved (only one deck-moving story is active at a time). Sweep runs are saved as input, preset and pre-sweep value only (ticks are never saved), so a reload mid-sweep puts the input back. Validated on load, persisted locally under one key, exported and imported as one versioned JSON file; `#reset` in the address clears it. `<KitProvider>` with `useKit`, `useKitApi`, `useSchema`, `useKitSweeps`, `useKitCopy` is how kit components reach the store, the schema, the sweep adapter and the copy. |
| Build | `src/kit/build/` | `defineBuildWorker` (the worker side) and `useBuild(input, { createWorker, build, settled })`: the build queue (`coalesce.ts`: one request in flight, the newest waiting, every answer newer than the last one shown rendered), `only` partial builds of the scenarios on screen during a sweep (`scope.ts`), and an inline fallback when the worker does not answer. |
| Frames | `src/kit/ui/` | The section skeleton and its composition (`SectionFrame`, `Section`), the answer strip, the footer line and its tabbed panel, the view page (`ViewFrame`, `ViewPage`), the chart host with the editor in ⚙ and the ⊞ table (`ChartHost`, `Authoring`, `TableView`), the comparison grid (`DeskGrid`), portal menus, settings (`Settings`, `SettingsBody`) and the hotkey legend, dialogs, popovers, the guide page (`GuideFrame`: a rail of section links beside prose, tables and key rows, from the app's `GuideSection[]`; `guide.css`), routes (`route.ts`: a `RouteConfig`, `viewHref`, `sectionHref`, and `#<page>/<part>` for a page's part), the shell hooks (`Shell.tsx`: scroll spy, `[` / `]` between views, the crash screen), adapters from a `ScenarioView` to frame props (`scenarioProps.tsx`: KPIs into figures, sections into chips and the Views menu), the frames' default copy (`copy.ts`), and the deck (`deck/`: the two-row bar, the drawer, the linked value, the segmented switch), all through props. One dark theme, graphite: `theme.css` holds the colour tokens and the token-only type scale, `kit.css` reads only those tokens, `deck/deck.css` styles the deck frame; the chrome (focus ring, focused field, active chips, primary buttons, active tab) reads `--accent`, a cream of its own; icons are drawn (`Icon.tsx`). Stacking: deck 25, top bar 30, drawer 35, dialogs 50, popovers 70, menus 80. See `src/kit/ui/README.md` and `src/kit/ui/deck/README.md`. |
| Maths | `src/kit/math/stats.ts` | The error function and the normal distribution, Student-t, lgamma, binomial, the regularized incomplete Beta, a seeded RNG, linspace and logspace, integration. No domain. |

### The app (`src/app/`)

| Area | Where | What it knows |
|---|---|---|
| Model | `src/app/model/` | Pure maths. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample) with `ratioForLossRate`, correlation, Kelly sizing and the robust optimum averaged over a band of loss rates, the two growth figures (`growth.ts`). The discussion's remaining concepts each have a file: `nav.ts` (NAV log growth and the Kelly share of NAV when the tranche is refilled each season), `railroad.ts` (stations, tracks and track widths of the schematic), `calendar.ts` (names per night from a histogram, Kelly per name with the capital ceiling), `wingSeason.ts` (the season-end distribution the wing's partial payout produces), `symmetric.ts` (the 60% symmetric-payoff system's season). `policies.ts` is the single source of the three policies' names and colours. No DOM, no chart library. |
| Parameters | `src/app/params/` | `params.ts`: one typed object and its defaults; the market switch (`market`: fair, discussion, custom) with `marketOf` / `marketPatch`; the wing's default realized ÷ priced sigma is solved at load so the wing's effective loss rate equals the deck's q. `schema.ts`: the schema (`PARAM_DEFS`, `SCHEMA` through the kit's `createSchema`): label, symbol, unit, range, tier (primary: the deck; secondary: a section's own inputs; advanced: Settings), help, definition, the input's feel (`input.perHundredPx`, `slider`), sweep anchors; where each deck input sits is one table (`DECK_PLACEMENT`: drawer group, first row, kept on a phone); seeds, caps and path counts take plain boxes. `datasets.ts`: the imported trade log and moves. `presets.ts`: the three default sweep presets (`PRESET_CATALOG`). `sweepAnchors.ts`: anchor values and unit formatting for sweeps. |
| Scenarios | `src/app/scenarios/` | The view-model: turns model output into the kit's chart specs, one file per section, plus `derived.ts` (shared derived state, the market state, and `movedBadge`, the "moves deck" badge of an active story) and `discussion.ts` (the discussion's setup and the quoted-vs-recomputed rows). `buildAll(params, datasets, { only })` (`index.ts`) builds everything, or during a sweep only the deck, the Desk and the scenarios on screen. Runs in a Web Worker (`src/app/worker.ts`). |
| Deck | `src/app/deck/` | `deckView.ts` (the deck's figures, built in the worker); `DeckBar.tsx`, the kit's `Deck` with this app's content; `useDeckProps.tsx`, `layout.ts` and `status.ts` (the schema and `DeckView` into the deck's groups, status, legend and drawer sections); the clean-season linked field (`CleanSeason.tsx`); the market switch (`MarketSwitch.tsx`); the strip slot (`DeckStrip.tsx`). |
| Desk | `src/app/desk/` | `desk.ts` (the Desk's policy grid, sizing line, calibration verdict, market state, built in the worker), `grid.ts` (the `DeskView` into the kit grid's columns and groups), `DeskPage.tsx`. |
| Figures | `src/app/figures/` | The railroad schematic and the season calendar (`Railroad.tsx`, `Calendar.tsx`), and `FIGURES` with their labels and blurbs (`index.ts`), registered in `main.tsx`. |
| Copy | `src/app/copy/` | `kitCopy.ts`: this app's sentences for the kit's frames (`KIT_COPY`, including `storyMoved`, which is `movedBadge`). `market.ts`: the market switch's lines. `guide.ts`: the Guide's ten sections as structured blocks (`GUIDE_SECTIONS`); keep it true to the GUI. |
| Wiring | `src/app/*.ts(x)` | `App.tsx`: the pages (Desk, Explain, view, Settings, Guide) and `ROUTES`. `store.ts`: the one store (`createAppStore` with storage key `tranche-replay:v1` and export version 5). `build.ts`: `BUILD` and `BUILD_SETTLED`. `sweeps.ts`: the `SweepAdapter`. `worker.ts`: the worker entry (`defineBuildWorker`). `DataDialog.tsx`: the trade-log and moves editors, in the Data dialog and the settings page's data group. |

## Using the app

- **Pages.** `#desk` is the landing page (an empty address opens it); `#explain` the
  guided tour (`#tour` and `#s-<section>` still work); `#view/<id>` one responsibility
  on its own page; `#settings` the full settings; `#guide` the Guide. The top bar reads
  Desk · Explain · Views ▾ · Settings · Guide, with Data, Import / export and ⚙ on the
  right; at 700px and below those three fold into one "⋯" menu (which also lists the
  Guide). The Views menu and "⋯" render above everything, so nothing clips them.
- **Guide.** `#guide` documents how the GUI works, in ten sections (the screen,
  parameters, editing a parameter by hand, parameter settings, the replayer, charts,
  pages, data and state, keys, for builders), each at `#guide/<section>`
  (`#guide/keys` is every shortcut in one table). A rail of section links marks the one
  being read. Linked from the top bar, the quick-settings dialog and the Settings page.
  Its text is `src/app/copy/guide.ts`; change it with the GUI.
- **Deck.** Anchored under the top bar on every page except Settings and the Guide, two rows when
  reduced. Row 1: eight fields in three groups set apart by 40px and a hairline (Per
  event: loss rate q, gain b, optimistic loss rate · Per season: nights n, names a
  night k, shared-cause nights c · Sizing: at risk a night, seasons chained N), and
  under the loss rate "= 55% clean season (Coin)": click it to type a clean-season
  probability and q is solved from it. Row 2: your policy (Spread + reserve, its
  colour a dot before the name) with EV per season, the median after N seasons,
  P(below the threshold) and ruin in ink; the Coin's clean season and ruin, muted,
  over the policy legend; the sweep
  strip of the active input in a slot whose width never changes; Full deck ▾. Below
  1280px the groups wrap whole; below 900px the Coin line and the legend take row 2's
  last line. On a phone row 1 keeps loss rate, gain, names a night
  and at risk a night, and "All inputs" opens the full deck as a bottom sheet.
- **Full deck** is a 460px drawer on the right, from under the top bar to the bottom
  of the window; it scrolls on its own and the charts stay live beside it. Sections:
  Event, Season, Sizing, Shared risk, Calibration band (every input with its full name,
  symbol and help, and a ⚙ on hover or focus for its parameter settings), Market,
  Figures (every policy named), Definitions. Collapse ▴ or Escape closes it (Escape
  closes an open ⚙ popover first). Presets are edited in Settings.
- **Desk** answers "given my book, what happens?": the three policies side by side for
  one season and for N seasons (mean, median, 10th percentile, P(below threshold),
  ruin; each row links to the view that explains it), the sizing heatmap with your
  cell outlined beside the robust risk, the one-line calibration verdict, and the
  market switch.
- **Explain** is the single page. Each section, without boxes: an eyebrow with its
  number and its views, the title, the question it answers with the claim as a narrow
  aside beside it, two or three numbers inline, the section's own inputs as an open
  row above the chart they drive, the primary chart, the secondary charts in two
  columns, and one footer line ("Table · Derivations · Quoted vs recomputed (5)") that
  opens a fixed-height tabbed panel in place.
- **Views** are the same charts split into 19 responsibilities, each titled with the
  trader's question it answers ("How long until my record proves q", "How much to risk
  a night", …), with the context beside the charts. Open them from the Views menu, the
  links next to a section's number, or the ↗ on any chart; `[` and `]` step to the
  previous or next view from any page when focus is not in a text field.
- **Inputs** are synthetic number fields: type, use the arrow keys (Page Up / Down ten
  steps), the wheel, or drag the track beside the box; Shift makes the wheel, the arrows
  and the drag fine. A click on the track focuses the field and leaves the value alone;
  double-click returns to the default. Dragging is relative, in the input's units per
  100 px (q and b 0.25 pp, nights 5, names 1, risk a night 10 pp, seasons 1; Shift
  ×0.1), times the drag sensitivity in Settings. The wheel acts only on a focused
  field, or after the pointer has rested on it for 400 ms with no page scroll in
  progress. The wheel, arrows and drag land on multiples of the step (the fine step with
  Shift), counted from zero; a typed value is clamped to the range and kept as typed.
  Focusing a field makes it the active input.
- **Parameter settings** are how a parameter is edited by hand, kept apart from its
  value and from the replayer: step (the quantum of the wheel, arrows and drag), fine
  step (Shift; default a tenth of the step, or a fifth or a half where the box cannot
  show a tenth), wheel step (one notch, a whole number of steps), drag per 100 px,
  decimals and slider. The schema's `input` block holds the defaults; your values
  override them. Change them in the drawer (⚙ beside a field: "Settings for
  <parameter>", defaults as placeholders, Reset) or on the Settings page's Parameters
  group (one row per parameter with its range, a Reset per row, Reset all). They are
  saved and exported with the state; Reset every parameter leaves them alone. A sweep
  preset never reads them: with q's step set to 0.5 pp the wheel moves q 0.5 pp while
  "Optimistic to break-even" still steps 0.05 pp (a test holds the plan to it).
- **Sweeps** drive the active input from a saved preset, in the input's own units:
  loop, ping-pong, or spots with hold times; between two named anchors (q: optimistic,
  deck, break-even; risk a night: robust, Kelly, deck; every input: min, current, max,
  default), ± around the current value, absolute values or a share of the range; with
  a step in the input's units ("0.05 pp", "1 name"). The defaults are "Optimistic to
  break-even" (q, loop, 0.05 pp every 400 ms), "Around the current value" (± 20% of
  the range, ping-pong) and "Three spots" (2 s each). A run starts from the current
  value and is locked to the page's frames; stop keeps the value; "↺ before sweep" or
  Ctrl+Z puts back the value from before. The track shows the preset's range as a band
  and the run's position as a moving tick; the deck strip reads "sweeping Loss rate per
  name 2.97% · step 10 / 18 · Ctrl+. stop". On the active input: Ctrl+Enter runs or
  pauses, Ctrl+. stops, Ctrl+[ and Ctrl+] switch presets, Ctrl+Shift+Enter pauses
  everything. Settings has the sweep rate (× every preset's speed) and a cap in values
  a second. Inputs that make no sense to sweep (seed, engine caps) are marked.
- **Undo.** Ctrl+Z / Ctrl+Shift+Z step through parameter changes outside a text field;
  inside one they are the field's own undo.
- **Stories** under a chart title ask a trader's question in one click ("What if q is
  really 3.2%?", "I widen the wing to 1σ") and answer it in one line; when one moves
  the deck the line says what it moved, from the value before ("moves deck: q 2.94% →
  3.38% · undo"). Clicking an active story, or undo, turns it off and puts the deck
  back, also after a reload: the story's question and answer are saved with it, so
  the chip comes back pressed with its answer line.
- **Market.** "Fair market" sets q = b/(1+b) (zero premium; the growth-optimal risk is
  then 0 and sizing only changes the median, P(below threshold) and ruin). "Discussion
  case" sets q so that a clean coin season has probability 55%. Typing q makes it
  custom; a q above the fair rate reads as a negative premium. Beside the switch, on
  the Desk and in the drawer: "The discussion's case is an assumed risk premium for
  selling tail insurance, not an information edge." and the premium in one sentence
  from the view-model ("The chain pays +0.44 pp premium over fair per event at the
  deck's q", or "The chain pays 0.00 pp premium: fair pricing.").
- **Charts** are borderless; their tools (↗ ⊞ ⚙) show on hover or keyboard focus. The
  plot box has the spec's height whatever it shows: **⊞** puts the numbers in the same
  box (sticky header, scrolling inside), and errors render there too. **⚙** opens the
  chart definition (display first: linear or log axes, mark, legend, reference lines;
  then ranges, series, backend, height) beside the chart on the side with more room,
  or above or below the plot when neither side has room, never over it; at 900px and
  below it is a bottom sheet. It leaves the layout alone and closes when the pointer
  moves away, on Escape or on a click outside. The backend shows as a tag only when it
  is not the default or the chart is edited.
- **Data** imports a trade log (0/1 losses or P&L per unit of max loss) and realized
  moves in priced sigmas. The record feeds calibration and the robust sizing curve; the
  moves can replace the Normal in the effective-loss-rate section.
- **Settings.** The quick dialog (⚙ in the top bar) holds exactly the default backend,
  drag sensitivity, sweep rate and the resets, and links the full page and the Guide.
  The full page adds the sweep's cap in values a second, the engine (engine,
  enumeration cap, Monte Carlo paths, seed, fan paths, as plain boxes), the hotkey
  legend, Parameters (every parameter's settings), the sweep presets, your data, and
  import and export of the whole state as JSON (export version 5: parameter settings
  travel with it; an older file keeps the current ones).

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
- The effective loss rate of a wing is E[payout]/W. A fairly priced wing has effective
  rate c/W, which equals the break-even rate b/(1+b). The default wing is solved so its
  effective rate equals the deck's q, and the section's first action takes the deck to
  the fair rate.
- The robust risk a night maximises growth averaged over loss rates drawn uniformly
  between the optimistic rate and break-even, or from a Beta posterior when a trade log
  is imported.
- Rates palette: optimistic = green, deck = ink (near white on graphite), break-even =
  red, wherever those rates are a series or an annotation; a test holds every chart to
  it. Policy colours are reserved for policies; `ink2` is the neutral accent for asides.
- Colour roles (one job per colour; tested in `tests/charts.test.ts`): figures, names,
  titles and labels are ink (`--ink`, `--ink-2`, `--muted`), so no number on a page is
  coloured and "yours" reads as ink against ink-2. The cream `--accent` (#e8e1a3)
  marks only where to act: the focus ring, the focused field, active and linked chips,
  primary buttons, the active tab, link-hover underlines; never in a chart. Amber, cyan
  and violet (Coin, Spread, Spread + reserve) live on chart marks, legend swatches,
  that policy's annotation lines and the 8px dot before a policy's name or figure.
  Loss red and good green mark ruin and clean outcomes, messages, the heat map's sign
  and the rates pair, as lines and dots; status bars fill at most 0.6. Ordered
  scenarios use the neutral grey ramp, or one policy's colour told apart by dash.
  Reference lines are 1px muted dashes (ink only for the deck's own value); grid lines
  run across the value axis only; labels sit on a page-coloured halo, not in a box.
- Type: every font size reads a token (`--fs-title` 36 · `--fs-view` 30 · `--fs-h` 20 ·
  `--fs-chart` 17 · `--fs-body` 15 · `--fs-ui` 13 · `--fs-label` 11.5 · `--fs-hero` 28 ·
  `--fs-kpi` 20), defined once in `:root`. Borders remain only on inputs, popovers, the
  drawer and dialogs.
- Chart conventions: bars on a numeric axis are drawn at their exact positions with a
  px thickness; annotation labels never overlap (vertical-line labels closer than 14px
  alternate top and bottom, horizontal-line labels stack, point labels move aside);
  legends wrap above the plot instead of printing over it; a step chart can change
  level after each point or midway (`step: "middle"`); a series with `band` fills down
  to its lower edge. Chart numbers print through `src/kit/charts/format.ts`; the text
  helpers (`pct`, `x2`, `signedPp`, …) are in `src/kit/charts/numbers.ts`.

## The concepts, and where they are

| Concept from the discussion | Section | View |
|---|---|---|
| A season of all-in nights is a coin: doubled or zero, p = (1 − q)^n | 01 Season reduction | Where a season ends; The one curve the coin reduces to |
| What the mean measures (a pool of replays) and what the median is (your tranche) | 02 Mean and median | What the mean means; What a pool of tranches would earn |
| How long a record takes to tell 2.52% from 3.38%, and why a 60% symmetric system is cheap to check | 03 Calibration | How long until my record proves q; How wide the record's error bar is; Which rates my record cannot rule out |
| Breach, effective and full-gap rates; the wing's width and partial losses | 04 Effective loss rate | Which loss rate to plug in; Breach, effective and full-gap rates |
| Spreading a night over names: same mean, different shape; single-name nights | 05 Diversification | What spreading buys; What single-name nights cost |
| Shared causes and shared volatility | 06 Shared causes | When shared causes ruin you; When volatility shocks everything at once |
| Time and breadth as two axes, the railroad, per-bet Kelly, the calendar | 07 Time and breadth | Time and breadth as two axes; How much to risk per name; A season by the calendar |
| Chaining seasons, half the tranche a night, refilling from NAV (f* ≈ 2p − 1) | 08 Chained seasons | How much to risk a night; Four seasons later; Refilling from NAV |

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
`src/app/model/policies.ts` (never by letter):

- **Coin** 1 name, whole tranche (amber)
- **Spread** k names, whole tranche, no reserve (cyan)
- **Spread + reserve** k names, the deck's share of the tranche a night (violet); the
  policy the reader holds
