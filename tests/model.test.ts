import { describe, expect, it } from "vitest";
import { breakEvenLossRate, cleanEnd, lossRateFromPClean, pCleanFromLossRate, seasonMean } from "../src/model/binary";
import { eventsForTest, eventsToResolve, eventsUntilUpperBelow, parseNumberList, recordStats } from "../src/model/calibration";
import { breachBeyond, crossoverSharedOutcome, jointLossProb, ruinPerSeason } from "../src/model/correlation";
import { betaPosterior, breadthTable, kellyFraction, nightOptimum, robustOptimum, robustSeasonLogGrowth, seasonLogGrowth, seasonRuin, uniformBand } from "../src/model/kelly";
import { binnedDistributions, nightDist, nightLogGrowth, nightRuin, scheduleDistribution, summarize } from "../src/model/season";
import { normalCdf, normalQuantile, studentTCdf } from "../src/model/stats";
import { fairRealizedRatio, wingRates } from "../src/model/wing";

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
