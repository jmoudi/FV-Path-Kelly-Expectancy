import { PARAM_BY_KEY } from "../../model/params";
import { useStore } from "../../state/store";
import { SweepStrip } from "../../ui/SweepStrip";

/** The reserved strip slot: the active input's name and its sweep strip, or a hint. */
export function DeckStrip() {
  const active = useStore((s) => s.activeInput);
  const def = active ? PARAM_BY_KEY[active] : undefined;
  if (!active || !def) return <span className="dkb-hint">Focus an input to sweep it</span>;
  return (
    <>
      <span className="dkb-active" title="The input the sweep hotkeys act on">
        {def.shortLabel ?? def.label}
      </span>
      <SweepStrip inputKey={active} compact />
    </>
  );
}
