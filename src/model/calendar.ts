/**
 * A season by the calendar.
 *
 * Each trading day offers 0 to 5 names, drawn from a histogram the reader sets. Every
 * name is sized at its own growth-optimal fraction f* = p − q/b, capped so the names
 * on one night never exceed the tranche. Capital use then follows the calendar on its
 * own: a dense night uses more, a sparse night less, an empty week none. An empty day
 * costs nothing in log terms; it adds no term to the sum.
 */
import { kellyFraction } from "./kelly";
import { nightDist, nightLogGrowth } from "./season";
import { makeRng } from "./stats";

export const MAX_NAMES_PER_NIGHT = 5;
export const TRADING_DAYS_PER_WEEK = 5;

/** Shares of nights with 0 … 5 names, scaled to sum to one. All zero means every night is empty. */
export function normalizeShares(shares: number[]): number[] {
  const n = MAX_NAMES_PER_NIGHT + 1;
  const raw = Array.from({ length: n }, (_, i) => Math.max(0, shares[i] ?? 0));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return raw.map((_, i) => (i === 0 ? 1 : 0));
  return raw.map((v) => v / sum);
}

/** The fraction per name once the capital ceiling applies: min(f*, 1/m). */
export function cappedFraction(fstar: number, names: number): number {
  if (names <= 0) return 0;
  return Math.max(0, Math.min(fstar, 1 / names));
}

/** Share of the tranche in use on a night with `names` names. */
export function capitalUsed(names: number, fstar: number): number {
  return names * cappedFraction(fstar, names);
}

/** Names on the median night: the smallest count whose cumulative share reaches one half. */
export function medianNames(shares: number[]): number {
  const s = normalizeShares(shares);
  let acc = 0;
  for (let m = 0; m < s.length; m++) {
    acc += s[m];
    if (acc >= 0.5 - 1e-12) return m;
  }
  return s.length - 1;
}

/** Capital used on the median night. */
export function medianCapitalUsed(shares: number[], fstar: number): number {
  return capitalUsed(medianNames(shares), fstar);
}

/** Expected names per night and expected share of the tranche in use per night. */
export function calendarMeans(shares: number[], fstar: number): { names: number; capital: number } {
  const s = normalizeShares(shares);
  let names = 0;
  let capital = 0;
  s.forEach((w, m) => {
    names += w * m;
    capital += w * capitalUsed(m, fstar);
  });
  return { names, capital };
}

/**
 * Expected log of one night with m names at the capped fraction: the m outcomes add
 * inside the log before it is taken, E[log(1 + f·Σ r)], conditional on the night not
 * wiping the tranche (which it can only do when the cap binds and every name loses).
 */
export function nightExpectedLog(names: number, q: number, b: number): number {
  if (names <= 0) return 0;
  const f = cappedFraction(kellyFraction(q, b), names);
  if (f <= 0) return 0;
  return nightLogGrowth(nightDist({ names, riskPerName: f, gain: b, lossRate: q, sharedOutcome: 0 }));
}

/**
 * Expected log growth over `days` calendar days: each night with m names adds its
 * expected log, and an empty night adds nothing. With one name a night this is the
 * breadth table's first row; with several it is the exact night, not m · g(f).
 */
export function calendarExpectedLogGrowth(shares: number[], days: number, q: number, b: number): number {
  const s = normalizeShares(shares);
  let perDay = 0;
  s.forEach((w, m) => {
    if (m === 0 || w === 0) return;
    perDay += w * nightExpectedLog(m, q, b);
  });
  return days * perDay;
}

export interface CalendarDay {
  /** 1-based day in the season. */
  day: number;
  /** 0-based week, five trading days each. */
  week: number;
  /** 0 … 4: Monday to Friday. */
  weekday: number;
  /** Names offered that night. */
  names: number;
  /** Fraction of the tranche on each name after the cap. */
  fraction: number;
  /** Share of the tranche in use that night. */
  capital: number;
  /** Names that hit max loss. */
  losses: number;
  /** The night's factor on the tranche. */
  factor: number;
  /** Realized log of the tranche at the end of the day (−∞ once ruined). */
  cumLog: number;
  /** Expected log of the tranche at the end of the day, from the histogram. */
  expectedCumLog: number;
}

/** One sampled season of `days` trading days, seeded. */
export function sampleCalendar(shares: number[], days: number, q: number, b: number, seed: number): CalendarDay[] {
  const s = normalizeShares(shares);
  const cdf: number[] = [];
  let acc = 0;
  for (const w of s) cdf.push((acc += w));
  const fstar = kellyFraction(q, b);
  const perDayExpected = calendarExpectedLogGrowth(shares, 1, q, b);
  const rng = makeRng(seed);
  const out: CalendarDay[] = [];
  let cum = 0;
  for (let d = 0; d < days; d++) {
    const u = rng();
    let m = 0;
    while (m < cdf.length - 1 && u > cdf[m]) m++;
    const f = cappedFraction(fstar, m);
    let losses = 0;
    for (let i = 0; i < m; i++) if (rng() < q) losses++;
    const factor = m === 0 ? 1 : Math.max(0, 1 + f * ((m - losses) * b - losses));
    cum = factor > 0 && Number.isFinite(cum) ? cum + Math.log(factor) : -Infinity;
    out.push({
      day: d + 1,
      week: Math.floor(d / TRADING_DAYS_PER_WEEK),
      weekday: d % TRADING_DAYS_PER_WEEK,
      names: m,
      fraction: f,
      capital: m * f,
      losses,
      factor,
      cumLog: cum,
      expectedCumLog: (d + 1) * perDayExpected,
    });
  }
  return out;
}
