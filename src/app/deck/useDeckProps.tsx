/**
 * The app's deck provider: turns the parameter schema and the view-model's DeckView
 * into the kit frame's props. The kit lays out; this file decides what goes where.
 */
import { useMemo } from "react";
import type { DeckProps, DrawerSection, InputGroup } from "@kit/ui/deck";
import { PARAM_DEFS } from "@app/params/schema";
import type { Params } from "@app/params/params";
import { useStore } from "@app/store";
import { Help } from "@kit/ui/Help";
import { ParamInput } from "@kit/inputs/ParamInput";
import type { DeckView } from "./deckView";
import { CleanSeasonField, CleanSeasonText } from "./CleanSeason";
import { DeckStrip } from "./DeckStrip";
import { deckLayout } from "./layout";
import { MarketSwitch } from "./MarketSwitch";
import { deckDefinitions, deckFigureRows, deckLegend, deckStatus } from "./status";

/** The drawer's copy of an input gets its own id; the reduced row keeps `param-<key>`. */
export const drawerFieldId = (k: keyof Params | "pClean") => `dk-param-${k}`;

export type DeckContent = Omit<DeckProps, "expanded" | "onExpandedChange" | "hidden" | "pending">;

export function useDeckProps(deck: DeckView | null): DeckContent {
  const params = useStore((s) => s.params);
  const active = useStore((s) => s.activeInput);
  // The strip follows a running or paused sweep even when no input is active.
  const swept = useStore((s) => Object.keys(s.runs).length > 0);
  const layout = useMemo(() => deckLayout(), []);

  const groups: InputGroup[] = useMemo(
    () =>
      layout.row.map((g) => ({
        id: g.group,
        caption: g.caption,
        fields: g.keys.map((k) => ({
          id: k,
          phone: layout.phone.includes(k),
          node: <ParamInput k={k} bare />,
          below: k === "lossRate" ? <CleanSeasonText /> : undefined,
        })),
      })),
    [layout],
  );

  const status = deckStatus(deck, params);
  const rows = deckFigureRows(deck);

  const drawer: DrawerSection[] = [
    ...layout.drawer.map(
      (g): DrawerSection => ({
        id: g.group,
        kind: "fields",
        title: g.title,
        blurb: g.blurb,
        fields: g.keys.flatMap((k) => {
          const field = { id: k, node: <ParamInput k={k} id={drawerFieldId(k)} withSettings /> };
          return k === "lossRate" ? [field, { id: "pClean", node: <CleanSeasonField id={drawerFieldId("pClean")} /> }] : [field];
        }),
        note:
          g.group === "band"
            ? `Robust sizing averages growth over loss rates ${deck?.bandLabel ?? "…"}.${deck && deck.recordEvents > 0 ? "" : " Import a trade log (Data) to use its posterior instead."}`
            : undefined,
      }),
    ),
    { id: "market", kind: "custom", title: "Market", blurb: "Which pricing the deck's loss rate assumes.", node: <MarketSwitch customFocusId={drawerFieldId("lossRate")} /> },
    {
      id: "figures",
      kind: "figures",
      title: "Figures",
      rows: rows.map(({ helpText, ...r }) => ({ ...r, help: <Help text={helpText} /> })),
      note: rows.length ? undefined : "Computing…",
    },
    { id: "definitions", kind: "definitions", title: "Definitions", items: deckDefinitions(deck, PARAM_DEFS) },
  ];

  return {
    groups,
    lead: status.lead,
    status: status.status,
    note: status.note,
    legend: deckLegend,
    strip: <DeckStrip />,
    stripIdle: !active && !swept,
    drawer,
    drawerTop: <DeckStrip />,
  };
}
