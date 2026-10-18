import { Segmented, type SegmentOption } from "@kit/ui/deck";
import { DISCUSSION_P_CLEAN, marketPatch, type Market } from "@app/params/params";
import { POLICY_META } from "@app/model/policies";
import { useStore } from "@app/store";
import { MARKET_LINE } from "@app/copy/market";
import { marketState } from "@app/scenarios/derived";
import { pct, pct2 } from "@kit/charts/numbers";

/**
 * The market switch: Fair market (q = b/(1+b)) · Discussion case (55% clean Coin
 * season at the deck's n) · Custom (q typed). The selected state is where q sits now,
 * so typing q by hand reads as Custom. Choosing Custom focuses the loss-rate box
 * (`customFocusId`). Reusable wherever the market state is shown (the Desk's block 4).
 */
export function MarketSwitch({ customFocusId }: { customFocusId?: string }) {
  const params = useStore((s) => s.params);
  const setParams = useStore((s) => s.setParams);
  const m = marketState(params);
  const options: SegmentOption<Market>[] = [
    { value: "fair", label: "Fair market", hint: `q = ${pct2(m.fairRate)}`, title: "q = b/(1+b): zero premium over fair, growth-optimal risk 0." },
    { value: "discussion", label: "Discussion case", hint: `q = ${pct2(m.discussionRate)}`, title: `q such that a clean ${POLICY_META.coin.name} season has probability ${pct(DISCUSSION_P_CLEAN)} over ${params.nights} nights.` },
    { value: "custom", label: "Custom", hint: m.actual === "custom" ? `q = ${pct2(params.lossRate)}` : "type q", title: "q typed by hand." },
  ];
  const onChange = (v: Market) => {
    if (v === "custom") {
      if (params.market !== "custom") setParams({ market: "custom" });
      if (customFocusId) document.getElementById(customFocusId)?.focus();
      return;
    }
    setParams(marketPatch(v, params));
  };
  // Where q sits decides, except that choosing Custom shows as Custom until another state is chosen.
  const selected: Market = m.chosen === "custom" ? "custom" : m.actual;
  // The premium sentence comes from the view-model (marketState().line), the one source the Desk and the drawer share.
  return (
    <div className="dkb-market">
      <Segmented options={options} value={selected} onChange={onChange} ariaLabel="Market" />
      <p className="dkb-market-line">{MARKET_LINE}</p>
      <p className="dkb-market-state">{m.sizingNote ? `${m.line} ${m.sizingNote}` : m.line}</p>
    </div>
  );
}
