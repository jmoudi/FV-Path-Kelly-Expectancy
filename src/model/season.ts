/**
 * The tranche-replay engine.
 *
 * A "night" puts `names` independent (or partially shared) bets on, each risking
 * `riskPerName` of the tranche. A win pays `gain` per unit risked, a loss costs the
 * whole unit. A season is `nights` nights in a row with gains compounding inside the
 * tranche. Chaining seasons is just a longer schedule.
 *
 * Everything here is exact where the combinatorics allow it (multinomial enumeration
 * of nightly loss counts) and falls back to a seeded Monte Carlo otherwise.
 */
import { binomialPmf, choose, logFactorial, makeRng } from "./stats";

export interface NightPolicy {
  /** Names (independent bets) per night, k. */
  names: number;
  /** Fraction of the tranche risked per name, f. k*f <= 1. */
  riskPerName: number;
  /** Gain per unit risked on a win, b (e.g. 0.035). */
  gain: number;
  /** Full-loss probability per name, q. */
  lossRate: number;
  /** Probability that the night's names share one outcome (common cause), c. */
  sharedOutcome: number;
}

/** Distribution of the nightly multiplier, indexed by the number of losing names j. */
export interface NightDist {
  k: number;
  prob: number[];
  factor: number[];
}

export function nightDist(p: NightPolicy): NightDist {
  const k = Math.max(1, Math.round(p.names));
  const f = p.riskPerName;
  const c = Math.min(1, Math.max(0, p.sharedOutcome));
  const q = p.lossRate;
  const prob: number[] = [];
  const factor: number[] = [];
  for (let j = 0; j <= k; j++) {
    let pj = (1 - c) * binomialPmf(k, j, q);
    if (j === 0) pj += c * (1 - q);
    if (j === k) pj += c * q;
    prob.push(pj);
    factor.push(Math.max(0, 1 + f * ((k - j) * p.gain - j)));
  }
  return { k, prob, factor };
}

/** Expected multiplier of one night. */
export function nightMean(nd: NightDist): number {
  let m = 0;
  for (let j = 0; j <= nd.k; j++) m += nd.prob[j] * nd.factor[j];
  return m;
}

/**
 * Expected log multiplier of one night, with the ruin state (factor 0) dropped.
 * This matches the convention used in the discussion's growth tables; the ruin
 * probability is reported separately.
 */
export function nightLogGrowth(nd: NightDist): number {
  let g = 0;
  for (let j = 0; j <= nd.k; j++) if (nd.factor[j] > 0) g += nd.prob[j] * Math.log(nd.factor[j]);
  return g;
}

export interface Outcome {
  value: number;
  prob: number;
}

export interface ScheduleBlock {
  nights: number;
  policy: NightPolicy;
}

export type Engine = "auto" | "exact" | "binned" | "montecarlo";

export interface Distribution {
  /** Sorted ascending by value. */
  outcomes: Outcome[];
  method: "exact" | "binned" | "montecarlo";
  nights: number;
}

export interface DistributionOptions {
  maxCompositions?: number;
  mcPaths?: number;
  seed?: number;
  engine?: Engine;
}

const LOG_MERGE_TOL = 1e-9;

function mergeOutcomes(list: Outcome[]): Outcome[] {
  list.sort((a, b) => a.value - b.value);
  const out: Outcome[] = [];
  for (const o of list) {
    if (o.prob <= 0) continue;
    const last = out[out.length - 1];
    if (last && (last.value === o.value || (last.value > 0 && Math.abs(Math.log(o.value) - Math.log(last.value)) < LOG_MERGE_TOL))) {
      last.prob += o.prob;
    } else {
      out.push({ value: o.value, prob: o.prob });
    }
  }
  return out;
}

/** Exact distribution of the product of `nights` iid nightly multipliers. */
export function exactBlockDistribution(nd: NightDist, nights: number): Outcome[] {
  const K = nd.k;
  if (nights === 0) return [{ value: 1, prob: 1 }];
  const logP = nd.prob.map((p) => (p > 0 ? Math.log(p) : -Infinity));
  const logF = nd.factor.map((f) => (f > 0 ? Math.log(f) : -Infinity));
  const lgN = logFactorial(nights);
  const out: Outcome[] = [];
  const rec = (j: number, remaining: number, lp: number, lv: number) => {
    if (j === K) {
      const n = remaining;
      let lpj = lp;
      let lvj = lv;
      if (n > 0) {
        if (logP[K] === -Infinity) return;
        lpj += n * logP[K] - logFactorial(n);
        lvj += n * logF[K];
      }
      out.push({ value: lvj === -Infinity ? 0 : Math.exp(lvj), prob: Math.exp(lgN + lpj) });
      return;
    }
    for (let n = 0; n <= remaining; n++) {
      if (n > 0 && logP[j] === -Infinity) break;
      const lpj = n > 0 ? lp + n * logP[j] - logFactorial(n) : lp;
      const lvj = n > 0 ? lv + n * logF[j] : lv;
      rec(j + 1, remaining - n, lpj, lvj);
    }
  };
  rec(0, nights, 0, 0);
  return mergeOutcomes(out);
}

/** Product-convolution of two independent outcome lists. */
export function convolve(a: Outcome[], b: Outcome[]): Outcome[] {
  const out: Outcome[] = [];
  for (const x of a) for (const y of b) out.push({ value: x.value * y.value, prob: x.prob * y.prob });
  return mergeOutcomes(out);
}

export function compositionCount(blocks: ScheduleBlock[]): number {
  let total = 1;
  for (const b of blocks) total *= choose(b.nights + Math.round(b.policy.names), Math.round(b.policy.names));
  return total;
}

/** Monte Carlo distribution of the schedule's end value. */
export function monteCarloDistribution(blocks: ScheduleBlock[], paths: number, seed: number): Outcome[] {
  const rng = makeRng(seed);
  const dists = blocks.map((b) => ({ nights: b.nights, nd: nightDist(b.policy) }));
  const cdfs = dists.map(({ nd }) => {
    const cdf: number[] = [];
    let acc = 0;
    for (const p of nd.prob) cdf.push((acc += p));
    return cdf;
  });
  const values: number[] = new Array(paths);
  for (let i = 0; i < paths; i++) {
    let v = 1;
    outer: for (let bi = 0; bi < dists.length; bi++) {
      const { nights, nd } = dists[bi];
      const cdf = cdfs[bi];
      for (let n = 0; n < nights; n++) {
        const u = rng();
        let j = 0;
        while (j < cdf.length - 1 && u > cdf[j]) j++;
        v *= nd.factor[j];
        if (v === 0) break outer;
      }
    }
    values[i] = v;
  }
  values.sort((a, b) => a - b);
  const w = 1 / paths;
  return mergeOutcomes(values.map((value) => ({ value, prob: w })));
}

/**
 * Binned dynamic programme over log(value). The clean-night factor of the first
 * block is an exact whole number of bins, so the common move never blurs; only the
 * rare loss nights are split between two neighbouring bins.
 *
 * `snapshotsAt` lists cumulative night counts at which to emit a distribution; the
 * final night is always emitted last.
 */
export function binnedDistributions(blocks: ScheduleBlock[], snapshotsAt: number[] = [], binsPerCleanNight = 24): Distribution[] {
  const active = blocks.filter((b) => b.nights > 0);
  const total = active.reduce((s, b) => s + b.nights, 0);
  if (total === 0) return [{ outcomes: [{ value: 1, prob: 1 }], method: "binned", nights: 0 }];
  const dists = active.map((b) => ({ nights: b.nights, nd: nightDist(b.policy) }));
  const firstClean = Math.log(Math.max(1 + 1e-9, dists[0].nd.factor[0]));
  const binWidth = firstClean / binsPerCleanNight;
  const floorLog = Math.log(1e-5);
  let hiLog = 0;
  for (const d of dists) hiLog += d.nights * Math.max(0, Math.log(Math.max(1e-9, d.nd.factor[0])));
  const nBins = Math.ceil((hiLog - floorLog) / binWidth) + 2;
  const zeroIdx = Math.round(-floorLog / binWidth);
  let cur = new Float64Array(nBins);
  cur[zeroIdx] = 1;
  let ruin = 0;
  const wanted = new Set(snapshotsAt.filter((s) => s > 0 && s <= total));
  wanted.add(total);
  const out: Distribution[] = [];
  const emit = (nightsDone: number) => {
    const outcomes: Outcome[] = [];
    if (ruin > 0) outcomes.push({ value: 0, prob: ruin });
    for (let i = 0; i < nBins; i++) if (cur[i] > 1e-15) outcomes.push({ value: Math.exp(floorLog + i * binWidth), prob: cur[i] });
    out.push({ outcomes, method: "binned", nights: nightsDone });
  };
  let done = 0;
  for (const { nights, nd } of dists) {
    const moves = nd.prob.map((p, j) => {
      if (nd.factor[j] <= 0) return { p, ruin: true, s: 0, r: 0 };
      const shift = Math.log(nd.factor[j]) / binWidth;
      const s = Math.floor(shift);
      return { p, ruin: false, s, r: shift - s };
    });
    for (let n = 0; n < nights; n++) {
      const next = new Float64Array(nBins);
      for (let i = 0; i < nBins; i++) {
        const m = cur[i];
        if (m === 0) continue;
        for (const mv of moves) {
          if (mv.p === 0) continue;
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
      done++;
      if (wanted.has(done)) emit(done);
    }
  }
  return out;
}

/** Distribution of the end value of a whole schedule. */
export function scheduleDistribution(blocks: ScheduleBlock[], opts: DistributionOptions = {}): Distribution {
  const maxComp = opts.maxCompositions ?? 250_000;
  const engine = opts.engine ?? "auto";
  const nights = blocks.reduce((s, b) => s + b.nights, 0);
  const active = blocks.filter((b) => b.nights > 0);
  if (engine === "montecarlo") return { outcomes: monteCarloDistribution(active, opts.mcPaths ?? 20_000, opts.seed ?? 42), method: "montecarlo", nights };
  if (engine === "exact" || (engine === "auto" && compositionCount(active) <= maxComp)) {
    let acc: Outcome[] = [{ value: 1, prob: 1 }];
    for (const b of active) acc = convolve(acc, exactBlockDistribution(nightDist(b.policy), b.nights));
    return { outcomes: acc, method: "exact", nights };
  }
  return binnedDistributions(active)[0];
}

export interface Summary {
  mean: number;
  median: number;
  p10: number;
  p90: number;
  /** P(end value < threshold). */
  pBelow: number;
  /** P(end value == 0). */
  pRuin: number;
  /** P(end value >= mean). */
  pAtOrAboveMean: number;
  /** E[log end value] over non-ruined outcomes (not renormalized). */
  expLog: number;
  /** Highest possible end value (no losses at all). */
  max: number;
  /** Probability of the no-loss outcome. */
  pMax: number;
  method: Distribution["method"];
}

export function weightedQuantile(outcomes: Outcome[], p: number): number {
  let acc = 0;
  for (const o of outcomes) {
    acc += o.prob;
    if (acc >= p - 1e-12) return o.value;
  }
  return outcomes.length ? outcomes[outcomes.length - 1].value : NaN;
}

export function summarize(d: Distribution, threshold = 0.5): Summary {
  const o = d.outcomes;
  let mean = 0;
  let pBelow = 0;
  let pRuin = 0;
  let expLog = 0;
  for (const x of o) {
    mean += x.value * x.prob;
    if (x.value < threshold) pBelow += x.prob;
    if (x.value <= 0) pRuin += x.prob;
    else expLog += x.prob * Math.log(x.value);
  }
  let pAtOrAboveMean = 0;
  for (const x of o) if (x.value >= mean - 1e-12) pAtOrAboveMean += x.prob;
  const last = o[o.length - 1];
  return {
    mean,
    median: weightedQuantile(o, 0.5),
    p10: weightedQuantile(o, 0.1),
    p90: weightedQuantile(o, 0.9),
    pBelow,
    pRuin,
    pAtOrAboveMean,
    expLog,
    max: last ? last.value : NaN,
    pMax: last ? last.prob : NaN,
    method: d.method,
  };
}

/** Sample paths (tranche value after each night, starting at 1) for fan charts. */
export function samplePaths(blocks: ScheduleBlock[], paths: number, seed: number): number[][] {
  const rng = makeRng(seed);
  const dists = blocks.map((b) => ({ nights: b.nights, nd: nightDist(b.policy) }));
  const out: number[][] = [];
  for (let i = 0; i < paths; i++) {
    const path = [1];
    let v = 1;
    for (const { nights, nd } of dists) {
      for (let n = 0; n < nights; n++) {
        if (v > 0) {
          const u = rng();
          let acc = 0;
          let j = 0;
          for (; j < nd.k; j++) {
            acc += nd.prob[j];
            if (u <= acc) break;
          }
          v *= nd.factor[j];
        }
        path.push(v);
      }
    }
    out.push(path);
  }
  return out;
}

/** One sample "grid" of a season: per night, the number of losing names, and the path. */
export function sampleGrid(policy: NightPolicy, nights: number, seed: number): { losses: number[][]; path: number[] } {
  const rng = makeRng(seed);
  const k = Math.max(1, Math.round(policy.names));
  const path = [1];
  const losses: number[][] = [];
  let v = 1;
  for (let n = 0; n < nights; n++) {
    const shared = rng() < policy.sharedOutcome;
    const row: number[] = [];
    if (shared) {
      const lost = rng() < policy.lossRate ? 1 : 0;
      for (let i = 0; i < k; i++) row.push(lost);
    } else {
      for (let i = 0; i < k; i++) row.push(rng() < policy.lossRate ? 1 : 0);
    }
    const j = row.reduce((s, x) => s + x, 0);
    v = v > 0 ? Math.max(0, v * (1 + policy.riskPerName * ((k - j) * policy.gain - j))) : 0;
    losses.push(row);
    path.push(v);
  }
  return { losses, path };
}

/** Inverse-transform samples from a discrete distribution. */
export function sampleFromDistribution(d: Distribution, n: number, seed: number): number[] {
  const rng = makeRng(seed);
  const cdf: number[] = [];
  let acc = 0;
  for (const o of d.outcomes) cdf.push((acc += o.prob));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const u = rng() * acc;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    out[i] = d.outcomes[lo].value;
  }
  return out;
}

/** Histogram of a distribution on log-spaced bins; the zero mass is kept separately. */
export interface HistogramBin {
  lo: number;
  hi: number;
  mid: number;
  prob: number;
}
export function logHistogram(d: Distribution, lo: number, hi: number, bins: number): { bins: HistogramBin[]; zeroMass: number } {
  const llo = Math.log(lo);
  const lhi = Math.log(hi);
  const w = (lhi - llo) / bins;
  const out: HistogramBin[] = [];
  for (let i = 0; i < bins; i++) {
    const a = Math.exp(llo + i * w);
    const b = Math.exp(llo + (i + 1) * w);
    out.push({ lo: a, hi: b, mid: Math.sqrt(a * b), prob: 0 });
  }
  let zeroMass = 0;
  for (const o of d.outcomes) {
    if (o.value <= 0) {
      zeroMass += o.prob;
      continue;
    }
    let idx = Math.floor((Math.log(o.value) - llo) / w);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    out[idx].prob += o.prob;
  }
  return { bins: out, zeroMass };
}
