# kit/ui/deck

The deck frame: a reduced bar of two rows anchored under a top bar, and a drawer
with every input and figure. Generic: it knows nothing about the explainer it sits
in. The app renders its own input widgets and formats its own numbers; the frame
lays them out.

## What it needs from the app

`<Deck>` takes (see `types.ts`):

- `groups: InputGroup[]` for row 1: `{ id, caption, fields: DeckField[] }`, where a
  `DeckField` is `{ id, node, below?, phone? }`. `node` is the app's input widget;
  `below` a line under it (e.g. a `LinkedValue`); `phone` keeps it in the row at
  ≤ 700px. Groups sit 40px apart with a hairline between them and wrap whole.
- row 2: `lead?: StatusLead` (`{ title, detail?, color?, tooltip? }`; `color` is
  drawn as an 8px dot before the title), `status: Figure[]` (`{ id, label, value,
  title? }`, value over label, always in ink),
  `note?: string` (a muted comparison), `legend: LegendItem[]`
  (`{ id, label, color }`), `chips?: ReactNode` before the strip, at their own width
  and nothing reserved while empty (this app's "Locks (n)"; on a phone they share the
  strip's line), and `strip?: ReactNode` for a slot that is always
  reserved (`stripIdle` when it only holds a placeholder: hidden on a phone).
- `drawer: DrawerSection[]`, each `{ id, title, blurb?, note? }` and one of
  `{ kind: "fields", fields }`, `{ kind: "figures", rows: FigureRow[] }`,
  `{ kind: "definitions", items }`, `{ kind: "custom", node }`; plus
  `drawerTop?: ReactNode` for the drawer's header (the drawer covers row 2's right
  end, so the app repeats the strip there).
- `expanded` and `onExpandedChange`; `hidden` (renders nothing, reports 0);
  `pending` (values dim); `heightVar` (default `--deck-h`, set on `<html>` to the
  reduced bar's rendered height so sticky offsets elsewhere can use it);
  `text` (button and title words); `phoneQuery` (default `(max-width: 700px)`).

Colours are CSS colour strings (`var(--c)`), so the frame never sees palette roles.
They are identity colours: the frame draws them as dots (before the lead, before a
figure row's label) and swatches (the legend), never as the colour of a value or a
name. A `FigureRow.color` says which one policy the row belongs to.

Also here: `LinkedValue` (a derived figure shown as text that turns into a box on
click, or always a box, handing the typed text back to the app to back-solve its
inputs), `Segmented` (a radio-group switch with an optional hint line per option),
`useMedia`.

## Styles

The frame's classes are `dkb-*`, `lv-*` and `seg-*`; they live in `deck.css` beside
these files, imported by the module that mounts the deck (in this app
`src/app/view/deck/DeckBar.tsx`). Sizes come from the
theme's type tokens (`--fs-label`, `--fs-ui`, `--fs-body`, `--fs-h`, `--fs-kpi`) and
colours from its colour tokens.

## Using it in another explainer

Write a provider that turns your parameter schema and your view-model's deck figures
into these props (this app's is `src/app/view/deck/useDeckProps.tsx`, with the pure parts
in `layout.ts` and `status.ts`), and mount `<Deck {...props} expanded … />` under the
top bar.
