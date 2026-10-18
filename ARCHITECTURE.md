# Architecture

Tranche Replay is two packages and, inside the app, three layers. The kit (`src/kit`)
is generic and could carry another finance explainer; the app (`src/app`) is this one.
Inside the app, **model** says what things are and how they are computed, **data**
holds the actual values, **scenarios** turn both into what the screen shows, and
**view** draws it. Cross-cutting features (notices, locks, logging) talk over one
typed **event bus** and nowhere else.

## The layers

| Layer | Folder | Holds | Imports |
|---|---|---|---|
| kit | `src/kit/` | charts, inputs and the parameter schema's types, sweeps, the store factory, the build worker, the event bus, the page frames. Its own README lists the areas | nothing from `src/app` |
| model | `src/app/model/` | contracts and pure functions: `Params`, `Market` and the market functions (`params.ts`), `Datasets`, `PolicyId` and the night each policy plays (`policies.ts`), the season, Kelly, calibration, wing, NAV, calendar and railroad maths. No values a person would tune | model, `@kit/math` |
| data | `src/app/data/` | instances: `DEFAULT_PARAMS` and `DISCUSSION_P_CLEAN` (`params.ts`), the schema (`schema.ts`: `PARAM_DEFS`, `GROUP_LABELS`, `SCHEMA`), the datasets' empty value and sanitizer, the sweep presets, the policies' names, colours and labels (`policies.ts`), the discussion's setup and the quoted-vs-recomputed row (`discussion.ts`), and the copy (`copy/`: `guide.ts`, `kitCopy.ts`, `market.ts`, `notices.ts`, `paramText.ts`) | model, data, the kit's worker-safe modules |
| scenarios | `src/app/scenarios/` | view-models: one builder per section returning a `ScenarioView`, the shared derived state (`derived.ts`), the deck's and the Desk's figures (`deck.ts`, `desk.ts`), the app's own controls (`controls.ts`: the clean-season link, the market switch, the dataset captions), and `buildAll` (`index.ts`). Built in the worker | model, data, scenarios, the kit's worker-safe modules |
| view | `src/app/view/` | everything that renders: `App.tsx` (the shell and the pages), the deck and Desk adapters and components (`deck/`, `desk/`), the SVG figures (`figures/`), `DataDialog.tsx`, the notices policy (`announce.ts`) and the typed bus hooks (`bus.ts`) | everything above; from model, types only |
| wiring | `src/app/*.ts` | `store.ts` (the one store), `build.ts` and `worker.ts` (the build, inline and off-thread; the worker URL stays the relative literal `new URL("./worker.ts", import.meta.url)`), `sweeps.ts` and `sweepAnchors.ts` (the sweep adapter), `events.ts` (`AppEvents`) | any app layer |
| root | `src/main.tsx` | the composition root: stylesheets, `applyThemeVars`, `registerFigures`, `createBus`, `<KitProvider store schema sweeps copy bus>` | anything |

The allowed directions, each arrow "may import":

```
            kit            (never imports app)
             ↑
  model ← data ← scenarios ← view
     (wiring and main.tsx compose them all)
```

The kit mirrors the split: `kit/math` and `kit/charts/spec` are model, `kit/state`
and `kit/build` the data plumbing, `kit/events` the channel, `kit/ui` the view.

Model, data and scenarios are **worker-safe**: following every value import from
them never reaches an npm package (React, zustand, a chart library), a `.tsx` file
or a stylesheet. The build worker (`worker.ts` → `scenarios/index.ts`) depends on it,
and the worker chunk in `dist/assets/worker-*.js` stays React-free.

`npm run boundaries` (`scripts/boundaries.mjs`, reads import lines, no ESLint) checks
all of it and exits 1 with every breach:

1. kit never imports app;
2. model imports only model and `kit/math`;
3. data imports only model, data and the kit;
4. scenarios never import view or the wiring;
5. view imports only types from model (the maths runs in scenarios);
6. model, data, scenarios, `kit/events/bus.ts` and `worker.ts` are worker-safe.

## The event bus

`src/kit/events/`: `createBus<Events>()` returns `{ emit, on, once, off, onAny,
recent }`. The event map is a type: `KitEvents` (`types.ts`) for what the kit says,
and the app's `AppEvents extends KitEvents` (`src/app/events.ts`) for its own. A name
or a payload that is not in the map does not compile. Handlers run synchronously, in
subscription order, each in its own try/catch.

- **Created** once in `src/main.tsx`: `createBus<AppEvents>({ log })`. In development
  the log prints every event with `console.debug("[bus] <name>", payload)`, except the
  replayer's ticks; `bus.recent()` holds the last 100.
- **Passed** through `<KitProvider bus>`, which provides it to React and connects the
  store to it (`connectBus`), so the store's actions emit on it. A test or a script
  creates a store with `createAppStore({ …, bus })` instead.
- **Used** with `useBus()` and `useBusEvent(name, handler)` in kit components,
  `useAppBus()` and `useAppEvent(name, handler)` (typed with `AppEvents`,
  `src/app/view/bus.ts`) in the app's, and `bus.on(name, handler)` (it returns the
  unsubscribe) anywhere else.
- **Rules.** Emit after the state holds the change, so a handler reads the new state.
  Payloads are plain data. The bus says what happened; state stays in the store and
  derived numbers come from the build, never over the bus. A handler that must change
  something calls a store action (or emits a `notice`); it returns nothing.

| Event | Payload | Emitted by |
|---|---|---|
| `param:changed` | `key, from, to, source` (`hand`, `sweep`, `story`, `action`, `import`, `link`, `switch`, `undo`, `redo`, `reset`) | the store, once per parameter that moved, from `setParam`, `setParams`, `undo`, `redo`, `resetParams`, `applyStory`, `clearOverride(s)`, `restoreSweep`, `importState`, `resetEverything` |
| `param:locked` | `key, locked` | reserved for the lock actions |
| `param:refused` | `key, reason, source, attempted?` | reserved for refused changes (locks, constraints) |
| `sweep:started` | `key, presetId, resumed` | the store: `startSweep`, `toggleSweep` (resume), `pauseAll` |
| `sweep:paused` | `key` | the store: `pauseSweep`, `pauseAll` |
| `sweep:stopped` | `key, reason` (`stop`, `restore`, `edit`, `undo`, `preset`, `import`, `reset`, `lock`) | the store, whenever a run ends |
| `sweep:stepped` | `key, index, value` | the replayer (`useSweepEngine`), per committed value |
| `story:applied` | `chartId, storyId, label?, before, after` | the store: `applyStory` |
| `story:cleared` | `chartId, storyId, before, after` | the store: a story clicked off, replaced, reset or displaced |
| `chart:edited` | `chartId, reset?` | the store: `setOverride`, `clearOverride`, `clearAllOverrides` |
| `data:changed` | `kind, count` | the store: `setDataset` |
| `state:imported` | `ok, error?` | the store: `importState` |
| `state:reset` | `{}` | the store: `resetEverything` |
| `settings:changed` | `what` (`ui`, `backend`, `param`), `key?` | the store: `setUi`, `setDefaultBackend`, `setParamSettings`, `resetParamSettings` |
| `build:settled` | `at, ok, partial, error?` | `useBuild`, after an answer rendered |
| `route:changed` | `from, to` | `useRoute` (the shell calls it once), when the address names another route: a page, a view, or another part of a page (`#s-<id>`, `#guide/<part>`), whether typed, from history or from a `Link`. Never for an in-page anchor (`#el-<id>`): the route stays, nothing is announced |
| `route:jumped` | `to, elementId` | `Link` (`followLink`), when a click scrolled the open page to one of its elements without a page switch: an `#el-<id>` anchor (the address stays; this is the only event) or another part of the open page (the address moves first, so `route:changed` comes before it). A page that opens on a part (`useRevealTarget`) is announced by `route:changed` alone |
| `notice` | `kind` (`info`, `warn`, `error`), `text, ttlMs?, id?` | anyone; `src/app/view/announce.ts` for imports and stories |
| `market:switched` (app) | `from, to` | the market switch |

**Notices.** `<Notices />` (`src/kit/ui/Notices.tsx`, mounted once by `App`) shows
each `notice` bottom-right for 6 s (`ttlMs` changes it); a click or Escape dismisses
it, hovering holds the stack, a notice with the `id` of one on screen replaces it, and
the only motion is opacity. Which events become notices, and in what words, is the
app's: `useAnnouncements()` (`src/app/view/announce.ts`) with the lines in
`src/app/data/copy/notices.ts`.

**For the locks.** The lock actions set `locks` in the store and emit `param:locked`;
a refused change emits `param:refused` (with `source`, so the line can say what was
refused) and a `notice` with `id: "lock-<key>"` (a wheel or a sweep hitting a locked
field then shows one notice, not thirty); a field shakes on
`useBusEvent("param:refused", …)` for its own key; a run whose parameter becomes
locked ends with `sweep:stopped` and reason `lock`.

## How to add …

**A parameter**
1. Model: add the field to `Params` (`src/app/model/params.ts`) and use it in the maths (`src/app/model/*.ts`).
2. Data: give it its value in `DEFAULT_PARAMS` (`src/app/data/params.ts`).
3. Data: add its `ParamDef` to `PARAM_DEFS` (`src/app/data/schema.ts`): label, symbol, unit, range, step, help, input feel, sweep anchors.
4. Place it: `tier: "primary"` and a `DECK_PLACEMENT` entry for the deck; `tier: "secondary"` with a `section` for a section's own row; `"advanced"` for Settings.
5. Scenarios: read it in the builder that needs it; list it in that scenario's `localParams` (or a view's `params`) when it is a section input.
6. If `derive` (`src/app/scenarios/derived.ts`) depends on it, add it to `keyOf`, the memo key.
7. A computed sweep anchor: a case in `anchorValue` (`src/app/sweepAnchors.ts`).
8. Nothing in the view: `ParamInput` draws it from the schema; settings, sweeps, undo, persistence and export come with it.
9. An old saved state without it gets the default from the schema's sanitizer; bump the store's `version` only when the export format changes.
10. Test the maths in `tests/model.test.ts`; run `npm run boundaries`.

**A chart**
1. Model: the pure function that computes its numbers.
2. Scenarios: in the section's builder (`src/app/scenarios/<section>.ts`) build a `ChartSpec`: `table(f(…), rows)`, `mark`, `x`, `y`, `series` with colour roles, `annotations`.
3. Give it a stable `id` and put it in the `ScenarioView`'s `primary` or `secondary`.
4. Name it in the `charts` of the view (`views[]`) that answers its question.
5. What-ifs: `stories` with `params` (moves the deck) or a `patch` (re-defines the chart).
6. A drawn figure instead: `kind: "figure"`, `figure: "<name>"`, the component in `src/app/view/figures/`, registered in `FIGURES`.
7. Its words (title, subtitle as the encoding) live in the spec.
8. Nothing else: `ChartHost` draws it with any backend, with ⚙ and ⊞.
9. `npm run parity -- --only=<id>` checks the three backends agree.
10. Pin what matters in `tests/charts.test.ts`.

**A view** (a responsibility page, `#view/<id>`)
1. In the section's builder, add `{ id, title, blurb, charts: [...] }` to `views`.
2. `title` is the trader's question it answers ("How much to risk a night").
3. `kpis: [indices]` picks the section's figures shown beside it; `params` its own inputs.
4. The id is the address: `#view/<id>`; the Views menu, `[` and `]`, the ↗ on its charts and the parity run find it by themselves.
5. Link to it from a Desk row: `ROW_VIEWS` in `src/app/scenarios/desk.ts`.
6. Link to it from copy: `#view/<id>` in a lede, a note or the Guide.
7. Context beside the charts comes from the scenario (claim, notes); nothing in the view layer.
8. Ordering follows the builders' order (`BUILDERS` in `src/app/scenarios/index.ts`) and then `views`.
9. Keep its charts' ids unique across the app.
10. Test that the view exists and holds its charts in `tests/charts.test.ts`.

**A page** (`#<name>`)
1. Add the name to `ROUTES.pages` in `src/app/view/App.tsx` (`aliases` for a second name).
2. Write the page in `src/app/view/<Name>.tsx`, from kit frames where one fits.
3. Its words in `src/app/data/copy/<name>.ts`, its numbers from the build (`result`), never computed in the page.
4. Add a branch to the page switch in `App`.
5. Add a link to `TopBar`'s nav, and to the ⋯ tools for narrow screens.
6. Should the deck hide on it? Extend `DeckBar`'s `hidden`.
7. Parts of the page are `#<name>/<part>` and arrive in `route.section`; give each the DOM id `<name>-<part>` and call `useRevealTarget(id, ready)` (`src/kit/ui/Link.tsx`), the one place that scrolls to it (and holds it while the page fills); links to it are `Link`s.
8. Anything else that needs to know listens to `route:changed`; nothing adds a hashchange listener.
9. Document it in the Guide's Pages section (`src/app/data/copy/guide.ts`).
10. Check it at 1380×900 and 400×800.

**An event**
1. Generic, said by the kit: add it to `KitEvents` (`src/kit/events/types.ts`); the app's own: to `AppEvents` (`src/app/events.ts`).
2. Give it a doc comment: who emits it and when.
3. Payload: plain data, enough for a listener to act without reading anything else.
4. Emit after the state holds the change: in a store action through `emit`, in a component with `useBus().emit` / `useAppBus().emit`.
5. Listen in a component with `useBusEvent` / `useAppEvent` (unsubscribes on unmount), elsewhere with `bus.on` (returns the unsubscribe).
6. A notice from it: one line in `src/app/view/announce.ts`, its words in `src/app/data/copy/notices.ts`.
7. A high-rate event (one per frame) should be muted in `main.tsx`'s dev-log filter.
8. Never use the bus to carry state or derived numbers; it says what happened.
9. Add it to the table above.
10. Test it with a recorder bus in `tests/events.test.ts`.

## Appendix: before (the audit, at 89ad318)

### Where model, data and view mixed

1. `src/app/params/params.ts` held the `Params` contract, `Market` and the market
   functions (model) beside `DEFAULT_PARAMS` and `DISCUSSION_P_CLEAN` (data); the
   market functions read the data constant.
2. `src/app/model/policies.ts` imported `Params` from `params/` (a model file reaching
   into a file of values) and kept the policies' names, colours, labels and
   `YOUR_POLICY` (data and copy) beside the night each policy plays (model).
3. `src/app/params/datasets.ts` held the `Datasets` contract with its empty value and
   sanitizer.
4. `src/app/scenarios/discussion.ts`: the discussion's setup, a data instance, in the
   view-model folder.
5. `src/app/deck/deckView.ts` and `src/app/desk/desk.ts`: view-models built in the
   worker, kept in folders of React components; `scenarios/index.ts` imported them from
   there.
6. `src/app/copy/kitCopy.ts` (copy) imported `movedBadge` from
   `scenarios/derived.ts`, against the direction data ← scenarios; `formatIn` there
   repeats most of `valueText` in `params/sweepAnchors.ts`.
7. Views computing maths: `deck/CleanSeason.tsx` (`pCleanFromLossRate`,
   `lossRateFromPClean`, parsing the typed probability), `DataDialog.tsx`
   (`parseNumberList`, `recordStats` for its caption), `deck/MarketSwitch.tsx`
   (`marketPatch`, and the options' words).
8. `src/app/copy/guide.ts` (copy) imported `HOTKEY_HINTS` from
   `kit/sweeps/useSweeps.ts`, a React hook module.
9. `src/app/params/sweepAnchors.ts`: the sweep adapter's anchor values (read from the
   last build's `DeckView`) and formatting, filed with the parameters.
10. Copy in components: `App.tsx` (top-bar labels and hints, the Settings lede, the
    "Computing…" lines), `desk/DeskPage.tsx` (block headings, lede, captions),
    `DataDialog.tsx` (blurbs, messages), `deck/status.ts` (row-2 tooltips),
    `deck/useDeckProps.tsx` (drawer notes and blurbs).
11. The discussion's quoted figures are written inline in each builder's `fig(…)`
    calls, next to the computation they are compared with.
12. Kit reaching for app types: none by import (the grep and rule 1 print nothing).
    In words only: kit comments call the colour roles a, b, c "policy" colours
    (`charts/theme.ts`, `ui/types.ts`, `ui/scenarioProps.tsx`, `ui/deck/types.ts`), and
    `theme.css` and `deck/deck.css` still carry app classes (`desk-*`, `dkb-market*`,
    `topbar-*`, …), as `src/kit/ui/README.md` says.
13. Scenarios or model importing React or the DOM: none.

### Ad-hoc cross-cutting channels

1. `kit/ui/route.ts` kept the views' reading order in a module variable:
   `setViewOrder` written by `App` in an effect, read by `stepView` inside
   `useViewKeys`.
2. `deck/DeckBar.tsx` listened to `hashchange` itself and re-parsed the hash to hide
   on Settings and the Guide, beside the router doing the same.
3. `kit/sweeps/useSweeps.ts` kept the replayer's cursors in a module-level `Map`
   shared by every mount.
4. `BUILD_SETTLED` (`build.ts`) is shared with `sweeps.ts`: the sweep adapter reads the
   last build's deck figures for anchors and asks `settledSince(t)`.
5. `KitCopy.storyMoved`: a function passed through the copy so a kit frame can have
   the app word what a story moved.
6. Feedback that stayed inside one component: the import dialog's inline line, the
   data editor's message, the chart editor's flash. Nothing else could learn that an
   import happened or a story moved the deck.
7. `deck/MarketSwitch.tsx` focuses the loss-rate box by DOM id (`customFocusId`,
   `document.getElementById`).
8. Window listeners for DOM concerns: menus close on `hashchange`, dialogs, popovers
   and the drawer on Escape.
9. Module-level registries and caches configured at start or private to a module:
   `registerFigures`, `configureTheme`, the backend cache, the wheel gate's scroll
   watcher, `builderIds` in `scenarios/index.ts`, the memo in `derived.ts`.
10. Callbacks through props: `TopBar`'s `onDialog`, the deck's `onExpandedChange`,
    `LinkedValue`'s `onCommit`; none crosses more than one level.
11. The store is a module singleton (`useStore`) that app components import directly.

## Appendix: after

- Moves (one mechanical commit, `git mv` and import rewrites): `params/{params,schema,
  datasets,presets}.ts` → `data/`; `params/sweepAnchors.ts` → `sweepAnchors.ts`;
  `copy/*` → `data/copy/`; `scenarios/discussion.ts` → `data/discussion.ts`;
  `deck/deckView.ts` → `scenarios/deck.ts`; `desk/desk.ts` → `scenarios/desk.ts`;
  `App.tsx`, `DataDialog.tsx` → `view/`; `deck/*` (the rest) → `view/deck/`;
  `desk/{DeskPage.tsx,grid.ts}` → `view/desk/`; `figures/*` → `view/figures/`.
- Mixed files split (before 1–3, 6): `model/params.ts` (the market functions now take
  the discussion's clean-season probability), `data/params.ts`; `model/datasets.ts`,
  `data/datasets.ts`; `model/policies.ts` (`nightPolicies`), `data/policies.ts`;
  `data/copy/paramText.ts` (`formatIn`, `movedParts`, `movedBadge`).
- Maths out of the views (7): `scenarios/controls.ts` (`cleanSeasonLink`,
  `marketSwitch`, `datasetCaption`, `readNumbers`). The hotkeys' names (8):
  `kit/sweeps/hotkeys.ts`, React-free.
- Channels (1–3, 6): the views' order is an argument (`useViewKeys(blocked, order)`,
  `stepView(order, dir)`); the deck takes `hidden` from the shell's route; the cursors
  live in the engine hook; imports and stories reach the reader as notices through the
  bus, and the router, the build and the replayer announce themselves on it.
- Kept, on purpose: the store singleton (11; `KitProvider` receives the same
  instance), `BUILD_SETTLED` (4; a query, not an event), `storyMoved` (5; copy may be
  a function), the DOM listeners (8) and the registries (9).
- Not done yet: the copy still inside components (10), the quoted figures inline in
  the builders (11), the DOM-id focus (7; a `param:focus` event would replace it), the
  duplicated value formatting (6: `formatIn` and `valueText`), and the app classes in
  the kit's stylesheets (12).
- With the links (merged after this audit): `Link` (`src/kit/ui/Link.tsx`) owns every
  scroll to a target, a click's (`followLink`) and a page's that opens on a part
  (`useRevealTarget`, which also holds the target while content above it arrives); no
  page scrolls itself. It adds two module-level registries of the kind kept in 9: the
  route config that `useRoute` registers for `Link` (`route.ts`), and the jump a link
  has started (`pending`), so the page that renders the route next neither scrolls a
  second time nor misses the mark. A link moves the address with `pushState` and a
  synthetic `hashchange`, which the router hears like any other; `route:jumped` says a
  link scrolled within the open page.
