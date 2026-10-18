import { useCallback } from "react";
import { useDeckProps } from "./useDeckProps";
import { Deck } from "@kit/ui/deck";
import { useStore } from "@app/store";
import type { DeckView } from "@app/scenarios/deck";
import "@kit/ui/deck/deck.css";

/**
 * The deck, anchored under the top bar: the kit's deck frame (src/kit/ui/deck) filled
 * by the app's provider (src/app/view/deck), with the expanded state kept in the store.
 * `hidden` comes from the shell's route (the deck sits on every page except Settings and
 * the Guide), so the deck keeps no hash listener of its own.
 */
export function DeckBar({ deck, pending, hidden }: { deck: DeckView | null; pending: boolean; hidden: boolean }) {
  const content = useDeckProps(deck);
  const expanded = useStore((s) => s.ui.deckExpanded);
  const setUi = useStore((s) => s.setUi);
  const onExpandedChange = useCallback((v: boolean) => setUi({ deckExpanded: v }), [setUi]);
  return <Deck {...content} expanded={expanded} onExpandedChange={onExpandedChange} hidden={hidden} pending={pending} />;
}
