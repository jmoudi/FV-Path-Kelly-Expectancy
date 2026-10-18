import { LinkedValue } from "@kit/ui/deck";
import { lossRateFromPClean, pCleanFromLossRate } from "@app/model/binary";
import { POLICY_META } from "@app/model/policies";
import { useStore } from "@app/store";
import { Help } from "../../ui/Help";
import { pct } from "@kit/charts/numbers";

const COIN = POLICY_META.coin.name;

/** P(clean season) of the Coin at the deck's q and n, and the back-solve that sets q from a typed value. */
function useCleanSeason() {
  const q = useStore((s) => s.params.lossRate);
  const n = useStore((s) => s.params.nights);
  const setParam = useStore((s) => s.setParam);
  const p = pCleanFromLossRate(q, n);
  const commit = (text: string): boolean => {
    const v = Number(text.replace(",", ".").replace(/[%\s]/g, "")) / 100;
    if (!Number.isFinite(v) || v <= 0 || v >= 1) return false;
    setParam("lossRate", lossRateFromPClean(v, n));
    return true;
  };
  const help = `Probability that one all-in name survives all ${n} nights, (1 − q)^n. Type a value and the loss rate per name is solved from it.`;
  return { p, commit, help, editText: (p * 100).toFixed(1) };
}

/** Under Loss rate in the reduced deck: "= 55% clean season (Coin)"; a click turns the value into a box. */
export function CleanSeasonText() {
  const c = useCleanSeason();
  return (
    <LinkedValue
      mode="text"
      id="deck-pclean"
      prefix="="
      value={pct(c.p)}
      suffix={`clean season (${COIN})`}
      editText={c.editText}
      unit="%"
      onCommit={c.commit}
      color="var(--a)"
      title={c.help}
      ariaLabel={`Clean season (${COIN}); typing it solves the loss rate`}
    />
  );
}

/** The same figure as a full field in the drawer, after Loss rate. */
export function CleanSeasonField({ id }: { id: string }) {
  const c = useCleanSeason();
  return (
    <div className="nf linked">
      <div className="nf-label">
        <span className="nf-label-text">
          <span>Clean season ({COIN})</span>
          <span className="sym">p</span>
        </span>
        <Help text={c.help} />
      </div>
      <div className="nf-row">
        <LinkedValue mode="box" id={id} value={pct(c.p)} editText={c.editText} unit="%" onCommit={c.commit} ariaLabel={`Clean season (${COIN}); typing it solves the loss rate`} boxClassName="nf-box" />
      </div>
    </div>
  );
}
