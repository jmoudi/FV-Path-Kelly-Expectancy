import { useEffect, useState } from "react";
import { lossRateFromPClean } from "../model/binary";
import { GROUP_LABELS, PARAM_DEFS, type ParamGroup, type Params } from "../model/params";
import { useStore } from "../state/store";
import { pct, pct1, signedPct1, smallPct, x2, type DeckView } from "../viewmodel/derived";
import { Help } from "./Help";
import { ParamInput } from "./ParamInput";
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
        <span className="nf-label-text">
          <span>Clean season</span>
          <span className="sym">p</span>
        </span>
        {!bare && <Help text="Probability that one all-in name survives the season, (1 − q)^n. Typing here back-solves the loss rate." />}
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

/** The inputs of one group, in schema order, with the linked clean-season field after the loss rate. */
function Fields({ g, bare }: { g: ParamGroup; bare: boolean }) {
  const defs = PARAM_DEFS.filter((d) => d.group === g);
  const pClean = useStore((s) => Math.pow(1 - s.params.lossRate, s.params.nights));
  return (
    <>
      {defs.map((d) => (
        <div key={d.key} className="dk-field">
          <ParamInput k={d.key} bare={bare} />
          {d.key === "lossRate" && <LinkedPClean pClean={pClean} bare={bare} />}
        </div>
      ))}
    </>
  );
}

interface Figure {
  label: string;
  value: string;
  basis: string;
  help: string;
  color?: "a" | "b" | "c";
}

/** The six headline figures, in reading order: what the coin gives, what the diversified tranche gives, what your policy gives. */
function figures(deck: DeckView, p: Params): Figure[] {
  return [
    { label: "Clean season", value: pct(deck.pClean), basis: "1 name, whole tranche", color: "a", help: "Probability that a single all-in name survives the whole season, (1 − q)^n." },
    { label: "Edge per season", value: signedPct1(deck.meanSeason - 1), basis: `mean ${x2(deck.meanSeason)} · ≈ 2p − 1`, help: "Mean season end minus one. The same for the coin and the diversified tranche; it is not what you earn." },
    { label: `Median, ${p.names} name${p.names === 1 ? "" : "s"} all-in`, value: x2(deck.seasonB.median), basis: `ruin ${smallPct(deck.seasonB.pRuin)}`, color: "b", help: "Typical season end with the names split over the whole tranche, no reserve." },
    { label: "Growth per season", value: signedPct1(deck.growthC), basis: `${pct(p.riskPerNight)} at risk · ruin ${smallPct(deck.ruinC)}`, color: "c", help: "E[log end | the tranche survives] under your policy; the rate the median compounds at." },
    { label: "Robust risk per night", value: pct(deck.robust.risk), basis: `you risk ${pct(p.riskPerNight)} · Kelly ${pct1(deck.kelly)} per name`, color: "c", help: `Risk per night that maximises growth averaged over a loss rate drawn ${deck.bandLabel}.` },
    { label: `Median after ${p.seasons} season${p.seasons === 1 ? "" : "s"}`, value: x2(deck.chainedC.median), basis: `P(below ${p.thresholdBelow.toFixed(2)}×) ${pct(deck.chainedC.pBelow)}`, color: "c", help: "Where the typical path of your policy stands after the seasons chained in the deck." },
  ];
}

/** Row two of the reduced deck: the figures as one status line. */
function FigureLine({ deck, pending }: { deck: DeckView | null; pending: boolean }) {
  const p = useStore((s) => s.params);
  if (!deck) return <div className="dk-figs caption">computing…</div>;
  return (
    <div className="dk-figs" style={{ opacity: pending ? 0.6 : 1 }} aria-label="Headline figures">
      {figures(deck, p).map((f) => (
        <span key={f.label} className={`fig${f.color ? ` role-${f.color}` : ""}`} title={`${f.help} ${f.basis}`}>
          <b>{f.value}</b>
          {f.label}
        </span>
      ))}
    </div>
  );
}

/** The figures in the full deck: a table with label, basis and value. */
function FigureTable({ deck, pending }: { deck: DeckView | null; pending: boolean }) {
  const p = useStore((s) => s.params);
  if (!deck) return <div className="caption">computing…</div>;
  return (
    <div className="figtable" style={{ opacity: pending ? 0.6 : 1 }}>
      {figures(deck, p).map((f) => (
        <div key={f.label} className={`figrow${f.color ? ` role-${f.color}` : ""}`}>
          <div className="fl">
            <div className="t">
              <span>{f.label}</span>
              <Help text={f.help} />
            </div>
            <div className="s">{f.basis}</div>
          </div>
          <div className="fv">{f.value}</div>
        </div>
      ))}
    </div>
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

/**
 * The deck, anchored under the top bar on every page.
 *
 * Reduced: two rows. Row one is the inputs in three groups set apart by distance,
 * each with its readable label and symbol. Row two is the figures as one status
 * line, the sweep strip for the active input, and the toggle.
 *
 * Full: two columns. Left, the inputs as sections with their help, then the sweep
 * presets. Right, the figures as a table, then the definitions.
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
      <div className="dk-row dk-inputs">
        {GROUPS.map((g) => (
          <section key={g} className="dk-group" aria-label={GROUP_LABELS[g].label}>
            <div className="dk-caption">{GROUP_LABELS[g].label}</div>
            <div className="dk-fields">
              <Fields g={g} bare />
            </div>
          </section>
        ))}
      </div>
      <div className="dk-row dk-status">
        <FigureLine deck={deck} pending={pending} />
        <div className="dk-strip">
          {activeInput && activeDef ? (
            <>
              <span className="dk-active" title="The input that hotkeys and sweeps act on">
                {activeDef.shortLabel ?? activeDef.label}
              </span>
              <SweepStrip inputKey={activeInput} compact />
            </>
          ) : (
            <span className="dk-hint">Focus an input to sweep it · Ctrl+Z undoes</span>
          )}
        </div>
        <button type="button" className="btn small quiet deckbar-toggle" aria-expanded={expanded} onClick={() => setUi({ deckExpanded: !expanded })} title="Full deck: inputs with help, every figure, definitions, sweep presets">
          {expanded ? "Collapse ▴" : "Full deck ▾"}
        </button>
      </div>
      {expanded && (
        <div className="dk-full">
          <div className="dk-col">
            <h3 className="dk-h">Inputs</h3>
            {GROUPS.map((g) => (
              <section key={g} className="dk-section" aria-label={GROUP_LABELS[g].label}>
                <header>
                  <h4>{GROUP_LABELS[g].label}</h4>
                  <p>{GROUP_LABELS[g].blurb}</p>
                </header>
                <div className="dk-fields full">
                  <Fields g={g} bare={false} />
                </div>
              </section>
            ))}
            <section className="dk-section" aria-label="Sweep presets">
              <header>
                <h4>Sweep presets</h4>
                <p>A preset drives an input on its own. Link one to the active input, then run it from the strip or with Ctrl+Enter.</p>
              </header>
              <SweepPanel compact />
            </section>
          </div>
          <div className="dk-col">
            <h3 className="dk-h">Figures</h3>
            <FigureTable deck={deck} pending={pending} />
            <h3 className="dk-h">Definitions</h3>
            <Definitions deck={deck} />
          </div>
        </div>
      )}
    </div>
  );
}
