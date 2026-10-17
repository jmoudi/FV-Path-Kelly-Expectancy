/**
 * Which per-event rate goes into the binary model.
 *
 * A short wing with short strike at distance d (in priced sigmas), width w (sigmas)
 * and credit c (as a fraction of the width). The move X is in priced sigmas.
 *   payout(X) = W · clamp((X − d)/w, 0, 1)
 * Three candidate rates:
 *   breach   = P(X > d)                 overstates: many breaches end inside the wing
 *   fullGap  = P(X > d + w)             understates: ignores partial losses
 *   effective = E[payout]/W            the rate that reproduces the event's expected value
 *                                      in the binary {+b, −1} abstraction with b = c/(W−c)
 */
import { integrate, normalCdf, normalPdf, studentTCdf, studentTPdf } from "./stats";

export type MoveDistribution = "normal" | "student";

export interface WingParams {
  /** Short strike distance from spot, in priced sigmas. */
  strikeDistance: number;
  /** Wing width, in priced sigmas. */
  wingWidth: number;
  /** Credit received as a fraction of the width (c/W). */
  creditFraction: number;
  /** Shape of the realized move. */
  moveDist: MoveDistribution;
  /** Degrees of freedom for the Student-t (rescaled to unit variance). */
  tailDf: number;
  /** Realized sigma divided by priced sigma. */
  realizedRatio: number;
}

/** Density of the realized move (in priced sigmas). */
export function movePdf(x: number, p: WingParams): number {
  const s = p.realizedRatio;
  if (p.moveDist === "normal") return normalPdf(x / s) / s;
  const df = Math.max(2.5, p.tailDf);
  const scale = Math.sqrt((df - 2) / df) * s;
  return studentTPdf(x / scale, df) / scale;
}

/** P(X > x). */
export function moveTail(x: number, p: WingParams): number {
  const s = p.realizedRatio;
  if (p.moveDist === "normal") return 1 - normalCdf(x / s);
  const df = Math.max(2.5, p.tailDf);
  const scale = Math.sqrt((df - 2) / df) * s;
  return 1 - studentTCdf(x / scale, df);
}

export interface WingRates {
  breach: number;
  fullGap: number;
  /** E[payout]/W: the EV-matching rate for the {+b, −1} abstraction. */
  effective: number;
  /** E[payout]/(W−c): the variant quoted in the wing-width discussion. */
  effectiveOverMaxLoss: number;
  /** Gain per unit risked when the wing expires worthless, b = c/(W−c). */
  gainPerUnit: number;
  /** Expected payout as a fraction of the width. */
  expectedPayout: number;
  /** Expected P&L in units of max loss. */
  expectedPnlPerMaxLoss: number;
}

export function wingRates(p: WingParams): WingRates {
  const d = p.strikeDistance;
  const w = Math.max(1e-6, p.wingWidth);
  const r = p.creditFraction;
  const breach = moveTail(d, p);
  const fullGap = moveTail(d + w, p);
  // E[payout]/W = ∫_d^{d+w} ((x−d)/w) f(x) dx + P(X > d+w)
  const partial = integrate((x) => ((x - d) / w) * movePdf(x, p), d, d + w, 400);
  const expectedPayout = partial + fullGap;
  const maxLoss = 1 - r;
  const gainPerUnit = r / maxLoss;
  return {
    breach,
    fullGap,
    effective: expectedPayout,
    effectiveOverMaxLoss: expectedPayout / maxLoss,
    gainPerUnit,
    expectedPayout,
    expectedPnlPerMaxLoss: (r - expectedPayout) / maxLoss,
  };
}

/** Payout per unit width at a move x. */
export function payoutFraction(x: number, p: WingParams): number {
  const t = (x - p.strikeDistance) / Math.max(1e-6, p.wingWidth);
  return Math.min(1, Math.max(0, t));
}
