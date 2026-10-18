import { describe, expect, it } from "vitest";
import { breakEvenLossRate, cleanEnd, lossRateFromPClean, pCleanFromLossRate, seasonMean } from "@app/model/binary";
import { eventsForTest, eventsToResolve, eventsUntilUpperBelow, parseNumberList, recordStats } from "@app/model/calibration";
import { breachBeyond, crossoverSharedOutcome, jointLossProb, ruinPerSeason } from "@app/model/correlation";
import { betaPosterior, breadthTable, kellyFraction, nightOptimum, robustOptimum, robustSeasonLogGrowth, seasonLogGrowth, seasonRuin, uniformBand } from "@app/model/kelly";
import { medianGrowthPerSeason } from "@app/model/growth";
import { coinOutcomes, doubleOrNothingShare, navKellyShare, navLogGrowth, navLogGrowthSlope, twoPointShare } from "@app/model/nav";
import { railroad, stationLogSum } from "@app/model/railroad";
import { calendarExpectedLogGrowth, calendarMeans, capitalUsed, cappedFraction, medianCapitalUsed, medianNames, normalizeShares, sampleCalendar } from "@app/model/calendar";
import { eventMultiplier, levelsDistribution, partialShareOfBadSeasons, payoutLevels, wingSeasonDistribution } from "@app/model/wingSeason";
import { evMatchingStake, symmetricKelly, symmetricSeasonDistribution, symmetricSeasonMean } from "@app/model/symmetric";
import { DEFAULT_PARAMS, DISCUSSION_P_CLEAN, marketLossRate, marketOf, marketPatch } from "@app/params/params";
import { sanitizeParams } from "@app/params/schema";
import { POLICY_IDS, POLICY_META, policies, policyLabel } from "@app/model/policies";
import { binnedDistributions, nightDist, nightLogGrowth, nightRuin, scheduleDistribution, summarize } from "@app/model/season";
import { normalCdf, normalQuantile, studentTCdf } from "@kit/math/stats";
import { fairRealizedRatio, ratioForLossRate, wingRates } from "@app/model/wing";

const b = 0.035;
const n = 20;
const q55 = lossRateFromPClean(0.55, n);

describe("stats", () => {
  it("normal cdf and quantile agree", () => {
    for (const p of [0.001, 0.0135, 0.1, 0.5, 0.9, 0.99865]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 8);
    expect(1 - normalCdf(3)).toBeCloseTo(0.00135, 5);
  });
  it("student-t cdf is sane", () => {
    expect(studentTCdf(0, 4)).toBeCloseTo(0.5, 10);
    expect(studentTCdf(2.776, 4)).toBeCloseTo(0.975, 3);
    expect(studentTCdf(-2.776, 4)).toBeCloseTo(0.025, 3);
  });
});

describe("binary season (section 1)", () => {
  it("reduces to the discussion's numbers", () => {
    expect(cleanEnd(b, n)).toBeCloseTo(1.99, 2);
    expect(breakEvenLossRate(b)).toBeCloseTo(0.0338, 4);
    expect(pCleanFromLossRate(breakEvenLossRate(b), n)).toBeCloseTo(0.503, 3);
    expect(q55).toBeCloseTo(0.0294, 4);
    expect(lossRateFromPClean(0.6, n)).toBeCloseTo(0.0252, 4);
    expect(lossRateFromPClean(0.45, n)).toBeCloseTo(0.0391, 4);
    expect(lossRateFromPClean(0.7, n)).toBeCloseTo(0.0177, 4);
    expect(seasonMean(0.55, b, n)).toBeCloseTo(1.095, 2);
  });
});

describe("calibration (section 3)", () => {
  it("needs roughly 1,500 events to split 2.52% from 3.41%", () => {
    const events = eventsToResolve(0.0252, 0.0341, 2);
    expect(events).toBeGreaterThan(1300);
    expect(events).toBeLessThan(1600);
  });
  it("a 60% vs 50% win rate resolves in about a hundred trades", () => {
    const events = eventsToResolve(0.5, 0.6, 2);
    expect(events).toBeGreaterThan(90);
    expect(events).toBeLessThan(150);
  });
  it("a proper one-sided test needs more", () => {
    expect(eventsForTest(0.0338, 0.0252, 0.05, 0.8)).toBeGreaterThan(eventsToResolve(0.0252, 0.0338, 2));
  });
  it("finds when the band clears break-even", () => {
    const nStar = eventsUntilUpperBelow(0.02945, 0.0338, 2);
    expect(nStar).not.toBeNull();
    expect(nStar!).toBeGreaterThan(3000);
    expect(nStar!).toBeLessThan(12000);
  });
  it("reads a record either way", () => {
    const bin = recordStats([0, 0, 1, 0, 0, 0, 0, 0, 0, 0], b, 2)!;
    expect(bin.kind).toBe("binary");
    expect(bin.rate).toBeCloseTo(0.1, 10);
    const pnl = recordStats([0.035, 0.035, -1, 0.035, -0.4], b, 2)!;
    expect(pnl.kind).toBe("pnl");
    const mean = (0.035 * 3 - 1 - 0.4) / 5;
    expect(pnl.rate).toBeCloseTo((b - mean) / (1 + b), 10);
    expect(parseNumberList("# comment\n0\n1\nx\n2.5, 7\n")).toEqual([0, 1, 7]);
  });
});

describe("wing rates (section 4)", () => {
  const base = { strikeDistance: 2, wingWidth: 0.5, creditFraction: 0.0338, moveDist: "normal" as const, tailDf: 4, realizedRatio: 1 };
  it("orders breach > effective > full gap", () => {
    const r = wingRates(base);
    expect(r.breach).toBeGreaterThan(r.effective);
    expect(r.effective).toBeGreaterThan(r.fullGap);
    expect(r.breach).toBeCloseTo(1 - normalCdf(2), 6);
    expect(r.gainPerUnit).toBeCloseTo(0.035, 3);
    expect(r.fairRate).toBeCloseTo(breakEvenLossRate(r.gainPerUnit), 10);
  });
  it("student-t with unit variance has fatter tails than normal", () => {
    const nr = wingRates({ ...base, strikeDistance: 2.5 });
    const st = wingRates({ ...base, strikeDistance: 2.5, moveDist: "student" });
    expect(st.breach).toBeGreaterThan(nr.breach);
  });
  it("solves the fair realized ratio", () => {
    const s = fairRealizedRatio(base);
    expect(s).not.toBeNull();
    expect(wingRates({ ...base, realizedRatio: s! }).effective).toBeCloseTo(base.creditFraction, 6);
  });
  it("solves the realized ratio for any target loss rate", () => {
    for (const q of [0.01, q55, 0.0338, 0.05]) {
      const s = ratioForLossRate(q, base);
      expect(s).not.toBeNull();
      expect(wingRates({ ...base, realizedRatio: s! }).effective).toBeCloseTo(q, 7);
    }
    // Above break-even the ratio must exceed 1 (the chain under-priced the move); below, the reverse.
    expect(ratioForLossRate(q55, base)!).toBeGreaterThan(1);
    expect(ratioForLossRate(0.01, base)!).toBeLessThan(1);
    // The fair ratio is the special case q = c/W.
    expect(ratioForLossRate(base.creditFraction, base)).toBeCloseTo(fairRealizedRatio(base)!, 12);
    // No solution in range: a rate no realized sigma in [0.3, 4] can produce.
    expect(ratioForLossRate(0.9, base)).toBeNull();
    expect(ratioForLossRate(1e-14, base)).toBeNull();
  });
  it("defaults the wing so its effective rate equals the deck's q", () => {
    const wp = { strikeDistance: DEFAULT_PARAMS.strikeDistance, wingWidth: DEFAULT_PARAMS.wingWidth, creditFraction: DEFAULT_PARAMS.creditFraction, moveDist: DEFAULT_PARAMS.moveDist, tailDf: DEFAULT_PARAMS.tailDf, realizedRatio: DEFAULT_PARAMS.realizedRatio };
    expect(wingRates(wp).effective).toBeCloseTo(DEFAULT_PARAMS.lossRate, 9);
    expect(DEFAULT_PARAMS.realizedRatio).toBeGreaterThan(1);
    expect(DEFAULT_PARAMS.realizedRatio).toBeLessThan(1.5);
    // The default survives its own sanitizer unchanged.
    expect(sanitizeParams(DEFAULT_PARAMS)).toEqual(DEFAULT_PARAMS);
  });
  it("uses an empirical sample", () => {
    const sample = [0, 0.5, -1, 2.2, 2.6, 3, 1.9, -0.4];
    const r = wingRates({ ...base, moveDist: "empirical", sample });
    expect(r.breach).toBeCloseTo(3 / 8, 10);
    expect(r.fullGap).toBeCloseTo(2 / 8, 10);
    expect(r.effective).toBeCloseTo((0.4 + 1 + 1) / 8, 10);
  });
});

describe("diversification within one season (section 5)", () => {
  const base = { gain: b, lossRate: q55, sharedOutcome: 0 };
  it("single name all-in: binary at 1.99 or 0", () => {
    const d = scheduleDistribution([{ nights: n, policy: { ...base, names: 1, riskPerName: 1 } }]);
    const s = summarize(d);
    expect(d.method).toBe("exact");
    expect(s.mean).toBeCloseTo(1.095, 2);
    expect(s.pRuin).toBeCloseTo(0.45, 2);
    expect(s.median).toBeCloseTo(1.99, 2);
    expect(s.pBelow).toBeCloseTo(0.45, 2);
    expect(s.expLog).toBeCloseTo(n * Math.log(1 + b), 6);
  });
  it("three names at a third each: same mean, median below 1, ruin ~0.05%", () => {
    const d = scheduleDistribution([{ nights: n, policy: { ...base, names: 3, riskPerName: 1 / 3 } }]);
    const s = summarize(d);
    expect(d.method).toBe("exact");
    expect(s.mean).toBeCloseTo(1.095, 2);
    expect(s.median).toBeCloseTo(0.88, 1);
    expect(s.pBelow).toBeCloseTo(0.12, 1);
    expect(s.pRuin).toBeCloseTo(0.0005, 3);
    expect(s.pMax).toBeCloseTo(0.17, 1);
  });
  it("half single-name nights at full tranche brings ruin back to 26%", () => {
    const d = scheduleDistribution([
      { nights: 10, policy: { ...base, names: 1, riskPerName: 1 } },
      { nights: 10, policy: { ...base, names: 3, riskPerName: 1 / 3 } },
    ]);
    expect(summarize(d).pRuin).toBeCloseTo(0.26, 1);
  });
  it("capping single-name nights at a third: ruin 0.03%, mean 1.06", () => {
    const d = scheduleDistribution([
      { nights: 10, policy: { ...base, names: 1, riskPerName: 1 / 3 } },
      { nights: 10, policy: { ...base, names: 3, riskPerName: 1 / 3 } },
    ]);
    const s = summarize(d);
    expect(s.pRuin).toBeCloseTo(0.0003, 3);
    expect(s.mean).toBeCloseTo(1.06, 2);
  });
  it("monte carlo and the binned engine agree with exact", () => {
    const blocks = [{ nights: n, policy: { ...base, names: 3, riskPerName: 1 / 3 } }];
    const exact = summarize(scheduleDistribution(blocks));
    const mc = summarize(scheduleDistribution(blocks, { engine: "montecarlo", mcPaths: 40_000, seed: 7 }));
    expect(mc.method).toBe("montecarlo");
    expect(mc.mean).toBeCloseTo(exact.mean, 1);
    expect(mc.median).toBeCloseTo(exact.median, 1);
    const binned = summarize(scheduleDistribution(blocks, { maxCompositions: 1 }));
    expect(binned.method).toBe("binned");
    expect(binned.mean).toBeCloseTo(exact.mean, 3);
    expect(binned.median).toBeCloseTo(exact.median, 2);
    expect(binned.pBelow).toBeCloseTo(exact.pBelow, 2);
    expect(binned.pRuin).toBeCloseTo(exact.pRuin, 5);
  });
  it("binned snapshots line up with a fresh run", () => {
    const blocks = [{ nights: 2 * n, policy: { ...base, names: 3, riskPerName: 1 / 6 } }];
    const snaps = binnedDistributions(blocks, [n]);
    expect(snaps).toHaveLength(2);
    const one = summarize(binnedDistributions([{ nights: n, policy: blocks[0].policy }])[0]);
    expect(summarize(snaps[0]).median).toBeCloseTo(one.median, 6);
  });
});

describe("correlation (section 6)", () => {
  it("joint loss is dominated by the shared-cause term past c = q^2", () => {
    expect(crossoverSharedOutcome(q55, 3)).toBeCloseTo(0.00087, 4);
    expect(ruinPerSeason(jointLossProb(q55, 3, 0), n)).toBeCloseTo(0.0005, 3);
    expect(ruinPerSeason(jointLossProb(q55, 3, 0.02), n)).toBeCloseTo(0.012, 2);
    expect(ruinPerSeason(jointLossProb(q55, 3, 0.05), n)).toBeCloseTo(0.03, 2);
    expect(ruinPerSeason(jointLossProb(q55, 3, 0.2), n)).toBeCloseTo(0.11, 2);
  });
  it("a 30% vol shock takes a 3-sigma breach from 0.27% to 2.1%", () => {
    expect(breachBeyond(3, 1)).toBeCloseTo(0.0027, 4);
    expect(breachBeyond(3, 1.3)).toBeCloseTo(0.021, 3);
  });
});

describe("growth figures", () => {
  it("median growth per season is median_N^(1/N) − 1", () => {
    expect(medianGrowthPerSeason(1.09, 4)).toBeCloseTo(Math.pow(1.09, 0.25) - 1, 12);
    expect(medianGrowthPerSeason(1.09, 4)).toBeCloseTo(0.0218, 3);
    expect(medianGrowthPerSeason(0.92, 4)).toBeCloseTo(-0.0206, 3);
    expect(medianGrowthPerSeason(1.5, 1)).toBeCloseTo(0.5, 12);
    expect(medianGrowthPerSeason(0, 4)).toBe(-1);
    expect(medianGrowthPerSeason(1.09, 0)).toBeNaN();
  });
  it("differs from the log growth of surviving paths", () => {
    // The coin after four seasons: survivors compound at the clean rate while the median is zero.
    const d = scheduleDistribution([{ nights: 4 * n, policy: { gain: b, lossRate: q55, sharedOutcome: 0, names: 1, riskPerName: 1 } }]);
    const s = summarize(d);
    expect(s.expLog / 4).toBeCloseTo(n * Math.log(1 + b), 6);
    expect(medianGrowthPerSeason(s.median, 4)).toBe(-1);
  });
});

describe("market switch", () => {
  it("fair sets q to break-even, discussion to the 55% clean season", () => {
    const p = { gain: b, nights: n };
    expect(marketLossRate("fair", p)).toBeCloseTo(breakEvenLossRate(b), 12);
    expect(marketLossRate("discussion", p)).toBeCloseTo(lossRateFromPClean(DISCUSSION_P_CLEAN, n), 12);
    expect(marketPatch("fair", p)).toEqual({ market: "fair", lossRate: breakEvenLossRate(b) });
    expect(marketPatch("custom", p)).toEqual({ market: "custom" });
  });
  it("reads the deck's q back as fair, discussion or custom", () => {
    expect(marketOf(DEFAULT_PARAMS)).toBe("discussion");
    expect(marketOf({ ...DEFAULT_PARAMS, lossRate: breakEvenLossRate(b) })).toBe("fair");
    expect(marketOf({ ...DEFAULT_PARAMS, lossRate: 0.0338 })).toBe("fair");
    expect(marketOf({ ...DEFAULT_PARAMS, lossRate: 0.0252 })).toBe("custom");
    expect(marketOf({ ...DEFAULT_PARAMS, nights: 30 })).toBe("custom");
    expect(DEFAULT_PARAMS.market).toBe("discussion");
    expect(sanitizeParams({ market: "nonsense" }).market).toBe("discussion");
    expect(sanitizeParams({ market: "fair" }).market).toBe("fair");
  });
});

describe("policies", () => {
  it("are named from one source, without letters", () => {
    const pols = policies(DEFAULT_PARAMS);
    expect(pols.map((x) => x.id)).toEqual(POLICY_IDS);
    expect(pols.map((x) => x.name)).toEqual(["Coin", "Spread", "Spread + reserve"]);
    expect(pols.map((x) => x.color)).toEqual(["a", "b", "c"]);
    expect(policyLabel("reserve", DEFAULT_PARAMS)).toBe("Spread + reserve (3 names, 50% a night)");
    expect(policyLabel("spread", { ...DEFAULT_PARAMS, names: 1 })).toBe("Spread (1 name, whole tranche)");
    for (const x of pols) expect(x.label).not.toMatch(/\b[ABC]\b/);
    expect(POLICY_META.coin.name).toBe("Coin");
  });
});

describe("kelly and breadth (section 7)", () => {
  it("f* = p − q/b", () => {
    expect(kellyFraction(q55, b)).toBeCloseTo(0.13, 2);
    expect(kellyFraction(0.0252, b)).toBeCloseTo(0.25, 2);
    expect(kellyFraction(0.032, b)).toBeCloseTo(0.054, 2);
  });
  it("breadth table: 0.6%, 1.9%, 3.1% per season", () => {
    const rows = breadthTable(q55, b, n, 5);
    expect(rows[0].growthCapped).toBeCloseTo(0.006, 3);
    expect(rows[2].growthCapped).toBeCloseTo(0.019, 2);
    expect(rows[4].growthCapped).toBeCloseTo(0.031, 2);
  });
  it("capital ceiling binds at five names and the optimistic rate", () => {
    const rows = breadthTable(0.0252, b, n, 5);
    expect(rows[4].capBinds).toBe(true);
    expect(rows[4].fractionPerName).toBeCloseTo(0.2, 6);
    expect(rows[2].capBinds).toBe(false);
  });
});

describe("growth conventions and robust sizing (section 8)", () => {
  const base = { gain: b, lossRate: q55, sharedOutcome: 0 };
  it("log growth grid matches the discussion", () => {
    expect(seasonLogGrowth(0.39, 3, q55, b, n)).toBeCloseTo(0.019, 2);
    expect(seasonLogGrowth(0.5, 3, q55, b, n)).toBeCloseTo(0.017, 2);
    expect(seasonLogGrowth(0.75, 3, q55, b, n)).toBeCloseTo(-0.001, 3);
    expect(seasonLogGrowth(1.0, 3, q55, b, n)).toBeCloseTo(-0.041, 2);
    expect(seasonLogGrowth(1.0, 3, 0.032, b, n)).toBeCloseTo(-0.107, 2);
    expect(seasonLogGrowth(0.75, 3, 0.0252, b, n)).toBeCloseTo(0.074, 3);
  });
  it("growth is conditional on survival and ruin is reported beside it", () => {
    const coin = nightDist({ ...base, names: 1, riskPerName: 1 });
    expect(nightRuin(coin)).toBeCloseTo(q55, 12);
    expect(nightLogGrowth(coin)).toBeCloseTo(Math.log(1 + b), 12);
    expect(seasonRuin(1, 1, q55, b, n)).toBeCloseTo(0.45, 2);
    const safe = nightDist({ ...base, names: 3, riskPerName: 1 / 6 });
    expect(nightRuin(safe)).toBe(0);
  });
  it("the robust optimum sits below the single-rate optimum", () => {
    const band = uniformBand(0.0252, breakEvenLossRate(b));
    const robust = robustOptimum(3, band, b, n);
    const single = nightOptimum(3, q55, b, n);
    expect(robust.risk).toBeGreaterThan(0.2);
    expect(robust.risk).toBeLessThan(0.6);
    expect(single.risk).toBeGreaterThan(0.3);
    expect(robustSeasonLogGrowth(robust.risk, 3, band, b, n)).toBeGreaterThanOrEqual(robustSeasonLogGrowth(0.5, 3, band, b, n) - 1e-12);
    const post = betaPosterior(3, 97);
    expect(post.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 10);
  });
  it("four seasons: single-name mean 1.44, ruin 91%", () => {
    const d = scheduleDistribution([{ nights: 4 * n, policy: { ...base, names: 1, riskPerName: 1 } }]);
    const s = summarize(d);
    expect(s.mean).toBeCloseTo(1.44, 1);
    expect(s.pRuin).toBeCloseTo(0.91, 2);
    expect(s.median).toBe(0);
  });
  it("four seasons, three names whole tranche: mean 1.44, median ~0.92, p10 ~0.18", () => {
    const d = scheduleDistribution([{ nights: 4 * n, policy: { ...base, names: 3, riskPerName: 1 / 3 } }], { maxCompositions: 60_000 });
    const s = summarize(d);
    expect(d.method).toBe("binned");
    expect(s.mean).toBeCloseTo(1.44, 1);
    expect(s.median).toBeGreaterThan(0.85);
    expect(s.median).toBeLessThan(1.0);
    expect(s.p10).toBeGreaterThan(0.12);
    expect(s.p10).toBeLessThan(0.25);
    expect(s.pBelow).toBeGreaterThan(0.25);
    expect(s.pBelow).toBeLessThan(0.36);
    expect(s.pRuin).toBeCloseTo(0.002, 3);
  });
  it("four seasons, three names half tranche: mean 1.20, median ~1.09", () => {
    const d = scheduleDistribution([{ nights: 4 * n, policy: { ...base, names: 3, riskPerName: 1 / 6 } }]);
    const s = summarize(d);
    expect(s.mean).toBeCloseTo(1.2, 1);
    expect(s.median).toBeGreaterThan(1.03);
    expect(s.median).toBeLessThan(1.15);
    expect(s.pBelow).toBeLessThan(0.1);
  });
});

describe("refilling from NAV (section 8)", () => {
  it("log growth of NAV at a share f: E[log(1 − f + f·X)]", () => {
    // p = 0.6, X ∈ {0, 2}, f = 0.2: 0.6·ln 1.2 + 0.4·ln 0.8 = 0.6·0.1823216 − 0.4·0.2231436 = 0.1093929 − 0.0892574 = 0.0201355
    expect(navLogGrowth(0.2, coinOutcomes(0.6, 2))).toBeCloseTo(0.0201355, 6);
    // p = 0.55, f = 0.1: 0.55·ln 1.1 + 0.45·ln 0.9 = 0.0524206 − 0.0474122 = 0.0050084
    expect(navLogGrowth(0.1, coinOutcomes(0.55, 2))).toBeCloseTo(0.0050084, 6);
    expect(navLogGrowth(0, coinOutcomes(0.55, 2))).toBe(0);
    // The whole NAV on a season that can end at zero: log(0).
    expect(navLogGrowth(1, coinOutcomes(0.55, 2))).toBe(-Infinity);
    // Slope at f = 0 is the mean minus one: 0.6·2 − 1 = 0.2.
    expect(navLogGrowthSlope(0, coinOutcomes(0.6, 2))).toBeCloseTo(0.2, 12);
  });
  it("the growth-optimal share of a double-or-nothing is 2p − 1", () => {
    expect(navKellyShare(coinOutcomes(0.6, 2))).toBeCloseTo(0.2, 6);
    expect(navKellyShare(coinOutcomes(0.55, 2))).toBeCloseTo(0.1, 6);
    expect(navKellyShare(coinOutcomes(0.5, 2))).toBe(0);
    expect(navKellyShare(coinOutcomes(0.45, 2))).toBe(0);
    expect(doubleOrNothingShare(0.55)).toBeCloseTo(0.1, 12);
    expect(doubleOrNothingShare(0.45)).toBe(0);
    // Two points {0, X}: f* = p − (1 − p)/(X − 1). At X = 1.99, p = 0.55: 0.55 − 0.45/0.99 = 0.0954545.
    expect(twoPointShare(0.55, 1.99)).toBeCloseTo(0.0954545, 6);
    expect(navKellyShare(coinOutcomes(0.55, 1.99))).toBeCloseTo(twoPointShare(0.55, 1.99), 6);
    // No ruin possible, X ∈ {0.5, 2} at even odds: slope 0 where 0.5(1 − 0.5f) = 0.25(1 + f), f = 0.5.
    expect(navKellyShare([{ value: 0.5, prob: 0.5 }, { value: 2, prob: 0.5 }])).toBeCloseTo(0.5, 6);
    // X always above one: the share is capped at the whole NAV.
    expect(navKellyShare([{ value: 1.2, prob: 1 }])).toBe(1);
  });
});

describe("railroad schematic (section 7)", () => {
  it("stations outside the log, tracks inside, widths from the share at risk", () => {
    // 3 names at 1/6 of the tranche each: half the tranche at risk a night, half in reserve.
    const r = railroad({ names: 3, riskPerName: 1 / 6, gain: b, lossRate: q55, sharedOutcome: 0 }, n);
    expect(r.nights).toBe(20);
    expect(r.names).toBe(3);
    expect(r.trackShare).toBeCloseTo(1 / 6, 12);
    expect(r.totalAtRisk).toBeCloseTo(0.5, 12);
    expect(r.reserveShare).toBeCloseTo(0.5, 12);
    expect(r.nameEvents).toBe(60);
    // Station factors 1 + f((k − j)b − j): j = 0: 1 + 0.105/6 = 1.0175; j = 1: 1 + (0.07 − 1)/6 = 0.845; j = 2: 1 + (0.035 − 2)/6 = 0.6725; j = 3: 1 − 3/6 = 0.5.
    expect(r.factors.map((x) => x.factor)).toEqual([expect.closeTo(1.0175, 10), expect.closeTo(0.845, 10), expect.closeTo(0.6725, 10), expect.closeTo(0.5, 10)]);
    // ln 1.0175 = 0.0173486.
    expect(r.cleanLog).toBeCloseTo(0.0173486, 6);
    // A clean station then a one-loss station: ln(1.0175 · 0.845) = ln 0.8597875 = −0.15107.
    expect(stationLogSum([1.0175, 0.845])).toBeCloseTo(-0.15107, 4);
    expect(stationLogSum([1.0175, 0])).toBe(-Infinity);
    // A per-name share above 1/k is clipped to the tranche.
    expect(railroad({ names: 2, riskPerName: 0.8, gain: b, lossRate: q55, sharedOutcome: 0 }, 5).reserveShare).toBe(0);
  });
});

describe("a season by the calendar (section 7)", () => {
  const f13 = 0.13;
  it("normalises the histogram and sizes each night at the capped Kelly fraction", () => {
    expect(normalizeShares([1, 1, 2, 0, 0, 0])).toEqual([0.25, 0.25, 0.5, 0, 0, 0]);
    expect(normalizeShares([0, 0, 0])).toEqual([1, 0, 0, 0, 0, 0]);
    expect(normalizeShares([0.2, -1, 0.2])).toEqual([0.5, 0, 0.5, 0, 0, 0]);
    // f* = 25% and five names want 125%: the cap takes each to 20%.
    expect(cappedFraction(0.25, 5)).toBeCloseTo(0.2, 12);
    expect(cappedFraction(f13, 3)).toBe(f13);
    expect(capitalUsed(3, f13)).toBeCloseTo(0.39, 12);
    expect(capitalUsed(5, 0.25)).toBeCloseTo(1, 12);
    expect(capitalUsed(0, f13)).toBe(0);
  });
  it("the median night is where the cumulative share reaches one half", () => {
    // Shares 20/30/50: cumulative 0.2, 0.5 → one name.
    expect(medianNames([0.2, 0.3, 0.5, 0, 0, 0])).toBe(1);
    // Shares 10/20/30/40: cumulative 0.1, 0.3, 0.6 → two names, capital 2 × 13% = 26%.
    expect(medianNames([0.1, 0.2, 0.3, 0.4, 0, 0])).toBe(2);
    expect(medianCapitalUsed([0.1, 0.2, 0.3, 0.4, 0, 0], f13)).toBeCloseTo(0.26, 12);
    expect(medianNames([0.5, 0.5, 0, 0, 0, 0])).toBe(0);
    // Default-like histogram 25/25/20/15/10/5: mean names 0.25 + 0.4 + 0.45 + 0.4 + 0.25 = 1.75; capital 0.13 × 1.75 = 0.2275.
    const m = calendarMeans([0.25, 0.25, 0.2, 0.15, 0.1, 0.05], f13);
    expect(m.names).toBeCloseTo(1.75, 12);
    expect(m.capital).toBeCloseTo(0.2275, 12);
  });
  it("empty days add no term to the sum of logs", () => {
    // Every night one name: the breadth table's first row, 0.6% a season.
    const one = calendarExpectedLogGrowth([0, 1, 0, 0, 0, 0], n, q55, b);
    expect(one).toBeCloseTo(breadthTable(q55, b, n, 1)[0].growthCapped, 12);
    expect(one).toBeCloseTo(0.006, 3);
    // Every night three names: 1.9%.
    const three = calendarExpectedLogGrowth([0, 0, 0, 1, 0, 0], n, q55, b);
    expect(three).toBeCloseTo(0.019, 2);
    // Half the nights empty, half with three names: exactly half of that.
    expect(calendarExpectedLogGrowth([0.5, 0, 0, 0.5, 0, 0], n, q55, b)).toBeCloseTo(0.5 * three, 12);
  });
  it("samples a seeded calendar with weeks of five trading days", () => {
    // No losses, three names a night, q = 0 makes f* = 1 and the cap takes it to 1/3: each night ×1.035, 20 nights → ln = 20 × 0.0344014 = 0.68803.
    const cal = sampleCalendar([0, 0, 0, 1, 0, 0], n, 0, b, 1);
    expect(cal).toHaveLength(20);
    expect(cal.every((d) => d.names === 3 && d.losses === 0)).toBe(true);
    expect(cal[0].fraction).toBeCloseTo(1 / 3, 12);
    expect(cal[0].capital).toBeCloseTo(1, 12);
    expect(cal[0].factor).toBeCloseTo(1.035, 12);
    expect(cal[19].cumLog).toBeCloseTo(0.68803, 5);
    expect(cal[19].expectedCumLog).toBeCloseTo(0.68803, 5);
    expect(cal[4]).toMatchObject({ day: 5, week: 0, weekday: 4 });
    expect(cal[5]).toMatchObject({ day: 6, week: 1, weekday: 0 });
    // The same seed draws the same calendar; a mixed histogram draws every count it allows.
    const mixed = [0.25, 0.25, 0.2, 0.15, 0.1, 0.05];
    const a = sampleCalendar(mixed, 200, q55, b, 42).map((d) => d.names);
    expect(sampleCalendar(mixed, 200, q55, b, 42).map((d) => d.names)).toEqual(a);
    expect(new Set(a).size).toBeGreaterThanOrEqual(5);
    for (const d of sampleCalendar(mixed, 200, q55, b, 42)) expect(d.capital).toBeCloseTo(d.names * kellyFraction(q55, b), 12);
  });
});

describe("wing width and partial losses (section 4)", () => {
  const base = { strikeDistance: 2, wingWidth: 0.5, creditFraction: 0.0338, moveDist: "normal" as const, tailDf: 4, realizedRatio: 1 };
  it("one event multiplies the tranche by 1 + (r − payout)/(1 − r)", () => {
    // r = 0.5 (b = 1): worthless wing doubles, payout 0.75 halves, full gap wipes.
    expect(eventMultiplier(0, 0.5)).toBe(2);
    expect(eventMultiplier(0.75, 0.5)).toBeCloseTo(0.5, 12);
    expect(eventMultiplier(1, 0.5)).toBe(0);
    // The discussion's wing: 1 + 0.0338/0.9662 = 1.034982, which is 1 + b.
    expect(eventMultiplier(0, 0.0338)).toBeCloseTo(1.034982, 6);
    expect(eventMultiplier(0, 0.0338)).toBeCloseTo(1 + wingRates(base).gainPerUnit, 12);
  });
  it("enumerates two events exactly: ×2 at 80%, ×0.5 at 10%, ruin at 10%", () => {
    const levels = [
      { factor: 2, prob: 0.8 },
      { factor: 0.5, prob: 0.1 },
      { factor: 0, prob: 0.1 },
    ];
    // Ends: 4 (0.8² = 0.64), 1 (2·0.8·0.1 = 0.16), 0.25 (0.1² = 0.01), 0 (the rest, 0.19).
    const d = levelsDistribution(levels, 2);
    expect(d.method).toBe("exact");
    expect(d.outcomes.map((o) => o.value)).toEqual([0, expect.closeTo(0.25, 12), expect.closeTo(1, 12), expect.closeTo(4, 12)]);
    expect(d.outcomes.map((o) => o.prob)).toEqual([expect.closeTo(0.19, 12), expect.closeTo(0.01, 12), expect.closeTo(0.16, 12), expect.closeTo(0.64, 12)]);
    // Mean (0.8·2 + 0.1·0.5)² = 1.65² = 2.7225.
    expect(summarize(d).mean).toBeCloseTo(2.7225, 10);
    // Bad seasons end at 0.25 (0.01) or 0 (0.19): one in twenty is partial.
    expect(partialShareOfBadSeasons(d)).toBeCloseTo(0.05, 12);
    expect(partialShareOfBadSeasons({ outcomes: [{ value: 2, prob: 1 }], method: "exact", nights: 1 })).toBeNull();
    // Twenty events: the binned recursion keeps the ruin mass exact, 1 − 0.9^20 = 0.878423, and here lands on the same bins as the exact answer.
    const exact = levelsDistribution(levels, 20);
    const binned = levelsDistribution(levels, 20, 1);
    expect(exact.method).toBe("exact");
    expect(binned.method).toBe("binned");
    expect(summarize(exact).pRuin).toBeCloseTo(0.878423, 6);
    expect(summarize(binned).pRuin).toBeCloseTo(0.878423, 6);
    expect(Math.abs(summarize(binned).mean / summarize(exact).mean - 1)).toBeLessThan(1e-6);
    expect(summarize(binned).median).toBeCloseTo(summarize(exact).median, 6);
  });
  it("discretises the payout so its mean is the wing's effective rate", () => {
    // Normal, short strike 2σ, width 0.5σ: no breach Φ(2) = 0.977250, full gap 1 − Φ(2.5) = 0.006210.
    const lv = payoutLevels(base, 8);
    expect(lv).toHaveLength(10);
    expect(lv[0].prob).toBeCloseTo(0.97725, 5);
    expect(lv[9].prob).toBeCloseTo(0.00621, 5);
    expect(lv.reduce((s, l) => s + l.prob, 0)).toBeCloseTo(1, 10);
    expect(lv.reduce((s, l) => s + l.prob * l.payout, 0)).toBeCloseTo(wingRates(base).effective, 4);
    // Empirical sample: 8 moves, 3 beyond the short strike at payouts 0.4, 1, 1 (see the wing tests).
    const emp = payoutLevels({ ...base, moveDist: "empirical", sample: [0, 0.5, -1, 2.2, 2.6, 3, 1.9, -0.4] }, 4);
    expect(emp[0].prob).toBeCloseTo(5 / 8, 12);
    expect(emp[5].prob).toBeCloseTo(2 / 8, 12);
    expect(emp[2].prob).toBeCloseTo(1 / 8, 12);
  });
  it("wider wings make more of the bad seasons partial", () => {
    const share = (w: number) => partialShareOfBadSeasons(wingSeasonDistribution({ ...base, wingWidth: w }, n))!;
    const narrow = share(0.25);
    const mid = share(0.5);
    const wide = share(1);
    expect(narrow).toBeLessThan(mid);
    expect(mid).toBeLessThan(wide);
    expect(wide).toBeGreaterThan(0.5);
    // Season mean is the per-event mean to the 20th: (1 + (r − effective)/(1 − r))^20 = 1.5319; ten payout levels over
    // twenty events are too many compositions to enumerate, so this comes off the binned recursion (to about 1e-3).
    const r = wingRates(base);
    const d = wingSeasonDistribution(base, n);
    expect(d.method).toBe("binned");
    expect(summarize(d).mean).toBeCloseTo(Math.pow(1 + (base.creditFraction - r.effective) / (1 - base.creditFraction), n), 2);
    // Ruin needs every bad event to gap past the long strike, so it sits below the full-gap season rate.
    expect(summarize(d).pRuin).toBeLessThanOrEqual(1 - Math.pow(1 - r.fullGap, n) + 1e-9);
    expect(summarize(d).pRuin).toBeGreaterThan(0);
  });
});

describe("the 60% symmetric system (section 3)", () => {
  it("two trades at a 50% stake: 0.25, 0.75, 2.25 with binomial weights", () => {
    const d = symmetricSeasonDistribution(0.6, 0.5, 2);
    expect(d.outcomes.map((o) => o.value)).toEqual([expect.closeTo(0.25, 12), expect.closeTo(0.75, 12), expect.closeTo(2.25, 12)]);
    expect(d.outcomes.map((o) => o.prob)).toEqual([expect.closeTo(0.16, 12), expect.closeTo(0.48, 12), expect.closeTo(0.36, 12)]);
    // Mean 0.16·0.25 + 0.48·0.75 + 0.36·2.25 = 0.04 + 0.36 + 0.81 = 1.21 = (1 + 0.5·0.2)².
    expect(summarize(d).mean).toBeCloseTo(1.21, 12);
    expect(symmetricSeasonMean(0.6, 0.5, 2)).toBeCloseTo(1.21, 12);
    expect(summarize(d).median).toBeCloseTo(0.75, 12);
  });
  it("twenty trades at 5%: mean 1.01^20 = 1.2202, median at 12 wins 1.05^12 · 0.95^8 = 1.1914", () => {
    const s = summarize(symmetricSeasonDistribution(0.6, 0.05, n));
    expect(s.mean).toBeCloseTo(1.2202, 4);
    expect(s.median).toBeCloseTo(1.1914, 4);
    expect(s.pRuin).toBe(0);
  });
  it("Kelly for even money is 2p − 1, and a stake can be solved to match a season mean", () => {
    expect(symmetricKelly(0.6)).toBeCloseTo(0.2, 12);
    expect(symmetricKelly(0.5)).toBe(0);
    expect(evMatchingStake(1.21, 0.6, 2)).toBeCloseTo(0.5, 12);
    // The tranche's 1.095 over 20 trades at 60%: (1.095^(1/20) − 1)/0.2 = 0.0045480/0.2 = 0.02274.
    expect(evMatchingStake(1.095, 0.6, n)).toBeCloseTo(0.02274, 5);
    expect(evMatchingStake(1, 0.6, n)).toBeNull();
    expect(evMatchingStake(1.2, 0.5, n)).toBeNull();
  });
});
