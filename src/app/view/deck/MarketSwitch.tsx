import { Segmented } from "@kit/ui/deck";
import { LockToggle, useRefusalShake } from "@kit/inputs/locks";
import type { Market } from "@app/model/params";
import { useStore } from "@app/store";
import { MARKET_LINE } from "@app/data/copy/market";
import { marketSwitch } from "@app/scenarios/controls";
import { useAppBus } from "@app/view/bus";

/**
 * The market switch: Fair market (q = b/(1+b)) · Discussion case (55% clean Coin
 * season at the deck's n) · Custom (q typed). The selected state is where q sits now,
 * so typing q by hand reads as Custom. Choosing Custom focuses the loss-rate box
 * (`customFocusId`). Reusable wherever the market state is shown (the Desk's block 4).
 * The options, the selection and the patches come from the view-model (marketSwitch).
 *
 * It obeys the locks: a choice that would move a locked parameter (q, or the market
 * itself) is refused as a whole, a notice says why and the switch shakes. Its padlock
 * locks the market where it is.
 */
export function MarketSwitch({ customFocusId }: { customFocusId?: string }) {
  const params = useStore((s) => s.params);
  const setParams = useStore((s) => s.setParams);
  const marketLocked = useStore((s) => !!s.locks.market);
  const bus = useAppBus();
  const view = marketSwitch(params);
  const ref = useRefusalShake<HTMLDivElement>((e) => e.source === "switch");
  const onChange = (v: Market) => {
    // The state already shown: nothing to ask for while the market is locked.
    if (marketLocked && v === view.selected) return;
    const patch = view.patchFor(v);
    if (patch) {
      const { refused } = setParams(patch, { source: "switch" });
      if (refused.length) return;
      if (v !== view.selected) bus.emit("market:switched", { from: view.selected, to: v });
    }
    if (v === "custom" && customFocusId) document.getElementById(customFocusId)?.focus();
  };
  // The premium sentence comes from the view-model (marketState().line), the one source the Desk and the drawer share.
  return (
    <div className="dkb-market">
      <div ref={ref} className={`k-lock-host dkb-market-row${marketLocked ? " locked" : ""}`}>
        <Segmented options={view.options} value={view.selected} onChange={onChange} ariaLabel="Market" />
        <LockToggle k="market" />
      </div>
      <p className="dkb-market-line">{MARKET_LINE}</p>
      <p className="dkb-market-state">{view.state}</p>
    </div>
  );
}
