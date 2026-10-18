# The kit

Everything under `src/kit` is generic. It draws charts from renderer-agnostic specs, renders inputs from a parameter schema, sweeps those inputs in step with the page's frames, keeps the state, builds off the main thread, and lays the result out as a deck, sections, view pages, a comparison grid and settings. It knows nothing about tranches, seasons or policies. `src/app` is one explainer built on it; another finance explainer (an options-spread replay, a carry trade, a bond ladder) keeps `src/kit` and writes its own `src/app`.

**The one rule: nothing in `src/kit` imports `src/app`.** Kit code gets what it shows through props, through the schema, through the sweep adapter and through the copy it is given. Check with:

    grep -rnE 'from "(@app/|(\.\./)+app/)|import\("@app/' src/kit      # must print nothing

Imports use `@kit/<area>/…` and `@app/<area>/…` across areas (tsconfig `paths` and vite `resolve.alias`, kept in step), and `./…` inside one area.

## Areas

| Area | What it is | What it needs from the app |
|---|---|---|
| `charts/` | `ChartSpec` and chart edits (`spec.ts`), axis resolution (`resolve.ts`), the bar plan, label placement and the parity probe (`bars.ts`, `collide.ts`, `probe.ts`, `parity.ts`), the backend switchboard (`registry.ts`, `backends/`: ECharts, Plotly, Vega-Lite, each loaded on first use), the figure registry (`figures/`), the palette (`theme.ts`), number formatting (`format.ts`, `numbers.ts`; minus always U+2212), `ChartFrame`, and `ScenarioView<P>`, the unit a builder returns (`scenario.ts`) | Specs; SVG figure components through `registerFigures`; optionally a palette through `configureTheme` |
| `inputs/` | `ParamDef<P>` and `createSchema` (`schema.ts`), the synthetic number field (typing, wheel, arrows, relative drag, sweep band), `NumberField` (field + store + sweeps), `Num`, `ParamInput`; parameter settings (`paramSettings.ts`: the six settings and their resolution over the schema's `input` defaults, the sanitizer, the grid; `ParamSettings.tsx`: the field's ⚙ popover and the settings table) | One `Schema<P>` (its `input` blocks are the settings' defaults) |
| `sweeps/` | Presets (loop, ping-pong, spots; ranges whole, share, absolute, ± around the value, between anchors), the plan engine, the frame-locked runner, the driver and hotkeys (`useSweeps.ts`), the strip and the preset editor, sanitizers. Never reads parameter settings | A `SweepAdapter` (context, format, settledSince) and a `PresetCatalog` |
| `state/` | `createAppStore(config)`: params with undo and redo, imported number lists, chart edits and stories, presets, links and runs, UI settings, parameter settings (`paramSettings`), persistence under one key, versioned import and export, all sanitized on load. `KitProvider` with `useKit`, `useKitApi`, `useSchema`, `useKitSweeps`, `useKitCopy` | The store config and one `<KitProvider>` |
| `build/` | `defineBuildWorker` (worker side), `useBuild` (one request in flight, the newest waiting, any newer answer shown, `only` partial builds during a sweep, inline fallback), `BuildQueue`, `SettleTracker`, `sweepScope` and `mergeResult` | A build function, a worker entry, and `createWorker` written with a relative `new URL("./worker.ts", import.meta.url)` |
| `ui/` | The deck frame (`deck/`), the section skeleton and its composition (`SectionFrame`, `Section`), the view page (`ViewFrame`, `ViewPage`), the chart host with ⚙ authoring and the ⊞ table, the comparison grid (`DeskGrid`), menus, settings (`Settings`, `SettingsBody`), dialogs, the guide page (`GuideFrame`), routes and links (`Link`, inline markup), the shell hooks (scroll spy, [ / ] between views, crash screen), adapters from a `ScenarioView` to frame props (`scenarioProps.tsx`), the stylesheets (`theme.css`, `kit.css`, `deck/deck.css`) and `applyThemeVars` | Props, a `RouteConfig`, `KitCopy` overrides, slots (the settings page's data group, the view page's not-found line), the guide's `GuideSection[]` |
| `math/` | Normal and Student-t distributions, lgamma, binomial, Beta, a seeded RNG, linspace and logspace, integration | Nothing |

Worker-safe (no React, no DOM; scenario builders may import them): `math/*`, `charts/{spec,scenario,numbers,format,resolve,theme,bars,collide,parity,probe}.ts`, `inputs/{schema,display,paramSettings}.ts`, `sweeps/{types,engine,runner,sanitize,adapter}.ts`, `build/{worker,coalesce,scope}.ts`. Never add a barrel `index.ts` that mixes them with `.tsx` files (`ui/deck/index.ts` is main-thread only).

## Where an app plugs in

1. **Schema** (`inputs/schema.ts`). `createSchema<P>({ defs, defaults })` gives `byKey`, `sanitize`, `sanitizePatch`, `coerce`. A def carries label, symbol, unit, range, step, tier, group, deck placement, section, help, definition, input feel, `sweepable` and `anchors: AnchorDef[]` (named sweep points; each may name the built-in it falls back to).
2. **Store** (`state/createAppStore.ts`). `createAppStore<P, D>({ schema, datasets: { empty, sanitize }, storageKey, version, presets: { defaults, legacy? }, planner? })`. Changing `storageKey` forgets every saved state; bump `version` when the export format changes. Parameter settings come with it: `paramSettings` (key → `ParamSettings`), `setParamSettings(key, patch)` (null clears a field), `resetParamSettings(key?)`, sanitized against the schema on load and import; `ParamInput` reads them through `effectiveSettings(def, user)`, the sweeps never do.
3. **Sweeps** (`sweeps/adapter.ts`). A `SweepAdapter` answers three questions: the `SweepContext` of an input now (bounds, default, the value before the run, its anchors and `resolve(id)` for their values), how its values read (`SweepFormat`), and `settledSince(t)` (from the build's `SettleTracker`). Pass it to `<KitProvider sweeps>` and, as `plannerFor(adapter)`, to the store.
4. **Build** (`build/`). `defineBuildWorker((input, { only }) => output)` in the worker entry. In the app: `{ createWorker, build, settled: new SettleTracker() }` and `useBuild(input, config)` with a memoised `input`. The output is `{ scenarios: ScenarioView[]; partial?: string[] }` plus whatever else the app builds.
5. **Provider** (`state/context.tsx`). `<KitProvider store={useStore} schema={SCHEMA} sweeps={SWEEPS} copy={KIT_COPY}>` around the app. `KitCopy` holds every sentence a frame says on its own, including `storyMoved(before, now)`, the badge of a story that moved the parameters.
6. **Frames.** `Deck` takes `DeckProps` (groups of fields as nodes, a lead, figures, a legend, a strip, drawer sections). `Section` and `ViewPage` take a `ScenarioView`. `DeskGrid` takes columns and row groups. `FullSettings` takes a `data` slot (its Parameters group lists the schema's numeric parameters by itself). `ParamInput withSettings` adds the field's ⚙. `GuideFrame` takes `{ title, lede, sections: GuideSection[], current, page }`, with paragraph, sub-heading, list, table, key-row and callout blocks. `SettingsDialog` takes an optional `guideHref`. Routes: `useRoute(cfg)` with `{ home, pages, aliases?, sectionsPage }`; `#view/<id>` and `#s-<id>` are built in (`viewHref`, `sectionHref`), and `#<page>/<part>` gives a page's part in `route.section` (the guide's sections). Links: `Link` (`ui/Link.tsx`) renders every in-app link (a route, or `#el-<id>` for an element of the open page); it scrolls within the page smoothly and switches pages through the router, never reloading; copy strings, even those built in the worker, carry links as inline markup (`[label](#href)`, with `code`, **term** and `{{a:Name}}`), which every frame renders through `rich()`. `KitCopy.links` points the inputs caption and the sweep strip's hint at the app's documentation.
7. **Look.** `registerFigures({ name: { component, label, blurb } })` before the first render. `configureTheme(patch)` then `applyThemeVars()` for another palette. The CSS chrome reads `--accent` (with `--accent-hover`, `--accent-tint`, `--on-accent`), which is its own colour (`THEME.accent`), never a data role, so chrome and data recolour separately: it marks where to act (focus, sliders, active chips, link underlines) and the numbers the prose refers to (section and guide numbers), never a figure or a chart.

## Checklist for a second explainer

- [ ] `src/app/params/`: the parameter interface, defaults, `ParamDef<P>[]`, `SCHEMA`, datasets and their sanitizer, a `PresetCatalog`.
- [ ] `src/app/model/`: pure functions of the parameters (use `kit/math`).
- [ ] `src/app/scenarios/`: builders `(params, …) => ScenarioView<P>` and one `buildAll(input, { only })`. Builders name SVG figures by string and never import React.
- [ ] `src/app/worker.ts` (`defineBuildWorker`) and `src/app/build.ts` (`createWorker` with a relative literal URL, `build`, `settled`).
- [ ] `src/app/sweeps.ts` (the `SweepAdapter`) and `src/app/store.ts` (`createAppStore`, with `planner: plannerFor(SWEEPS)`).
- [ ] `src/app/copy/kitCopy.ts`: the `KitCopy` overrides.
- [ ] Optionally `src/app/copy/guide.ts`: the GUI's documentation as `GuideSection[]` for `GuideFrame`, on a page of its own (`pages: [..., "guide"]`).
- [ ] Adapters from the build output to `DeckProps` and, if any, to `DeskGrid`'s columns and groups.
- [ ] `src/main.tsx`: `applyThemeVars()`, `registerFigures(…)`, `<KitProvider>`; the stylesheets `theme.css` then `kit.css` before the components.
- [ ] `src/app/App.tsx`: `useRoute(ROUTES)`, `useBuild(input, BUILD)`, `useSweepEngine()`, `useSweepHotkeys()`, `useScrollSpy`, `useViewKeys`, then the frames.
- [ ] The boundary check above prints nothing; `tsc`, the tests and `vite build` pass; the built bundle has a `worker-*.js` chunk.

## A worked sketch: a credit-spread replay

Three files and nothing from `src/app`. Type-checked against this kit.

```ts
// spread.ts: the parameters, the schema and one scenario (worker-safe: no React)
import { f, table, type ChartSpec } from "@kit/charts/spec";
import type { ScenarioView } from "@kit/charts/scenario";
import { pct } from "@kit/charts/numbers";
import { createSchema, type ParamDef } from "@kit/inputs/schema";
import { linspace, normalCdf } from "@kit/math/stats";

export interface P { width: number; credit: number; vol: number }
const defs: ParamDef<P>[] = [
  { key: "width", label: "Wing width, σ", unit: "sigma", min: 0.25, max: 3, step: 0.05, tier: "primary", group: "trade", help: "Long strike minus short strike." },
  { key: "credit", label: "Credit, σ", unit: "sigma", min: 0.01, max: 1, step: 0.01, tier: "primary", group: "trade", help: "Premium collected." },
  { key: "vol", label: "Realized ÷ priced", unit: "ratio", min: 0.5, max: 2, step: 0.05, tier: "primary", group: "market", help: "How far moves run." },
];
export const SCHEMA = createSchema<P>({ defs, defaults: { width: 0.5, credit: 0.05, vol: 1 } });

export function buildSpread(p: P): { scenarios: ScenarioView<P>[]; pLoss: number } {
  const rows = linspace(0, 2 + p.width, 81).map((m) => ({ m, pnl: p.credit - Math.min(p.width, Math.max(0, m - 1)) }));
  const payoff: ChartSpec = { id: "payoff", title: "P&L at expiry", kind: "xy", mark: "line", data: table([f("m", "Move, priced σ"), f("pnl", "P&L, σ")], rows), x: { field: "m" }, y: { field: "pnl", zero: false }, series: [{ field: "pnl", color: "a" }], annotations: [{ kind: "vline", x: 1, text: "short strike", color: "muted" }] };
  const pLoss = 1 - normalCdf((1 + p.credit) / p.vol);
  const view: ScenarioView<P> = { id: "spread", number: 1, title: "One spread", claim: "The credit buys a capped loss.", lede: "Where does one spread end?", kpis: [{ label: "P(loss)", value: pct(pLoss, 1) }], primary: [payoff], secondary: [], tables: [], notes: [], localParams: ["vol"], views: [{ id: "payoff", title: "The payoff", blurb: "P&L against the move.", charts: ["payoff"] }] };
  return { scenarios: [view], pLoss };
}
```
```ts
// worker.ts
import { defineBuildWorker } from "@kit/build/worker";
import { buildSpread, type P } from "./spread";
defineBuildWorker((p: P) => buildSpread(p));
```
```tsx
// main.tsx: store, build, sweeps, deck and one section
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettleTracker } from "@kit/build/coalesce";
import { useBuild } from "@kit/build/useBuild";
import { pct } from "@kit/charts/numbers";
import { ParamInput } from "@kit/inputs/ParamInput";
import { KitProvider } from "@kit/state/context";
import { createAppStore } from "@kit/state/createAppStore";
import { plannerFor, type SweepAdapter } from "@kit/sweeps/adapter";
import { useSweepEngine } from "@kit/sweeps/useSweeps";
import { Deck } from "@kit/ui/deck";
import { Section } from "@kit/ui/Section";
import "@kit/ui/theme.css";
import "@kit/ui/kit.css";
import { buildSpread, SCHEMA, type P } from "./spread";

const SETTLED = new SettleTracker<ReturnType<typeof buildSpread>>();
const SWEEPS: SweepAdapter = {
  context: (key, _p: P, at) => { const d = SCHEMA.byKey[key]; return d ? { min: d.min, max: d.max, step: d.step, default: SCHEMA.defaults[d.key], ...at } : null; },
  format: () => ({ value: (v) => v.toFixed(2), delta: (d) => d.toFixed(2), ms: (ms) => `${ms} ms` }),
  settledSince: (t) => SETTLED.settledSince(t),
};
const useStore = createAppStore<P, { fills: number[] }>({ schema: SCHEMA, datasets: { empty: { fills: [] }, sanitize: () => ({ fills: [] }) }, storageKey: "spread-replay:v1", version: 1, presets: { defaults: [] }, planner: plannerFor(SWEEPS) });
const BUILD = { createWorker: () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }), build: buildSpread, settled: SETTLED };
const field = (k: keyof P) => ({ id: k, node: <ParamInput k={k} compact /> });

function App() {
  const params = useStore((s) => s.params);
  const { result, pending } = useBuild(params, BUILD);
  const [expanded, setExpanded] = useState(false);
  useSweepEngine();
  return (
    <>
      <Deck groups={[{ id: "trade", caption: "Trade", fields: [field("width"), field("credit")] }, { id: "market", caption: "Market", fields: [field("vol")] }]}
        status={result ? [{ id: "ploss", label: "P(loss)", value: pct(result.pLoss, 1) }] : []} legend={[]} drawer={[]} expanded={expanded} onExpandedChange={setExpanded} pending={pending} />
      {result?.scenarios.map((s) => <Section key={s.id} view={s} />)}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<KitProvider store={useStore} schema={SCHEMA} sweeps={SWEEPS} copy={{ exportFilePrefix: "spread-replay" }}><App /></KitProvider>);
```
The deck shows the three inputs (typing, wheel, drag, sweeps once presets exist); the section shows the payoff chart through any backend, with ⚙ authoring and the ⊞ table; undo, chart edits and import and export work. The rest is more scenarios, presets, a richer deck lead and copy.
