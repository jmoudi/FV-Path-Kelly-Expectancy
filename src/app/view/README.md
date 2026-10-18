# app/view

Everything that renders. `App.tsx` (the top bar, the routes, the page switch, the
notices); `deck/` (`DeckBar`, `useDeckProps` and the pure adapters `layout.ts` and
`status.ts` from the schema and the `DeckView` to the kit deck's props, the
clean-season field, the market switch, the strip slot); `desk/` (`DeskPage` and
`grid.ts`, the `DeskView` to the kit grid); `figures/` (the railroad and the calendar,
registered as `FIGURES`); `DataDialog.tsx`; `announce.ts` (which events become notices);
`bus.ts` (`useAppBus`, `useAppEvent`).

Lays out and calls the store; computes nothing. From model it imports types only: a
number or a patch comes from scenarios (`../scenarios/controls.ts` for the app's own
controls) or from the build.
