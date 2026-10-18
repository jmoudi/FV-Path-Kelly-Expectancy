# kit/inputs

The parameter schema, the synthetic number field, and parameter settings.

- `schema.ts`: `ParamDef<P>` (label, symbol, unit, range, step, tier, group, deck
  placement, section, help, definition, input feel, `sweepable`, `anchors`) and
  `createSchema<P>({ defs, defaults })`, which gives `byKey`, `sanitize`,
  `sanitizePatch` and `coerce`. A def's `input` block (`slider`, `perHundredPx`,
  `wheelStep`, `fineStep`, `decimals`) is the default of its parameter settings.
- `SyntheticNumber.tsx`: a text box (typing, arrows, wheel) with a drag track. A click on
  the track focuses the field and does not move the value; dragging is relative at
  `perHundredPx` units per 100 px (Shift ×0.1); double-click returns to the default.
  The wheel, the arrows and the drag land on multiples of the step (of `fineStep` with
  Shift, which also makes one wheel notch or arrow press a fine step); Page Up / Down
  move ten steps; a typed value is clamped to the range and kept as typed. It draws a
  band (a sweep's range, with marks for spots), a moving tick, and the ▶ / ❚❚ marker in
  a slot reserved inside the box. `empty` lets a box stand empty with a placeholder (a
  setting at its default); `suffix` replaces the unit's sign ("pp").
- `wheelGate.ts`: the wheel changes a field only when it is focused, or after the
  pointer has rested on it 400 ms with no page scroll in progress; trackpad deltas
  accumulate to one step per notch.
- `display.ts`: how values show and parse (percent units stored as shares, U+2212 minus).
- `number-field.css`: the band, tick, run slot and sweep strip styles (tokens only).

- `NumberField.tsx`: the field wired to the store, the schema and the sweep engine
  through the kit context; `ParamInput.tsx` renders one schema parameter with it (or a
  select for a choice), with the parameter's effective settings, and with
  `withSettings` the ⚙ for them; `Num.tsx` is a plain box for settings and editors
  (`emptyHint` / `emptyBase` for a box that may stay empty).

## Parameter settings

How a person edits one parameter by hand, kept apart from its value (`params`) and from
the replayer (`kit/sweeps`, whose presets own their step and timing and never read
these; the two share only the schema's range).

- `paramSettings.ts` (worker-safe): `ParamSettings` (`step`, `fineStep`, `wheelStep`,
  `dragPerHundredPx`, `decimals`, `slider`, all optional), `effectiveSettings(def,
  user)` (the person's value, else the schema's `input`, else a default derived from
  the resolved step: fine step a tenth of it, or a fifth or a half when the box cannot
  show a tenth; wheel step the step, rounded to whole steps; decimals enough for the
  step), `sanitizeParamSettings(input, schema)`, `patchParamSetting`, and the grid
  (`quantize`, `stepOnGrid`, `clampTyped`).
- `ParamSettings.tsx`: `ParamSettingsButton` (the ⚙ beside a field's label, shown on
  hover or focus; a popover "Settings for <parameter>" beside the field with the six
  settings, defaults as placeholders, Reset; Escape closes it before any drawer),
  `ParamSettingsFields` (its body) and `ParamSettingsTable` (every numeric parameter:
  name, symbol, range, the six settings, Reset per row, Reset all; stacked on narrow
  screens). Styles in `param-settings.css`.
- The store keeps them (`kit/state`: `paramSettings`, `setParamSettings`,
  `resetParamSettings`), persisted and exported with the state.

What `SyntheticNumber` needs: value, bounds, unit, `onChange`, and optionally `active`,
`onActivate`, `run`, `band`, `tick`, `dragScale`. What the app supplies for the rest:
one `Schema<P>`, given to `<KitProvider schema>` (in this app `src/app/params/schema.ts`).
