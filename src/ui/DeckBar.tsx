import { useEffect, useState } from "react";
import { lossRateFromPClean } from "../model/binary";
import { GROUP_LABELS, PARAM_DEFS, type ParamGroup } from "../model/params";
import { useStore } from "../state/store";
import { pct, pct1, signedPct1, smallPct, x2, type DeckView } from "../viewmodel/derived";
import { Help } from "./Help";
import { ParamInput } from "./ParamInput";
import { KpiTile } from "./Section";
import { SweepPanel } from "./SweepPanel";
import { SweepStrip } from "./SweepStrip";

const GROUPS: ParamGroup[] = ["event", "season", "sizing"];

/** Editing P(clean season) back-solves the per-name loss rate. */
function LinkedPClean({ pClean, bare }: { pClean: number; bare?: boolean }) {
  const nights = useStore((s) => s.params.nights);
  const setParam = useStore((s) => s.setParam);
  const [text, setText] = useState((pClean * 100).toFixed(1));
  useEffect(() => setText((pClean * 100).toFixed(1)), [pClean]);
  return (
    <div className={`nf compact linked${bare ? " bare" : ""}`}>
      <div className="nf-label">
        <span className="nf-short" title="Probability of a clean season; typing here back-solves the loss rate">
          p
        </span>
        {!bare && <Help text="Typing a clean-season probability here sets the loss rate so that (1 − q)^n equals it." />}
      </div>
      <div className="nf-row">
        <input
          id="param-pclean"
          className="nf-box"
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
      </div>
    </div>
  );
}

function Group({ g, bare }: { g: ParamGroup; bare: boolean }) {
  const defs = PARAM_DEFS.filter((d) => d.group === g);
  const pClean = useStore((s) => Math.pow(1 - s.params.lossRate, s.params.nights));
  return (
    <fieldset className={`group${bare ? " bare" : ""}`}>
      <legend>
        {GROUP_LABELS[g].label}
        {!bare && <span className="caption"> · {GROUP_LABELS[g].blurb}</span>}
      </legend>
      <div className="group-body">
        {defs.map((d) => (
          <div key={d.key} className="group-item">
            <ParamInput k={d.key} bare={bare} />
            {d.key === "lossRate" && <LinkedPClean pClean={pClean} bare={bare} />}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function Definitions({ deck }: { deck: DeckView | null }) {
  const p = useStore((s) => s.params);
  const items: { term: string; def: string }[] = [
    ...PARAM_DEFS.filter((d) => d.definition).map((d) => ({ term: d.label, def: d.definition! })),
    { term: "Clean season", def: `P(no name hits max loss all season) = (1 − q)^n = ${deck ? pct(deck.pClean) : "…"}.` },
    { term: "Edge per season", def: `Mean season end minus one, p × (1 + b)^n − 1 ≈ 2p − 1 = ${deck ? signedPct1(deck.meanSeason - 1) : "…"}.` },
    { term: "Median, diversified", def: "The season end that half of the replays beat, with k names risking the whole tranche." },
    { term: "Growth per season", def: "E[log end | the tranche survives], the rate the median compounds at, always read with P(ruin)." },
    { term: "Robust risk per night", def: `Risk per night maximising growth averaged over loss rates ${deck ? deck.bandLabel : "you cannot rule out"}.` },
    { term: "Policies", def: `A: 1 name, whole tranche. B: ${p.names} names, whole tranche. C: ${p.names} names, ${pct(p.riskPerNight)} of the tranche.` },
  ];
  return (
    <dl className="defs">
      {items.map((it) => (
        <div key={it.term}>
          <dt>{it.term}</dt>
          <dd>{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeadlineKpis({ deck, pending, full }: { deck: DeckView | null; pending: boolean; full: boolean }) {
  const params = useStore((s) => s.params);
  if (!deck) return <div className="caption">computing…</div>;
  const tiles = [
    { label: "Clean season", value: pct(deck.pClean), sub: "1 name, whole tranche", color: "a" as const, help: "Probability that a single all-in name survives the whole season." },
    { label: "Robust risk per night", value: pct(deck.robust.risk), sub: `you risk ${pct(params.riskPerNight)} · Kelly ${pct1(deck.kelly)} per name`, color: "c" as const, help: `Risk per night that maximises growth averaged over a loss rate drawn ${deck.bandLabel}.` },
    { label: `Median after ${params.seasons} season${params.seasons === 1 ? "" : "s"}`, value: x2(deck.chainedC.median), sub: `P(below ${params.thresholdBelow.toFixed(2)}×) ${pct(deck.chainedC.pBelow)}`, color: "c" as const, help: "Where the typical path of your policy stands after the seasons chained in the deck." },
    { label: "Edge per season", value: signedPct1(deck.meanSeason - 1), sub: `mean ${x2(deck.meanSeason)} · ≈ 2p − 1`, help: "Mean season end minus one; the same for the coin and the diversified tranche." },
    { label: "Median, diversified", value: x2(deck.seasonB.median), sub: `${params.names} name${params.names === 1 ? "" : "s"}, all-in · ruin ${smallPct(deck.seasonB.pRuin)}`, color: "b" as const, help: "Typical season end with the names split over the whole tranche." },
    { label: "Growth per season", value: signedPct1(deck.growthC), sub: `${pct(params.riskPerNight)} at risk · ruin ${smallPct(deck.ruinC)}`, color: "c" as const, help: "E[log end | survive] under your policy." },
  ];
  const shown = full ? tiles : tiles.slice(0, 2);
  return (
    <div className={`kpis${full ? "" : " kpis-bar"}`} style={{ opacity: pending ? 0.7 : 1 }}>
      {shown.map((t) => (
        <KpiTile key={t.label} k={t} />
      ))}
    </div>
  );
}

/**
 * The deck: anchored under the top bar on every page. Collapsed it is one row of
 * grouped inputs and three figures; expanded it shows the full inputs with help,
 * every figure, the definitions, and the sweep presets.
 */
export function DeckBar({ deck, pending }: { deck: DeckView | null; pending: boolean }) {
  const expanded = useStore((s) => s.ui.deckExpanded);
  const setUi = useStore((s) => s.setUi);
  const activeInput = useStore((s) => s.activeInput);
  const activeDef = activeInput ? PARAM_DEFS.find((d) => d.key === activeInput) : undefined;
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ deckExpanded: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, setUi]);
  return (
    <div className={`deckbar${expanded ? " expanded" : ""}`} id="deck">
      <div className="deckbar-row">
        <div className="deckbar-groups">
          {GROUPS.map((g) => (
            <Group key={g} g={g} bare />
          ))}
        </div>
        <HeadlineKpis deck={deck} pending={pending} full={false} />
        <button type="button" className="btn small quiet deckbar-toggle" aria-expanded={expanded} onClick={() => setUi({ deckExpanded: !expanded })} title="Full deck: definitions, every figure, sweep presets">
          {expanded ? "Collapse ▴" : "Deck ▾"}
        </button>
      </div>
      <div className="deckbar-striprow">
        {activeInput && activeDef ? (
          <>
            <span className="deckbar-active" title="The input that hotkeys and sweeps act on">
              <span className="caption">active</span> <b>{activeDef.label}</b>
            </span>
            <SweepStrip inputKey={activeInput} />
          </>
        ) : (
          <span className="caption">Focus any input to sweep it, switch its preset, or reset it. Undo any change with Ctrl+Z.</span>
        )}
      </div>
      {expanded && (
        <div className="deckbar-full">
          <div className="deckbar-full-groups">
            {GROUPS.map((g) => (
              <Group key={g} g={g} bare={false} />
            ))}
          </div>
          <HeadlineKpis deck={deck} pending={pending} full />
          <div className="deckbar-full-lower">
            <div>
              <h4>Definitions</h4>
              <Definitions deck={deck} />
            </div>
            <div>
              <SweepPanel compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
