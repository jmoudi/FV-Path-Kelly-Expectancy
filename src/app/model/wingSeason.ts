/**
 * The season the wing's payout actually produces.
 *
 * The binary model treats every bad event as a full loss. A real wing pays out in
 * proportion to how far the move ends inside it. Per event, in units of max loss
 * M = W − c, the P&L is (c − payout)/M, so the tranche multiplies by
 *
 *   m(payout) = 1 + (r − payout) / (1 − r),   r = c/W, payout as a fraction of W,
 *
 * which is 1 + b when the wing expires worthless and 0 when the move gaps past the
 * long strike. A season of n such events with the whole tranche on each has an end
 * distribution between the coin's two spikes: narrow wings make the binary exact,
 * wide wings turn most bad seasons into partial losses.
 */
import { exactBlockDistribution, type Distribution, type NightDist, type Outcome } from "./season";
import { choose, integrate } from "@kit/math/stats";
import { movePdf, moveTail, payoutFraction, type WingParams } from "./wing";

export interface PayoutLevel {
  /** Payout as a fraction of the width, 0 … 1. */
  payout: number;
  prob: number;
}

/**
 * Discretise the payout: the mass that never breaches (payout 0), `partials` levels
 * at the midpoints of equal slices of the wing, and the full gap (payout 1).
 */
export function payoutLevels(p: WingParams, partials = 8): PayoutLevel[] {
  const d = p.strikeDistance;
  const w = Math.max(1e-6, p.wingWidth);
  const n = Math.max(1, Math.round(partials));
  const levels: PayoutLevel[] = [];
  if (p.moveDist === "empirical") {
    const sm = p.sample ?? [];
    const counts = new Array<number>(n + 2).fill(0);
    for (const v of sm) {
      const pay = payoutFraction(v * p.realizedRatio, p);
      if (pay <= 0) counts[0]++;
      else if (pay >= 1) counts[n + 1]++;
      else counts[1 + Math.min(n - 1, Math.floor(pay * n))]++;
    }
    const total = sm.length || 1;
    levels.push({ payout: 0, prob: sm.length ? counts[0] / total : 1 });
    for (let i = 0; i < n; i++) levels.push({ payout: (i + 0.5) / n, prob: counts[1 + i] / total });
    levels.push({ payout: 1, prob: counts[n + 1] / total });
    return levels;
  }
  const breach = moveTail(d, p);
  const fullGap = moveTail(d + w, p);
  levels.push({ payout: 0, prob: Math.max(0, 1 - breach) });
  for (let i = 0; i < n; i++) {
    const a = d + (i * w) / n;
    const b = a + w / n;
    levels.push({ payout: (i + 0.5) / n, prob: Math.max(0, integrate((x) => movePdf(x, p), a, b, 40)) });
  }
  levels.push({ payout: 1, prob: Math.max(0, fullGap) });
  const sum = levels.reduce((s, l) => s + l.prob, 0);
  return sum > 0 ? levels.map((l) => ({ payout: l.payout, prob: l.prob / sum })) : levels;
}

/** The tranche multiplier for one event at a payout fraction, with the whole tranche on it. */
export function eventMultiplier(payout: number, creditFraction: number): number {
  const r = Math.min(0.999999, Math.max(0, creditFraction));
  return Math.max(0, 1 + (r - payout) / (1 - r));
}

export interface Level {
  factor: number;
  prob: number;
}

/**
 * Distribution of the product of `nights` iid draws from the levels: exact
 * (multinomial enumeration) while the compositions are few, otherwise a binned
 * log-space recursion like the season engine's, with the ruin mass kept apart.
 */
export function levelsDistribution(levels: Level[], nights: number, maxCompositions = 60_000, binsPerCleanNight = 24): Distribution {
  const live = levels.filter((l) => l.prob > 0);
  if (!live.length || nights <= 0) return { outcomes: [{ value: 1, prob: 1 }], method: "exact", nights };
  if (choose(nights + live.length - 1, live.length - 1) <= maxCompositions) {
    const nd: NightDist = { k: live.length - 1, prob: live.map((l) => l.prob), factor: live.map((l) => l.factor) };
    return { outcomes: exactBlockDistribution(nd, nights), method: "exact", nights };
  }
  const best = Math.max(...live.map((l) => l.factor));
  const binWidth = Math.log(Math.max(1 + 1e-9, best)) / binsPerCleanNight;
  // The floor is a whole number of bins below 1, so the starting tranche sits exactly on a bin.
  const zeroIdx = Math.ceil(-Math.log(1e-5) / binWidth);
  const floorLog = -zeroIdx * binWidth;
  const hiLog = nights * Math.max(0, Math.log(Math.max(1e-9, best)));
  const nBins = Math.ceil((hiLog - floorLog) / binWidth) + 2;
  let cur = new Float64Array(nBins);
  cur[zeroIdx] = 1;
  let ruin = 0;
  const moves = live.map((l) => {
    if (l.factor <= 0) return { p: l.prob, ruin: true, s: 0, r: 0 };
    const shift = Math.log(l.factor) / binWidth;
    const s = Math.floor(shift);
    return { p: l.prob, ruin: false, s, r: shift - s };
  });
  for (let t = 0; t < nights; t++) {
    const next = new Float64Array(nBins);
    for (let i = 0; i < nBins; i++) {
      const m = cur[i];
      if (m === 0) continue;
      for (const mv of moves) {
        if (mv.ruin) {
          ruin += m * mv.p;
          continue;
        }
        let a = i + mv.s;
        let b = a + 1;
        if (a < 0) a = 0;
        if (b < 0) b = 0;
        if (a >= nBins) a = nBins - 1;
        if (b >= nBins) b = nBins - 1;
        next[a] += m * mv.p * (1 - mv.r);
        next[b] += m * mv.p * mv.r;
      }
    }
    cur = next;
  }
  const outcomes: Outcome[] = [];
  if (ruin > 0) outcomes.push({ value: 0, prob: ruin });
  for (let i = 0; i < nBins; i++) if (cur[i] > 1e-15) outcomes.push({ value: Math.exp(floorLog + i * binWidth), prob: cur[i] });
  return { outcomes, method: "binned", nights };
}

/** The season-end distribution of `nights` events on this wing, whole tranche on each. */
export function wingSeasonDistribution(p: WingParams, nights: number, opts: { partials?: number; maxCompositions?: number } = {}): Distribution {
  const levels = payoutLevels(p, opts.partials ?? 8).map((l) => ({ factor: eventMultiplier(l.payout, p.creditFraction), prob: l.prob }));
  return levelsDistribution(levels, nights, opts.maxCompositions);
}

/** Among seasons that end below the start, the share that end above zero. Null when no season ends below the start. */
export function partialShareOfBadSeasons(d: Distribution): number | null {
  let bad = 0;
  let partial = 0;
  for (const o of d.outcomes) {
    if (o.value < 1 - 1e-9) {
      bad += o.prob;
      if (o.value > 0) partial += o.prob;
    }
  }
  return bad > 0 ? partial / bad : null;
}
