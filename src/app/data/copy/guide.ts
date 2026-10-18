/**
 * The Guide (#guide): how this app's GUI works, in the owner's words: parameter,
 * parameter settings, replayer, preset, deck, drawer, Desk, Explain, view, story,
 * chart editor. It names things and leaves their meaning to Explain and the views.
 * Rendered by the kit's GuideFrame (src/kit/ui/GuideFrame.tsx).
 *
 * Keep it true to the implementation: when a control changes, change its line here.
 */
import type { GuideSection } from "@kit/ui/GuideFrame";
import type { KeyBinding } from "@kit/ui/Settings";
import { HOTKEY_HINTS as K } from "@kit/sweeps/hotkeys";

const MAC = K.undo.startsWith("⌘");
const CTRL = MAC ? "⌘" : "Ctrl";

export const GUIDE_LEDE = "How the screen works: what each control does, where it lives and what the app keeps. It names things; Explain and the views say what they mean.";

const KEYS: KeyBinding[] = [
  { keys: ["[", "]"], action: "Previous or next view", scope: "from any page, not while typing in a box" },
  { keys: [K.undo], action: "Undo a parameter change; during a sweep, back to the value before it", scope: "outside a text box" },
  { keys: MAC ? [K.redo] : [K.redo, "Ctrl+Y"], action: "Redo", scope: "outside a text box" },
  { keys: [K.toggle], action: "Run or pause the linked preset", scope: "on the active parameter" },
  { keys: [K.stop], action: "Stop the sweep and keep the value", scope: "the active parameter's run, else every run" },
  { keys: [K.prev, K.next], action: "Previous or next preset", scope: "on the active parameter" },
  { keys: [K.all], action: "Pause or resume every sweep" },
  { keys: ["Enter"], action: "Commit a typed value", scope: "in a box" },
  { keys: ["Esc"], action: "Cancel typing in a box; otherwise close a popover, a menu, a dialog or the drawer, and dismiss the notices" },
  { keys: ["↑", "↓"], action: "One step; with Shift, one fine step", scope: "in a box or on a track" },
  { keys: ["←", "→"], action: "One step; with Shift, one fine step", scope: "on a track" },
  { keys: ["PgUp", "PgDn"], action: "Ten steps", scope: "in a box or on a track" },
  { keys: ["Home", "End"], action: "The bottom or the top of the range", scope: "on a track" },
  { keys: ["wheel"], action: "One wheel step; with Shift, one fine step", scope: "on a focused field, or after the pointer rests 400 ms" },
  { keys: ["Shift+drag"], action: "Drag at a tenth of the speed, on the fine step", scope: "on a track" },
  { keys: ["double-click"], action: "Back to the parameter's default", scope: "on a track" },
];

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "screen",
    title: "The screen",
    body: [
      { kind: "p", text: "Every page has the **top bar**. Most pages have the **deck** under it. The rest of the window is the page itself." },
      {
        kind: "table",
        head: ["Part", "Where", "What it holds"],
        rows: [
          ["Top bar", "always, at the top", "Tranche Replay (back to the Desk); Desk · Explain · Views ▾ · Settings · Guide; on the right Data, Import / export and {icon:settings} (quick settings). At 700 px and narrower the right-hand three fold into {icon:more}, which also lists the Guide."],
          ["Deck", "under the top bar, on every page but Settings and the Guide", "The parameters every section reads, in two rows, and Full deck ▾, which opens the **drawer** with all of them."],
          ["Desk", "`#desk`, the landing page", "The policies side by side, the sizing heatmap, a one-line record verdict and the market switch."],
          ["Explain", "`#explain`", "Every section on one page, with a rail of section links at the left."],
          ["Views", "`#view/<id>`", "One responsibility per page: a few charts with their context beside them."],
          ["Settings", "`#settings`, and quick settings behind {icon:settings}", "Everything that is not a parameter's value."],
          ["Guide", "`#guide`", "This page."],
          ["Notices", "bottom right, for a few seconds", "A line when an import worked or was refused, and when a story moved the deck or put it back, with the values that moved."],
        ],
      },
      { kind: "p", text: "Menus, popovers and dialogs draw above everything, so nothing clips them; Esc closes them." },
      { kind: "p", text: "A **notice** goes after 6 seconds; a click or Esc dismisses it sooner, and pointing at the stack holds it." },
    ],
  },
  {
    id: "parameters",
    title: "Parameters",
    body: [
      { kind: "p", text: "A **parameter** is a named value the model reads: Loss rate per name `q`, Nights per season `n`, At risk a night, and so on. Its value is what the charts are computed from. How a parameter is edited by hand is a separate thing, its **parameter settings** ([section 4](#guide/parameter-settings)); the **replayer** that moves it automatically is a third ([section 5](#guide/replayer))." },
      { kind: "h", text: "Where each parameter lives" },
      {
        kind: "table",
        head: ["Tier", "Where you edit it", "For example"],
        rows: [
          ["Deck row", "the deck's first row (eight fields in three groups: Per event, Per season, Sizing), and the drawer", "Loss rate per name, Gain per unit risked, Names a night"],
          ["Drawer", "the drawer's groups Event, Season, Sizing, Shared risk and Calibration band", "Drawdown threshold, Separation demanded"],
          ["Section", "Inputs for this section, above a section's charts on Explain; Inputs for this view on a view page", "Wing width, Student-t degrees of freedom"],
          ["Engine", "Settings → Engine, as plain boxes", "Random seed, Monte Carlo paths"],
        ],
      },
      { kind: "p", text: "A parameter marked **all sections** moves every section, not only its own. Two parameters are choices and take a select, Move distribution and Distribution engine; the market is a switch (below). On a phone the deck's row keeps four fields and All inputs opens the drawer as a bottom sheet." },
      { kind: "h", text: "The linked clean-season field" },
      { kind: "p", text: "Under Loss rate in the deck, **= 55% clean season (Coin)** is not a parameter but a figure linked to one: click it, type a probability and press Enter, and the loss rate is solved from it (Esc cancels). The drawer shows the same figure under Loss rate, and it works the same way." },
      { kind: "h", text: "The market switch" },
      { kind: "p", text: "The market switch, in the drawer's Market section and the Desk's Market block, sets the loss rate to one of two named cases, Fair market or Discussion case; typing the loss rate by hand makes it Custom." },
      { kind: "p", text: "Some sections and views also offer an action that sets parameters in one click; undo puts them back." },
    ],
  },
  {
    id: "editing",
    title: "Editing a parameter by hand",
    body: [
      { kind: "p", text: "A number parameter is a box with a drag track beside it, the **slider**. Focusing the box or the track makes it the **active parameter**: it is highlighted, the deck's strip names it, and the replayer's keys act on it." },
      {
        kind: "table",
        head: ["You", "What happens"],
        rows: [
          ["type a number", "Enter, or leaving the box, commits it; Esc cancels. A typed value is clamped to the parameter's range and kept as typed, never rounded to the step (a count is rounded to a whole number)."],
          ["turn the wheel", "Acts only while the field is focused, or after the pointer has rested on it for 400 ms with no page scroll in progress; otherwise the page scrolls. One notch moves one wheel step; with Shift, one fine step."],
          ["press ↑ or ↓", "One step (on the track ← and → too); with Shift, one fine step. Page Up and Page Down move ten steps; Home and End on the track go to the ends of the range."],
          ["drag the track", "The value moves relative to where you grab: the parameter's drag per 100 px of pointer travel, times the drag sensitivity in quick settings, however wide the track is drawn. Shift drags at a tenth of the speed on the fine step."],
          ["click the track", "Focuses the field and leaves the value alone."],
          ["double-click the track", "Back to the parameter's default."],
        ],
      },
      { kind: "p", text: "The wheel, the arrow keys and the drag land on multiples of the step (with Shift, of the fine step), counted from zero and kept inside the range. From a value between two multiples, the first move lands on the nearest one in its direction." },
      { kind: "h", text: "Undo and redo" },
      { kind: "p", text: `${K.undo} steps back through parameter changes and ${K.redo}${MAC ? "" : " (or Ctrl+Y)"} forward, while focus is not in a text box; inside a box they are the box's own undo. Changes less than 400 ms apart count as one step, and the last 100 are kept. While a sweep runs or is paused, ${K.undo} first puts its parameter back where it was before the sweep.` },
    ],
  },
  {
    id: "parameter-settings",
    title: "Parameter settings",
    body: [
      { kind: "p", text: "**Parameter settings** say how a parameter moves when you edit it by hand. They are not its value, and they do not touch the replayer: a preset that steps 0.25 pp keeps stepping 0.25 pp after you set the manual step to 0.5 pp, and no preset changes the manual step. The only thing the two share is the parameter's range." },
      {
        kind: "table",
        head: ["Setting", "What it does", "Default"],
        rows: [
          ["Step", "The quantum: the wheel, the arrow keys and the drag land on its multiples.", "The parameter's own (Loss rate 0.05 pp, Nights 1)"],
          ["Fine step", "The quantum with Shift held, for the wheel, the arrows and the drag.", "A tenth of the step, or a fifth or a half where the box cannot show a tenth (Loss rate 0.01 pp); for a count, a tenth of the step and at least 1"],
          ["Wheel step", "One notch of the wheel, as a whole number of steps (at least one).", "The step"],
          ["Drag per 100 px", "How far 100 px of drag moves the value, before the drag sensitivity in quick settings multiplies it.", "Set per parameter (Loss rate 0.25 pp, Nights 5, Names a night 1, At risk a night 10 pp)"],
          ["Decimals", "Decimal places the box shows. A typed value keeps its precision whatever the box shows.", "Enough for the step, unless the parameter sets its own"],
          ["Slider", "Whether the drag track shows beside the box.", "On, except for seeds, caps and path counts"],
        ],
      },
      { kind: "h", text: "Where to change them" },
      {
        kind: "list",
        items: [
          "In the drawer (Full deck ▾): hover or focus a field and click the {icon:settings} at the right of its label. The popover **Settings for <parameter>** holds the six settings, shows each default as the placeholder of an empty box, and Reset clears that parameter's settings.",
          "On the Settings page, under **Parameters**: one row per parameter with its name, symbol, range and the defaults it sets for itself, the six settings (Slider as a switch: default, on or off), Reset on a row that has settings of its own, and Reset all. On a wide screen a row at rest shows only your own settings; pointing at the row or working in it shows every box, an empty one with its default.",
          "The deck's reduced row shows none of this, but its fields follow the same settings, as do the drawer, the section and view inputs and Settings → Engine.",
        ],
      },
      { kind: "p", text: "An empty box means the default. Type a value, or use the wheel or the arrows on the box, to set one; clear the box to go back to the default. A {icon:settings} whose parameter has its own settings stays visible, in the accent colour. Parameter settings are saved with the state and travel in the export ([section 8](#guide/data)). Reset every parameter (Settings → Reset) puts the values back and leaves the settings alone; Forget everything saved clears both." },
    ],
  },
  {
    id: "replayer",
    title: "The replayer",
    body: [
      { kind: "p", text: "The **replayer** moves the active parameter by itself, from a saved **preset**, so you can watch the charts change instead of dragging. A preset speaks the parameter's own units and owns its step and its timing; parameter settings never change it." },
      { kind: "h", text: "Presets" },
      {
        kind: "table",
        head: ["Part", "Choices"],
        rows: [
          ["Kind", "loop (wrap to the start), ping-pong (reverse at the ends), spots (hold a few values in turn)"],
          ["Range", "the whole range; part of the parameter's range (as shares); between two values; ± around the current value (a share of the range, or the parameter's units); between two anchors"],
          ["Anchors", "every parameter: min, current, max, default. Loss rate: optimistic, deck, break-even. At risk a night: robust, Kelly, deck. An anchor a parameter lacks falls back to its min, current value or max."],
          ["Step", "in the parameter's units (0.05 pp, 1 name) or as a share of the swept range"],
          ["Timing", "the least time each value stays on screen, in ms; each spot has its own hold time"],
        ],
      },
      { kind: "p", text: "Three presets ship: Optimistic to break-even (loop, 0.05 pp every 400 ms), Around the current value (± 20% of the range, ping-pong) and Three spots (2 s each). Settings → Sweep presets creates, edits, deletes and links them, and describes each in the active parameter's units (\"loops from optimistic 2.52% to break-even 3.38%, step 0.05 pp every 400 ms\")." },
      { kind: "h", text: "Linking and running" },
      { kind: "p", text: "Each parameter has at most one linked preset. In the deck's strip, the preset chip links one (link a preset) and each click moves to the next; {icon:play} run starts it, {icon:pause} pauses, {icon:stop} stops a paused run, and {icon:restore} before sweep puts back the value from before. The same controls sit at the top of the drawer and under Settings → Sweep presets." },
      { kind: "p", text: `While a run moves, the strip reads \`sweeping Loss rate per name 2.97% · step 10 / 18 · ${K.stop} stop\`, the track draws the preset's range as a band with the run's position as a moving tick, and {icon:play} or {icon:pause} sits inside the box. Before it runs, the linked preset's band shows on the active parameter's track.` },
      {
        kind: "list",
        items: [
          "A run starts from the current value and never moves on before the charts have drawn the last value; each value stays at least its time, divided by the sweep rate in quick settings, and the cap in values a second (Settings) holds back any preset.",
          `Stop keeps the value where it is; {icon:restore} before sweep or ${K.undo} restores the value from before; editing the swept parameter by hand stops the run; a reload during a run puts the value back.`,
          "During a run the app rebuilds only the deck, the Desk and the sections or view on screen; everything else catches up when it stops.",
          "Parameters that make no sense to sweep (the seed, engine caps, path counts) read not swept in the strip.",
        ],
      },
      {
        kind: "keys",
        rows: [
          { keys: [K.toggle], action: "Run or pause the linked preset", scope: "on the active parameter" },
          { keys: [K.stop], action: "Stop", scope: "the active parameter's run, else every run" },
          { keys: [K.prev, K.next], action: "Previous or next preset", scope: "on the active parameter" },
          { keys: [K.all], action: "Pause or resume every sweep" },
        ],
      },
    ],
  },
  {
    id: "charts",
    title: "Charts",
    body: [
      { kind: "p", text: "Each chart has a title and, under it, a subtitle that says what is drawn and how (the encoding). Its tools show while the pointer is over the chart or focus is inside it." },
      {
        kind: "table",
        head: ["Tool", "What it does"],
        rows: [
          ["{icon:open}", "Opens the chart's view on its own page."],
          ["{icon:table}", "Shows the numbers behind the chart in the same box: the box keeps its height, the header stays, the rows scroll. {icon:table} again goes back."],
          ["{icon:settings}", "Opens the **chart editor**."],
        ],
      },
      { kind: "h", text: "Stories" },
      { kind: "p", text: "The chips under a title are **stories**: questions asked in one click (\"What if q is really 3.2%?\"). A story can change what the chart shows, move parameters, or both, and its answer appears under the chips, in full. When it moved the deck, the line carries a badge, `moves deck: q 2.94% → 3.38%`, and undo." },
      {
        kind: "list",
        items: [
          "Only one deck-moving story is active at a time: starting another turns the first off and puts its parameters back first.",
          "Clicking the active story, or undo, turns it off and restores what it moved, also after a reload.",
          "A story replaces the chart's own edits.",
        ],
      },
      { kind: "h", text: "The chart editor" },
      { kind: "p", text: "{icon:settings} opens the chart's definition beside the chart on the side with more room, or above or below the plot when neither side has room, never over the plot; at 900 px and narrower it is a bottom sheet. It opens without animation and closes when the pointer moves away, on Esc or on a click outside." },
      {
        kind: "table",
        head: ["Group", "What you can change"],
        rows: [
          ["Display", "x and y axes linear or log; the mark (line, step, area, bar, scatter); reference lines and labels; the legend"],
          ["Axis ranges", "from and to on each axis (auto until set); the x field, when the data has more than one"],
          ["Series", "show or hide each series, its mark and its emphasis; add a column from the data"],
          ["Backend", "ECharts, Plotly, Vega-Lite or Table, for this chart"],
          ["Size", "the plot's height in px"],
          ["Last row", "Data as CSV, Copy spec JSON, Reset chart"],
        ],
      },
      { kind: "p", text: "Display, axis ranges and series apply to plotted charts. Edits are saved per chart; a tag such as `ECharts · edited` marks a chart that is edited or drawn by another backend than the default. Figures the app draws itself (the railroad, the calendar) offer only their height and their data. The default backend for every chart is in quick settings; Settings → Reset clears every chart's edits." },
    ],
  },
  {
    id: "pages",
    title: "Pages",
    body: [
      { kind: "h", text: "Desk" },
      { kind: "p", text: "The landing page; an empty address opens it. Four blocks: Your book (the policies side by side over one season and over N seasons; each row label opens the view that explains it), How much to risk a night (the sizing heatmap with your cell outlined, beside the robust figure), Can the record tell (one line that links to its view) and Market (the market switch)." },
      { kind: "h", text: "Explain" },
      { kind: "p", text: "Every section on one page, in order. The rail at the left (on screens wider than 1100 px) marks where you are and jumps to a section; `#s-<section>` opens one. A section reads top to bottom: its number with links to its views, the title, the question it answers with the claim beside it, two or three numbers (+N more figures shows the rest), Inputs for this section, the primary chart, the secondary charts, and a footer line (Table · Derivations · Quoted vs recomputed) that opens one panel of fixed height in place." },
      { kind: "h", text: "Views" },
      { kind: "p", text: "The same charts split into responsibilities, one per page (`#view/<id>`), with the context beside them: the claim, a line on the view, its figures, Inputs for this view and the derivations. Open one from the Views menu, from the links next to a section's number or from {icon:open} on a chart. [ and ] step to the previous or next view from any page while focus is not in a box; the links under the title do the same." },
      { kind: "h", text: "Settings" },
      { kind: "p", text: "{icon:settings} in the top bar opens quick settings: the default backend, the drag sensitivity, the sweep rate and the resets. The Settings page (`#settings`) adds the cap in values a second, the engine parameters, the hotkeys, Parameters (the parameter settings), Sweep presets, your data, and import and export." },
      { kind: "h", text: "Guide" },
      { kind: "p", text: "This page. Each section has its own address, `#guide/<section>`; [Keys](#guide/keys) is `#guide/keys`." },
    ],
  },
  {
    id: "data",
    title: "Data and state",
    body: [
      { kind: "h", text: "Your data" },
      { kind: "p", text: "Data in the top bar (or Settings → Your data) takes two imports, one number per line (a CSV's last column is used), pasted or opened from a file:" },
      {
        kind: "list",
        items: [
          "**Trade log**: feeds the calibration section and the robust sizing curve.",
          "**Realized moves**: can replace the move distribution in the effective-loss-rate section (pick Imported moves among its inputs).",
        ],
      },
      { kind: "h", text: "What is saved, and where" },
      { kind: "p", text: "Everything you change is saved in this browser as you go (localStorage, key `tranche-replay:v1`): parameter values, parameter settings, chart edits and active stories with what they moved, presets and links, your data, the default backend and the settings. Values a sweep passes through are not saved; a reload during a sweep puts the parameter back where it was before." },
      { kind: "p", text: "Import / export (top bar, or Settings → Import and export) saves or copies the whole state as one JSON file and loads one back. A loaded file is checked and anything invalid is dropped; a file from before parameter settings existed keeps the current ones." },
      { kind: "h", text: "Resets" },
      {
        kind: "table",
        head: ["Reset", "What it clears"],
        rows: [
          ["Reset every parameter (Settings → Reset)", "parameter values only"],
          ["Reset chart edits", "every chart's edits and stories; stories put their parameters back"],
          ["Reset / Reset all (Settings → Parameters)", "one parameter's settings, or every parameter's"],
          ["Forget everything saved", "all of the above, presets and data included"],
          ["`#reset` in the address", "the saved state, when the app opens"],
        ],
      },
    ],
  },
  {
    id: "keys",
    title: "Keys",
    body: [
      { kind: "p", text: `Every shortcut in one table. ${MAC ? "On a Mac the app shows ⌘ where other systems have Ctrl." : `On a Mac ⌘ takes the place of ${CTRL}.`}` },
      { kind: "keys", rows: KEYS },
    ],
  },
  {
    id: "builders",
    title: "For builders",
    body: [
      { kind: "p", text: "The code is two layers: `src/kit` is generic (charts, the parameter schema and the synthetic input, parameter settings, the replayer, the store, the build worker, the page frames, this page's frame) and `src/app` is this explainer. `src/kit/README.md` lists the kit's areas, where an app plugs in, and a checklist for a second explainer; `ARCHITECTURE.md` the layers inside `src/app` (model, data, scenarios, view), the event bus and how to add a parameter, a chart, a view, a page or an event. This page's text is `src/app/data/copy/guide.ts`, drawn by the kit's `GuideFrame`." },
    ],
  },
  {
    id: "directives",
    title: "Directives",
    body: [
      // The document introduces itself; this sentence shows only when it cannot be read.
      { kind: "markdown", src: "directives.md", idPrefix: "g-directives-", failure: "This section shows the project's directives (the owner's requests, the design they imply, the decisions taken, the open questions). Its source is docs/DIRECTIVES.md in the repository, which the build serves as directives.md next to index.html." },
    ],
  },
];
