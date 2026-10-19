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
- `constraints.ts`: `CONSTRAINTS`, the relations the model implies among the
  parameters, as data for the kit's solver (`kit/state/constraints.ts`), each a rule
  only while a lock makes it one: the clean-season identity p = (1 − q)^n among q, p and
  n, the market identity (Fair: q = b/(1+b); Discussion case: p = 55% at n), the six
  calendar shares summing to 1; the linked key `P_CLEAN` ("pClean", lockable though not
  a parameter), `effectiveMarket`, and `SWEEP_RULE` (the store's own rule, for the Guide).
- `copy/`: `guide.ts` (the Guide; its Locks part is `guideLocks.ts`), `kitCopy.ts` (the
  kit frames' sentences), `locks.ts` (what the lock notices say, `lockValueText`),
  `market.ts`, `notices.ts` (what the notices say), `paramText.ts` (a parameter value
  in words, what a story moved).

Imports model, data and the kit's worker-safe modules only; never scenarios or view.
