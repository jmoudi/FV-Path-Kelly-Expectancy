import { LinkedValue } from "@kit/ui/deck";
import { useStore } from "@app/store";
import { Help } from "@kit/ui/Help";
import { cleanSeasonLink } from "@app/scenarios/controls";

/** P(clean season) of the Coin at the deck's q and n, and the back-solve that sets q from a typed value (the view-model decides both). */
function useCleanSeason() {
  const lossRate = useStore((s) => s.params.lossRate);
  const nights = useStore((s) => s.params.nights);
  const setParams = useStore((s) => s.setParams);
  const link = cleanSeasonLink({ lossRate, nights });
  const commit = (text: string): boolean => {
    const patch = link.solve(text);
    if (!patch) return false;
    setParams(patch);
    return true;
  };
  return { ...link, commit };
}

/** Under Loss rate in the reduced deck: "= 55% clean season (Coin)"; a click turns the value into a box. */
export function CleanSeasonText() {
  const c = useCleanSeason();
  return (
    <LinkedValue
      mode="text"
      id="deck-pclean"
      prefix="="
      value={c.value}
      suffix={`clean season (${c.coin})`}
      editText={c.editText}
      unit="%"
      onCommit={c.commit}
      title={c.help}
      ariaLabel={c.ariaLabel}
    />
  );
}

/**
 * The same figure in the drawer, right under Loss rate: the line the reduced deck shows
 * ("= 55% clean season (Coin) p"), with its help. A click turns the value into a box.
 * It has no slider of its own, so it reads as part of q's field, not as a field.
 */
export function CleanSeasonField({ id }: { id: string }) {
  const c = useCleanSeason();
  return (
    <div className="dkb-linked">
      <LinkedValue
        mode="text"
        id={id}
        prefix="="
        value={c.value}
        suffix={
          <>
            clean season ({c.coin}) <span className="sym">p</span>
          </>
        }
        editText={c.editText}
        unit="%"
        onCommit={c.commit}
        title={c.help}
        ariaLabel={c.ariaLabel}
      />
      <Help text={c.help} />
    </div>
  );
}
