/**
 * The store factory. Parameters with undo/redo, imported number lists, chart edits and
 * stories, sweep presets, links and runs (with each swept input's pre-sweep value,
 * persisted so a reload mid-run puts it back), UI settings, parameter settings (how each
 * parameter is edited by hand; never read by the sweeps), versioned import/export
 * with sanitizers, and local persistence. Knows nothing about the explainer: the
 * schema, the defaults, the presets and the sanitizers come in the config. The app
 * instantiates it once (src/app/store.ts).
 *
 * Every action that changes something says so on the event bus (kit/events), once the
 * store holds the new state: param:changed per parameter with its source, sweep:started,
 * paused and stopped, story:applied and cleared, chart:edited, data:changed,
 * state:imported, state:reset, settings:changed. The bus comes in the config or, from
 * <KitProvider bus>, through connectBus.
 *
 * Locks (`locks`, persisted and exported): a locked parameter, or a linked key the
 * app's constraints name, holds its value. Every change of the parameters, whoever
 * makes it (a hand edit, a sweep tick, a story, a switch, a linked value, an action,
 * undo and redo, a reset, an import), runs through one step, `applyConstraints`
 * (kit/state/constraints.ts) with the app's relations: what holds is applied, what a
 * lock refuses is announced as param:refused (with the lock that blocks it). A run on a
 * parameter that becomes locked stops with sweep:stopped reason "lock", and a locked
 * parameter is never swept. lockParam emits param:locked.
 *
 * This file is the former src/state/store.ts with Params -> P, Datasets -> D and its module-level
 * constants moved into the config. Behaviour is unchanged.
 */
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { sanitizeOverride, STORY_LABEL_MAX, STORY_NARRATIVE_MAX, type BackendId, type SpecOverride, type Story } from "@kit/charts/spec";
import type { Schema } from "@kit/inputs/schema";
import { patchParamSetting, sanitizeParamSettings, type ParamSettings, type ParamSettingsPatch } from "@kit/inputs/paramSettings";
import { migratePresetId, sanitizePreset, sanitizePresets } from "@kit/sweeps/sanitize";
import { clonePreset, type PersistedRun, type PresetCatalog, type SweepPlan, type SweepPreset, type SweepRun } from "@kit/sweeps/types";
import type { Bus } from "@kit/events/bus";
import type { KitEvents, ParamSource, SweepStopReason } from "@kit/events/types";
import { applyConstraints, keyLabel, sanitizeLocks, type ConstraintOutcome, type ConstraintSet, type LinkedKey, type Locks, type Refusal } from "./constraints";

export { sanitizePreset };
export type { Locks, Refusal };

/**
 * Sources whose change is all or nothing under the locks: one click that sets several
 * parameters, a value solved into them, or a sweep's next value (the replayer moves its
 * parameter to the preset's value or not at all; what a relation moves beside it, such
 * as q re-solved while n is swept with p locked, is fine).
 */
const ATOMIC_SOURCES: ReadonlySet<ParamSource> = new Set<ParamSource>(["switch", "story", "link", "action", "sweep"]);

export interface UiSettings {
  /** The most values a second a running sweep commits, whatever its presets ask for. */
  sweepHz: number;
  /** Sweep rate: multiplies the speed of every preset (2 = each value holds half as long). */
  sweepSpeed: number;
  /** Multiplier on every input's drag sensitivity (its units per 100 px). */
  dragSensitivity: number;
  /** The deck bar starts expanded. */
  deckExpanded: boolean;
}

export const DEFAULT_UI: UiSettings = { sweepHz: 10, sweepSpeed: 1, dragSensitivity: 1, deckExpanded: false };

export interface ExportedState<P extends object, D extends object> {
  version: number;
  exportedAt: string;
  params: P;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  datasets: D;
  presets: SweepPreset[];
  links: Record<string, string>;
  ui: UiSettings;
  /** chart id -> the parameters a story moved, as they were before it. */
  storyPrev: Record<string, Partial<P>>;
  /** parameter key -> the parameter settings a person changed (kit/inputs/paramSettings.ts). Absent in older exports. */
  paramSettings?: Record<string, ParamSettings>;
  /** The locked parameters and linked keys, key -> true. Absent in older exports. */
  locks?: Locks;
}

/** What local storage holds: the exported state plus the sweeps that were running, with each input's pre-sweep value. */
interface StoredState<P extends object, D extends object> extends ExportedState<P, D> {
  runs?: PersistedRun[];
}

/**
 * Resolves a preset for one input when a run starts (its anchors need the app's schema
 * and the last build). Without one a run has no plan and does not move.
 */
export type SweepPlanner<P = any> = (key: string, preset: SweepPreset, at: { origin: number; current: number }, params: P) => SweepPlan | null;

export interface DatasetsConfig<D extends object> {
  empty: D;
  sanitize: (input: unknown) => D;
}

export interface AppStoreConfig<P extends object, D extends object> {
  schema: Schema<P>;
  datasets: DatasetsConfig<D>;
  /** localStorage key, e.g. "tranche-replay:v1". Changing it forgets every saved state. */
  storageKey: string;
  /** Export format version written into every saved and exported state. */
  version: number;
  /** The presets a fresh state starts with, and the legacy ids they replace. */
  presets: PresetCatalog;
  /** Plans a run when it starts (kit/sweeps/adapter.ts plannerFor(adapter)). */
  planner?: SweepPlanner<P>;
  defaultBackend?: BackendId;
  ui?: Partial<UiSettings>;
  /** The event bus the actions emit on; <KitProvider bus> connects one too (connectBus). */
  bus?: Bus<any>;
  /** The relations among the parameters and the linked keys a lock can hold (kit/state/constraints.ts). Without them only the locks themselves apply. */
  constraints?: ConstraintSet<P>;
}

/** What a change came to: the refusals (empty when everything asked for holds). */
export interface ChangeResult {
  refused: Refusal[];
}

export interface KitState<P extends object, D extends object> {
  params: P;
  datasets: D;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  authoringOpen: string | null;
  presets: SweepPreset[];
  /** input key -> preset id */
  links: Record<string, string>;
  /** input key -> running or paused sweep. Saved as key, preset and pre-sweep value only; a reload puts the value back. */
  runs: Record<string, SweepRun>;
  /** input key -> its value before the last sweep, kept after stop for "↺ before sweep" until the input is edited by hand. */
  sweepOrigins: Record<string, number>;
  /**
   * chart id -> the parameters a story moved, as they were before it. Persisted, so a
   * reload still knows what "undo" restores. Only one deck-moving story is active at a
   * time: applying one turns the other off and restores its parameters first.
   */
  storyPrev: Record<string, Partial<P>>;
  activeInput: string | null;
  ui: UiSettings;
  /** Undo stack of parameter states (most recent last). Sweep ticks are not recorded. */
  past: P[];
  future: P[];
  /**
   * Parameter settings: parameter key -> how a person edits it by hand (step, fine step,
   * wheel step, drag per 100 px, decimals, slider), over the schema's `input` defaults.
   * Persisted and exported; never read by the sweeps.
   */
  paramSettings: Record<string, ParamSettings>;
  /**
   * Locks: key -> true for each locked parameter or linked key (the app's constraints
   * name the linked ones). Persisted and exported; every change runs through them.
   */
  locks: Locks;
  /** The linked keys a lock can hold besides the parameters (from the app's constraints), with their labels. */
  linked: Record<string, LinkedKey<P>>;
  /**
   * `source` (default "hand") is what param:changed reports. A locked parameter refuses
   * every call (param:refused), even one that would leave it where it is: someone tried.
   */
  setParam: <K extends Extract<keyof P, string>>(key: K, value: P[K], source?: ParamSource) => void;
  /**
   * history: false skips the undo stack; sweep: true is a sweep tick (no history, not
   * saved); source defaults to "sweep" for a tick and "hand" otherwise. The change runs
   * through the locks and the relations first (applyConstraints): what holds is applied
   * and what is refused comes back (and goes out as param:refused). `via` names the
   * linked key the patch was solved from (its lock refuses it); `atomic` makes it all or
   * nothing (the default for a switch, a story, a linked value, an action and each value
   * of a sweep tick, which runs through the step one parameter at a time; a refused
   * value stops its run with sweep:stopped "lock").
   */
  setParams: (patch: Partial<P>, opts?: { history?: boolean; sweep?: boolean; source?: ParamSource; via?: string; atomic?: boolean }) => ChangeResult;
  /** Lock or unlock a parameter or linked key: emits param:locked; locking stops a run on it (sweep:stopped "lock"). */
  lockParam: (key: string, on: boolean) => void;
  /** Unlock every key. */
  unlockAll: () => void;
  /** What a change would come to under the locks, without making it or saying anything. */
  checkChange: (patch: Partial<P>, opts?: { source?: ParamSource; via?: string; atomic?: boolean }) => ConstraintOutcome<P>;
  /** Why clicking this story would be refused under the locks now (empty: it would apply). */
  storyRefusals: (id: string, story: Story) => Refusal[];
  /** A parameter's or linked key's name, for notices and lists. */
  lockLabel: (key: string) => string;
  undo: () => void;
  redo: () => void;
  resetParams: () => void;
  setDataset: (kind: Extract<keyof D, string>, values: number[]) => void;
  setOverride: (id: string, patch: SpecOverride) => void;
  applyStory: (id: string, story: Story) => void;
  clearOverride: (id: string) => void;
  clearAllOverrides: () => void;
  setDefaultBackend: (b: BackendId) => void;
  setAuthoringOpen: (id: string | null) => void;
  setUi: (patch: Partial<UiSettings>) => void;
  setActiveInput: (key: string | null) => void;
  upsertPreset: (p: SweepPreset) => void;
  deletePreset: (id: string) => void;
  linkPreset: (key: string, presetId: string | null) => void;
  cyclePreset: (key: string, dir: 1 | -1) => void;
  startSweep: (key: string, presetId?: string) => void;
  pauseSweep: (key: string) => void;
  toggleSweep: (key: string) => void;
  /** Stop the run and keep the value where it is. */
  stopSweep: (key: string) => void;
  /** Put the input (or, without a key, every running or paused sweep's input) back where it was before the sweep. */
  restoreSweep: (key?: string) => void;
  /** The engine moved a run to another value of its plan. */
  setRunIndex: (key: string, index: number) => void;
  pauseAll: () => void;
  exportState: () => ExportedState<P, D>;
  importState: (text: string) => { ok: true } | { ok: false; error: string };
  resetEverything: () => void;
  /** Change some of one parameter's settings; a null field goes back to its default. */
  setParamSettings: (key: string, patch: ParamSettingsPatch) => void;
  /** Back to the defaults: one parameter's settings, or (without a key) every parameter's. */
  resetParamSettings: (key?: string) => void;
  /** The bus the actions emit on (null: none, nothing is emitted). */
  connectBus: (bus: Bus<any> | null) => void;
  getBus: () => Bus<any> | null;
}

export type AppStore<P extends object, D extends object> = UseBoundStore<StoreApi<KitState<P, D>>>;

const VALID_BACKENDS: BackendId[] = ["echarts", "plotly", "vega", "table"];

function sanitizeOverrides(input: unknown): Record<string, SpecOverride> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, SpecOverride> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[\w-]{1,64}$/.test(k)) continue;
    const o = sanitizeOverride(v);
    if (o) out[k] = o;
  }
  return out;
}

const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function persistedRuns(runs: Record<string, SweepRun>): PersistedRun[] {
  return Object.values(runs).map((r) => ({ key: r.key, presetId: r.presetId, origin: r.origin }));
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createAppStore<P extends object, D extends object>(cfg: AppStoreConfig<P, D>): AppStore<P, D> {
  const { schema, storageKey } = cfg;
  const defaults = schema.defaults;
  const defaultUi: UiSettings = { ...DEFAULT_UI, ...(cfg.ui ?? {}) };
  const defaultBackend: BackendId = cfg.defaultBackend ?? "echarts";
  const sanitizeParams = (input: unknown): P => schema.sanitize(input);
  const defaultPresets = () => cfg.presets.defaults.map(clonePreset);
  const valueOf = (params: P, key: string): unknown => (params as Record<string, unknown>)[key];

  function load(): Partial<StoredState<P, D>> {
    try {
      if (typeof location !== "undefined" && location.hash === "#reset") {
        localStorage.removeItem(storageKey);
        history.replaceState(null, "", location.pathname + location.search);
        return {};
      }
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<StoredState<P, D>>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  type Persisted = Pick<KitState<P, D>, "params" | "overrides" | "defaultBackend" | "datasets" | "presets" | "links" | "ui" | "storyPrev" | "paramSettings" | "locks"> & { runs?: PersistedRun[] };

  function save(state: Persisted) {
    try {
      const payload: StoredState<P, D> = { version: cfg.version, exportedAt: new Date().toISOString(), ...state };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* storage unavailable: the app works without it */
    }
  }

  /** chart id -> snapshot; only snapshots whose chart still carries a story override are kept. */
  function sanitizeStoryPrev(input: unknown, overrides: Record<string, SpecOverride>): Record<string, Partial<P>> {
    if (!input || typeof input !== "object") return {};
    const out: Record<string, Partial<P>> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!/^[\w-]{1,64}$/.test(k) || !overrides[k]?.story) continue;
      const patch = schema.sanitizePatch(v);
      if (patch) out[k] = patch;
    }
    return out;
  }

  function sanitizeLinks(input: unknown, presets: SweepPreset[]): Record<string, string> {
    if (!input || typeof input !== "object") return {};
    const ids = new Set(presets.map((p) => p.id));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!schema.byKey[k] || typeof v !== "string") continue;
      const id = migratePresetId(v, cfg.presets);
      if (ids.has(id)) out[k] = id;
    }
    return out;
  }

  /** Saved runs: a known numeric input, a pre-sweep value that is a number. */
  function sanitizeRuns(input: unknown): PersistedRun[] {
    if (!Array.isArray(input)) return [];
    const out: PersistedRun[] = [];
    for (const r of input) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const def = typeof o.key === "string" ? schema.byKey[o.key] : undefined;
      if (!def || def.unit === "choice" || typeof o.origin !== "number" || !Number.isFinite(o.origin)) continue;
      out.push({ key: def.key, presetId: typeof o.presetId === "string" ? o.presetId : "", origin: o.origin });
    }
    return out;
  }

  function sanitizeUi(input: unknown): UiSettings {
    const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    return {
      sweepHz: num(o.sweepHz, 1, 30, defaultUi.sweepHz),
      sweepSpeed: num(o.sweepSpeed, 0.25, 4, defaultUi.sweepSpeed),
      dragSensitivity: num(o.dragSensitivity, 0.25, 4, defaultUi.dragSensitivity),
      deckExpanded: typeof o.deckExpanded === "boolean" ? o.deckExpanded : defaultUi.deckExpanded,
    };
  }

  /** Keep the last 100 parameter states; coalesce rapid edits of the same field within 400 ms. */
  let lastHistoryAt = 0;
  function pushHistory(past: P[], prev: P): P[] {
    const t = now();
    const coalesce = t - lastHistoryAt < 400 && past.length > 0;
    lastHistoryAt = t;
    if (coalesce) return past;
    return [...past, prev].slice(-100);
  }

  const initial = load();
  const initialPresets = sanitizePresets(initial.presets, cfg.presets);
  const initialOverrides = sanitizeOverrides(initial.overrides);
  /**
   * A reload in the middle of a sweep puts each swept input back where it was before
   * the sweep: ticks are never saved, but an edit of another input during the run
   * saves the parameters with the swept value in them.
   */
  const initialParams = (() => {
    const params = sanitizeParams(initial.params ?? defaults);
    const runs = sanitizeRuns(initial.runs);
    if (!runs.length) return params;
    return sanitizeParams({ ...params, ...Object.fromEntries(runs.map((r) => [r.key, r.origin])) });
  })();

  let bus: Bus<KitEvents> | null = cfg.bus ?? null;
  const emit = <K extends keyof KitEvents & string>(name: K, payload: KitEvents[K]) => bus?.emit(name, payload);
  /** param:changed for every parameter whose value differs between the two. */
  const emitChanges = (prev: P, next: P, source: ParamSource) => {
    if (!bus || prev === next) return;
    for (const key of Object.keys(next)) {
      const from = valueOf(prev, key);
      const to = valueOf(next, key);
      if (!Object.is(from, to)) emit("param:changed", { key, from, to, source });
    }
  };
  /** sweep:stopped for every run that is gone. */
  const emitStopped = (before: Record<string, SweepRun>, after: Record<string, SweepRun>, reason: SweepStopReason) => {
    for (const key of Object.keys(before)) if (!(key in after)) emit("sweep:stopped", { key, reason });
  };
  /** The values of these parameters now. */
  const valuesOf = (params: P, keys: string[]) => Object.fromEntries(keys.map((k) => [k, valueOf(params, k)]));

  // ---- locks and the relations (kit/state/constraints.ts) ----
  const linked: Record<string, LinkedKey<P>> = cfg.constraints?.linked ?? {};
  const lockable = (key: string) => !!schema.byKey[key] || key in linked;
  const labelOf = (key: string) => keyLabel(key, { set: cfg.constraints, byKey: schema.byKey });
  /** The keys whose value differs between the two. */
  const diff = (from: P, to: P): Partial<P> => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(to)) if (!Object.is(valueOf(from, key), valueOf(to, key))) out[key] = valueOf(to, key);
    return out as Partial<P>;
  };
  /** A change as the store would take it: sanitized, then through the locks and the relations. */
  const solveWith = (locks: Locks, prev: P, patch: Partial<P>, source: ParamSource, o: { via?: string; atomic?: boolean } = {}): ConstraintOutcome<P> => {
    const asked = diff(prev, sanitizeParams({ ...prev, ...patch }));
    return applyConstraints(prev, asked, locks, source, { set: cfg.constraints, byKey: schema.byKey, via: o.via, atomic: o.atomic ?? ATOMIC_SOURCES.has(source) });
  };
  /** The parameters with a solved patch applied (the same object when it is empty). */
  const applied = (prev: P, patch: Partial<P>): P => (Object.keys(patch).length ? sanitizeParams({ ...prev, ...patch }) : prev);
  /** The first value of a run's plan, from where it stands, that differs from the current one. */
  const nextMove = (run: SweepRun, current: unknown): number | null => {
    const plan = run.plan;
    if (!plan || !plan.values.length) return null;
    if (plan.jumpTo != null && plan.jumpTo !== current) return plan.jumpTo;
    for (let i = 1; i <= plan.values.length; i++) {
      const v = plan.values[(Math.max(-1, run.index) + i + plan.values.length) % plan.values.length];
      if (v !== current) return v;
    }
    return null;
  };

  return create<KitState<P, D>>()((set, get) => {
    const persist = (patch: Partial<Persisted>) => {
      const s = get();
      save({ params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui, storyPrev: s.storyPrev, paramSettings: s.paramSettings, locks: s.locks, runs: persistedRuns(s.runs), ...patch });
    };
    const solve = (prev: P, patch: Partial<P>, source: ParamSource, o: { via?: string; atomic?: boolean } = {}) => solveWith(get().locks, prev, patch, source, o);
    /**
     * param:refused for each refusal, once the state holds what was applied. The refusals
     * of a locked key itself go last, so a listener that keeps one line per lock (the
     * notices) ends on the plainest one.
     */
    const emitRefusals = (refusals: Refusal[], source: ParamSource) => {
      const ordered = [...refusals.filter((r) => r.key !== r.by), ...refusals.filter((r) => r.key === r.by)];
      for (const r of ordered) emit("param:refused", { key: r.key, reason: r.reason, source, attempted: r.attempted, by: r.by, ...(r.detail ? { detail: r.detail } : {}) });
    };
    /** A run whose next value the locks refuse (its parameter locked, or a relation that cannot follow). */
    const runBlocked = (key: string, locks: Locks): boolean => {
      if (locks[key]) return true;
      const s = get();
      const run = s.runs[key];
      const v = run ? nextMove(run, valueOf(s.params, key)) : null;
      return v != null && solveWith(locks, s.params, { [key]: v } as Partial<P>, "sweep").refusals.length > 0;
    };
    /** A hand edit of a swept input stops its run and forgets its pre-sweep value. */
    const releaseSweeps = (keys: string[]) => {
      const { runs, sweepOrigins } = get();
      if (!keys.some((k) => k in runs || k in sweepOrigins)) return null;
      const nextRuns = { ...runs };
      const nextOrigins = { ...sweepOrigins };
      for (const k of keys) {
        delete nextRuns[k];
        delete nextOrigins[k];
      }
      return { runs: nextRuns, sweepOrigins: nextOrigins };
    };
    /**
     * What clicking a story asks for, before the locks: the chart edits, the parameters
     * it would leave (`params`; `clean` is them with the other stories put back first),
     * the snapshots, and what to announce.
     */
    const planStory = (id: string, story: Story) => {
      const current = get().overrides[id];
      const active = current?.story === story.id;
      // A story replaces the chart's edits; clicking the active story turns it off. Its label
      // and answer are saved with it, so a reload shows the chip pressed with its answer line
      // even when the rebuilt chart no longer offers the story.
      const text: SpecOverride = {};
      if (story.label) text.storyLabel = story.label.slice(0, STORY_LABEL_MAX);
      if (story.narrative) text.storyNarrative = story.narrative.slice(0, STORY_NARRATIVE_MAX);
      const next: SpecOverride | null = active ? null : { ...(story.patch ?? {}), story: story.id, ...text };
      const overrides = { ...get().overrides };
      if (next) overrides[id] = next;
      else delete overrides[id];
      const storyPrev = { ...get().storyPrev };
      let params = get().params;
      let clean = params;
      let moves = false;
      // What to announce once the new state is set.
      const cleared: KitEvents["story:cleared"][] = [];
      let applied: KitEvents["story:applied"] | null = null;
      if (active) {
        // Turning a story off puts back the parameters it moved.
        const back = storyPrev[id];
        const keys = Object.keys(back ?? {});
        const on = valuesOf(params, keys);
        if (back) params = sanitizeParams({ ...params, ...back });
        cleared.push({ chartId: id, storyId: story.id, before: on, after: valuesOf(params, keys) });
        delete storyPrev[id];
      } else if (story.params) {
        moves = true;
        if (current?.story) cleared.push({ chartId: id, storyId: current.story, before: {}, after: {} });
        // Only one deck-moving story is active at a time: turn the others off first and
        // restore what they moved, so the new snapshot is taken from clean parameters.
        for (const otherId of Object.keys(storyPrev)) {
          if (otherId === id) continue;
          const back = storyPrev[otherId];
          const keys = Object.keys(back);
          const on = valuesOf(params, keys);
          params = sanitizeParams({ ...params, ...back });
          const otherStory = get().overrides[otherId]?.story;
          if (otherStory) cleared.push({ chartId: otherId, storyId: otherStory, before: on, after: valuesOf(params, keys) });
          delete storyPrev[otherId];
          delete overrides[otherId];
        }
        clean = params;
        // Snapshot what it is about to move, unless an earlier story on this chart already did.
        const snap: Partial<P> = { ...(storyPrev[id] ?? {}) };
        for (const k of Object.keys(story.params)) if (!(k in snap)) (snap as Record<string, unknown>)[k] = valueOf(params, k);
        storyPrev[id] = snap;
        params = sanitizeParams({ ...params, ...story.params });
        applied = { chartId: id, storyId: story.id, label: story.label, before: { ...snap }, after: valuesOf(params, Object.keys(snap)) };
      } else {
        // A story that only re-defines the chart replaces a deck-moving one on the same chart.
        const back = storyPrev[id];
        const keys = Object.keys(back ?? {});
        const on = valuesOf(params, keys);
        if (back) params = sanitizeParams({ ...params, ...back });
        if (current?.story) cleared.push({ chartId: id, storyId: current.story, before: on, after: valuesOf(params, keys) });
        delete storyPrev[id];
        applied = { chartId: id, storyId: story.id, label: story.label, before: {}, after: {} };
      }
      return { overrides, params, clean, storyPrev, cleared, applied, moves };
    };
    return {
      params: initialParams,
      datasets: cfg.datasets.sanitize(initial.datasets ?? cfg.datasets.empty),
      overrides: initialOverrides,
      defaultBackend: VALID_BACKENDS.includes(initial.defaultBackend as BackendId) ? (initial.defaultBackend as BackendId) : defaultBackend,
      authoringOpen: null,
      presets: initialPresets,
      links: sanitizeLinks(initial.links, initialPresets),
      runs: {},
      sweepOrigins: {},
      storyPrev: sanitizeStoryPrev(initial.storyPrev, initialOverrides),
      activeInput: null,
      ui: sanitizeUi(initial.ui),
      past: [],
      future: [],
      paramSettings: sanitizeParamSettings(initial.paramSettings, schema),
      locks: sanitizeLocks(initial.locks, lockable),
      linked,
      setParam: (key, value, source = "hand") => {
        const v = schema.coerce(key, value);
        // A locked parameter refuses even a call that would leave it where it is: someone tried to move it.
        if (get().locks[key]) {
          emitRefusals([{ key, reason: "locked", by: key, attempted: v }], source);
          return;
        }
        if (get().params[key] === v) return;
        get().setParams({ [key]: v } as unknown as Partial<P>, { source });
      },
      setParams: (patch, opts) => {
        const prev = get().params;
        const source: ParamSource = opts?.source ?? (opts?.sweep ? "sweep" : "hand");
        // A sweep tick is neither history nor saved: a reload restores the pre-sweep value instead.
        if (opts?.sweep) {
          // One step per run's value (the engine sends every running sweep's tick at once), so
          // a value the locks refuse stops its own run and leaves the others moving.
          let params = prev;
          const refused: Refusal[] = [];
          for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            const one = solve(params, { [k]: v } as Partial<P>, source, { via: opts?.via, atomic: opts?.atomic });
            refused.push(...one.refusals);
            params = applied(params, one.patch);
          }
          const runsBefore = get().runs;
          // A run whose value a lock refuses stops where it is.
          const blocked = refused.map((r) => r.key).filter((k) => k in runsBefore);
          const runs = blocked.length ? Object.fromEntries(Object.entries(runsBefore).filter(([k]) => !blocked.includes(k))) : runsBefore;
          if (params !== prev || runs !== runsBefore) set({ params, runs });
          if (runs !== runsBefore) persist({});
          emitStopped(runsBefore, runs, "lock");
          emitRefusals(refused, source);
          emitChanges(prev, params, source);
          return { refused };
        }
        // The one step every change takes: the locks and the relations among the parameters.
        const out = solve(prev, patch, source, { via: opts?.via, atomic: opts?.atomic });
        const params = applied(prev, out.patch);
        if (params === prev) {
          emitRefusals(out.refusals, source);
          return { refused: out.refusals };
        }
        const runsBefore = get().runs;
        if (opts?.history === false) {
          set({ params });
        } else {
          const released = releaseSweeps([...new Set([...Object.keys(patch), ...Object.keys(out.patch)])]) ?? {};
          set({ params, past: pushHistory(get().past, prev), future: [], ...released });
        }
        persist({ params });
        emitStopped(runsBefore, get().runs, "edit");
        emitRefusals(out.refusals, source);
        emitChanges(prev, params, source);
        return { refused: out.refusals };
      },
      undo: () => {
        const { past, params, future } = get();
        if (!past.length) return;
        // A locked parameter keeps its value; the rest goes back (through the relations).
        const out = solve(params, past[past.length - 1], "undo");
        const prev = applied(params, out.patch);
        // Undo takes the wheel: any sweep stops where history puts its input.
        const runsBefore = get().runs;
        set({ params: prev, past: past.slice(0, -1), future: [params, ...future].slice(0, 100), runs: {} });
        persist({ params: prev });
        emitStopped(runsBefore, {}, "undo");
        emitRefusals(out.refusals, "undo");
        emitChanges(params, prev, "undo");
      },
      redo: () => {
        const { past, params, future } = get();
        if (!future.length) return;
        const out = solve(params, future[0], "redo");
        const next = applied(params, out.patch);
        const runsBefore = get().runs;
        set({ params: next, past: pushHistory(past, params), future: future.slice(1), runs: {} });
        persist({ params: next });
        emitStopped(runsBefore, {}, "undo");
        emitRefusals(out.refusals, "redo");
        emitChanges(params, next, "redo");
      },
      resetParams: () => {
        const prev = get().params;
        // Locked parameters keep their values (and the relations hold around them).
        const out = solve(prev, defaults, "reset");
        const params = applied(prev, out.patch);
        persist({ params });
        set({ params, past: pushHistory(get().past, prev), future: [] });
        emitRefusals(out.refusals, "reset");
        emitChanges(prev, get().params, "reset");
      },
      setDataset: (kind, values) => {
        const datasets = cfg.datasets.sanitize({ ...get().datasets, [kind]: values });
        persist({ datasets });
        set({ datasets });
        const list = (datasets as Record<string, unknown>)[kind];
        emit("data:changed", { kind, count: Array.isArray(list) ? list.length : 0 });
      },
      setOverride: (id, patch) => {
        const prev = get().overrides[id] ?? {};
        const merged = sanitizeOverride({ ...prev, ...patch, story: undefined, storyLabel: undefined, storyNarrative: undefined }) ?? {};
        const overrides = { ...get().overrides, [id]: merged };
        persist({ overrides });
        set({ overrides });
        emit("chart:edited", { chartId: id });
      },
      applyStory: (id, story) => {
        const plan = planStory(id, story);
        const prev = get().params;
        // All or nothing: a story that would move a locked parameter is refused, and the deck stays.
        const out = solve(prev, plan.params, "story");
        if (out.refusals.length) {
          emitRefusals(out.refusals, "story");
          return;
        }
        const params = applied(prev, out.patch);
        const { overrides, storyPrev, cleared } = plan;
        let applyEvent = plan.applied;
        // What the relations moved with the story is part of what it moved: undo puts it back too.
        const snap = storyPrev[id];
        if (snap && plan.moves) {
          for (const a of out.adjusted) if (!(a.key in snap)) (snap as Record<string, unknown>)[a.key] = valueOf(plan.clean, a.key);
          if (applyEvent) applyEvent = { ...applyEvent, before: { ...snap }, after: valuesOf(params, Object.keys(snap)) };
        }
        persist({ overrides, params, storyPrev });
        set({ overrides, params, storyPrev, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
        for (const c of cleared) emit("story:cleared", c);
        if (applyEvent) emit("story:applied", applyEvent);
        emitChanges(prev, params, "story");
      },
      storyRefusals: (id, story) => solve(get().params, planStory(id, story).params, "story").refusals,
      clearOverride: (id) => {
        const was = get().overrides[id];
        const overrides = { ...get().overrides };
        delete overrides[id];
        const storyPrev = { ...get().storyPrev };
        const back = storyPrev[id];
        delete storyPrev[id];
        const prev = get().params;
        // A reset of the chart: what the story moved goes back, except what is locked now.
        const out = back ? solve(prev, back, "story", { atomic: false }) : null;
        const params = out ? applied(prev, out.patch) : prev;
        persist({ overrides, params, storyPrev });
        set({ overrides, params, storyPrev, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
        if (was?.story) emit("story:cleared", { chartId: id, storyId: was.story, before: valuesOf(prev, Object.keys(back ?? {})), after: valuesOf(params, Object.keys(back ?? {})) });
        if (was) emit("chart:edited", { chartId: id, reset: true });
        if (out) emitRefusals(out.refusals, "story");
        emitChanges(prev, params, "story");
      },
      clearAllOverrides: () => {
        const prev = get().params;
        const was = get().overrides;
        const snaps = get().storyPrev;
        let target: Partial<P> = {};
        for (const back of Object.values(snaps)) target = { ...target, ...back };
        const out = Object.keys(target).length ? solve(prev, target, "story", { atomic: false }) : null;
        const params = out ? applied(prev, out.patch) : prev;
        persist({ overrides: {}, params, storyPrev: {} });
        set({ overrides: {}, params, storyPrev: {}, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
        for (const [chartId, o] of Object.entries(was)) {
          if (o.story) emit("story:cleared", { chartId, storyId: o.story, before: valuesOf(prev, Object.keys(snaps[chartId] ?? {})), after: valuesOf(params, Object.keys(snaps[chartId] ?? {})) });
          emit("chart:edited", { chartId, reset: true });
        }
        if (out) emitRefusals(out.refusals, "story");
        emitChanges(prev, params, "story");
      },
      setDefaultBackend: (b) => {
        persist({ defaultBackend: b });
        set({ defaultBackend: b });
        emit("settings:changed", { what: "backend" });
      },
      setAuthoringOpen: (authoringOpen) => set({ authoringOpen }),
      setUi: (patch) => {
        const ui = sanitizeUi({ ...get().ui, ...patch });
        persist({ ui });
        set({ ui });
        emit("settings:changed", { what: "ui" });
      },
      setActiveInput: (activeInput) => set({ activeInput }),
      upsertPreset: (p) => {
        const clean = sanitizePreset(p, cfg.presets);
        if (!clean) return;
        const presets = get().presets.some((x) => x.id === clean.id) ? get().presets.map((x) => (x.id === clean.id ? clean : x)) : [...get().presets, clean];
        persist({ presets });
        set({ presets });
      },
      deletePreset: (id) => {
        const presets = get().presets.filter((p) => p.id !== id);
        const links = Object.fromEntries(Object.entries(get().links).filter(([, v]) => v !== id));
        const runsBefore = get().runs;
        const runs = Object.fromEntries(Object.entries(runsBefore).filter(([, r]) => r.presetId !== id));
        persist({ presets, links });
        set({ presets, links, runs });
        emitStopped(runsBefore, runs, "preset");
      },
      linkPreset: (key, presetId) => {
        const links = { ...get().links };
        if (presetId) links[key] = presetId;
        else delete links[key];
        const run = get().runs[key];
        set({ links });
        if (run && run.presetId !== presetId) {
          // A running sweep switches to the new preset from where it is; a paused one ends (its value and ↺ stay).
          if (presetId && run.startedAt != null) get().startSweep(key, presetId);
          else {
            const runs = { ...get().runs };
            delete runs[key];
            set({ runs });
            emit("sweep:stopped", { key, reason: "preset" });
          }
        }
        persist({ links });
      },
      cyclePreset: (key, dir) => {
        const { presets, links } = get();
        if (!presets.length) return;
        const i = presets.findIndex((p) => p.id === links[key]);
        const next = presets[(i + dir + presets.length) % presets.length];
        get().linkPreset(key, next.id);
      },
      startSweep: (key, presetId) => {
        const s = get();
        const id = presetId ?? s.links[key] ?? s.presets[0]?.id;
        const preset = s.presets.find((p) => p.id === id);
        const value = valueOf(s.params, key);
        // The engine never plans a locked parameter: the attempt is refused (and says so).
        if (s.locks[key]) {
          emitRefusals([{ key, reason: "locked", by: key, attempted: undefined }], "sweep");
          return;
        }
        if (!id || !preset || typeof value !== "number") return;
        const links = s.links[key] === id ? s.links : { ...s.links, [key]: id };
        const existing = s.runs[key];
        // Switching presets mid-run keeps the value from before the first one.
        const origin = existing?.origin ?? value;
        const plan = cfg.planner ? cfg.planner(key, preset, { origin, current: value }, s.params) : null;
        const run: SweepRun = { key, presetId: id, origin, startedAt: now(), plan, index: plan ? plan.start : -1 };
        // Nor a run whose first move a lock elsewhere refuses (a relation that cannot follow).
        const first = nextMove(run, value);
        const check = first != null ? solve(s.params, { [key]: first } as Partial<P>, "sweep") : null;
        if (check?.refusals.length) {
          emitRefusals(check.refusals, "sweep");
          return;
        }
        const runs = { ...s.runs, [key]: run };
        const sweepOrigins = { ...s.sweepOrigins, [key]: origin };
        // The ticks are not history, but where the input stood before the run is: Ctrl+Z goes back to it.
        const history = existing ? {} : { past: [...s.past, s.params].slice(-100), future: [] as P[] };
        set({ links, runs, sweepOrigins, ...history });
        persist({ links });
        emit("sweep:started", { key, presetId: id, resumed: false });
      },
      pauseSweep: (key) => {
        const r = get().runs[key];
        if (!r || r.startedAt == null) return;
        set({ runs: { ...get().runs, [key]: { ...r, startedAt: null } } });
        // While paused the value is on screen to inspect; save it (a reload still restores the pre-sweep value).
        persist({});
        emit("sweep:paused", { key });
      },
      toggleSweep: (key) => {
        const r = get().runs[key];
        if (!r) get().startSweep(key);
        else if (r.startedAt == null) {
          set({ runs: { ...get().runs, [key]: { ...r, startedAt: now() } } });
          emit("sweep:started", { key, presetId: r.presetId, resumed: true });
        } else get().pauseSweep(key);
      },
      stopSweep: (key) => {
        if (!get().runs[key]) return;
        const runs = { ...get().runs };
        delete runs[key];
        set({ runs });
        // Stop keeps the value: save it now, since the ticks were not saved.
        persist({});
        emit("sweep:stopped", { key, reason: "stop" });
      },
      restoreSweep: (key) => {
        const s = get();
        const keys = key ? [key] : Object.keys(s.runs);
        const patch: Record<string, number> = {};
        for (const k of keys) {
          const origin = s.runs[k]?.origin ?? s.sweepOrigins[k];
          if (origin != null) patch[k] = origin;
        }
        const runs = { ...s.runs };
        const sweepOrigins = { ...s.sweepOrigins };
        for (const k of keys) {
          delete runs[k];
          delete sweepOrigins[k];
        }
        const prev = s.params;
        // ↺ before sweep goes through the locks too: what a lock now holds stays, each parameter on its own.
        const out = Object.keys(patch).length ? solve(prev, patch as Partial<P>, "sweep", { atomic: false }) : null;
        const params = out ? applied(prev, out.patch) : prev;
        const moved = params !== prev && Object.keys(diff(prev, params)).length > 0;
        set({ runs, sweepOrigins, params, ...(moved ? { past: [...s.past, prev].slice(-100), future: [] } : {}) });
        persist({ params });
        emitStopped(s.runs, runs, "restore");
        if (out) emitRefusals(out.refusals, "sweep");
        emitChanges(prev, params, "sweep");
      },
      setRunIndex: (key, index) => {
        const r = get().runs[key];
        if (!r || r.index === index) return;
        set({ runs: { ...get().runs, [key]: { ...r, index } } });
      },
      pauseAll: () => {
        const was = get().runs;
        const runs = { ...was };
        const anyRunning = Object.values(runs).some((r) => r.startedAt != null);
        for (const k of Object.keys(runs)) {
          const r = runs[k];
          runs[k] = anyRunning ? { ...r, startedAt: null } : { ...r, startedAt: now() };
        }
        set({ runs });
        if (anyRunning) persist({});
        for (const k of Object.keys(runs)) {
          if (anyRunning && was[k].startedAt != null) emit("sweep:paused", { key: k });
          else if (!anyRunning) emit("sweep:started", { key: k, presetId: runs[k].presetId, resumed: true });
        }
      },
      exportState: () => {
        const s = get();
        return { version: cfg.version, exportedAt: new Date().toISOString(), params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui, storyPrev: s.storyPrev, paramSettings: s.paramSettings, locks: s.locks };
      },
      importState: (text) => {
        const refuse = (error: string) => {
          emit("state:imported", { ok: false, error });
          return { ok: false as const, error };
        };
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return refuse(`Not valid JSON: ${(e as Error).message}`);
        }
        if (!parsed || typeof parsed !== "object") return refuse("Expected a JSON object.");
        const obj = parsed as Partial<ExportedState<P, D>>;
        if (!obj.params || typeof obj.params !== "object") return refuse('Missing a "params" object.');
        const prev = get().params;
        // A parameter locked now keeps its value (and the relations hold around it); the rest is the file's.
        const solved = solve(prev, sanitizeParams(obj.params), "import");
        const params = applied(prev, solved.patch);
        // The file's locks join the ones in place: an import never unlocks. An older export has none.
        const locksBefore = get().locks;
        const locks = obj.locks !== undefined ? { ...locksBefore, ...sanitizeLocks(obj.locks, lockable) } : locksBefore;
        const overrides = sanitizeOverrides(obj.overrides);
        const datasets = cfg.datasets.sanitize(obj.datasets ?? get().datasets);
        const presets = obj.presets ? sanitizePresets(obj.presets, cfg.presets) : get().presets;
        const links = sanitizeLinks(obj.links ?? get().links, presets);
        const ui = sanitizeUi(obj.ui ?? get().ui);
        const backend = VALID_BACKENDS.includes(obj.defaultBackend as BackendId) ? (obj.defaultBackend as BackendId) : get().defaultBackend;
        const storyPrev = sanitizeStoryPrev(obj.storyPrev, overrides);
        // An export from before parameter settings existed keeps the current ones.
        const paramSettings = obj.paramSettings !== undefined ? sanitizeParamSettings(obj.paramSettings, schema) : get().paramSettings;
        const runsBefore = get().runs;
        set({ params, overrides, defaultBackend: backend, datasets, presets, links, ui, storyPrev, paramSettings, locks, runs: {}, sweepOrigins: {} });
        save({ params, overrides, defaultBackend: backend, datasets, presets, links, ui, storyPrev, paramSettings, locks, runs: [] });
        emitStopped(runsBefore, {}, "import");
        emitRefusals(solved.refusals, "import");
        for (const key of Object.keys(locks)) if (!locksBefore[key]) emit("param:locked", { key, locked: true });
        emitChanges(prev, params, "import");
        emit("state:imported", { ok: true });
        return { ok: true };
      },
      resetEverything: () => {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        const prev = get().params;
        const runsBefore = get().runs;
        const locksBefore = get().locks;
        set({ params: { ...defaults }, overrides: {}, defaultBackend, datasets: cfg.datasets.empty, presets: defaultPresets(), links: {}, runs: {}, sweepOrigins: {}, storyPrev: {}, ui: { ...defaultUi }, paramSettings: {}, locks: {} });
        emitStopped(runsBefore, {}, "reset");
        for (const key of Object.keys(locksBefore)) emit("param:locked", { key, locked: false });
        emitChanges(prev, get().params, "reset");
        emit("state:reset", {});
      },

      // ---- locks (kit/state/constraints.ts) ----
      lockParam: (key, on) => {
        if (!lockable(key) || !!get().locks[key] === on) return;
        const locks = { ...get().locks };
        if (on) locks[key] = true;
        else delete locks[key];
        // The sweep rule: a run on the key, or one whose next value the new locks refuse, stops where it is.
        const runsBefore = get().runs;
        const stop = on ? Object.keys(runsBefore).filter((k) => runBlocked(k, locks)) : [];
        const runs = stop.length ? Object.fromEntries(Object.entries(runsBefore).filter(([k]) => !stop.includes(k))) : runsBefore;
        set({ locks, runs });
        persist({ locks });
        emit("param:locked", { key, locked: on });
        emitStopped(runsBefore, runs, "lock");
      },
      unlockAll: () => {
        const was = Object.keys(get().locks);
        if (!was.length) return;
        set({ locks: {} });
        persist({ locks: {} });
        for (const key of was) emit("param:locked", { key, locked: false });
      },
      checkChange: (patch, opts) => solve(get().params, patch, opts?.source ?? "hand", { via: opts?.via, atomic: opts?.atomic }),
      lockLabel: labelOf,

      // ---- parameter settings (kit/inputs/paramSettings.ts): the manual feel, not the replayer's ----
      setParamSettings: (key, patch) => {
        const def = schema.byKey[key];
        if (!def) return;
        const paramSettings = { ...get().paramSettings };
        const next = patchParamSetting(def, paramSettings[key], patch);
        if (next) paramSettings[key] = next;
        else delete paramSettings[key];
        persist({ paramSettings });
        set({ paramSettings });
        emit("settings:changed", { what: "param", key });
      },
      resetParamSettings: (key) => {
        const paramSettings = key ? { ...get().paramSettings } : {};
        if (key) delete paramSettings[key];
        persist({ paramSettings });
        set({ paramSettings });
        emit("settings:changed", key ? { what: "param", key } : { what: "param" });
      },

      // ---- the event bus ----
      connectBus: (next) => {
        bus = next;
      },
      getBus: () => bus,
    };
  });
}
