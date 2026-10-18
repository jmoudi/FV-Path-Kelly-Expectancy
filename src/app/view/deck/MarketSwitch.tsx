import { Segmented } from "@kit/ui/deck";
import type { Market } from "@app/model/params";
import { useStore } from "@app/store";
import { MARKET_LINE } from "@app/data/copy/market";
import { marketSwitch } from "@app/scenarios/controls";

/**
 * The market switch: Fair market (q = b/(1+b)) · Discussion case (55% clean Coin
 * season at the deck's n) · Custom (q typed). The selected state is where q sits now,
 * so typing q by hand reads as Custom. Choosing Custom focuses the loss-rate box
 * (`customFocusId`). Reusable wherever the market state is shown (the Desk's block 4).
 * The options, the selection and the patches come from the view-model (marketSwitch).
 */
export function MarketSwitch({ customFocusId }: { customFocusId?: string }) {
  const params = useStore((s) => s.params);
  const setParams = useStore((s) => s.setParams);
  const view = marketSwitch(params);
  const onChange = (v: Market) => {
    const patch = view.patchFor(v);
    if (patch) setParams(patch);
    if (v === "custom" && customFocusId) document.getElementById(customFocusId)?.focus();
  };
  // The premium sentence comes from the view-model (marketState().line), the one source the Desk and the drawer share.
  return (
    <div className="dkb-market">
      <Segmented options={view.options} value={view.selected} onChange={onChange} ariaLabel="Market" />
      <p className="dkb-market-line">{MARKET_LINE}</p>
      <p className="dkb-market-state">{view.state}</p>
    </div>
  );
}
