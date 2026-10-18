# kit/inputs

The synthetic number field.

- `SyntheticNumber.tsx`: a text box (typing, arrows, wheel) with a drag track. A click on
  the track focuses the field and does not move the value; dragging is relative at
  `perHundredPx` units per 100 px (Shift ×0.1); double-click returns to the default. It
  draws a band (a sweep's range, with marks for spots), a moving tick, and the ▶ / ❚❚
  marker in a slot reserved inside the box.
- `wheelGate.ts`: the wheel changes a field only when it is focused, or after the
  pointer has rested on it 400 ms with no page scroll in progress; trackpad deltas
  accumulate to one step per notch.
- `display.ts`: how values show and parse (percent units stored as shares, U+2212 minus).
- `number-field.css`: the band, tick, run slot and sweep strip styles (tokens only).

What the app supplies: value, bounds, unit, `onChange`, and optionally `active`,
`onActivate`, `run`, `band`, `tick`, `dragScale`. In this app `src/ui/NumberField.tsx`
connects it to the store and the sweep engine.
