# app/data

The instances: the values of this explainer, typed by the model.

- `params.ts`: `DEFAULT_PARAMS` (the discussion's inputs; the wing's realized ÷ priced
  sigma solved at load so its effective rate equals q) and `DISCUSSION_P_CLEAN`.
- `schema.ts`: `PARAM_DEFS`, `GROUP_LABELS`, the deck placement table, `SCHEMA`
  (through the kit's `createSchema`), `PARAM_BY_KEY`, `sanitizeParams`.
- `datasets.ts`: the empty datasets and their sanitizer. `presets.ts`: the default
  sweep presets (`PRESET_CATALOG`).
- `policies.ts`: the policies' names, colours and labels, `YOUR_POLICY`, `policies(p)`.
- `discussion.ts`: the discussion's setup (`DISCUSSION`) and `fig`, the
  quoted-vs-recomputed row with its reason.
- `copy/`: `guide.ts` (the Guide), `kitCopy.ts` (the kit frames' sentences),
  `market.ts`, `notices.ts` (what the notices say), `paramText.ts` (a parameter value
  in words, what a story moved).

Imports model, data and the kit's worker-safe modules only; never scenarios or view.
