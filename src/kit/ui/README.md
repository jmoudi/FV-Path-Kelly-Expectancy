# kit/ui: the layout frames

Generic React frames for an explainer page. They know nothing about the model they
show: every frame takes plain props and small interfaces defined here (`types.ts`),
and never imports the app's types.

| Frame | File | Takes |
|---|---|---|
| Section skeleton | `SectionFrame.tsx` | eyebrow, chips (`LinkItem[]`), title, lede, claim, answers (`FigureItem[]`), actions, inputs (nodes), primary and secondary charts (nodes), panels (`PanelTab[]`) |
| Answer strip, figure | `AnswerStrip.tsx` | `FigureItem[]`; the first is the hero, the rest open with "+N more figures" |
| Footer line and tabbed panel | `TabbedPanel.tsx` | `PanelTab[]` (id, label, count, render); fixed height, scrolls inside |
| View page | `ViewFrame.tsx` | eyebrow, title, prev/next (`LinkItem`), main and aside nodes; the aside sticks beside the charts only while it fits the window, and is never a scroll box |
| Comparison grid | `DeskGrid.tsx` | `GridColumn[]` (a `tone` is the dot before the name, inline so a wrapped name keeps it; `subShort` replaces `sub` on a narrow screen), `GridGroup[]` of `GridRow`s with cells by column id; one hero row per group; the highlighted column in ink, the rest in ink-2; each cell from its decimal point on sits in a fixed slot, so a column's decimal points stack |
| Menus | `Menu.tsx` | `MenuButton` (portal panel, closes on Escape, outside click, hashchange), `LinkGroups`, `MenuItems` |
| Settings | `Settings.tsx` | `SettingsLayout`, `SettingsGroup`, `SettingRow`, `KeyLegend` (`KeyBinding[]`), `Segmented` |
| Chart frame | `../charts/ChartFrame.tsx` | title, subtitle, tools, tag, stories, story note, a plot box of fixed height, overlay, footer |
| Section | `Section.tsx` | one `ScenarioView`, through `SectionFrame` and the adapters in `scenarioProps.tsx` |
| View page | `ViewPage.tsx` | the `ScenarioView`s and a view id; `notFound` (a node) for an unknown id |
| Chart host | `ChartHost.tsx`, `Authoring.tsx`, `TableView.tsx` | one `ChartSpec`: the backend, the editor in ⚙, the ⊞ table, stories (the badge from `copy.storyMoved`; the answer shown whole); `legendPeer` (set by `Section` for two charts side by side) keeps the neighbour's legend rows free above the plot |
| Full and quick settings | `SettingsBody.tsx` | `FullSettings` takes a `data` slot and lists the schema's advanced tier and, under Parameters, every numeric parameter's settings (`kit/inputs/ParamSettings.tsx`); `QuickSettings` holds the everyday settings and the resets |
| Dialogs | `Dialogs.tsx` | `Modal`, import and export, the settings dialog (`guideHref` links a guide page) |
| Guide page | `GuideFrame.tsx`, `guide.css` | `title`, `lede`, `sections: GuideSection[]` (blocks: paragraph, sub-heading, list, table, key rows; inline `code` (a quote with a space is set without the chip), **term**, [label](#href), `{icon:name}` for a drawn tool icon), `current` (the section in the address, scrolled to), `page` (links are `#<page>/<id>`). A rail of section links that highlights the one being read; a contents list above the text on narrow screens |
| Routes | `route.ts` | a `RouteConfig` (`home`, `pages`, `aliases`, `sectionsPage`); `#view/<id>` and `#s-<id>` built in; `#<page>/<part>` puts the part in `route.section`. `useRoute` (called once, by the shell) emits `route:changed` on the event bus |
| Shell hooks | `Shell.tsx` | `useScrollSpy(ids, enabled, prefix = "s-")`, `useViewKeys(blocked, order)` (`[` and `]` between the views of `order`), `CrashScreen` |
| Notices | `Notices.tsx`, `notices.css` | nothing: it shows every `notice` on the event bus bottom-right (6 s, click or Escape dismisses, hover holds, the same `id` replaces, opacity only); mount it once |
| Copy | `copy.ts` | `KitCopy`: every sentence a frame says on its own; neutral defaults, the app overrides them |

Styles live in `kit.css` and read only the theme's tokens: `--fs-title`, `--fs-view`,
`--fs-h`, `--fs-chart`, `--fs-body`, `--fs-ui`, `--fs-label`, `--fs-hero`, `--fs-kpi`
(with `--fw-*` weights), the colours (`--bg`, `--surface`, `--raised`, `--raised-2`,
`--hairline`, `--grid`, `--ink`, `--ink-2`, `--muted`), the accent (`--accent`,
`--accent-hover`, `--accent-tint`, `--on-accent`), and the spacing
(`--space-section`, `--space-block`, `--gutter-2col`, `--prose-max`, `--claim-w`,
`--panel-h`, `--topbar-h`, `--deck-h`). No frame draws a box; structure is type,
spacing and hairlines. Colour roles: figures, names and labels are ink (`--ink`,
`--ink-2`, `--muted`); `--accent` (cream) marks only where to act (the focus ring,
the focused field's box and thumb, active and linked chips, primary buttons, the
active tab, link-hover underlines); the data colours `--a`/`--b`/`--c`, `--loss`,
`--good` appear in the frames only as an identity dot (`.dot`, from a `tone`/`dot`/
`color` prop) or a legend swatch. `applyThemeVars()` (`applyTheme.ts`) writes the
palette into the variables. Icons are drawn (`Icon.tsx`: one 16-unit grid, one
1.5px stroke), never font glyphs.

`theme.css` and `deck/deck.css` still carry a few rules for this app's own classes
(`desk-*`, `dkb-market*`, `topbar-*`, `topnav*`, `brand-*`, `rail-title`,
`page-title`, `status-line`); moving them into an app stylesheet changes the cascade
order, so it waits for its own screenshot pass.

To use them in another explainer: define the tokens (copy the `:root` block of
`src/kit/ui/theme.css`), import `kit.css` after it, and write adapters that turn your
view-model into these props (this app's are in `src/app/view/`).
