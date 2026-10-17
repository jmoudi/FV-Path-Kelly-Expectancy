import { create } from "zustand";
import { sanitizeOverride, type BackendId, type SpecOverride, type Story } from "../charts/spec";
import { DEFAULT_PARAMS, EMPTY_DATASETS, PARAM_BY_KEY, sanitizeDatasets, sanitizeParams, type Datasets, type Params } from "../model/params";
import { DEFAULT_PRESETS, type SweepPreset, type SweepRange, type SweepRun } from "../sweeps/types";

const STORAGE_KEY = "tranche-replay:v1";
const EXPORT_VERSION = 3;

export interface UiSettings {
  /** How many times a second a running sweep commits a value. */
  sweepHz: number;
  /** Multiplier on every input's drag sensitivity. */
  dragSensitivity: number;
  /** The deck bar starts expanded. */
  deckExpanded: boolean;
}

const DEFAULT_UI: UiSettings = { sweepHz: 5, dragSensitivity: 1, deckExpanded: false };

export interface ExportedState {
  version: number;
  exportedAt: string;
  params: Params;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  datasets: Datasets;
  presets: SweepPreset[];
  links: Record<string, string>;
  ui: UiSettings;
}

interface AppState {
  params: Params;
  datasets: Datasets;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  authoringOpen: string | null;
  presets: SweepPreset[];
  /** input key -> preset id */
  links: Record<string, string>;
  /** input key -> running sweep (transient) */
  runs: Record<string, SweepRun>;
  /** chart id -> the parameters a story moved, as they were before it (transient). */
  storyPrev: Record<string, Partial<Params>>;
  activeInput: string | null;
  ui: UiSettings;
  /** Undo stack of parameter states (most recent last). Sweep ticks are not recorded. */
  past: Params[];
  future: Params[];
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  setParams: (patch: Partial<Params>, opts?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  resetParams: () => void;
  setDataset: (kind: keyof Datasets, values: number[]) => void;
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
  stopSweep: (key: string) => void;
  pauseAll: () => void;
  exportState: () => ExportedState;
  importState: (text: string) => { ok: true } | { ok: false; error: string };
  resetEverything: () => void;
}

function load(): Partial<ExportedState> {
  try {
    if (typeof location !== "undefined" && location.hash === "#reset") {
      localStorage.removeItem(STORAGE_KEY);
      history.replaceState(null, "", location.pathname + location.search);
      return {};
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ExportedState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

type Persisted = Pick<AppState, "params" | "overrides" | "defaultBackend" | "datasets" | "presets" | "links" | "ui">;

function save(state: Persisted) {
  try {
    const payload: ExportedState = { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable: the app works without it */
  }
}

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

export function sanitizePreset(input: unknown): SweepPreset | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^[\w-]{1,64}$/.test(o.id)) return null;
  const kind = o.kind === "loop" || o.kind === "pingpong" || o.kind === "scenarios" ? o.kind : "loop";
  const r = (o.range && typeof o.range === "object" ? o.range : {}) as Record<string, unknown>;
  const mode: SweepRange["mode"] = r.mode === "fraction" || r.mode === "absolute" ? r.mode : "full";
  const range: SweepRange = mode === "full" ? { mode } : { mode, lo: num(r.lo, -1e12, 1e12, 0), hi: num(r.hi, -1e12, 1e12, 1) };
  const scenarios = Array.isArray(o.scenarios)
    ? o.scenarios
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({ at: num(s.at, -1e12, 1e12, 0.5), holdMs: num(s.holdMs, 50, 600_000, 2000) }))
        .slice(0, 32)
    : [];
  return {
    id: o.id,
    name: typeof o.name === "string" ? o.name.slice(0, 80) : o.id,
    kind,
    range,
    stepFraction: num(o.stepFraction, 0.0005, 1, 0.02),
    intervalMs: num(o.intervalMs, 10, 600_000, 300),
    smooth: typeof o.smooth === "boolean" ? o.smooth : true,
    scenarios,
  };
}

function sanitizePresets(input: unknown): SweepPreset[] {
  if (!Array.isArray(input)) return DEFAULT_PRESETS.map((p) => ({ ...p }));
  const out = input.map(sanitizePreset).filter((p): p is SweepPreset => !!p);
  return out.length ? out : DEFAULT_PRESETS.map((p) => ({ ...p }));
}

function sanitizeLinks(input: unknown, presets: SweepPreset[]): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const ids = new Set(presets.map((p) => p.id));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) if (PARAM_BY_KEY[k] && typeof v === "string" && ids.has(v)) out[k] = v;
  return out;
}

function sanitizeUi(input: unknown): UiSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    sweepHz: num(o.sweepHz, 1, 30, DEFAULT_UI.sweepHz),
    dragSensitivity: num(o.dragSensitivity, 0.25, 4, DEFAULT_UI.dragSensitivity),
    deckExpanded: typeof o.deckExpanded === "boolean" ? o.deckExpanded : DEFAULT_UI.deckExpanded,
  };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Keep the last 100 parameter states; coalesce rapid edits of the same field within 400 ms. */
let lastHistoryAt = 0;
function pushHistory(past: Params[], prev: Params): Params[] {
  const t = now();
  const coalesce = t - lastHistoryAt < 400 && past.length > 0;
  lastHistoryAt = t;
  if (coalesce) return past;
  return [...past, prev].slice(-100);
}

const initial = load();
const initialPresets = sanitizePresets(initial.presets);

export const useStore = create<AppState>((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    const s = get();
    save({ params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui, ...patch });
  };
  return {
    params: sanitizeParams(initial.params ?? DEFAULT_PARAMS),
    datasets: sanitizeDatasets(initial.datasets ?? EMPTY_DATASETS),
    overrides: sanitizeOverrides(initial.overrides),
    defaultBackend: VALID_BACKENDS.includes(initial.defaultBackend as BackendId) ? (initial.defaultBackend as BackendId) : "echarts",
    authoringOpen: null,
    presets: initialPresets,
    links: sanitizeLinks(initial.links, initialPresets),
    runs: {},
    storyPrev: {},
    activeInput: null,
    ui: sanitizeUi(initial.ui),
    past: [],
    future: [],
    setParam: (key, value) => {
      const def = PARAM_BY_KEY[key];
      let v: unknown = value;
      if (def && def.unit !== "choice" && typeof value === "number") {
        v = Math.min(def.max, Math.max(def.min, value));
        if (def.unit === "int") v = Math.round(v as number);
      }
      const prev = get().params;
      if (prev[key] === v) return;
      const params = { ...prev, [key]: v } as Params;
      persist({ params });
      set({ params, past: pushHistory(get().past, prev), future: [] });
    },
    setParams: (patch, opts) => {
      const prev = get().params;
      const params = sanitizeParams({ ...prev, ...patch });
      persist({ params });
      if (opts?.history === false) set({ params });
      else set({ params, past: pushHistory(get().past, prev), future: [] });
    },
    undo: () => {
      const { past, params, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      persist({ params: prev });
      set({ params: prev, past: past.slice(0, -1), future: [params, ...future].slice(0, 100) });
    },
    redo: () => {
      const { past, params, future } = get();
      if (!future.length) return;
      const next = future[0];
      persist({ params: next });
      set({ params: next, past: pushHistory(past, params), future: future.slice(1) });
    },
    resetParams: () => {
      const prev = get().params;
      persist({ params: DEFAULT_PARAMS });
      set({ params: { ...DEFAULT_PARAMS }, past: pushHistory(get().past, prev), future: [] });
    },
    setDataset: (kind, values) => {
      const datasets = sanitizeDatasets({ ...get().datasets, [kind]: values });
      persist({ datasets });
      set({ datasets });
    },
    setOverride: (id, patch) => {
      const prev = get().overrides[id] ?? {};
      const merged = sanitizeOverride({ ...prev, ...patch, story: undefined }) ?? {};
      const overrides = { ...get().overrides, [id]: merged };
      persist({ overrides });
      set({ overrides });
    },
    applyStory: (id, story) => {
      const current = get().overrides[id];
      const active = current?.story === story.id;
      // A story replaces the chart's edits; clicking the active story turns it off.
      const next = active ? null : story.patch ? { ...story.patch, story: story.id } : { story: story.id };
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
        // Snapshot what it is about to move, unless an earlier story on this chart already did.
        const snap: Partial<Params> = storyPrev[id] ?? {};
        for (const k of Object.keys(story.params) as (keyof Params)[]) if (!(k in snap)) (snap as Record<string, unknown>)[k] = prev[k];
        storyPrev[id] = snap;
        params = sanitizeParams({ ...params, ...story.params });
      } else {
        delete storyPrev[id];
      }
      persist({ overrides, params });
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
      persist({ overrides, params });
      set({ overrides, params, storyPrev, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
    },
    clearAllOverrides: () => {
      const prev = get().params;
      let params = prev;
      for (const back of Object.values(get().storyPrev)) params = { ...params, ...back };
      params = params === prev ? prev : sanitizeParams(params);
      persist({ overrides: {}, params });
      set({ overrides: {}, params, storyPrev: {}, ...(params !== prev ? { past: pushHistory(get().past, prev), future: [] } : {}) });
    },
    setDefaultBackend: (defaultBackend) => {
      persist({ defaultBackend });
      set({ defaultBackend });
    },
    setAuthoringOpen: (authoringOpen) => set({ authoringOpen }),
    setUi: (patch) => {
      const ui = sanitizeUi({ ...get().ui, ...patch });
      persist({ ui });
      set({ ui });
    },
    setActiveInput: (activeInput) => set({ activeInput }),
    upsertPreset: (p) => {
      const clean = sanitizePreset(p);
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
      const runs = { ...get().runs };
      if (runs[key] && runs[key].presetId !== presetId) delete runs[key];
      persist({ links });
      set({ links, runs });
    },
    cyclePreset: (key, dir) => {
      const { presets, links } = get();
      if (!presets.length) return;
      const i = presets.findIndex((p) => p.id === links[key]);
      const next = presets[(i + dir + presets.length) % presets.length];
      get().linkPreset(key, next.id);
      if (get().runs[key]) get().startSweep(key, next.id);
    },
    startSweep: (key, presetId) => {
      const id = presetId ?? get().links[key] ?? get().presets[0]?.id;
      if (!id) return;
      if (!get().links[key] || get().links[key] !== id) get().linkPreset(key, id);
      const runs = { ...get().runs, [key]: { key, presetId: id, elapsedMs: 0, startedAt: now() } };
      // The sweep's ticks are not history, but where the input stood before it started is.
      set({ runs, past: [...get().past, get().params].slice(-100), future: [] });
    },
    pauseSweep: (key) => {
      const r = get().runs[key];
      if (!r || r.startedAt == null) return;
      set({ runs: { ...get().runs, [key]: { ...r, elapsedMs: r.elapsedMs + (now() - r.startedAt), startedAt: null } } });
    },
    toggleSweep: (key) => {
      const r = get().runs[key];
      if (!r) get().startSweep(key);
      else if (r.startedAt == null) set({ runs: { ...get().runs, [key]: { ...r, startedAt: now() } } });
      else get().pauseSweep(key);
    },
    stopSweep: (key) => {
      const runs = { ...get().runs };
      delete runs[key];
      set({ runs });
    },
    pauseAll: () => {
      const runs = { ...get().runs };
      const anyRunning = Object.values(runs).some((r) => r.startedAt != null);
      for (const k of Object.keys(runs)) {
        const r = runs[k];
        runs[k] = anyRunning ? (r.startedAt == null ? r : { ...r, elapsedMs: r.elapsedMs + (now() - r.startedAt), startedAt: null }) : { ...r, startedAt: now() };
      }
      set({ runs });
    },
    exportState: () => {
      const s = get();
      return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, presets: s.presets, links: s.links, ui: s.ui };
    },
    importState: (text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
      }
      if (!parsed || typeof parsed !== "object") return { ok: false, error: "Expected a JSON object." };
      const obj = parsed as Partial<ExportedState>;
      if (!obj.params || typeof obj.params !== "object") return { ok: false, error: 'Missing a "params" object.' };
      const params = sanitizeParams(obj.params);
      const overrides = sanitizeOverrides(obj.overrides);
      const datasets = sanitizeDatasets(obj.datasets ?? get().datasets);
      const presets = obj.presets ? sanitizePresets(obj.presets) : get().presets;
      const links = sanitizeLinks(obj.links ?? get().links, presets);
      const ui = sanitizeUi(obj.ui ?? get().ui);
      const defaultBackend = VALID_BACKENDS.includes(obj.defaultBackend as BackendId) ? (obj.defaultBackend as BackendId) : get().defaultBackend;
      set({ params, overrides, defaultBackend, datasets, presets, links, ui, runs: {} });
      save({ params, overrides, defaultBackend, datasets, presets, links, ui });
      return { ok: true };
    },
    resetEverything: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      set({ params: { ...DEFAULT_PARAMS }, overrides: {}, defaultBackend: "echarts", datasets: { record: [], moves: [] }, presets: DEFAULT_PRESETS.map((p) => ({ ...p })), links: {}, runs: {}, ui: { ...DEFAULT_UI } });
    },
  };
});
