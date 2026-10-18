# app/model

What things are and how they are computed: the contracts and the pure functions of this
explainer, no instances. `params.ts` (the `Params` type, `Market` and the market
functions, which take the discussion's clean-season probability as an argument),
`datasets.ts` (the `Datasets` type), `policies.ts` (the policy ids and the night each
plays), and the maths: `season.ts` (season distributions: exact, binned, Monte Carlo),
`binary.ts`, `calibration.ts`, `wing.ts`, `wingSeason.ts`, `correlation.ts`, `kelly.ts`,
`growth.ts`, `nav.ts`, `railroad.ts`, `calendar.ts`, `symmetric.ts`.

Imports only model and `@kit/math`; no React, no DOM, no values (those are
`../data`). Checked by `npm run boundaries` (see `ARCHITECTURE.md`).
