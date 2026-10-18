/**
 * The railroad schematic of one season.
 *
 * Nights are stations along the line: time steps that sit outside the log, each one
 * multiplying the tranche by a factor. The names on a night are parallel tracks that
 * split off before the station and merge again after it: bets that sit inside the log,
 * whose outcomes add up before the log is taken. A track's width is the share of the
 * tranche that name risks; the reserve runs through every station untouched.
 *
 *   growth over the season = Σ_nights log(1 + Σ_names f·r)
 *                            ^ outside          ^ inside
 */
import type { NightPolicy } from "./season";

export interface StationFactor {
  /** Losing names on the night, j. */
  losses: number;
  /** The factor the station applies: 1 + f·((k − j)·b − j), floored at zero. */
  factor: number;
}

export interface Railroad {
  /** Stations: nights in the season (outside the log). */
  nights: number;
  /** Tracks per station: names on a night (inside the log). */
  names: number;
  /** Share of the tranche at risk on each track, f. */
  trackShare: number;
  /** k·f: the share of the tranche the night can lose. */
  totalAtRisk: number;
  /** 1 − k·f: the share that runs through every station untouched. */
  reserveShare: number;
  /** Gain per unit risked on a track that arrives, b. */
  gain: number;
  /** One station's factor for each number of losing tracks. */
  factors: StationFactor[];
  /** log(1 + k·f·b): what one station adds when every track arrives. */
  cleanLog: number;
  /** k·n: name-events in the season, the count the collapsed axes reduce to. */
  nameEvents: number;
}

export function railroad(policy: NightPolicy, nights: number): Railroad {
  const k = Math.max(1, Math.round(policy.names));
  const f = Math.max(0, Math.min(1 / k, policy.riskPerName));
  const b = policy.gain;
  const factors: StationFactor[] = [];
  for (let j = 0; j <= k; j++) factors.push({ losses: j, factor: Math.max(0, 1 + f * ((k - j) * b - j)) });
  const total = k * f;
  return {
    nights,
    names: k,
    trackShare: f,
    totalAtRisk: total,
    reserveShare: Math.max(0, 1 - total),
    gain: b,
    factors,
    cleanLog: Math.log(1 + total * b),
    nameEvents: k * nights,
  };
}

/** The season's log growth is the sum over stations of the log of each station's factor. */
export function stationLogSum(factors: number[]): number {
  let s = 0;
  for (const x of factors) {
    if (x <= 0) return -Infinity;
    s += Math.log(x);
  }
  return s;
}
