# kit/state

- `createAppStore.ts`: `createAppStore<P, D>(config)`, one zustand store: params with undo and redo, imported number lists, chart overrides and stories (one parameter-moving story at a time, its snapshot persisted), sweep presets, links, runs and the values before them, UI settings, persistence under `storageKey`, versioned import and export, everything sanitized on load.
- `context.tsx`: `<KitProvider store schema sweeps copy>`, and `useKit(selector)`, `useKitApi()`, `useSchema()`, `useKitSweeps()`, `useKitCopy()` for kit components. Kit components see the erased types (`KitState<any, any>`, `Schema<any>`); the app keeps its own typed `useStore`.

What the app supplies: `{ schema, datasets: { empty, sanitize }, storageKey, version, presets: { defaults, legacy? }, planner? }`, where `planner` is `plannerFor(adapter)` from `kit/sweeps/adapter.ts`. In this app: `src/app/store.ts`.
