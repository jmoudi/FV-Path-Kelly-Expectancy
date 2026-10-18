/**
 * View-models of the app's own controls: what the clean-season linked value, the
 * market switch and the dataset editors show, and the parameter patch each one asks
 * for. The maths and the words are decided here so the components in src/app/view
 * only lay them out and call the store. Pure, no React.
 */
import { lossRateFromPClean, pCleanFromLossRate } from "@app/model/binary";
import { parseNumberList, recordStats } from "@app/model/calibration";
import type { Datasets } from "@app/model/datasets";
import type { Market, Params } from "@app/model/params";
import { marketPatch } from "@app/model/params";
import { DISCUSSION_P_CLEAN } from "@app/data/params";
import { POLICY_META } from "@app/data/policies";
import { pct, pct2, sigma } from "@kit/charts/numbers";
import { marketState } from "./derived";

// ---- the clean-season linked value under the loss rate ----

export interface CleanSeasonLink {
  /** P(clean season) of the Coin at the deck's q and n. */
  p: number;
  /** "55%". */
  value: string;
  /** What the box starts with when the value is clicked: "55.0". */
  editText: string;
  /** The Coin's name, for the suffix "clean season (Coin)". */
  coin: string;
  help: string;
  ariaLabel: string;
  /** The patch a typed clean-season probability asks for (q solved from it); null when the text is not a probability. */
  solve: (typed: string) => Partial<Params> | null;
}

export function cleanSeasonLink(p: Pick<Params, "lossRate" | "nights">): CleanSeasonLink {
  const coin = POLICY_META.coin.name;
  const pClean = pCleanFromLossRate(p.lossRate, p.nights);
  return {
    p: pClean,
    value: pct(pClean),
    editText: (pClean * 100).toFixed(1),
    coin,
    help: `Probability that one all-in name survives all ${p.nights} nights, (1 − q)^n. Type a value and the loss rate per name is solved from it.`,
    ariaLabel: `Clean season (${coin}); typing it solves the loss rate`,
    solve: (typed) => {
      const v = Number(typed.replace(",", ".").replace(/[%\s]/g, "")) / 100;
      if (!Number.isFinite(v) || v <= 0 || v >= 1) return null;
      return { lossRate: lossRateFromPClean(v, p.nights) };
    },
  };
}

// ---- the market switch ----

export interface MarketOption {
  value: Market;
  label: string;
  hint: string;
  title: string;
}

export interface MarketSwitchView {
  options: MarketOption[];
  /** Where q sits decides, except that choosing Custom shows as Custom until another state is chosen. */
  selected: Market;
  /** The premium sentence (marketState().line), with the sizing note when there is no positive premium. */
  state: string;
  /** The patch choosing a state asks for; null when nothing changes (Custom while already custom). */
  patchFor: (m: Market) => Partial<Params> | null;
}

export function marketSwitch(params: Params): MarketSwitchView {
  const m = marketState(params);
  return {
    options: [
      { value: "fair", label: "Fair market", hint: `q = ${pct2(m.fairRate)}`, title: "q = b/(1+b): zero premium over fair, growth-optimal risk 0." },
      { value: "discussion", label: "Discussion case", hint: `q = ${pct2(m.discussionRate)}`, title: `q such that a clean ${POLICY_META.coin.name} season has probability ${pct(DISCUSSION_P_CLEAN)} over ${params.nights} nights.` },
      { value: "custom", label: "Custom", hint: m.actual === "custom" ? `q = ${pct2(params.lossRate)}` : "type q", title: "q typed by hand." },
    ],
    selected: m.chosen === "custom" ? "custom" : m.actual,
    state: m.sizingNote ? `${m.line} ${m.sizingNote}` : m.line,
    patchFor: (v) => (v === "custom" ? (params.market !== "custom" ? { market: "custom" } : null) : marketPatch(v, params, DISCUSSION_P_CLEAN)),
  };
}

// ---- the dataset editors ----

/** The numbers in pasted text or a file: one per line, a CSV's last column. */
export function readNumbers(text: string): number[] {
  return parseNumberList(text);
}

/** The line under a dataset's title: what is imported and what it says. */
export function datasetCaption(kind: keyof Datasets, values: number[], p: Pick<Params, "gain" | "zSigma">): string {
  if (values.length === 0) return "Nothing imported.";
  if (kind === "record") {
    const stats = recordStats(values, p.gain, p.zSigma);
    if (stats) return `${values.length} events · effective rate ${pct2(stats.rate)} · band ${pct2(stats.interval[0])} to ${pct2(stats.interval[1])} (${stats.kind === "binary" ? "0/1 losses" : "P&L per max loss"})`;
  }
  return `${values.length} moves · mean ${sigma(values.reduce((a, b) => a + b, 0) / values.length)} · beyond 2σ: ${pct2(values.filter((v) => v > 2).length / values.length)}`;
}
