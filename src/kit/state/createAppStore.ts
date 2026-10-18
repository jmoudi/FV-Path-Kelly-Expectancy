/**
 * The store factory. Parameters with undo/redo, imported number lists, chart edits and
 * stories, sweep presets, links and runs (with each swept input's pre-sweep value,
 * persisted so a reload mid-run puts it back), UI settings, versioned import/export
 * with sanitizers, and local persistence. Knows nothing about the explainer: the
 * schema, the defaults, the presets and the sanitizers come in the config. The app
 * instantiates it once (src/app/store.ts).
 *
 * This file is the former src/state/store.ts with Params -> P, Datasets -> D and its module-level
 * constants moved into the config. Behaviour is unchanged.
 */
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { sanitizeOverride, STORY_LABEL_MAX, STORY_NARRATIVE_MAX, type BackendId, type SpecOverride, type Story } from "@kit/charts/spec";
import type { Schema } from "@kit/inputs/schema";
import { migratePresetId, sanitizePreset, sanitizePresets } from "@kit/sweeps/sanitize";
import { clonePreset, type PersistedRun, type PresetCatalog, type SweepPlan, type SweepPreset, type SweepRun } from "@kit/sweeps/types";

export { sanitizePreset };

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
  setParam: <K extends Extract<keyof P, string>>(key: K, value: P[K]) => void;
  /** history: false skips the undo stack; sweep: true is a sweep tick (no history, not saved). */
  setParams: (patch: Partial<P>, opts?: { history?: boolean; sweep?: boolean }) => void;
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

  type Persisted = Pick<KitState<P, D>, "params" | "overrides" | "defaultBackend" | "datasets" | "presets" | "links" | "ui" | "storyPrev"> & { runs?: PersistedRun[] };

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

  return create<KitState<P, D>>()((set, get) => {
    const persist = (patch: Partial<Persisted>) => {
      const s = get();
      save({ params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui, storyPrev: s.storyPrev, runs: persistedRuns(s.runs), ...patch });
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
      setParam: (key, value) => {
        const v = schema.coerce(key, value);
        const prev = get().params;
        if (prev[key] === v) return;
        const params = { ...prev, [key]: v } as P;
        const released = releaseSweeps([key]) ?? {};
        set({ params, past: pushHistory(get().past, prev), future: [], ...released });
        persist({ params });
      },
      setParams: (patch, opts) => {
        const prev = get().params;
        const params = sanitizeParams({ ...prev, ...patch });
        // A sweep tick is neither history nor saved: a reload restores the pre-sweep value instead.
        if (opts?.sweep) {
          set({ params });
          return;
        }
        if (opts?.history === false) {
          set({ params });
        } else {
          const released = releaseSweeps(Object.keys(patch)) ?? {};
          set({ params, past: pushHistory(get().past, prev), future: [], ...released });
        }
        persist({ params });
      },
      undo: () => {
        const { past, params, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        // Undo takes the wheel: any sweep stops where history puts its input.
        set({ params: prev, past: past.slice(0, -1), future: [params, ...future].slice(0, 100), runs: {} });
        persist({ params: prev });
      },
      redo: () => {
        const { past, params, future } = get();
        if (!future.length) return;
        const next = future[0];
        set({ params: next, past: pushHistory(past, params), future: future.slice(1), runs: {} });
        persist({ params: next });
      },
      resetParams: () => {
        const prev = get().params;
        persist({ params: defaults });
        set({ params: { ...defaults }, past: pushHistory(get().past, prev), future: [] });
      },
      setDataset: (kind, values) => {
        const datasets = cfg.datasets.sanitize({ ...get().datasets, [kind]: values });
        persist({ datasets });
        set({ datasets });
      },
      setOverride: (id, patch) => {
        const prev = get().overrides[id] ?? {};
        const merged = sanitizeOverride({ ...prev, ...patch, story: undefined, storyLabel: undefined, storyNarrative: undefined }) ?? {};
        const overrides = { ...get().overrides, [id]: merged };
        persist({ overrides });
        set({ overrides });
      },
      applyStory: (id, story) => {
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
        const prev = get().params;
        const storyPrev = { ...get().storyPrev };
        let params = prev;
        if (active) {
          // Turning a story off puts back the parameters it moved.
          const back = storyPrev[id];
          if (back) params = sanitizeParams({ ...params, ...back });
          delete storyPrev[id];
        } else if (story.params) {
          // Only one deck-moving story is active at a time: turn the others off first and
          // restore what they moved, so the new snapshot is taken from clean parameters.
          for (const otherId of Object.keys(storyPrev)) {
            if (otherId === id) continue;
            params = sanitizeParams({ ...params, ...storyPrev[otherId] });
            delete storyPrev[otherId];
            delete overrides[otherId];
          }
          // Snapshot what it is about to move, unless an earlier story on this chart already did.
          const snap: Partial<P> = storyPrev[id] ?? {};
          for (const k of Object.keys(story.params)) if (!(k in snap)) (snap as Record<string, unknown>)[k] = valueOf(params, k);
          storyPrev[id] = snap;
          params = sanitizeParams({ ...params, ...story.params });
        } else {
          // A story that only re-defines the chart replaces a deck-moving one on the same chart.
          const back = storyPrev[id];
          if (back) params = sanitizeParams({ ...params, ...back });
          delete storyPrev[id];
        }
        persist({ overrides, params, storyPrev });
        set({ overrides, params, storyPrev, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
      },
      clearOverride: (id) => {
        const overrides = { ...get().overrides };
        delete overrides[id];
        const storyPrev = { ...get().storyPrev };
        const back = storyPrev[id];
        delete storyPrev[id];
        const prev = get().params;
        const params = back ? sanitizeParams({ ...prev, ...back }) : prev;
        persist({ overrides, params, storyPrev });
        set({ overrides, params, storyPrev, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
      },
      clearAllOverrides: () => {
        const prev = get().params;
        let params = prev;
        for (const back of Object.values(get().storyPrev)) params = { ...params, ...back };
        params = params === prev ? prev : sanitizeParams(params);
        persist({ overrides: {}, params, storyPrev: {} });
        set({ overrides: {}, params, storyPrev: {}, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
      },
      setDefaultBackend: (b) => {
        persist({ defaultBackend: b });
        set({ defaultBackend: b });
      },
      setAuthoringOpen: (authoringOpen) => set({ authoringOpen }),
      setUi: (patch) => {
        const ui = sanitizeUi({ ...get().ui, ...patch });
        persist({ ui });
        set({ ui });
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
        const runs = Object.fromEntries(Object.entries(get().runs).filter(([, r]) => r.presetId !== id));
        persist({ presets, links });
        set({ presets, links, runs });
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
        if (!id || !preset || typeof value !== "number") return;
        const links = s.links[key] === id ? s.links : { ...s.links, [key]: id };
        const existing = s.runs[key];
        // Switching presets mid-run keeps the value from before the first one.
        const origin = existing?.origin ?? value;
        const plan = cfg.planner ? cfg.planner(key, preset, { origin, current: value }, s.params) : null;
        const run: SweepRun = { key, presetId: id, origin, startedAt: now(), plan, index: plan ? plan.start : -1 };
        const runs = { ...s.runs, [key]: run };
        const sweepOrigins = { ...s.sweepOrigins, [key]: origin };
        // The ticks are not history, but where the input stood before the run is: Ctrl+Z goes back to it.
        const history = existing ? {} : { past: [...s.past, s.params].slice(-100), future: [] as P[] };
        set({ links, runs, sweepOrigins, ...history });
        persist({ links });
      },
      pauseSweep: (key) => {
        const r = get().runs[key];
        if (!r || r.startedAt == null) return;
        set({ runs: { ...get().runs, [key]: { ...r, startedAt: null } } });
        // While paused the value is on screen to inspect; save it (a reload still restores the pre-sweep value).
        persist({});
      },
      toggleSweep: (key) => {
        const r = get().runs[key];
        if (!r) get().startSweep(key);
        else if (r.startedAt == null) set({ runs: { ...get().runs, [key]: { ...r, startedAt: now() } } });
        else get().pauseSweep(key);
      },
      stopSweep: (key) => {
        if (!get().runs[key]) return;
        const runs = { ...get().runs };
        delete runs[key];
        set({ runs });
        // Stop keeps the value: save it now, since the ticks were not saved.
        persist({});
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
        const params = Object.keys(patch).length ? sanitizeParams({ ...prev, ...patch }) : prev;
        const moved = keys.some((k) => valueOf(params, k) !== valueOf(prev, k));
        set({ runs, sweepOrigins, params, ...(moved ? { past: [...s.past, prev].slice(-100), future: [] } : {}) });
        persist({ params });
      },
      setRunIndex: (key, index) => {
        const r = get().runs[key];
        if (!r || r.index === index) return;
        set({ runs: { ...get().runs, [key]: { ...r, index } } });
      },
      pauseAll: () => {
        const runs = { ...get().runs };
        const anyRunning = Object.values(runs).some((r) => r.startedAt != null);
        for (const k of Object.keys(runs)) {
          const r = runs[k];
          runs[k] = anyRunning ? { ...r, startedAt: null } : { ...r, startedAt: now() };
        }
        set({ runs });
        if (anyRunning) persist({});
      },
      exportState: () => {
        const s = get();
        return { version: cfg.version, exportedAt: new Date().toISOString(), params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui, storyPrev: s.storyPrev };
      },
      importState: (text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
        }
        if (!parsed || typeof parsed !== "object") return { ok: false, error: "Expected a JSON object." };
        const obj = parsed as Partial<ExportedState<P, D>>;
        if (!obj.params || typeof obj.params !== "object") return { ok: false, error: 'Missing a "params" object.' };
        const params = sanitizeParams(obj.params);
        const overrides = sanitizeOverrides(obj.overrides);
        const datasets = cfg.datasets.sanitize(obj.datasets ?? get().datasets);
        const presets = obj.presets ? sanitizePresets(obj.presets, cfg.presets) : get().presets;
        const links = sanitizeLinks(obj.links ?? get().links, presets);
        const ui = sanitizeUi(obj.ui ?? get().ui);
        const backend = VALID_BACKENDS.includes(obj.defaultBackend as BackendId) ? (obj.defaultBackend as BackendId) : get().defaultBackend;
        const storyPrev = sanitizeStoryPrev(obj.storyPrev, overrides);
        set({ params, overrides, defaultBackend: backend, datasets, presets, links, ui, storyPrev, runs: {}, sweepOrigins: {} });
        save({ params, overrides, defaultBackend: backend, datasets, presets, links, ui, storyPrev, runs: [] });
        return { ok: true };
      },
      resetEverything: () => {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        set({ params: { ...defaults }, overrides: {}, defaultBackend, datasets: cfg.datasets.empty, presets: defaultPresets(), links: {}, runs: {}, sweepOrigins: {}, storyPrev: {}, ui: { ...defaultUi } });
      },
    };
  });
}
