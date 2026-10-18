import type { Params } from "@app/params/params";
import { quoted, type SourceFigure } from "./types";
import { pct, pct1, pct2, x2 } from "@kit/charts/numbers";

/** The discussion's setup, which every quoted figure assumes. */
export const DISCUSSION = { q: 0.02945, b: 0.035, n: 20, k: 3, risk: 0.5, N: 4, c: 0, threshold: 0.5, alt: 0.0252, z: 2, perYear: 80 } as const;
export type DiscussionInput = keyof typeof DISCUSSION;

/**
 * When a recomputed figure disagrees with the quote, the usual reason is that the
 * deck has moved off the discussion's inputs. Name the inputs that differ.
 */
export function whyDeck(p: Params, deps: readonly DiscussionInput[]): string | undefined {
  const diffs: string[] = [];
  const off = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  for (const dep of deps) {
    switch (dep) {
      case "q":
        if (off(p.lossRate, DISCUSSION.q, 5e-5)) diffs.push(`q ${pct2(p.lossRate)} (quoted at ${pct2(DISCUSSION.q)})`);
        break;
      case "b":
        if (off(p.gain, DISCUSSION.b, 5e-5)) diffs.push(`b ${pct2(p.gain)} (quoted at ${pct1(DISCUSSION.b)})`);
        break;
      case "n":
        if (p.nights !== DISCUSSION.n) diffs.push(`${p.nights} nights (quoted for ${DISCUSSION.n})`);
        break;
      case "k":
        if (Math.round(p.names) !== DISCUSSION.k) diffs.push(`${Math.round(p.names)} names a night (quoted for ${DISCUSSION.k})`);
        break;
      case "risk":
        if (off(p.riskPerNight, DISCUSSION.risk, 1e-6)) diffs.push(`${pct(p.riskPerNight)} at risk a night (quoted for ${pct(DISCUSSION.risk)})`);
        break;
      case "N":
        if (p.seasons !== DISCUSSION.N) diffs.push(`${p.seasons} seasons (quoted for ${DISCUSSION.N})`);
        break;
      case "c":
        if (off(p.sharedOutcome, DISCUSSION.c, 1e-9)) diffs.push(`shared-cause nights ${pct2(p.sharedOutcome)} (quoted for independent names)`);
        break;
      case "threshold":
        if (off(p.thresholdBelow, DISCUSSION.threshold, 1e-6)) diffs.push(`threshold ${x2(p.thresholdBelow)} (quoted for ${x2(DISCUSSION.threshold)})`);
        break;
      case "alt":
        if (off(p.altLossRate, DISCUSSION.alt, 5e-5)) diffs.push(`optimistic rate ${pct2(p.altLossRate)} (quoted at ${pct2(DISCUSSION.alt)})`);
        break;
      case "z":
        if (off(p.zSigma, DISCUSSION.z, 1e-6)) diffs.push(`${p.zSigma}σ separation (quoted at ${DISCUSSION.z}σ)`);
        break;
      case "perYear":
        if (p.eventsPerYear !== DISCUSSION.perYear) diffs.push(`${p.eventsPerYear} events a year (quoted at ${DISCUSSION.perYear})`);
        break;
    }
  }
  return diffs.length ? `The deck differs from the discussion's setup: ${diffs.join(", ")}.` : undefined;
}

/**
 * A quoted-vs-recomputed row. When the figure disagrees, the reason is the deck
 * input that moved, or else the reason given, or else rounding.
 */
export function fig(p: Params, label: string, quotedText: string, computed: string, agrees: boolean, deps: readonly DiscussionInput[], reason?: string): SourceFigure {
  const why = agrees ? undefined : (whyDeck(p, deps) ?? reason ?? "Rounding in the discussion.");
  return quoted(label, quotedText, computed, agrees, why);
}
