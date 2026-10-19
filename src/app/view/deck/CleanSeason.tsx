import type { ReactNode } from "react";
import { LinkedValue } from "@kit/ui/deck";
import { useStore } from "@app/store";
import { Help } from "@kit/ui/Help";
import { LockToggle, useRefusalShake } from "@kit/inputs/locks";
import { cleanSeasonLink } from "@app/scenarios/controls";
import { P_CLEAN } from "@app/data/constraints";

/**
 * P(clean season) of the Coin at the deck's q and n, and the back-solve that sets q from
 * a typed value (the view-model decides both). The typed value goes through the locks as
 * a value solved from the linked key: locked, or with q held by another lock, it is
 * refused (a notice says why) and the line shakes.
 */
function useCleanSeason() {
  const lossRate = useStore((s) => s.params.lossRate);
  const nights = useStore((s) => s.params.nights);
  const setParams = useStore((s) => s.setParams);
  const locked = useStore((s) => !!s.locks[P_CLEAN]);
  const link = cleanSeasonLink({ lossRate, nights });
  const commit = (text: string): boolean => {
    const patch = link.solve(text);
    if (!patch) return false;
    return setParams(patch, { source: "link", via: P_CLEAN }).refused.length === 0;
  };
  /** A click on the value while p is locked: refused out loud, nothing to edit. */
  const attempt = () => setParams({ lossRate }, { source: "link", via: P_CLEAN });
  return { ...link, commit, attempt, locked };
}

/** The line shakes for a refusal of its own key, and of q when the change came from it. */
const shakesFor = (e: { key: string; source: string }) => e.key === P_CLEAN || (e.source === "link" && e.key === "lossRate");

/** While p is locked the value is text in the accent; a click says it is locked. */
function LockedValue({ value, suffix, onAttempt, title }: { value: string; suffix: ReactNode; onAttempt: () => void; title: string }) {
  return (
    <span className="lv">
      <span className="lv-prefix">=</span>
      <button type="button" className="lv-value" onClick={onAttempt} title={title} aria-label={`${title}: ${value}`}>
        {value}
      </button>
      <span className="lv-suffix">{suffix}</span>
    </span>
  );
}

const LOCKED_TITLE = "Clean season (Coin) is locked: unlock it to type a value";

/** Under Loss rate in the reduced deck: "= 55% clean season (Coin)"; a click turns the value into a box. */
export function CleanSeasonText() {
  const c = useCleanSeason();
  const ref = useRefusalShake<HTMLSpanElement>(shakesFor);
  const suffix = `clean season (${c.coin})`;
  return (
    <span ref={ref} className={`k-lock-host${c.locked ? " locked" : ""}`}>
      {c.locked ? (
        <LockedValue value={c.value} suffix={suffix} onAttempt={c.attempt} title={LOCKED_TITLE} />
      ) : (
        <LinkedValue mode="text" id="deck-pclean" prefix="=" value={c.value} suffix={suffix} editText={c.editText} unit="%" onCommit={c.commit} title={c.help} ariaLabel={c.ariaLabel} />
      )}
      <LockToggle k={P_CLEAN} onlyWhenLocked />
    </span>
  );
}

/**
 * The same figure in the drawer, right under Loss rate: the line the reduced deck shows
 * ("= 55% clean season (Coin) p"), with its help and its padlock. A click turns the
 * value into a box. It has no slider of its own, so it reads as part of q's field, not
 * as a field.
 */
export function CleanSeasonField({ id }: { id: string }) {
  const c = useCleanSeason();
  const ref = useRefusalShake<HTMLDivElement>(shakesFor);
  const suffix = (
    <>
      clean season ({c.coin}) <span className="sym">p</span>
    </>
  );
  return (
    <div ref={ref} className={`dkb-linked k-lock-host${c.locked ? " locked" : ""}`}>
      {c.locked ? (
        <LockedValue value={c.value} suffix={suffix} onAttempt={c.attempt} title={LOCKED_TITLE} />
      ) : (
        <LinkedValue mode="text" id={id} prefix="=" value={c.value} suffix={suffix} editText={c.editText} unit="%" onCommit={c.commit} title={c.help} ariaLabel={c.ariaLabel} />
      )}
      <Help text={c.help} />
      <LockToggle k={P_CLEAN} />
    </div>
  );
}
