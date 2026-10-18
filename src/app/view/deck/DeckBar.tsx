import { useCallback, useEffect, useState } from "react";
import { useDeckProps } from "./useDeckProps";
import { Deck } from "@kit/ui/deck";
import { useStore } from "@app/store";
import type { DeckView } from "@app/scenarios/deck";
import "@kit/ui/deck/deck.css";

/** The deck sits on every page except Settings and the Guide (#guide, #guide/<section>). Read from the hash the way src/kit/ui/route.ts does. */
function onSettingsPage(): boolean {
  if (typeof location === "undefined") return false;
  const h = location.hash.replace(/^#/, "");
  return h === "settings" || h === "guide" || h.startsWith("guide/");
}

function useOnSettingsPage(): boolean {
  const [on, setOn] = useState(onSettingsPage);
  useEffect(() => {
    const update = () => setOn(onSettingsPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return on;
}

/**
 * The deck, anchored under the top bar: the kit's deck frame (src/kit/ui/deck) filled
 * by the app's provider (src/app/deck), with the expanded state kept in the store.
 */
export function DeckBar({ deck, pending }: { deck: DeckView | null; pending: boolean }) {
  const content = useDeckProps(deck);
  const expanded = useStore((s) => s.ui.deckExpanded);
  const setUi = useStore((s) => s.setUi);
  const hidden = useOnSettingsPage();
  const onExpandedChange = useCallback((v: boolean) => setUi({ deckExpanded: v }), [setUi]);
  return <Deck {...content} expanded={expanded} onExpandedChange={onExpandedChange} hidden={hidden} pending={pending} />;
}
