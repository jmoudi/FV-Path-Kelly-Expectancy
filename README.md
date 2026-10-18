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
```

## How it is put together

The code is split so that the data, the chart definitions, and the renderers can each
be swapped without touching the others.

| Layer | Where | What it knows |
|---|---|---|
| Model | `src/model/` | Pure math. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration and record statistics, wing rates (Normal, Student-t or an imported sample) with `ratioForLossRate`, correlation, Kelly sizing and the robust optimum averaged over a band of loss rates, the two growth figures (`growth.ts`). The discussion's remaining concepts each have a file: `nav.ts` (NAV log growth and the Kelly share of NAV when the tranche is refilled each season), `railroad.ts` (stations, tracks and track widths of the schematic), `calendar.ts` (names per night from a histogram, Kelly per name with the capital ceiling, the sampled and expected season), `wingSeason.ts` (the season-end distribution the wing's partial payout produces, and the share of bad seasons that are partial), `symmetric.ts` (the 60% symmetric-payoff system's season). `policies.ts` is the single source of the three policies' names and colours. No DOM, no chart library. |
| Parameters | `src/model/params.ts` | One typed object plus a schema with tiers: primary (control deck), secondary (tuned under a section), advanced (settings dialog). Where each deck input sits is one table (`DECK_PLACEMENT`): its group (the drawer section), whether it is in the reduced deck's first row, and whether a phone keeps it. Seeds, caps and path counts take plain boxes (no slider). Includes the market switch (`market`: fair, discussion, custom) with `marketOf` / `marketPatch`. The wing's default realized ÷ priced sigma is solved at load so the wing's effective loss rate equals the deck's q. Imported datasets sit beside it. |
| View-model | `src/viewmodel/` | Turns model output into renderer-agnostic chart specs (`src/charts/spec.ts`): data table, mark, axes, series, annotations, stories. One file per section, plus `desk.ts` (the Desk's policy grid, sizing line, calibration verdict and market state) and `derived.ts` (shared derived state, the deck's figures, and the one number formatter: U+2212 minus everywhere, milliseconds under a second). Runs in a Web Worker (`worker.ts`) so sliders never block the page. |
| Axis resolution | `src/charts/resolve.ts` | Computes concrete domains, tick positions and tick labels once, so every backend draws the same ranges and puts reference lines in the same place. |
| Switchboard | `src/charts/registry.ts`, `src/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite, or an HTML table. Each backend is loaded on first use. |
| Figures | `src/charts/figures/` | Charts of kind `figure` (the railroad schematic, the season calendar) are drawn by a React SVG component from the registry in `index.ts`, sized to the width the host gives them, in the theme's colours. They are not backend-switchable: ⊞ shows their data table and ⚙ offers only the height. |
| Authoring | `src/ui/Authoring.tsx`, stories in each spec | A story is a trader's question ("Half my nights have one name", "The chain is right: q = break-even") with a one-line answer; when it moves the deck it carries a badge ("moves deck: q 2.94% → 2.52%"). Display choices (axis scales, backends, zooms) are not stories; they live in ⚙, which edits the spec by hand (backend, mark, axis scale and domain in the axis's own units, x field, series visibility, mark and emphasis, extra columns, legend, height) and stores only the diff, keyed by chart id. |
| State | `src/state/store.ts` | Parameters, imported data, chart edits, default backend, and the snapshot of parameters a story moved. Only one deck-moving story is active at a time: applying one turns the other off and restores its parameters. Validated on load, persisted locally, exported and imported as one JSON file (version 4). `#reset` in the address clears it. |
| UI | `src/ui/` | Control deck, section layout, chart host, tables, dialogs. One dark theme, graphite, with three policy hues and two status colours. |
| Kit frames | `src/kit/ui/deck/` | The deck bar and drawer as a generic frame: input groups, status figures, legend and drawer sections come in through props, so it knows nothing about tranches (see its README). |
| App providers | `src/app/deck/` | Turn the parameter schema and the view-model's `DeckView` into the deck frame's props (`layout.ts`, `status.ts` are pure and tested); the clean-season linked figure and the market switch. `src/ui/DeckBar.tsx` composes the two. |

## Using the app

- **Deck.** Anchored under the top bar on every page except Settings, two rows when
  reduced. Row 1: eight fields in three groups set apart by 40px and a hairline (Per
  event: loss rate q, gain b, optimistic loss rate · Per season: nights n, names a
  night k, shared-cause nights c · Sizing: at risk a night, seasons chained N), and
  under the loss rate "= 55% clean season (Coin)": click it to type a clean-season
  probability and q is solved from it. Row 2: your policy (Spread + reserve) with EV
  per season, the median after N seasons, P(below the threshold) and ruin in its
  colour; the Coin's clean season and ruin, muted; the policy legend; the sweep strip
  of the active input in a slot that is always there; Full deck ▾. Below 1280px the
  groups wrap whole. On a phone row 1 keeps loss rate, gain, names a night and at risk
  a night, and "All inputs" opens the full deck as a bottom sheet.
- **Full deck** is a 460px drawer on the right, from under the top bar to the bottom
  of the window; it scrolls on its own and the charts stay live beside it. Sections:
  Event, Season, Sizing, Shared risk, Calibration band (every input with its full
  name, symbol and help), Market (Fair market · Discussion case · Custom), Figures
  (every policy named), Definitions. Collapse ▴ or Escape closes it. Sweep presets
  are edited in Settings.
- **Tour** is the guided single page: each section has a functional title, a one-line
  lede, the claim it defends in a boxed aside, an inputs bar, two headline figures, the
  primary chart, secondary charts, and expanders for tables, notes and the
  quoted-versus-recomputed figures.
- **Views** are the same charts split into 19 responsibilities (season outcomes,
  sizing grid, confidence band, candidate rates, a season by the calendar, refilling
  from NAV, …), each on its own page with the context beside it. Open them from the Views menu, the chips next to a section title,
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
