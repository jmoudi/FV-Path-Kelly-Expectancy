/**
 * The kit's events: what the store, the replayer, the router and the build say happened.
 * One discriminated map, event name → payload. An app extends it with its own events:
 *
 *   export interface AppEvents extends KitEvents { "market:switched": { from: Market; to: Market } }
 *
 * Worker-safe types only.
 */

/** Who changed a parameter. */
export type ParamSource =
  /** Typing, the wheel, the arrows, the drag, a select. */
  | "hand"
  /** A running sweep's tick, or ↺ before sweep. */
  | "sweep"
  /** A story chip, turned on or off. */
  | "story"
  /** A section's action ("take the deck to the fair rate"). */
  | "action"
  /** A state file imported. */
  | "import"
  /** A linked value solved back into its parameters (the clean-season field). */
  | "link"
  /** A switch that sets several parameters at once (the market switch). */
  | "switch"
  | "undo"
  | "redo"
  /** Reset to the defaults: one parameter (↺ default) or every one. */
  | "reset";

/** Why a run ended. */
export type SweepStopReason = "stop" | "restore" | "edit" | "undo" | "preset" | "import" | "reset" | "lock";

/** A route as the router reads it (kit/ui/route.ts `Route`). */
export interface RouteRef {
  page: string;
  id?: string;
  section?: string;
}

export type NoticeKind = "info" | "warn" | "error";

export interface Notice {
  kind: NoticeKind;
  text: string;
  /** How long it stays, ms (default 6000). */
  ttlMs?: number;
  /** A notice with the id of one on screen replaces it (and restarts its time) instead of stacking. */
  id?: string;
}

export interface KitEvents {
  /** One per parameter whose value changed, after the store holds the new value. */
  "param:changed": { key: string; from: unknown; to: unknown; source: ParamSource };
  /** A parameter (or a linked key) was locked or unlocked: the store's lockParam, unlockAll, an import that adds locks, resetEverything. */
  "param:locked": { key: string; locked: boolean };
  /**
   * A change was refused (a locked parameter, a relation among locked ones); `attempted`
   * is the value asked for. `reason` is "locked" when the key itself is locked, otherwise
   * the id of the relation that refused it; `by` names the locked key that blocks it and
   * `detail` says why in one line (kit/state/constraints.ts).
   */
  "param:refused": { key: string; reason: string; source: ParamSource; attempted?: unknown; by?: string; detail?: string };
  /** A run started, switched preset, or (`resumed`) continued after a pause. */
  "sweep:started": { key: string; presetId: string; resumed: boolean };
  "sweep:paused": { key: string };
  "sweep:stopped": { key: string; reason: SweepStopReason };
  /** The replayer committed the next value of a run (one per tick and run). */
  "sweep:stepped": { key: string; index: number; value: number };
  /** A story turned on; `before` holds the parameters it moved as they were, `after` as they are now (both empty for a chart-only story). */
  "story:applied": { chartId: string; storyId: string; label?: string; before: Record<string, unknown>; after: Record<string, unknown> };
  /** A story turned off (clicked again, replaced, reset, or another deck-moving story took its place); `before` holds the parameters it had moved as they were with it on, `after` as they were put back (both empty when it moved nothing). */
  "story:cleared": { chartId: string; storyId: string; before: Record<string, unknown>; after: Record<string, unknown> };
  /** A chart's definition was edited in ⚙ (`reset`: its edits were cleared). */
  "chart:edited": { chartId: string; reset?: boolean };
  /** An imported number list changed. */
  "data:changed": { kind: string; count: number };
  /** A state file was imported, or refused. */
  "state:imported": { ok: boolean; error?: string };
  /** Everything went back to the defaults. */
  "state:reset": Record<string, never>;
  /** A setting changed: the UI settings, the default backend, or one parameter's settings (all of them without a key). */
  "settings:changed": { what: "ui" | "backend" | "param"; key?: string };
  /** A build's answer is on screen; `at` is when it was requested, `partial` the scenarios a sweep build was limited to. */
  "build:settled": { at: number; ok: boolean; partial: string[] | null; error?: string };
  /** The address moved to another route (a page, a view, or a part of a page). Never for an in-page anchor (#el-<id>), which keeps the route. */
  "route:changed": { from: RouteRef; to: RouteRef };
  /**
   * A link scrolled the open page to one of its elements, with no page switch: an in-page
   * anchor (`to` is #el-<id>; the address stays, so no route:changed) or a part of the page
   * already open (another section; route:changed for the new address comes first).
   */
  "route:jumped": { to: string; elementId: string };
  /** Something to tell the reader; the Notices stack shows it. */
  notice: Notice;
}
