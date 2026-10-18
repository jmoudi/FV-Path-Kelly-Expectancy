/**
 * The app's side of the sweep engine: the values of the anchors the schema names
 * (optimistic, deck, break-even for q; robust, Kelly, deck for the risk a night),
 * the sweep context of one parameter, and how its values and deltas read.
 * The engine (src/sweeps) is generic; this is where tranche knowledge enters.
 */
import { breakEvenLossRate } from "@app/model/binary";
import { DEFAULT_PARAMS, type Params } from "@app/data/params";
import type { ParamDef } from "@app/data/schema";
import type { SweepContext, SweepFormat } from "@kit/sweeps/engine";
import { fmtInt, fmtMs, pct, sigma, x2 } from "@kit/charts/numbers";
import { typographic } from "@kit/charts/format";
import type { DeckView } from "@app/scenarios/deck";

export interface AnchorSource {
  params: Params;
  /** The swept input's value when the run started. */
  origin: number;
  /** Deck figures of the last build, for anchors the model computes (robust, Kelly). */
  deck: DeckView | null;
}

/** The value of a named anchor now; undefined when it cannot be computed (no build yet). */
export function anchorValue(id: string, src: AnchorSource): number | undefined {
  switch (id) {
    case "optimistic":
      return src.params.altLossRate;
    case "break-even":
      return breakEvenLossRate(src.params.gain);
    case "deck":
      return src.origin;
    case "robust":
      return src.deck?.robust.risk;
    case "kelly":
      return src.deck?.nightKelly.risk;
    default:
      return undefined;
  }
}

/** The sweep context of one numeric parameter. */
export function sweepContext(def: ParamDef, src: AnchorSource & { current?: number }): SweepContext {
  const dflt = DEFAULT_PARAMS[def.key];
  return {
    min: def.min,
    max: def.max,
    step: def.step,
    integer: def.unit === "int",
    default: typeof dflt === "number" ? dflt : undefined,
    origin: src.origin,
    current: src.current ?? src.origin,
    anchors: def.anchors ?? [],
    resolve: (id) => anchorValue(id, src),
  };
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Decimal places a percentage of this parameter reads with. */
function pctDecimals(def: ParamDef): number {
  if (def.input?.decimals != null) return def.input.decimals;
  if (def.unit === "pct2") return 2;
  const s = def.step * 100;
  return s >= 1 ? 0 : s >= 0.1 ? 1 : 2;
}

/** A value of the parameter as the deck prints it: "2.94%", "50%", "20", "0.50×". */
export function valueText(def: ParamDef, v: number): string {
  switch (def.unit) {
    case "pct":
    case "pct2":
      return pct(v, pctDecimals(def));
    case "int":
      return fmtInt(v);
    case "x":
      return x2(v);
    case "sigma":
      return sigma(v);
    default:
      return typographic(v.toFixed(2));
  }
}

/** A change of the parameter in its own units: "0.05 pp", "5 pp", "1 name", "0.25σ". */
export function deltaText(def: ParamDef, d: number): string {
  const a = Math.abs(d);
  const sign = d < 0 ? "−" : "";
  switch (def.unit) {
    case "pct":
    case "pct2":
      return `${sign}${trimZeros((a * 100).toFixed(2))} pp`;
    case "int": {
      const n = Math.round(a);
      const noun = def.input?.noun;
      return noun ? `${sign}${n} ${n === 1 ? noun.one : noun.many}` : `${sign}${n}`;
    }
    case "x":
      return `${sign}${a.toFixed(2)}×`;
    case "sigma":
      return `${sign}${a.toFixed(2)}σ`;
    default:
      return `${sign}${trimZeros(a.toFixed(3))}`;
  }
}

/** How a preset description reads for this parameter. */
export function sweepFormat(def: ParamDef): SweepFormat {
  return { value: (v) => valueText(def, v), delta: (d) => deltaText(def, d), ms: fmtMs };
}
