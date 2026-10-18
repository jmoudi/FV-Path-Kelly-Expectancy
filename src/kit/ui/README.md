# kit/ui and kit/charts: the layout frames

Generic React frames for an explainer page. They know nothing about the model they
show: every frame takes plain props and small interfaces defined here (`types.ts`),
and never imports the app's types.

| Frame | File | Takes |
|---|---|---|
| Section skeleton | `SectionFrame.tsx` | eyebrow, chips (`LinkItem[]`), title, lede, claim, answers (`FigureItem[]`), actions, inputs (nodes), primary and secondary charts (nodes), panels (`PanelTab[]`) |
| Answer strip, figure | `AnswerStrip.tsx` | `FigureItem[]`; the first is the hero, the rest open with "+N more figures" |
| Footer line and tabbed panel | `TabbedPanel.tsx` | `PanelTab[]` (id, label, count, render); fixed height, scrolls inside |
| View page | `ViewFrame.tsx` | eyebrow, title, prev/next (`LinkItem`), main and aside nodes |
| Comparison grid | `DeskGrid.tsx` | `GridColumn[]`, `GridGroup[]` of `GridRow`s with cells by column id; one hero cell per group |
| Menus | `Menu.tsx` | `MenuButton` (portal panel, closes on Escape, outside click, hashchange), `LinkGroups`, `MenuItems` |
| Settings | `Settings.tsx` | `SettingsLayout`, `SettingsGroup`, `SettingRow`, `KeyLegend` (`KeyBinding[]`), `Segmented` |
| Chart frame | `../charts/ChartFrame.tsx` | title, subtitle, tools, tag, stories, story note, a plot box of fixed height, overlay, footer |

Styles live in `kit.css` and read only the theme's tokens: `--fs-title`, `--fs-view`,
`--fs-h`, `--fs-chart`, `--fs-body`, `--fs-ui`, `--fs-label`, `--fs-hero`, `--fs-kpi`
(with `--fw-*` weights), the colours (`--bg`, `--surface`, `--raised`, `--hairline`,
`--grid`, `--ink`, `--ink-2`, `--muted`), and the spacing (`--space-section`,
`--space-block`, `--gutter-2col`, `--prose-max`, `--claim-w`, `--panel-h`,
`--topbar-h`, `--deck-h`). No frame draws a box; structure is type, spacing and
hairlines.

To use them in another explainer: define the tokens (copy the `:root` block of
`src/ui/theme.css`), import `kit.css` after it, and write adapters that turn your
view-model into these props (this app's are in `src/app/`).
