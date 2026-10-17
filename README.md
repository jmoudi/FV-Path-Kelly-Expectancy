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
| Model | `src/model/` | Pure math. Season distributions (exact multinomial enumeration, a binned log-space engine, seeded Monte Carlo), the binary reduction, calibration, wing rates, correlation, Kelly sizing. No DOM, no chart library. |
| Parameters | `src/model/params.ts` | One typed object plus a schema with tiers: primary (control deck), secondary (tuned under a section), advanced (settings dialog). |
| View-model | `src/viewmodel/` | Turns model output into renderer-agnostic chart specs (`src/charts/spec.ts`): data table, mark, axes, series, annotations, user-story presets. One file per section. |
| Switchboard | `src/charts/registry.ts`, `src/charts/backends/` | Routes a spec to ECharts, Plotly, Vega-Lite, or an HTML table. Each backend is loaded on first use. |
| Authoring | `src/ui/Authoring.tsx` | Edits a spec in the GUI (backend, mark, axis scale and domain, x field, series visibility and emphasis, extra columns, height) and stores only the diff, keyed by chart id. |
| State | `src/state/store.ts` | Parameters, chart edits, default backend. Persisted locally, exported and imported as one JSON file. |
| UI | `src/ui/` | Control deck, section layout, chart host, tables, dialogs. One dark theme, graphite, with three policy hues and two status colours. |

## Reading the app

- **Control deck.** Six inputs: loss rate per name (or the clean-season probability it
  implies), gain per unit risked, nights per season, names per night, tranche at risk
  per night, seasons chained. Six headline numbers update with them.
- **Sections.** Each opens with the question it answers, a short lede, a row of
  figures, the primary chart, then secondary charts. Tables, notes, derivations, and the
  quoted-versus-computed figures sit in expanders underneath.
- **⚙ on any chart** opens the chart definition. The stories at the top are one-click
  re-definitions ("zoom on the range you cannot rule out", "show the mean instead").
- **⊞ on any chart** shows the numbers behind it.
- **Settings** picks the default backend and the engine limits; **Import / export**
  moves the whole state as JSON.

## The three policies

Every section compares the same three policies, derived from the deck:

- **A** one name, whole tranche (the coin)
- **B** k names, whole tranche (diversified, no reserve)
- **C** k names, the deck's share of the tranche (diversified, with reserve)
