import { useEffect, useState } from "react";
import { lossRateFromPClean } from "../model/binary";
import { PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { pct, pct1, signedPct1, smallPct, x2, type DeckView } from "../viewmodel/derived";
import { Help } from "./Help";
import { ParamInput } from "./ParamInput";
import { KpiTile } from "./Section";

/** Editing P(clean season) back-solves the per-name loss rate. */
function LinkedPClean({ pClean }: { pClean: number }) {
  const nights = useStore((s) => s.params.nights);
  const setParam = useStore((s) => s.setParam);
  const [text, setText] = useState((pClean * 100).toFixed(1));
  useEffect(() => setText((pClean * 100).toFixed(1)), [pClean]);
  return (
    <div className="param-linked">
      <span>P(clean season)</span>
      <input
        id="param-pclean"
        className="param-num"
        type="text"
        inputMode="decimal"
        value={`${text}%`}
        onChange={(e) => setText(e.target.value.replace(/%/g, ""))}
        onBlur={() => {
          if (text === (pClean * 100).toFixed(1)) return;
          const v = Number(text) / 100;
          if (Number.isFinite(v) && v > 0 && v < 1) setParam("lossRate", lossRateFromPClean(v, nights));
          else setText((pClean * 100).toFixed(1));
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label="Probability of a clean season, back-solves the loss rate"
      />
      <Help text="Typing a clean-season probability here sets the loss rate so that (1 − q)^n equals it." />
    </div>
  );
}

export function ControlDeck({ deck, pending }: { deck: DeckView | null; pending: boolean }) {
  const params = useStore((s) => s.params);
  const primary = PARAM_DEFS.filter((d) => d.tier === "primary");
  const pClean = deck?.pClean ?? Math.pow(1 - params.lossRate, params.nights);
  return (
    <div className="deck" id="deck">
      <div className="deck-head">
        <h1>The tranche</h1>
        <p>Six inputs drive every section. Everything else is tuned where it matters, under each section.</p>
      </div>
      <div className="deck-grid">
        {primary.map((d) => (
          <div key={d.key} style={{ display: "grid", gap: 4 }}>
            <ParamInput k={d.key} />
            {d.key === "lossRate" && <LinkedPClean pClean={pClean} />}
          </div>
        ))}
      </div>
      <div className="kpis deck-kpis" style={{ opacity: pending ? 0.7 : 1 }}>
        {deck ? (
          <>
            <KpiTile k={{ label: "Clean season", value: pct(deck.pClean), sub: "1 name, whole tranche", color: "a", help: "Probability that a single all-in name survives the whole season. The one number the coin reduces to." }} />
            <KpiTile k={{ label: "Edge per season", value: signedPct1(deck.meanSeason - 1), sub: `mean ${x2(deck.meanSeason)} · ≈ 2p − 1`, help: "Mean season end minus one. The same for the coin and for the diversified tranche." }} />
            <KpiTile k={{ label: "Median, diversified", value: x2(deck.seasonB.median), sub: `${params.names} name${params.names === 1 ? "" : "s"}, all-in · ruin ${smallPct(deck.seasonB.pRuin)}`, color: "b", help: "Typical season end with the names split over the whole tranche. Where the free lunch is paid for." }} />
            <KpiTile k={{ label: "Robust risk per night", value: pct(deck.robust.risk), sub: `you risk ${pct(params.riskPerNight)} · Kelly ${pct1(deck.kelly)} per name`, color: "c", help: `The risk per night that maximises growth averaged over a loss rate drawn ${deck.bandLabel}. Section 8 derives it.` }} />
            <KpiTile k={{ label: "Growth per season", value: signedPct1(deck.growthC), sub: `${pct(params.riskPerNight)} at risk · ruin ${smallPct(deck.ruinC)}`, color: "c", help: "Expected log of the season end under your policy, conditional on surviving. The rate the median compounds at." }} />
            <KpiTile k={{ label: `Median after ${params.seasons} season${params.seasons === 1 ? "" : "s"}`, value: x2(deck.chainedC.median), sub: `P(below ${params.thresholdBelow.toFixed(2)}×) ${pct(deck.chainedC.pBelow)}`, color: "c", help: "Where the typical path of your policy stands after the seasons chained in the deck." }} />
          </>
        ) : (
          <div className="caption">Computing…</div>
        )}
      </div>
    </div>
  );
}
