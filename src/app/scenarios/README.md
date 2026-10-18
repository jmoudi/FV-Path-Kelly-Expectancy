# app/scenarios

The view-models: model and data in, what the screen shows out, as plain data built in
the worker. One builder per section (`binary.ts`, `meanMedian.ts`, `calibration.ts`,
`wing.ts`, `diversification.ts`, `correlation.ts`, `axes.ts`, `chaining.ts`), each
returning a `ScenarioView` of the kit's chart specs; `derived.ts` (the state every
builder shares, the market state); `deck.ts` (`DeckView`, the deck's figures); `desk.ts`
(`DeskView`, the Desk); `controls.ts` (the clean-season link, the market switch's
options and patches, the dataset captions); `types.ts` (the kit's scenario types bound
to `Params`); `index.ts` (`buildAll(params, datasets, { only })`).

Imports model, data, scenarios and the kit's worker-safe modules; never view, never
React.
