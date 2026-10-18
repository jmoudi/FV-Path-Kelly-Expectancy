What the owner asked for while specifying Tranche Replay, message by message; what those words imply; the design decisions taken, each with its reason and the alternative not taken; and the questions still open. About ten minutes to read.

The source is `docs/DIRECTIVES.md`. The build serves a copy as `directives.md` beside the page, and [Guide → Directives](#guide/directives) reads it at run time, so an edit shows on the next page load.

## 1. The owner's directives

The owner's words, quoted exactly (… marks a cut; spelling as written), then → where each landed: a page, a control, a file, or *open*. Numbers run in the order the messages were sent. The finance discussion pasted into the first message is the content the app charts, not a directive.

### Original post

1. “paint graphs/charts (use some convenient existing lib) that explain all the concepts that we discuss.”\
   → Eight sections on [Explain](#explain) and 19 views, drawn by ECharts, Plotly or Vega-Lite.
2. “strict detaching of the data vs view model, so its swappable.”\
   → `src/app/model` → scenario builders in `src/app/scenarios` that return chart specs → backends in `src/kit/charts`.
3. “i cant quite intuit what `mean` here would mean”\
   → Section 02; the views [What the mean means](#view/replay-quantiles) and [What a pool of tranches would earn](#view/pooling).
4. “every scenario warrants more than one type of chart or table.”\
   → Primary and secondary charts, ⊞ on every chart, and Table · Derivations · Quoted vs recomputed.
5. “not every input is equally important to be configurable to the same degree.”\
   → Tiers: the deck's row, the drawer, a section's own inputs, Settings → Engine.
6. “Importable, exportable data.”\
   → Data (a trade log, realized moves); Import / export of the whole state as JSON.
7. “clear collapsing into popups or expanders of less needed information. Not overly dense.”\
   → The drawer, ⚙ popovers, one footer panel per section, “+N more figures”.
8. “There must be a clear, a very clear differential in font sizes.”\
   → Nine type tokens from 36 px to 11.5 px, nothing else: `src/kit/ui/theme.css`.
9. “Only use one dark theme, graphite, with more than one accent color.”\
   → Graphite; policy, status and accent colours, each with one job.
10. “is an advanced trader overwhelmed when he sees the app? … because of all the different toolings”\
    → Chart tools on hover only, a two-row deck, the Desk first, quick settings apart.
11. “if the user's eyes are they guided to the important stuff … Great low friction UX.”\
    → One hero number per section; ledes that ask the question; popovers that open at once.
12. “an intermediate in-gui-authoring layer for how we can define the charts … a switchboard system between well-known "backends"”\
    → The ⚙ chart editor, the switchboard in `src/kit/charts/registry.ts`, and `npm run parity`.
13. “That they tell some user stories.”\
    → Story chips: a trader's question, a one-line answer, “moves deck” with undo.
14. “after you are done, … review the app, and improve upon that.”\
    → Process: a structural review, later an aesthetic one.
15. “Ask me 8 questions across 4 fronts …”\
    → Process; what is still undecided is in part 4.

### Feedback 1 (“5/10”)

16. “You framed it too much as a document rather than as an embryonic app or MVP.”\
    → The [Desk](#desk) is the landing page.
17. “You editorialize too much.”\
    → Ledes ask, subtitles state the encoding, notes carry the derivations.
18. “The first heading is not very useful … the second heading is just crud.”\
    → A small eyebrow (“Section 07”) over a plain title; no slogan.
19. “a small, specially highlighted box inside a prose section … attached to the right side.”\
    → The claim: a 260 px aside inside the prose column.
20. “The single-page guided tour is NOT deprecated.”\
    → Explain; `#tour` still opens it.
21. “every single [responsibility] needs to be accessible in its own separate view.”\
    → 19 views at `#view/<id>`; Views ▾, ↗ on each chart, `[` and `]`.
22. “If I open the settings of a chart, it mutates the underlying geometry … Don't do that.”\
    → ⚙ floats beside the chart; the plot box keeps its height.
23. “The pop-up should open instantly, without animation. Moving the cursor out and away by some physical distance auto-closes it.”\
    → No animation; it closes 140 px away, on Esc or on a click outside.
24. “Stuff like how we define … clean season and so on should live in a view that is anchored … by default it is a small collapsed view”\
    → The sticky two-row deck; Full deck ▾ opens the drawer with the definitions.
25. “you need physical distance between them to clearly structure them.”\
    → Deck groups 40 px apart with a hairline; drawer sections the same.
26. “the settings page can be expanded to a full page, or be shown in the reduced page”\
    → Quick settings behind ⚙, and the [Settings](#settings) page.
27. “a definer for automatic inspection of values. … I can save that and replay it.”\
    → The replayer: saved sweep presets, `src/kit/sweeps`.
28. “after reaching the max value, it loops back to the start … it inverts and goes backwards.”\
    → Preset kinds loop and ping-pong.
29. “I can also restrict it to a specific sub-range if I want.”\
    → Ranges: a share, two values, ± around the value, between named anchors.
30. “This can apply to some sliders but not others”\
    → `sweepable` in the schema; the strip says “not swept”.
31. “there must also be hotkeys so I can quickly stop and resume it.”\
    → Ctrl+Enter run or pause, Ctrl+. stop, Ctrl+Shift+Enter every run.
32. “I can link one such preset to one slider and save that state overall”\
    → One linked preset per parameter, saved and exported.
33. “Via hotkeys, I can also quick-switch between different presets.”\
    → Ctrl+[ and Ctrl+] on the active (focused) parameter.
34. “A short preview, in a non-obstructing, discreet location”\
    → The deck's strip, in a slot whose width never changes.
35. “three different spots where the input value will be, switching between them at a user-defined interval.”\
    → The spots kind, and the preset “Three spots”.
36. “The step size is not the minimum integer chunk … it's arbitrary, as is the timing”\
    → Steps in the parameter's units, intervals in ms.
37. “linking two or more such presets together, so they can operate on more than one slider.”\
    → *Open* (part 4).
38. “whenever I said "slider" here, I actually just mean the input facility.”\
    → Presets act on values; the word became “parameter”.
39. “Create a new synthetic input facility … by default is enabled in MOST places”\
    → `src/kit/inputs/SyntheticNumber.tsx`: box, wheel, arrows, drag track.
40. “felt physical distance, I need to drag from the middle to an extreme, REGARDLESS of how wide it actually is in the GUI”\
    → Drag in units per 100 px (q: 0.25 pp), Shift for a tenth.
41. “Just because I talked about an issue here doesnt mean I want that you ONLY fix these issues”\
    → The Desk, the vocabulary, chart parity and five missing concepts.

### Feedback 2

42. “I did NOT just flag 5 things to improve.”\
    → Every sentence of the feedback became a requirement, numbered or not.
43. “think like a fellow smart engineer.”\
    → Reviews hunt structural failures, not only the listed ones.

### Feedback 3

44. “There are not just defects. there are full blown inadequacies.”\
    → A rebuild from one design spec, not patches.
45. “not the card soup but clearly archicteted sections”\
    → Borderless sections; borders only where you type or on what floats.
46. “the reduced view has cryptical labels; the reduced can be two rows thick.”\
    → Two rows with word labels (“Loss rate per name q”).
47. “Tell your adversarial … to be way more critical. It also needs to read my original post.”\
    → Process: the next review read it and scored 4.5/10.

### Message 4

48. “Status? And continue if stalled.”\
    → Process.
49. “reuse conceptually with some rewrites, but basically mostly the same.”\
    → `src/kit` beside `src/app`; the kit never imports the app.
50. “Keep a smart Lego approach.”\
    → Kit areas with their own READMEs; a second-explainer checklist in `src/kit/README.md`.
51. “You are a bit slow.”\
    → Process: the work runs in parallel stages.

### Message 5

52. “dont mix up parameters (my new word for inputs/sliders here) with settings about the parameters.”\
    → Parameter, parameter settings, replayer: three words for three things.
53. “what if I want to set it such that it increments in 0.5% steps instead of 1?”\
    → Six settings per parameter: ⚙ in the drawer, Settings → Parameters.
54. “if a replayer-setting specifies that the step is 0.25% … the replayer uses its own value”\
    → The replayer never reads parameter settings; a test holds it to that.
55. “implement documentation about how the GUI works in a convenient locations.”\
    → The [Guide](#guide), written in `src/app/copy/guide.ts`.
56. “I mean some internal small docs view.”\
    → A page in the top bar, not tooltips.
57. “No math/finance concepts in that except where very pertinent to app concerns.”\
    → The Guide names things; Explain says what they mean.
58. “tell the next UI reviewer to be more critical about aesthetics. some choices are eyesores, like the purple for every label etc.”\
    → An aesthetics review; figures in ink, violet only on marks and dots, a cream accent.

### Message 6

59. “you may at any place of the app, not just the docs view, include hyperlinks.”\
    → One link component, `src/kit/ui/Link.tsx`.
60. “on a long page to another spot on the long page "scroll here", between views "switch to that view (ofc without page reload)", and so on. regular modern principles.”\
    → In-page links scroll; route links change the address and never reload.
61. “But underline such links.”\
    → Always underlined; chips and buttons are not links.
62. “the docs can be improved. It is currently monochrome”\
    → The Guide's colour: accent numbers, key caps, terms, callouts.
63. “use good taste about what elements may be colored”\
    → Colour only where it has a job; numbers stay ink.
64. “no need for the sliders or the graphs or its horizontal y-axis hint lines to be all similar grey colors.”\
    → An accent slider fill; guide lines apart from the grid.
65. “check if model (contracts, classes, and so on), data (actual instances of the models), and view () are cleanly separated.”\
    → `src/app/model`, `src/app/data`, `src/app/view`; `ARCHITECTURE.md`.
66. “same about events. global typed event bus.”\
    → `src/kit/events/bus.ts`; toasts from its `notice` event.
67. “the app should allow for even more rapid iteration.”\
    → `ARCHITECTURE.md`: adding a parameter, a chart, a view, a page.
68. “a very valuable showroom for future apps.”\
    → Part 2; the scope stays one explainer.
69. “we lock/fix one parameter (loudly).”\
    → A padlock on every field; a refusal shakes it and says why.
70. “this limits the allwoed movements of the other parameters.”\
    → A constraints table, `src/app/data/constraints.ts`.
71. “what were my actual directives … plus implied design … plus what you decided would be good app design”\
    → This file.
72. “expose this markdown (ie reading it dynamically once per page refresh) within the docs.”\
    → Guide → Directives, read once per page load, with Reload.

## 2. The implied design

What the words imply without saying it; every later change should pass these.

- **A trader's vocabulary, no edge language.** “Think like a finance expert”, read with the owner's standing thesis (no informational or execution edge; only sizing bets by their probability distributions in an efficient market): views are named by the trader's question, policies by what they do, and a rate below fair is a premium paid for tail insurance. The word appears only in “not an information edge”.
- **An app, not a document.** The first screen answers “given my book, what happens?”; reading is one step away.
- **The replayer is a first-class tool**, apart from editing by hand and from parameter settings, with its own units, timing, hotkeys and saved state.
- **Inputs have physical feel.** Distance is pixels, not fractions of a track; nothing moves under the pointer.
- **The tour stays beside the views.** Read in order on Explain, or open one question as its own view.
- **Architecture over boxes.** Groups come from distance, type and hairlines; borders only for what you type into or what floats.
- **Importance is tiered.** Inputs, figures and notes each have a tier and a place.
- **Colour is meaning.** “more than one accent color”, “ENHANCE clarity” and “the purple for every label”: one job per colour.
- **The kit is for future apps.** A second explainer keeps the kit and rewrites the domain.
- **The app is a showroom.** The switchboard, the replayer, the synthetic input, parameter settings, locks, the bus and the Guide are patterns shown on real maths; the scope stays one explainer.

## 3. The decisions taken

### Words and type

- **Vocabulary and policy names.** Coin, Spread, Spread + reserve, named in one file, `src/app/model/policies.ts`; Expected value per season, Premium over fair per event, Log growth of surviving paths beside P(ruin), Median growth per season; one number formatter.\
  *Why:* A/B/C meant nothing; “edge per season” contradicted the thesis. *Not taken:* lettered policies with a legend.
- **The type scale.** Nine tokens: 36 · 30 · 20 · 17 · 15 · 13 · 11.5, a hero figure at 28, other figures at 20; weights 400/500/600.\
  *Why:* nearly all text sat between 10.5 and 14 px. *Not taken:* sizes per component.
- **Surfaces.** Borders only on inputs, popovers, the drawer and dialogs; no filled tiles.\
  *Why:* the tour's main column had 114 bordered boxes. *Not taken:* quieter cards.

### Pages

- **Routes, and the Desk as landing.** `#desk` (and the empty address), `#explain`, `#view/<id>`, `#settings`, `#guide`. The Desk compares the three policies over one and N seasons, beside the sizing heatmap, a one-line record verdict and the market switch.\
  *Why:* the old landing page was a 17-screen tour. *Not taken:* the tour first.
- **The section skeleton.** Eyebrow, title, the question with the claim beside it, two or three numbers, the section's inputs open, the primary chart, secondary charts in two columns, one footer panel of fixed height.\
  *Why:* one question and one number catch the eye first. *Not taken:* an expander around every block.
- **The deck: two rows and a drawer.** Eight word-labelled fields in three groups; your policy's line, the Coin muted, the legend and the strip; a 460 px drawer on the right with the charts live beside it; a bottom sheet on a phone.\
  *Why:* the old expanded deck covered 852 of 900 px. *Not taken:* a panel expanding over the page.
- **Settings in two sizes, and keys.** Quick settings hold four things; the page adds presets, engine boxes (no sliders on seeds), parameter settings, data, state and hotkeys. `[` and `]` step between views; Ctrl+Z undoes parameters outside text boxes.\
  *Why:* the old dialog was the page squeezed; Alt+arrows took the browser's back and forward. *Not taken:* one view with collapsible groups.

### Finance framing

- **The market switch and fair-pricing copy.** Fair market (q = b/(1+b)), Discussion case (a 55% clean season), Custom; beside it “an assumed risk premium for selling tail insurance, not an information edge”; at zero premium the growth-optimal risk is 0. The wing's default is solved so its effective rate equals the deck's q.\
  *Why:* the old defaults said the chain overpriced the tail 2.6×. *Not taken:* opening on Fair market (part 4).
- **The discussion, checked.** Every quoted figure beside the app's, with “agrees?” and a reason; the five missing concepts drawn (refilling from NAV, the railroad, the calendar, wing width, the 60% system).\
  *Why:* a disagreement teaches more when it says so. *Not taken:* listing only the matches.

### Parameters and the replayer

- **A frame-locked replayer with anchors.** The next value only after the last one has drawn, and only what is on screen rebuilds; presets in the parameter's units between named anchors (q: optimistic, deck, break-even; risk: robust, Kelly, deck); a run starts from the current value, and ↺, Ctrl+Z or a reload restore the value from before.\
  *Why:* 230–370 ms builds against a 200 ms tick froze the charts. *Not taken:* a fixed timer; steps as a share of the range.
- **The synthetic input's feel.** A click focuses, double-click resets, drag is relative per 100 px, the wheel waits for focus or a 400 ms rest, the run marker has a reserved slot.\
  *Why:* a click on a 52 px track set q to 5.4%, and the wheel hijacked scrolling. *Not taken:* the native range input; absolute drag.
- **Parameter settings apart from values.** Six settings, defaults from the schema, saved and exported; the wheel, arrows and drag land on the step's grid; a typed value is clamped, never rounded.\
  *Why:* Message 5, in so many words. *Not taken:* one step shared with the replayer.
- **Locks and constraints.** A lock refuses every route of change with a notice and one 200 ms shake; a constraints table re-solves or refuses (p = (1 − q)^n, fair ⇒ q = b/(1+b), the calendar's shares, running sweeps) in one `applyConstraints` step.\
  *Why:* “loudly”, and the maths binds parameters together. *Not taken:* silent greying; a general solver.

### Charts

- **Parity and the switchboard.** One spec, three backends and a table; `npm run parity` reads back what each backend drew; labels are de-collided before any backend; display toggles live in ⚙; stories are questions, one deck-mover at a time, saved.\
  *Why:* two backends drew the first chart wrong, and 25 of 39 chips were toggles. *Not taken:* one library; a spec per backend.

### Code

- **Kit and app, and three app layers.** The kit never imports the app (one grep proves it); inside the app, model ← data ← scenarios ← view.\
  *Why:* reuse “conceptually with some rewrites”. *Not taken:* a package; reuse at the code level.
- **A typed event bus.** `createBus<Events>()` with emit, on, once, off, a React hook and a dev log; notices show as toasts.\
  *Why:* locks, toasts and logging cut across components. *Not taken:* DOM events; store subscriptions everywhere.

### Colour, links and docs

- **Colour roles, with a cream accent.** Ink for figures and text; the accent (#e8e1a3) only where to act; policy colours on marks, swatches, policy lines and 8 px dots; red and green for status; a grey ramp for ordered scenarios.\
  *Why:* violet coloured every “yours” figure, and cyan did three jobs. *Not taken:* cyan as the accent (it is Spread's).
- **Hyperlinks.** One `Link`, always underlined; route links change the address, in-page links scroll below the sticky bars and highlight; ids on every section, chart and heading.\
  *Why:* Message 6. *Not taken:* links in the Guide only.
- **The Guide.** `GuideFrame` over typed blocks; its key table comes from the hotkey constants the app binds.\
  *Why:* the keys cannot drift from the code. *Not taken:* tooltips.
- **This document.** One source, copied to `public/directives.md` at every build and dev start, fetched once per page load, never bundled.\
  *Why:* “reading it dynamically once per page refresh”. *Not taken:* bundling the text.

## 4. Open questions for the owner

1. **The accent hue.** Keep the cream (#e8e1a3), or another hue that is neither a policy nor a status colour?
2. **How loud a lock is.** A padlock in the accent, a hatched track, a notice and one shake per refusal: too much, too little? Should the replayer stop quietly instead?
3. **The tour's name.** Keep Explain, or call it Tour?
4. **The default market.** The app opens on the discussion's case, an assumed premium. Open on Fair market instead?
5. **The second explainer.** Which first on the kit: a credit-spread replay as sketched in `src/kit/README.md`, a carry trade, a bond ladder?
6. **The IBKR trade-log import.** Data takes pasted numbers. Read executions from the IBKR account instead, and which fields count as a full loss?
7. **Presets over several parameters.** Two parameters in lockstep, or one swept inside the other as a grid?
8. **Your policy.** The Desk marks Spread + reserve as yours. Pick it yourself, or add a Custom column?
