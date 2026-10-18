import { useStore } from "../../state/store";
import { SweepStrip } from "../../ui/SweepStrip";

/**
 * The deck's reserved strip slot: the sweep strip of the active input, alone. The
 * strip names the input, shows its hint when none is active, and follows a running
 * sweep; the slot's width is the strip's (--sweep-strip-w), so nothing beside it moves.
 */
export function DeckStrip() {
  const active = useStore((s) => s.activeInput);
  return <SweepStrip inputKey={active} compact />;
}
