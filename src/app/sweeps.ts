/**
 * This explainer's sweep adapter: the kit's sweep engine asks it for an input's
 * context (bounds, default, origin, the anchors the schema declares and their values
 * from src/app/sweepAnchors.ts), how the input reads, and whether a build has
 * rendered (BUILD_SETTLED). Passed to <KitProvider sweeps> and, as a planner, to the store.
 */
import { isSweepable } from "@kit/inputs/schema";
import type { SweepAdapter } from "@kit/sweeps/adapter";
import { BUILD_SETTLED } from "@app/build";
import type { Params } from "@app/model/params";
import { SCHEMA } from "@app/data/schema";
import { sweepContext, sweepFormat } from "@app/sweepAnchors";

export const SWEEPS: SweepAdapter = {
  context(key, params: Params, at) {
    const def = SCHEMA.byKey[key];
    if (!def || !isSweepable(def)) return null;
    return sweepContext(def, { params, origin: at.origin, current: at.current, deck: BUILD_SETTLED.latest?.deck ?? null });
  },
  format: (key) => sweepFormat(SCHEMA.byKey[key]),
  settledSince: (t) => BUILD_SETTLED.settledSince(t),
};
