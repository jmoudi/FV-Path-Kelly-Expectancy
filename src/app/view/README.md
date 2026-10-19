# app/view

Everything that renders. `App.tsx` (the top bar, the routes, the page switch, the
notices); `deck/` (`DeckBar`, `useDeckProps` and the pure adapters `layout.ts` and
`status.ts` from the schema and the `DeckView` to the kit deck's props, the
clean-season field and the market switch, each with its padlock and its shake, the
strip slot, and "Locks (n)" in row 2); `desk/` (`DeskPage` and
`grid.ts`, the `DeskView` to the kit grid); `figures/` (the railroad and the calendar,
registered as `FIGURES`); `DataDialog.tsx`; `announce.ts` (which events become notices; `announceLocks.ts` for the locks: locked,
unlocked, a refused change, a run a lock stopped, one notice id per lock);
`bus.ts` (`useAppBus`, `useAppEvent`).

Lays out and calls the store; computes nothing. From model it imports types only: a
number or a patch comes from scenarios (`../scenarios/controls.ts` for the app's own
controls) or from the build.
