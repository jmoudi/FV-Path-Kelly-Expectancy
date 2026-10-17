import { useEffect, useState } from "react";
import { lossRateFromPClean } from "../model/binary";
import { seasonLogGrowth } from "../model/kelly";
import { PARAM_DEFS } from "../model/params";
import { useStore } from "../state/store";
import { pct, pct1, signedPct1, smallPct, x2, type Derived } from "../viewmodel/derived";
import { Help } from "./Help";
import { ParamInput } from "./ParamInput";

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

export function ControlDeck({ derived }: { derived: Derived }) {
  const params = useStore((s) => s.params);
  const primary = PARAM_DEFS.filter((d) => d.tier === "primary");
  const growthC = seasonLogGrowth(params.riskPerNight, params.names, params.lossRate, params.gain, params.nights, params.sharedOutcome);
  const C = derived.chained.C.summary;
  const B = derived.season.B.summary;
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
            {d.key === "lossRate" && <LinkedPClean pClean={derived.pClean} />}
          </div>
        ))}
      </div>
      <div className="kpis">
        <div className="kpi role-a">
          <div className="l">
            <span>Clean season</span>
            <Help text="Probability that a single all-in name survives the whole season. The one number the coin reduces to." />
          </div>
          <div className="v">{pct(derived.pClean)}</div>
          <div className="s">1 name, whole tranche</div>
        </div>
        <div className="kpi">
          <div className="l">
            <span>Mean season</span>
            <Help text="Expected season end in tranche units. The same for the coin and for the diversified tranche." />
          </div>
          <div className="v">{x2(derived.meanSeason)}</div>
          <div className="s">≈ 2p − 1 = {signedPct1(2 * derived.pClean - 1)}</div>
        </div>
        <div className="kpi role-b">
          <div className="l">
            <span>Median, diversified</span>
            <Help text="Typical season end with the names split over the whole tranche. Where the free lunch is paid for." />
          </div>
          <div className="v">{x2(B.median)}</div>
          <div className="s">
            {params.names} names, all-in · ruin {smallPct(B.pRuin)}
          </div>
        </div>
        <div className="kpi role-c">
          <div className="l">
            <span>Kelly per name</span>
            <Help text="Growth-optimal fraction of the tranche per name: p − q/b at the deck's loss rate." />
          </div>
          <div className="v">{pct1(derived.kelly)}</div>
          <div className="s">you risk {pct1(params.riskPerNight / params.names)} per name</div>
        </div>
        <div className="kpi role-c">
          <div className="l">
            <span>Growth per season</span>
            <Help text="Expected log of the season end under your policy, ruin excluded. The rate the median compounds at." />
          </div>
          <div className="v">{signedPct1(growthC)}</div>
          <div className="s">
            {params.names} names, {pct(params.riskPerNight)} at risk
          </div>
        </div>
        <div className="kpi role-c">
          <div className="l">
            <span>Median after {params.seasons} seasons</span>
            <Help text="Where the typical path of your policy stands after the seasons chained in the deck." />
          </div>
          <div className="v">{x2(C.median)}</div>
          <div className="s">
            P(below {params.thresholdBelow.toFixed(2)}×) {pct(C.pBelow)}
          </div>
        </div>
      </div>
    </div>
  );
}
