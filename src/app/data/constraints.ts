/**
 * The relations the model implies among this explainer's parameters, as a declarative
 * table the kit's solver runs (src/kit/state/constraints.ts) on every change the store
 * takes: while a parameter (or the clean-season probability) is locked, these say what
 * else moves with a change, and which changes are refused.
 *
 *   clean-season   p = (1 − q)^n among q, p and n
 *   market         Fair market ⇒ q = b ÷ (1 + b); Discussion case ⇒ q such that p = 55% at n
 *   calendar       the six calendar shares sum to 1 while one of them is locked
 *   sweep-range    a run on a parameter that becomes locked stops (the store enforces it)
 *
 * The finance is the model's (src/app/model); the words of the details are here.
 */
import { lossRateFromPClean, pCleanFromLossRate } from "@app/model/binary";
import { CALENDAR_SHARE_KEYS, marketLossRate, marketOf, type Market, type Params } from "@app/model/params";
import type { ConstraintSet, Relation, RelationContext } from "@kit/state/constraints";
import { pct, pct2 } from "@kit/charts/numbers";
import { DISCUSSION_P_CLEAN } from "./params";
import { POLICY_META } from "./policies";

/** The linked key of the clean-season probability: lockable, though it is not a parameter. */
export const P_CLEAN = "pClean";

export const MARKET_NAMES: Record<Market, string> = { fair: "Fair market", discussion: "Discussion case", custom: "Custom" };

/** The market the deck sits in: the stored choice when it is Custom, otherwise where q is. */
export function effectiveMarket(p: Params): Market {
  return p.market === "custom" ? "custom" : marketOf(p, DISCUSSION_P_CLEAN);
}

const TOL = 1e-9;
const close = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/**
 * (1) The clean-season identity p = (1 − q)^n, while p is locked. A change of n
 * re-solves q. A change of q re-solves n to whole nights in the direction q moved (q
 * up, n down) and puts q where p holds exactly at that n. Either is refused when the
 * key it would move is locked too, or would leave its range.
 */
const cleanSeason: Relation<Params> = {
  id: "clean-season",
  label: "Clean season",
  keys: [P_CLEAN, "lossRate", "nights"],
  describe: "With the clean season p locked, changing Nights per season n re-solves the Loss rate per name q, and changing q moves n by whole nights (and puts q where p holds); with q locked as well, n cannot move.",
  solve(ctx: RelationContext<Params>) {
    if (!ctx.locked(P_CLEAN)) return null;
    const { prev, next } = ctx;
    const p = pCleanFromLossRate(prev.lossRate, prev.nights);
    if (close(pCleanFromLossRate(next.lossRate, next.nights), p)) return null;
    const pName = ctx.label(P_CLEAN);
    if (ctx.changed("nights")) {
      if (ctx.pinned("lossRate")) return { conflict: `${pName} at ${pct(p)} and ${ctx.label("lossRate")} at ${pct2(next.lossRate)} leave ${ctx.label("nights")} no room`, by: ctx.locked("lossRate") ? "lossRate" : P_CLEAN };
      const q = lossRateFromPClean(p, next.nights);
      if (!ctx.inRange("lossRate", q)) return { conflict: `at ${next.nights} nights it would need q = ${pct2(q)}, outside its range`, by: P_CLEAN };
      return { set: { lossRate: q }, by: P_CLEAN };
    }
    // q moved and n did not: n follows in whole nights.
    if (ctx.pinned("nights")) return { conflict: `with ${ctx.label("nights")} fixed, q cannot move off ${pct2(prev.lossRate)}`, by: ctx.locked("nights") ? "nights" : P_CLEAN };
    const exact = Math.log(p) / Math.log(1 - next.lossRate);
    const up = next.lossRate > prev.lossRate;
    let n = up ? Math.floor(exact + 1e-9) : Math.ceil(exact - 1e-9);
    if (n === prev.nights) n += up ? -1 : 1;
    if (!Number.isFinite(n) || !ctx.inRange("nights", n)) return { conflict: `q = ${pct2(next.lossRate)} would need n outside its range`, by: P_CLEAN };
    const q = lossRateFromPClean(p, n);
    if (ctx.pinned("lossRate") && !close(q, next.lossRate)) return { conflict: `no whole number of nights keeps ${pName} at ${pct(p)} with q = ${pct2(next.lossRate)}`, by: P_CLEAN };
    if (!ctx.inRange("lossRate", q)) return { conflict: `it would need q = ${pct2(q)}, outside its range`, by: P_CLEAN };
    // A sweep or a story asks for q itself; the note says why it cannot have that value.
    // The notice names the lock already: "… Clean season (Coin) is locked (at 55%, q moves only …)".
    const note = `at ${pct(p)}, q moves only with whole nights of n`;
    return { set: ctx.pinned("lossRate") ? { nights: n } : { nights: n, lossRate: q }, by: P_CLEAN, note };
  },
};

/**
 * (2) The market identity. A change that picks a market state (the switch, a story)
 * takes q to that state's rate, and is refused when q cannot go there. While the market
 * is locked, its rule holds: on Fair market a change of b re-solves q, on the Discussion
 * case a change of n does; a change of q by hand is refused in both.
 */
const market: Relation<Params> = {
  id: "market",
  label: "Market",
  keys: ["market", "lossRate", "gain", "nights"],
  describe: "Fair market means q = b ÷ (1 + b) and the Discussion case a 55% clean season at n. With q locked, choosing either is refused. With the market locked on Fair, changing the Gain per unit risked b re-solves q (on the Discussion case, changing n does), and changing q by hand is refused.",
  solve(ctx) {
    const { next } = ctx;
    if (ctx.changed("market")) {
      const m = next.market;
      if (m === "custom") return null;
      // Only a lock makes this a rule: without one the change is taken as asked.
      const q = marketLossRate(m, next, DISCUSSION_P_CLEAN);
      if (close(next.lossRate, q, 1e-6) || !ctx.pinned("lossRate")) return null;
      const by = ctx.locked("lossRate") ? "lossRate" : ctx.locked(P_CLEAN) ? P_CLEAN : "lossRate";
      return { refuse: ["market", "lossRate"], by, detail: `${MARKET_NAMES[m]} needs q = ${pct2(q)}` };
    }
    if (!ctx.locked("market")) return null;
    const m = effectiveMarket(ctx.prev);
    if (m === "custom") return null;
    const q = marketLossRate(m, next, DISCUSSION_P_CLEAN);
    if (close(next.lossRate, q, 1e-12)) return null;
    const rule = m === "fair" ? "q = b ÷ (1 + b)" : `q gives a ${pct(DISCUSSION_P_CLEAN)} clean season at n`;
    const driver = m === "fair" ? "gain" : "nights";
    if (ctx.requested("lossRate") && !ctx.changed(driver)) return { refuse: ["lossRate"], by: "market", detail: `on ${MARKET_NAMES[m]}, ${rule}` };
    if (ctx.pinned("lossRate")) return { conflict: `on ${MARKET_NAMES[m]}, ${rule}, and ${ctx.label("lossRate")} cannot follow`, by: ctx.locked("lossRate") ? "lossRate" : "market" };
    return { set: { lossRate: q }, by: "market" };
  },
};

/**
 * (3) The calendar histogram while one of its shares is locked: the six shares sum to
 * 1. The share you edit takes its value (at most what the locked ones leave), the other
 * unlocked shares are rescaled in proportion to fill the rest, and a locked share keeps
 * its value. With every other share locked, the edit is refused.
 */
const calendar: Relation<Params> = {
  id: "calendar",
  label: "Calendar shares",
  keys: [...CALENDAR_SHARE_KEYS],
  describe: "While one of the six calendar shares (Empty nights … Nights with 5 names) is locked, the shares sum to 100%: the share you edit takes its value, the other unlocked shares are rescaled to fill the rest, and the locked ones hold.",
  solve(ctx) {
    const locked = CALENDAR_SHARE_KEYS.filter((k) => ctx.locked(k));
    if (!locked.length) return null;
    const { prev, next } = ctx;
    const edited = CALENDAR_SHARE_KEYS.filter((k) => ctx.requested(k) && ctx.changed(k));
    if (!edited.length) return null;
    const rest = CALENDAR_SHARE_KEYS.filter((k) => !ctx.locked(k) && !edited.includes(k));
    const held = locked.reduce((s, k) => s + next[k], 0);
    const free = Math.max(0, 1 - held);
    const want = edited.reduce((s, k) => s + next[k], 0);
    // With every other share locked, the edited one can only be what they leave.
    if (!rest.length) return Math.abs(want - free) > 1e-9 ? { refuse: edited, by: locked[0], detail: `the other shares are locked, so this one stays at ${pct(prev[edited[0]])}` } : null;
    const set: Partial<Params> = {};
    // The edited shares take at most what the locked ones leave.
    const scale = want > free ? free / want : 1;
    if (scale < 1) for (const k of edited) set[k] = next[k] * scale;
    const room = free - want * scale;
    const before = rest.reduce((s, k) => s + prev[k], 0);
    for (const k of rest) set[k] = before > 0 ? (prev[k] / before) * room : room / rest.length;
    return { set, by: locked[0], ...(scale < 1 ? { note: `the locked shares leave at most ${pct(free)}` } : {}) };
  },
};

export const CONSTRAINTS: ConstraintSet<Params> = {
  relations: [cleanSeason, market, calendar],
  linked: {
    [P_CLEAN]: { label: `Clean season (${POLICY_META.coin.name})`, short: "p", text: (p) => pct(pCleanFromLossRate(p.lossRate, p.nights)) },
  },
};

/** (4) The rule the store enforces itself, for the Guide: a sweep and a lock. */
export const SWEEP_RULE = {
  id: "sweep-range",
  label: "Sweeps",
  describe: "A locked parameter is never swept: a run on it stops when it is locked and Ctrl+Enter on it only says so. A run whose next value the locks refuse, or that a relation would put elsewhere (q while p is locked), stops there; a run on n while p is locked re-solves q at every value.",
};
