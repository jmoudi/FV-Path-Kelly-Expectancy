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
npm test           # model, chart, deck, sweep, parameter-settings, Guide and event-bus tests
npm run parity     # every chart × backend draws the same marks (see below)
npm run boundaries # the import rules between the kit and the app's layers (ARCHITECTURE.md)
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

`ARCHITECTURE.md` is the map: the layers and which may import which, the event bus and
every event, and how to add a parameter, a chart, a view, a page or an event (with the
audit that led to it). In short, two packages, so that the next finance explainer can
keep the first and rewrite only the second:

- **`src/kit/`** is generic and knows nothing about tranches, seasons or wings: chart
  specs and their resolution, the three backends and the figure registry, the parameter
  schema and the synthetic input, the sweep engine and its presets, the store factory,
  the build worker scaffolding, the typed event bus, and the page frames (deck,
  sections, view pages, the comparison grid, settings, dialogs, notices, routes, theme).
  It is driven by props, by the schema, by a sweep adapter, by the copy it is given and
  by the bus. `src/kit/README.md` lists its
  areas, where an app plugs in, and the checklist for a second explainer, with a worked
  sketch; each area has a short README of its own.
- **`src/app/`** is this explainer, in layers: `model/` (contracts and the maths),
  `data/` (the values: defaults, the schema, presets, the policies' names, the
  discussion's setup, the copy), `scenarios/` (the view-models, built in the worker),
  `view/` (everything that renders), and the wiring at its root (`store.ts`,
  `build.ts`, `worker.ts`, `sweeps.ts`, `sweepAnchors.ts`, `events.ts`).
- **`src/main.tsx`** loads `theme.css` then `kit.css`, writes the palette into the CSS
  variables (`applyThemeVars`), registers the figures, creates the event bus, and
  mounts `<App />` inside `<KitProvider store schema sweeps copy bus>`.

Nothing in `src/kit` imports `src/app`, model imports neither data nor view, scenarios
never import view, the view takes only types from model, and model, data and scenarios
stay React-free all the way down; `npm run boundaries` checks all of it (the quick
grep for the first rule prints nothing):

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
| Inputs | `src/kit/inputs/` | `ParamDef<P>` and `createSchema` (`schema.ts`: `byKey`, `sanitize`, `sanitizePatch`, `coerce`). `SyntheticNumber` (box, wheel, relative drag track, sweep band and tick, the run marker's reserved slot), the wheel gate, the display rules, `NumberField` (the field wired to the store and the sweeps), `Num`, `ParamInput`, and `number-field.css` (also the sweep strip's styles). Parameter settings: `paramSettings.ts` (the six settings, their resolution over the schema's `input` defaults, the sanitizer, and the grid the wheel, arrows and drag land on) and `ParamSettings.tsx` (the field's ⚙ popover and the Settings page's table, styled by `param-settings.css`). Locks in the GUI: `locks.tsx` (`LockToggle`, the padlock beside a field or in a row; `LocksChip`, "Locks (n)" for the deck; `useRefusalShake`; `useStoryBlocks`, the stories' "blocked:" labels), `shake.ts` (the one 200 ms shake of a refused change) and `locks.css` (the hatched track, the read-only box). |
| Sweeps | `src/kit/sweeps/` | Presets, plans and their sanitizers (`types.ts`, `engine.ts`, `sanitize.ts`, over the app's `PresetCatalog`); the frame-locked sweep clock (`runner.ts`: the next value only after the last one rendered, each value on screen at least its interval); the driver and the hotkeys (`useSweeps.ts`); the strip and the preset editor (`SweepStrip`, `SweepPanel`); and the `SweepAdapter` (`adapter.ts`) through which they ask the app for an input's context, its format and whether a build has rendered. |
| Events | `src/kit/events/` | `createBus<Events>()`: `emit`, `on`, `once`, `off`, `onAny`, `recent` and a dev log (`console.debug`, in development); `KitEvents`, the typed map an app extends (`param:changed` with who changed it, `sweep:*`, `story:*`, `chart:edited`, `state:imported`, `build:settled`, `route:changed`, `notice`, and `param:locked` / `param:refused` for locks, with the lock that blocks a change and why); `BusProvider`, `useBus`, `useBusEvent`, `busHooks<AppEvents>()`. The store's actions, the replayer, the router and the build emit on it; `kit/ui/Notices.tsx` shows every `notice`. See its README and `ARCHITECTURE.md`. |
| State | `src/kit/state/` | `createAppStore(config)`: parameters with undo and redo, imported data, chart edits, default backend, presets and links, settings, parameter settings (`paramSettings`, `setParamSettings`, `resetParamSettings`; never read by the sweeps), the snapshot of parameters a story moved (only one deck-moving story is active at a time), and locks (`locks`, `lockParam`, `unlockAll`): every change of the parameters runs through one step, `applyConstraints` (`constraints.ts`: the generic solver over the locks and the app's declarative relations, with a cycle guard), and what it refuses goes out as `param:refused`. Sweep runs are saved as input, preset and pre-sweep value only (ticks are never saved), so a reload mid-sweep puts the input back. Validated on load, persisted locally under one key, exported and imported as one versioned JSON file; `#reset` in the address clears it. `<KitProvider>` with `useKit`, `useKitApi`, `useSchema`, `useKitSweeps`, `useKitCopy` is how kit components reach the store, the schema, the sweep adapter and the copy; it also provides the bus and connects the store to it, so every action that changes something emits there. |
| Build | `src/kit/build/` | `defineBuildWorker` (the worker side) and `useBuild(input, { createWorker, build, settled })`: the build queue (`coalesce.ts`: one request in flight, the newest waiting, every answer newer than the last one shown rendered), `only` partial builds of the scenarios on screen during a sweep (`scope.ts`), and an inline fallback when the worker does not answer. |
| Frames | `src/kit/ui/` | The section skeleton and its composition (`SectionFrame`, `Section`), the answer strip, the footer line and its tabbed panel, the view page (`ViewFrame`, `ViewPage`), the chart host with the editor in ⚙ and the ⊞ table (`ChartHost`, `Authoring`, `TableView`), the comparison grid (`DeskGrid`), portal menus, settings (`Settings`, `SettingsBody`) and the hotkey legend, dialogs, popovers, the guide page (`GuideFrame`: a rail of section links beside prose, tables, key rows, callouts and a Markdown file read at run time, from the app's `GuideSection[]`; `guide.css`), the Markdown renderer (`Markdown.tsx`, `RemoteMarkdown.tsx`, `markdown.css`), routes (`route.ts`: a `RouteConfig`, `viewHref`, `sectionHref`, `anchorHref`, and `#<page>/<part>` for a page's part), links (`Link.tsx`: `Link`, in-page smooth scroll with a brief mark or a route switch, never a reload; `useRevealTarget`, the one place a page scrolls to the part in its address; `rich()` for inline markup in copy), the shell hooks (`Shell.tsx`: scroll spy, `[` / `]` between the views of the order it is given, the crash screen), the notice stack (`Notices.tsx`, `notices.css`: bottom-right, 6 s, click or Escape dismisses), adapters from a `ScenarioView` to frame props (`scenarioProps.tsx`: KPIs into figures, sections into chips and the Views menu), the frames' default copy (`copy.ts`), and the deck (`deck/`: the two-row bar, the drawer, the linked value, the segmented switch), all through props. One dark theme, graphite: `theme.css` holds the colour tokens and the token-only type scale, `kit.css` reads only those tokens, `deck/deck.css` styles the deck frame; the chrome (focus ring, focused field, active chips, primary buttons, active tab) reads `--accent`, a cream of its own; icons are drawn (`Icon.tsx`). Stacking: deck 25, top bar 30, drawer 35, dialogs 50, popovers 70, menus 80, notices 90. See `src/kit/ui/README.md` and `src/kit/ui/deck/README.md`. |
| Maths | `src/kit/math/stats.ts` | The error function and the normal distribution, Student-t, lgamma, binomial, the regularized incomplete Beta, a seeded RNG, linspace and logspace, integration. No domain. |

### The app (`src/app/`)

| Area | Where | What it knows |
|---|---|---|
| Model | `src/app/model/` | Contracts and pure maths: the `Params` type, `Market` and the market functions (`params.ts`), the `Datasets` type, the policy ids and the night each plays (`policies.ts`), and the maths: season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample) with `ratioForLossRate`, correlation, Kelly sizing and the robust optimum averaged over a band of loss rates, the two growth figures (`growth.ts`). The discussion's remaining concepts each have a file: `nav.ts` (NAV log growth and the Kelly share of NAV when the tranche is refilled each season), `railroad.ts` (stations, tracks and track widths of the schematic), `calendar.ts` (names per night from a histogram, Kelly per name with the capital ceiling), `wingSeason.ts` (the season-end distribution the wing's partial payout produces), `symmetric.ts` (the 60% symmetric-payoff system's season). No values, no DOM, no chart library. |
| Data | `src/app/data/` | The values. `params.ts`: `DEFAULT_PARAMS` and `DISCUSSION_P_CLEAN` (the market switch's discussion case); the wing's default realized ÷ priced sigma is solved at load so the wing's effective loss rate equals the deck's q. `policies.ts`: the single source of the three policies' names, colours and labels (`POLICY_META`, `policies(p)`, `YOUR_POLICY`). `discussion.ts`: the discussion's setup and the quoted-vs-recomputed row (`fig`). `schema.ts`: the schema (`PARAM_DEFS`, `SCHEMA` through the kit's `createSchema`): label, symbol, unit, range, tier (primary: the deck; secondary: a section's own inputs; advanced: Settings), help, definition, the input's feel (`input.perHundredPx`, `slider`), sweep anchors; where each deck input sits is one table (`DECK_PLACEMENT`: drawer group, first row, kept on a phone); seeds, caps and path counts take plain boxes. `datasets.ts`: the empty trade log and moves and their sanitizer. `presets.ts`: the three default sweep presets (`PRESET_CATALOG`). `copy/`: `kitCopy.ts` (this app's sentences for the kit's frames, `KIT_COPY`, with `storyMoved`), `market.ts` (the market switch's lines), `notices.ts` (what the notices say), `paramText.ts` (a value in its unit, `movedBadge`: "moves deck: q 2.94% → 3.38%"), `guide.ts` (the Guide's sections as structured blocks, `GUIDE_SECTIONS`; keep it true to the GUI), `guideLocks.ts` (its Locks part, inside Parameters), `locks.ts` (what the lock notices say). `constraints.ts`: the relations among the parameters while some are locked (`CONSTRAINTS`: the clean-season identity p = (1 − q)^n, the market identity, the calendar shares summing to 1) and the lockable clean-season probability `pClean`. |
| Scenarios | `src/app/scenarios/` | The view-model: turns model output into the kit's chart specs, one file per section, plus `derived.ts` (shared derived state, the market state), `deck.ts` (the deck's figures, `DeckView`), `desk.ts` (the Desk's policy grid, sizing line, calibration verdict and market state, `DeskView`) and `controls.ts` (the clean-season link, the market switch's options and patches, the dataset captions). `buildAll(params, datasets, { only })` (`index.ts`) builds everything, or during a sweep only the deck, the Desk and the scenarios on screen. Runs in a Web Worker (`src/app/worker.ts`). |
| Deck | `src/app/view/deck/` | `DeckBar.tsx`, the kit's `Deck` with this app's content (hidden on Settings and the Guide, from the shell's route); `useDeckProps.tsx`, `layout.ts` and `status.ts` (the schema and `DeckView` into the deck's groups, status, legend and drawer sections); the clean-season linked field (`CleanSeason.tsx`); the market switch (`MarketSwitch.tsx`); the strip slot (`DeckStrip.tsx`). |
| Desk | `src/app/view/desk/` | `grid.ts` (the `DeskView` into the kit grid's columns and groups), `DeskPage.tsx`. |
| Figures | `src/app/view/figures/` | The railroad schematic and the season calendar (`Railroad.tsx`, `Calendar.tsx`), and `FIGURES` with their labels and blurbs (`index.ts`), registered in `main.tsx`. |
| View | `src/app/view/` | `App.tsx`: the pages (Desk, Explain, view, Settings, Guide), `ROUTES` and the notice stack. `DataDialog.tsx`: the trade-log and moves editors, in the Data dialog and the settings page's data group. `announce.ts`: which events become notices (an import taken or refused, a story that moved the deck or put it back); `announceLocks.ts`: the locks' notices (locked, unlocked, a refused change, a run a lock stopped), one per lock. `bus.ts`: `useAppBus`, `useAppEvent`. The view lays out and calls the store; it computes nothing. |
| Wiring | `src/app/*.ts` | `store.ts`: the one store (`createAppStore` with storage key `tranche-replay:v1` and export version 5). `build.ts`: `BUILD` and `BUILD_SETTLED`. `sweeps.ts` and `sweepAnchors.ts`: the `SweepAdapter`, anchor values and unit formatting for sweeps. `worker.ts`: the worker entry (`defineBuildWorker`). `events.ts`: `AppEvents`, the kit's events plus `market:switched`. |

## Using the app

- **Pages.** `#desk` is the landing page (an empty address opens it); `#explain` the
  guided tour (`#tour` and `#s-<section>` still work); `#view/<id>` one responsibility
  on its own page; `#settings` the full settings; `#guide` the Guide. The top bar reads
  Desk · Explain · Views ▾ · Settings · Guide, with Data, Import / export and ⚙ on the
  right; at 700px and below those three fold into one "⋯" menu (which also lists the
  Guide). The Views menu and "⋯" render above everything, so nothing clips them.
- **Links.** Underlined text is a link, and no link reloads the page. A link to a part
  of the open page (a section number on Explain, a Guide section, the "↓ <chart>"
  under a section's figures) scrolls there smoothly below the top bar and deck and
  marks the target for a moment; a link to another page or view (a figure's label, a
  Desk row, a deck figure, a section number seen from a view) switches to it, at that
  part when it names one; Back returns; Ctrl- or ⌘-click and a middle click open the
  same address in a new tab. "Inputs for this section" links to the Guide's parameter
  settings and the sweep strip's hint to the replayer. Chips, buttons, rails and the
  top bar are not underlined.
- **Guide.** `#guide` documents how the GUI works, in ten sections (the screen,
  parameters, editing a parameter by hand, parameter settings, the replayer, charts,
  pages, data and state, keys, for builders), each at `#guide/<section>`
  (`#guide/keys` is every shortcut in one table). A rail of section links marks the one
  being read. Linked from the top bar, the quick-settings dialog and the Settings page.
  Its text is `src/app/data/copy/guide.ts`; change it with the GUI.
- **Directives.** An eleventh Guide section, `#guide/directives`, renders
  `docs/DIRECTIVES.md` (the owner's directives, the design they imply, the decisions
  taken, the open questions), which `scripts/directives.mjs` copies to
  `public/directives.md` on every build and dev start; the page fetches it once per
  load (Reload reads it again) and never bundles its text.
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
- **Locks** fix a parameter at its value, loudly: a padlock beside a field's label in
  the drawer, a section's inputs and Settings → Engine (on hover or focus), Lock in the
  ⚙ popover, a Lock column in Settings → Parameters. A locked field keeps the padlock in
  the accent, even in the reduced deck, with its track hatched and its box read-only;
  row 2 shows "Locks (n)", the list of locks with their values, Unlock and Unlock all.
  Nothing moves a locked parameter: typing, the wheel, the arrows, a drag, the
  replayer (never planned; a run stops when its parameter is locked), a story (its chip
  reads "blocked: Loss rate per name is locked"), the market switch, the clean-season
  field, undo, the resets and an import (which keeps the locked value). Each refusal is
  a warning notice ("Loss rate per name is locked. Unlock it in the deck to change
  it.") and one 200 ms shake of the field. The clean-season probability p and the
  market can be locked too, and a lock limits what the model ties to it: with p locked
  a change of n re-solves q; with q locked Fair market is refused; with the market
  locked on Fair a change of b re-solves q; with a calendar share locked the other
  shares renormalise around it (`src/app/data/constraints.ts`).
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
- **Notices.** Bottom right, for 6 seconds: a line when an import worked or was refused,
  when a parameter is locked or unlocked or a lock refuses a change, and when a story
  moved the deck or put it back, with the values that moved ("“I sit at
  the robust optimum” moves the deck: At risk a night 50% → 38%. Click the story again
  or press Ctrl+Z to put it back."). A click or Escape dismisses them; pointing at the
  stack holds it.
- **Stories** under a chart title ask a trader's question in one click ("What if q is
  really 3.2%?", "I widen the wing to 1σ") and answer it in one line; when one moves
  the deck the line says what it moved, from the value before ("moves deck: q 2.94% →
  3.38% · undo"). Clicking an active story, or undo, turns it off and puts the deck
  back, also after a reload: the story's question and answer are saved with it, so
  the chip comes back pressed with its answer line. A story that would move a locked
  parameter reads "blocked: <name> is locked" and does not apply.
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
  legend, Parameters (every parameter's settings and its Lock), the sweep presets, your
  data, and import and export of the whole state as JSON (export version 6: parameter
  settings and locks travel with it; an older file keeps the current ones, and a
  parameter locked now keeps its value whatever the file says).

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
  it. Where the deck's rate is the reference beside a chart's subject it steps down the
  ink family: a half-opacity ink-2 bar, or a thin dashed ramp-2 line under a thick white
  curve. Policy colours are reserved for policies; `ink2` is the neutral role of asides
  and guide lines.
- Colour roles (one job per colour; tested in `tests/charts.test.ts`): text, figures,
  names, titles and labels are ink (`--ink`, `--ink-2`, `--muted`), so no number on a
  page is coloured and "yours" reads as ink against ink-2. The cream `--accent`
  (#e8e1a3) marks where to act and the landmarks the prose refers to: the focus ring,
  the focused field, the sliders (fill at 55%, thumb, full accent and a halo on the
  field being worked on; a sweep's band stays a neutral grey), active and linked chips,
  story chips (underlined label, pressed in the accent), primary buttons, the active
  tab, link underlines (45% at rest, full on hover and focus), the section number in an
  eyebrow and on the rails, the Guide's section numbers and table-header tint, the
  claim aside's rule (60%) and the inputs caption's rule; never in a chart. Amber,
  cyan and violet (Coin, Spread, Spread + reserve) live on chart marks, legend
  swatches, that policy's annotation lines (its mean and median markers) and the 8px
  dot before a policy's name or figure (in the Guide too, `{{a:Coin}}`). Loss red and
  good green mark ruin and clean outcomes, messages, the heat map's sign, the rates
  pair (as lines and dots) and the Guide's callout rules (Note green, Careful red);
  status bars fill at 0.7 with a 1px edge in the full colour. The heat map's ends sit
  at matched lightness, dark enough that ink cell labels keep 4.5:1. Ordered scenarios
  use the neutral grey ramp, or one policy's colour told apart by dash. Reference lines
  are 1px dashes in their role: optimistic green, the deck's own value ink, break-even
  red, a policy's mean or median in its colour, guide lines (zero, no growth, start,
  coin flip, the median line, time scales) ink-2, landmarks (strikes, season
  boundaries, the threshold) muted. A label takes its line's or band's colour; a band
  (a series band or a shaded annotation) is the colour of what it describes at 12%.
  Grid lines run across the value axis only; a label sits on a halo in the colour under
  it (the page, an area fill, a band), never in a box, and a vertical line that would
  run through a band's title starts under it. A measurement of every page's text
  colours after this pass: ink, ink-2 and muted only, plus the accent section numbers.
- Links: every in-app link is the kit's `Link` (`src/kit/ui/Link.tsx`), underlined;
  copy strings carry them as inline markup, `[Section 04](#s-wing)`, rendered by
  `rich()` wherever the page shows that copy (ledes, claims, notes, captions, help,
  quoted rows, blurbs, the Guide), and the directives document's in-app links go
  through it as well. A test holds every "Section NN" in the copy to a link to the
  section with that number, and every link to a section, view or Guide part that
  exists. Sections are `s-<id>`, chart cards `chart-<id>`, a section's figures
  `s-<id>-fig-<i>`, Guide sections `guide-<id>` (headings `guide-<id>-h`, sub-headings
  and the directives' headings `guide-<id>-<slug>`); `#el-<id>` links to any of them
  on the open page.
- Surfaces: one graphite ramp (`--bg` · `--surface` · `--raised` · `--raised-2` ·
  `--hairline`, one step apart); the hairline keeps 1.4:1 on `--raised`, so an input's
  edge holds; the top bar and the deck are opaque. A focused box shows one 2px accent
  ring over its own border.
- Numbers in the page (figures, the Desk grid, deck and section boxes, tables, the
  market switch) are IBM Plex Sans with tabular figures; IBM Plex Mono is left to the
  chart canvases, code chips, key caps and the JSON box. The Desk grid gives every
  figure two decimals and stacks the decimal points of a column.
- Type: every font size reads a token (`--fs-title` 36 · `--fs-view` 30 · `--fs-h` 20 ·
  `--fs-chart` 17 · `--fs-body` 15 · `--fs-ui` 13 · `--fs-label` 11.5 · `--fs-hero` 28 ·
  `--fs-kpi` 20), defined once in `:root`. Borders remain only on inputs, popovers, the
  drawer and dialogs.
- Chart conventions: bars on a numeric axis are drawn at their exact positions with a
  px thickness; annotation labels never overlap (vertical-line labels closer than 14px
  alternate top and bottom, horizontal-line labels stack, point labels move aside);
  legends wrap above the plot instead of printing over it, and two charts side by side
  keep the same legend rows free, so their plot frames start on one line; subtitles
  carry the encoding only, facts about the data go in the caption; a step chart can change
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
`src/app/data/policies.ts` (never by letter):

- **Coin** 1 name, whole tranche (amber)
- **Spread** k names, whole tranche, no reserve (cyan)
- **Spread + reserve** k names, the deck's share of the tranche a night (violet); the
  policy the reader holds
