# kit/ui: the layout frames

Generic React frames for an explainer page. They know nothing about the model they
show: every frame takes plain props and small interfaces defined here (`types.ts`),
and never imports the app's types.

| Frame | File | Takes |
|---|---|---|
| Links | `Link.tsx` | `Link` (`to`: a route, an in-page anchor `#el-<id>` or an external address; `variant="plain"` for rails and chips): never reloads; a part of the open page scrolls smoothly below the sticky bars and is marked for a moment; Ctrl/⌘- or middle-click opens a new tab. `resolveLink` (pure), `followLink` (a jump within the open page emits `route:jumped`), `revealElement`, `useRevealTarget(elementId, ready)` for a page that renders a route's part: the one place a page scrolls to the part in its address, holding it while content above arrives. `rich(text)` / `RichText` render inline markup in any copy string: `[label](to)` through `Link`, `code` (a quote with a space is set without the chip), **term**, `{{a:Name}}` (a name after its identity dot), `{icon:name}` (a drawn tool icon); `plainText` strips it |
| Section skeleton | `SectionFrame.tsx` | eyebrow (the number in `.k-eyebrow-n`), chips (`LinkItem[]`), title, lede, claim, answers (`FigureItem[]`, each with an optional `href` and `elId`), `answersAfter` (a link on the strip's footer line), actions, inputs (nodes) with `inputsHref` (the caption's link), primary and secondary charts (nodes), panels (`PanelTab[]`) |
| Answer strip, figure | `AnswerStrip.tsx` | `FigureItem[]`; the first is the hero, the rest open with "+N more figures"; a figure with `href` has its label as a link |
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
| Guide page | `GuideFrame.tsx`, `guide.css` | `title`, `lede`, `sections: GuideSection[]` (blocks: paragraph, sub-heading, list, table, key rows, callout `note`/`careful`, a Markdown file read at run time; inline markup as `rich`, a **term**'s first appearance marked as its definition), `current` (the section in the address, revealed by `useRevealTarget` and held there while the page grows until the reader moves), `page` (links are `#<page>/<id>`, sections carry the DOM id `<page>-<id>`, sub-headings and the Markdown block's headings `<page>-<id>-<slug>`). A rail of section links that highlights the one being read; a contents list above the text on narrow screens |
| Routes | `route.ts` | a `RouteConfig` (`home`, `pages`, `aliases`, `sectionsPage`), registered by `useRoute` for `Link`; `#view/<id>` and `#s-<id>` built in; `#<page>/<part>` puts the part in `route.section`; `partElementId` names its element (`s-<id>`, `<page>-<part>`); `#el-<id>` (`anchorHref`) is no route but an anchor on the open page. `useRoute` (called once, by the shell) emits `route:changed` on the event bus for a move to another route, never for an `#el-` anchor |
| Shell hooks | `Shell.tsx` | `useScrollSpy(ids, enabled, prefix = "s-")`, `useViewKeys(blocked, order)` (`[` and `]` between the views of `order`), `CrashScreen` |
| Notices | `Notices.tsx`, `notices.css` | nothing: it shows every `notice` on the event bus bottom-right (6 s, click or Escape dismisses, hover holds, the same `id` replaces, opacity only); mount it once |
| Markdown | `Markdown.tsx`, `RemoteMarkdown.tsx`, `markdown.css` | `Markdown`: `text` (headings, paragraphs, lists, quotes, fenced code, rules; bold, italic, `code`, links; an in-app hash goes through `Link`; raw HTML stays text), `idPrefix`, `headingShift`, `classes`, `link` (another renderer). `RemoteMarkdown`: `src` fetched once per page load relative to the page, "Loaded <time> · Reload", `failure` for the line shown when it cannot be read |
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
`color` prop) or a legend swatch. Links (`.k-link`) are underlined always: ink-2 text,
the underline the accent at 45%, the full accent on hover and focus. The accent also
carries the places to act and the landmarks the prose refers to: the sliders (fill at
55%, thumb, the full accent and a halo on the field being worked on; a sweep's band
stays neutral), the section number in an eyebrow and the guide's section numbers, the
rule of the claim aside (60%) and of the inputs caption, the story chips' underline
and pressed state; never a figure. `applyThemeVars()` (`applyTheme.ts`) writes the
palette into the variables. Icons are drawn (`Icon.tsx`: one 16-unit grid, one
1.5px stroke; `lock` and `unlock` are the padlocks of `kit/inputs/locks.tsx`), never
font glyphs; copy names them as `{icon:<name>}`.

`theme.css` and `deck/deck.css` still carry a few rules for this app's own classes
(`desk-*`, `dkb-market*`, `topbar-*`, `topnav*`, `brand-*`, `rail-title`,
`page-title`, `status-line`); moving them into an app stylesheet changes the cascade
order, so it waits for its own screenshot pass.

To use them in another explainer: define the tokens (copy the `:root` block of
`src/kit/ui/theme.css`), import `kit.css` after it, and write adapters that turn your
view-model into these props (this app's are in `src/app/view/`).
