/**
 * Which per-event rate goes into the binary model.
 *
 * A short wing with short strike at distance d (in priced sigmas), width w (sigmas)
 * and credit c (as a fraction of the width). The move X is in priced sigmas, signed
 * so that positive means "toward the short strike" (one wing of a condor).
 *   payout(X) = W · clamp((X − d)/w, 0, 1)
 * Three candidate rates:
 *   breach    = P(X > d)          overstates: many breaches end inside the wing
 *   fullGap   = P(X > d + w)      understates: ignores partial losses
 *   effective = E[payout]/W       the rate that reproduces the event's expected value
 *                                 in the binary {+b, −1} abstraction with b = c/(W−c)
 * In an efficient market the credit equals the expected payout, so the fair effective
 * rate is c/W, which is exactly the break-even rate b/(1+b). A deck rate below c/W is
 * a premium the chain pays for tail insurance, not information about the chain.
 */
import { integrate, normalCdf, normalPdf, studentTCdf, studentTPdf } from "./stats";

export type MoveDistribution = "normal" | "student" | "empirical";

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
  /** Realized moves in priced sigmas, for the empirical distribution. */
  sample?: number[];
}

/** Density of the realized move (in priced sigmas). Empirical: a 0.25σ histogram density. */
export function movePdf(x: number, p: WingParams): number {
  const s = p.realizedRatio;
  if (p.moveDist === "empirical") {
    const sm = p.sample ?? [];
    if (!sm.length) return 0;
    const w = 0.25;
    let n = 0;
    for (const v of sm) if (v * s >= x - w / 2 && v * s < x + w / 2) n++;
    return n / sm.length / w;
  }
  if (p.moveDist === "normal") return normalPdf(x / s) / s;
  const df = Math.max(2.5, p.tailDf);
  const scale = Math.sqrt((df - 2) / df) * s;
  return studentTPdf(x / scale, df) / scale;
}

/** P(X > x). */
export function moveTail(x: number, p: WingParams): number {
  const s = p.realizedRatio;
  if (p.moveDist === "empirical") {
    const sm = p.sample ?? [];
    if (!sm.length) return 0;
    let n = 0;
    for (const v of sm) if (v * s > x) n++;
    return n / sm.length;
  }
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
  /** The rate at which the wing is fairly priced: c/W = b/(1+b). */
  fairRate: number;
  /** fairRate − effective: the premium over fair the inputs assert, as a rate per event. */
  premiumRate: number;
}

export function wingRates(p: WingParams): WingRates {
  const d = p.strikeDistance;
  const w = Math.max(1e-6, p.wingWidth);
  const r = p.creditFraction;
  const breach = moveTail(d, p);
  const fullGap = moveTail(d + w, p);
  let expectedPayout: number;
  if (p.moveDist === "empirical") {
    const sm = p.sample ?? [];
    expectedPayout = sm.length ? sm.reduce((acc, v) => acc + payoutFraction(v * p.realizedRatio, p), 0) / sm.length : 0;
  } else {
    // E[payout]/W = ∫_d^{d+w} ((x−d)/w) f(x) dx + P(X > d+w)
    const partial = integrate((x) => ((x - d) / w) * movePdf(x, p), d, d + w, 400);
    expectedPayout = partial + fullGap;
  }
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
    fairRate: r,
    premiumRate: r - expectedPayout,
  };
}

/** Payout per unit width at a move x. */
export function payoutFraction(x: number, p: WingParams): number {
  const t = (x - p.strikeDistance) / Math.max(1e-6, p.wingWidth);
  return Math.min(1, Math.max(0, t));
}

/** The realized ÷ priced sigma range the solvers search. */
export const RATIO_RANGE: [number, number] = [0.3, 4];

/**
 * The realized-over-priced sigma at which the wing's effective rate equals a
 * target loss rate q. Bisection on RATIO_RANGE; null if no solution in range (the
 * empirical distribution is a step function, so it may have none).
 */
export function ratioForLossRate(q: number, p: WingParams): number | null {
  const eff = (s: number) => wingRates({ ...p, realizedRatio: s }).effective - q;
  let [lo, hi] = RATIO_RANGE;
  let flo = eff(lo);
  const fhi = eff(hi);
  if (flo > 0 || fhi < 0) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = eff(mid);
    if (fm === 0) return mid;
    if ((fm < 0) === (flo < 0)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The realized-over-priced sigma at which the wing is fairly priced
 * (effective rate = c/W, zero premium).
 */
export function fairRealizedRatio(p: WingParams): number | null {
  return ratioForLossRate(p.creditFraction, p);
}
