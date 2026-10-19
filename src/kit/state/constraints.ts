/**
 * Parameter locks and the relations among parameters: the generic solver. An app
 * declares its relations as data (this app: src/app/data/constraints.ts) and the store
 * runs every parameter change through `applyConstraints` before it holds it.
 *
 * A lock is state (`locks: { key: true }` in the store). A key is a parameter of the
 * schema, or a linked key the app names (a value computed from parameters, such as a
 * probability solved from two of them), which holds its value by the relations alone.
 *
 * Composition, in this order:
 *  1. A linked value the change was solved from (`via`) that is locked refuses the whole
 *     change.
 *  2. Each requested key whose value differs from the current one: refused when it is
 *     locked, kept otherwise. Unchanged keys drop out.
 *  3. The relations run in table order over the working change, each one whose keys
 *     were touched. A relation may move other keys too (`set`), refuse some of the
 *     requested ones (`refuse`), or find the change impossible (`conflict`). A key a
 *     relation sets is pinned for the other relations: they must not move it again (a
 *     relation that needs to says `conflict`), and neither may anyone move a locked key.
 *     Passes repeat until nothing moves.
 *  4. A refusal drops its keys from the request and the solve starts over without them;
 *     a conflict refuses every requested key. Cycle guard: a change that has not settled
 *     after `maxPasses` passes (default 8) is a conflict.
 *  5. `atomic` (a switch, a story, a linked value, an action, a sweep's next value): any
 *     refusal, or a relation moving a requested key off the value asked for, refuses the
 *     whole change (the relation's `note` says why).
 *
 * The result is the patch to apply and the refusals (each naming the lock that caused
 * it); the store applies the one and emits param:refused for the others. Pure, no
 * React: the build worker may import this file.
 */
import type { ParamSource } from "@kit/events/types";

/** key → true: the parameters (and linked keys) that hold their value. */
export type Locks = Record<string, true>;

/** A change that did not happen, and the lock that stopped it. */
export interface Refusal {
  key: string;
  /** "locked" when the key itself is locked; otherwise the id of the relation that refused it. */
  reason: string;
  /** The locked key that blocks the change (the key itself when it is locked). */
  by: string;
  /** One line on why, for the notice; empty for a plain lock. */
  detail?: string;
  /** The value asked for. */
  attempted?: unknown;
}

/** A key a relation moved, or a requested key it put elsewhere than asked. */
export interface Adjustment {
  key: string;
  from: unknown;
  to: unknown;
  /** The relation that moved it. */
  relation: string;
  /** The locked key it holds. */
  by: string;
  /** The relation's line on how the key may move, when it gave one. */
  note?: string;
}

export interface ConstraintOutcome<P> {
  /** What to apply: the requested keys that hold and what the relations moved with them. */
  patch: Partial<P>;
  refusals: Refusal[];
  adjusted: Adjustment[];
}

/** What a relation reads while it solves. `next` is the state the change would make. */
export interface RelationContext<P> {
  prev: P;
  next: P;
  source: ParamSource;
  /** The caller asked for this key (and it is still part of the change). */
  requested(key: string): boolean;
  /** The key's value in `next` differs from `prev`. */
  changed(key: string): boolean;
  locked(key: string): boolean;
  /** Locked, or set by another relation in this solve: this relation must not move it. */
  pinned(key: string): boolean;
  /** Inside the key's schema range (true for a key the schema does not know). */
  inRange(key: string, value: number): boolean;
  /** A key's name for the notices: the schema's label, or the linked key's. */
  label(key: string): string;
}

export type RelationResult<P> =
  /**
   * Move these keys too; `by` is the lock this holds. `note` says, in one line, how the
   * relation lets a key move (the detail of an all-or-nothing change it puts elsewhere).
   */
  | { set: Partial<P>; by: string; note?: string }
  /** Drop these requested keys from the change. */
  | { refuse: string[]; by: string; detail: string }
  /** The change cannot hold with the locks as they are: refuse all of it. */
  | { conflict: string; by: string }
  | null
  | undefined;

/** One relation the model implies among some parameters. */
export interface Relation<P> {
  id: string;
  /** Its name in the Guide. */
  label: string;
  /** Every key it ties: parameters and linked keys. It runs when one of them changes. */
  keys: string[];
  /** One line for the Guide: what it holds and when. */
  describe: string;
  solve(ctx: RelationContext<P>): RelationResult<P>;
}

/** A value computed from parameters that can be locked like one. */
export interface LinkedKey<P> {
  label: string;
  /** Its symbol ("p"). */
  short?: string;
  /** The value as the deck prints it, for the list of locks. */
  text?: (params: P) => string;
}

export interface ConstraintSet<P> {
  relations: Relation<P>[];
  linked?: Record<string, LinkedKey<P>>;
  /** Passes before a change that does not settle counts as a conflict. Default 8. */
  maxPasses?: number;
}

export interface ApplyOptions<P> {
  /** The relations (none: only the locks themselves apply). */
  set?: ConstraintSet<P>;
  /** The schema's definitions, for ranges and labels. */
  byKey?: Record<string, { label: string; min: number; max: number; unit?: string } | undefined>;
  /** All or nothing (see the header). */
  atomic?: boolean;
  /** The linked key the change was solved from: when it is locked, nothing changes. */
  via?: string;
}

const same = (a: unknown, b: unknown) => Object.is(a, b);

/** The label of a key: the schema's, the linked key's, or the key. */
export function keyLabel<P>(key: string, opts: Pick<ApplyOptions<P>, "set" | "byKey">): string {
  return opts.byKey?.[key]?.label ?? opts.set?.linked?.[key]?.label ?? key;
}

/**
 * Run a change through the locks and the relations. `prev` is the state now, `patch`
 * the change asked for, `locks` the locked keys and `source` who asks.
 */
export function applyConstraints<P extends object>(prev: P, patch: Partial<P>, locks: Locks, source: ParamSource, opts: ApplyOptions<P> = {}): ConstraintOutcome<P> {
  const valueOf = (o: object, k: string): unknown => (o as Record<string, unknown>)[k];
  const asked = Object.entries(patch as Record<string, unknown>);
  const relations = opts.set?.relations ?? [];
  const maxPasses = Math.max(1, opts.set?.maxPasses ?? 8);
  const label = (k: string) => keyLabel(k, opts);
  const refusals: Refusal[] = [];

  // 1. A locked linked value refuses the change solved from it.
  if (opts.via && locks[opts.via]) {
    return { patch: {}, refusals: [{ key: opts.via, reason: "locked", by: opts.via, attempted: undefined }], adjusted: [] };
  }

  // 2. The locks on the requested keys themselves.
  let request = new Map<string, unknown>();
  for (const [k, v] of asked) {
    if (same(valueOf(prev, k), v)) continue;
    if (locks[k]) refusals.push({ key: k, reason: "locked", by: k, attempted: v });
    else request.set(k, v);
  }
  const refuseAll = (by: string, reason: string, detail: string): ConstraintOutcome<P> => ({
    patch: {},
    refusals: [...refusals, ...[...request.keys()].map((k) => ({ key: k, reason, by, detail, attempted: request.get(k) }))],
    adjusted: [],
  });
  if (opts.atomic && refusals.length) {
    const first = refusals[0];
    return refuseAll(first.by, first.reason, first.detail ?? "");
  }

  // 3–4. The relations, restarted without whatever they refuse.
  for (let attempt = 0; attempt <= asked.length; attempt++) {
    const working = new Map(request);
    const setBy = new Map<string, string>();
    const adjusted: Adjustment[] = [];
    let refusedNow: { keys: string[]; by: string; detail: string; relation: string } | null = null;
    let settled = relations.length === 0;
    const next = () => ({ ...prev, ...Object.fromEntries(working) }) as P;

    for (let pass = 0; pass < maxPasses && !settled && !refusedNow; pass++) {
      let moved = false;
      for (const rel of relations) {
        const state = next();
        const changed = (k: string) => !same(valueOf(state, k), valueOf(prev, k));
        if (!rel.keys.some((k) => changed(k))) continue;
        const ctx: RelationContext<P> = {
          prev,
          next: state,
          source,
          requested: (k) => request.has(k),
          changed,
          locked: (k) => !!locks[k],
          pinned: (k) => !!locks[k] || (setBy.has(k) && setBy.get(k) !== rel.id),
          inRange: (k, v) => {
            const def = opts.byKey?.[k];
            return !def || (Number.isFinite(v) && v >= def.min - 1e-12 && v <= def.max + 1e-12);
          },
          label,
        };
        const res = rel.solve(ctx);
        if (!res) continue;
        /**
         * The change cannot hold: all of it when atomic; otherwise the requested keys this
         * relation ties (or, when it ties none of them, every requested key), then the
         * solve starts over without them.
         */
        const conflict = (by: string, detail: string): ConstraintOutcome<P> | null => {
          if (opts.atomic) return refuseAll(by, rel.id, detail);
          const tied = [...request.keys()].filter((k) => rel.keys.includes(k));
          refusedNow = { keys: tied.length ? tied : [...request.keys()], by, detail, relation: rel.id };
          return null;
        };
        if ("conflict" in res) {
          const done = conflict(res.by, res.conflict);
          if (done) return done;
          break;
        }
        if ("refuse" in res) {
          const keys = res.refuse.filter((k) => request.has(k));
          if (keys.length) {
            refusedNow = { keys, by: res.by, detail: res.detail, relation: rel.id };
            break;
          }
          continue;
        }
        for (const [k, v] of Object.entries(res.set as Record<string, unknown>)) {
          if (same(valueOf(state, k), v)) continue;
          const owner = setBy.get(k);
          const why = locks[k] ? { by: k, detail: `${label(k)} is locked` } : owner && owner !== rel.id ? { by: res.by, detail: `${label(k)} cannot satisfy both ${owner} and ${rel.id}` } : typeof v === "number" && !ctx.inRange(k, v) ? { by: res.by, detail: `${label(k)} would leave its range` } : null;
          if (why) {
            const done = conflict(why.by, why.detail);
            if (done) return done;
            break;
          }
          adjusted.push({ key: k, from: valueOf(state, k), to: v, relation: rel.id, by: res.by, ...(res.note ? { note: res.note } : {}) });
          setBy.set(k, rel.id);
          if (same(valueOf(prev, k), v)) working.delete(k);
          else working.set(k, v);
          moved = true;
        }
        if (refusedNow) break;
      }
      if (!moved && !refusedNow) settled = true;
    }

    if (refusedNow) {
      for (const k of refusedNow.keys) {
        refusals.push({ key: k, reason: refusedNow.relation, by: refusedNow.by, detail: refusedNow.detail, attempted: request.get(k) });
        request.delete(k);
      }
      if (opts.atomic) {
        const first = refusals[0];
        return refuseAll(first.by, first.reason, first.detail ?? "");
      }
      continue;
    }
    if (!settled) return refuseAll("", "cycle", "the relations among the locked parameters do not settle");

    // 5. All or nothing: a requested key the relations moved elsewhere refuses the change.
    if (opts.atomic) {
      const off = adjusted.find((a) => request.has(a.key) && !same(working.has(a.key) ? working.get(a.key) : valueOf(prev, a.key), request.get(a.key)));
      if (off) return refuseAll(off.by, off.relation, off.note ?? `${label(off.key)} cannot take the value asked for`);
    }
    return { patch: Object.fromEntries(working) as Partial<P>, refusals, adjusted };
  }
  return refuseAll("", "cycle", "the relations among the locked parameters do not settle");
}

/** Locks from untrusted input: known keys only, each `true`. */
export function sanitizeLocks(input: unknown, known: (key: string) => boolean): Locks {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Locks = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) if (v === true && known(k)) out[k] = true;
  return out;
}
