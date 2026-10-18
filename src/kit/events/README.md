# kit/events

The one channel cross-cutting features talk through: notices, locks, logging.

- `types.ts`: `KitEvents`, the discriminated map of what the kit says (event name →
  payload): `param:changed` (with its `ParamSource`), `param:locked`, `param:refused`,
  `sweep:started|paused|stopped|stepped`, `story:applied|cleared`, `chart:edited`,
  `data:changed`, `state:imported`, `state:reset`, `settings:changed`,
  `build:settled`, `route:changed`, `route:jumped`, `notice`. An app extends it:
  `interface AppEvents extends KitEvents { … }`. Types only.
- `bus.ts` (worker-safe): `createBus<Events>({ log?, keep?, onError? })` →
  `emit`, `on` (returns the unsubscribe), `once`, `off`, `onAny` (every event, for logs),
  `recent()` (the last `keep`, default 100). Handlers run synchronously in subscription
  order; a throwing one goes to `onError` and the others still run; a handler added
  during an event waits for the next one. `log: true` (or a filter) prints each event
  with `console.debug`: the dev log.
- `react.tsx`: `BusProvider`, `useBus()`, `useOptionalBus()` (null outside a provider,
  for a piece that also renders on its own), `useBusEvent(name, handler)` (subscribed
  while mounted, always calling the newest handler), and `busHooks<AppEvents>()` for the
  same two hooks typed with an app's map.

Who emits: the store's actions (`kit/state/createAppStore.ts`, after the new state is
set), the replayer (`useSweepEngine`: `sweep:stepped`), the router (`useRoute`:
`route:changed`, never for an `#el-` anchor), the links (`Link`: `route:jumped`, a scroll
within the open page) and the build (`useBuild`: `build:settled`). `kit/ui/Notices.tsx`
shows every `notice`.

What the app supplies: one bus, `createBus<AppEvents>()` in its `main.tsx`, given to
`<KitProvider bus>`, which provides it and connects the store to it. In this app:
`src/main.tsx`, `src/app/events.ts`, `src/app/view/bus.ts`, `src/app/view/announce.ts`.
The event table and the rules are in `ARCHITECTURE.md`.
