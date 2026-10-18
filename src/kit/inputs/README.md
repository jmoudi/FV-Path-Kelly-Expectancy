# kit/inputs

The parameter schema and the synthetic number field.

- `schema.ts`: `ParamDef<P>` (label, symbol, unit, range, step, tier, group, deck
  placement, section, help, definition, input feel, `sweepable`, `anchors`) and
  `createSchema<P>({ defs, defaults })`, which gives `byKey`, `sanitize`,
  `sanitizePatch` and `coerce`.
- `SyntheticNumber.tsx`: a text box (typing, arrows, wheel) with a drag track. A click on
  the track focuses the field and does not move the value; dragging is relative at
  `perHundredPx` units per 100 px (Shift ×0.1); double-click returns to the default. It
  draws a band (a sweep's range, with marks for spots), a moving tick, and the run
  marker (drawn, not a glyph: a triangle while running, two bars while paused) in a
  slot reserved inside the box in every state (`--nf-slot`, which a frame that sets the
  box's padding reads), so nothing shifts and a 64px box still shows "8.00%".
- `wheelGate.ts`: the wheel changes a field only when it is focused, or after the
  pointer has rested on it 400 ms with no page scroll in progress; trackpad deltas
  accumulate to one step per notch.
- `display.ts`: how values show and parse (percent units stored as shares, U+2212 minus).
- `number-field.css`: the band, tick, run slot and sweep strip styles (tokens only).

- `NumberField.tsx`: the field wired to the store, the schema and the sweep engine
  through the kit context; `ParamInput.tsx` renders one schema parameter with it (or a
  select for a choice); `Num.tsx` is a plain box for settings and editors.

What `SyntheticNumber` needs: value, bounds, unit, `onChange`, and optionally `active`,
`onActivate`, `run`, `band`, `tick`, `dragScale`. What the app supplies for the rest:
one `Schema<P>`, given to `<KitProvider schema>` (in this app `src/app/params/schema.ts`).
