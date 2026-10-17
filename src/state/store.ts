import { create } from "zustand";
import { sanitizeOverride, type BackendId, type SpecOverride, type Story } from "../charts/spec";
import { DEFAULT_PARAMS, EMPTY_DATASETS, PARAM_BY_KEY, sanitizeDatasets, sanitizeParams, type Datasets, type Params } from "../model/params";

const STORAGE_KEY = "tranche-replay:v1";
const EXPORT_VERSION = 2;

export interface ExportedState {
  version: number;
  exportedAt: string;
  params: Params;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  datasets: Datasets;
}

interface AppState {
  params: Params;
  datasets: Datasets;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  authoringOpen: string | null;
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  setParams: (patch: Partial<Params>) => void;
  resetParams: () => void;
  setDataset: (kind: keyof Datasets, values: number[]) => void;
  setOverride: (id: string, patch: SpecOverride) => void;
  replaceOverride: (id: string, override: SpecOverride | null) => void;
  applyStory: (id: string, story: Story) => void;
  clearOverride: (id: string) => void;
  clearAllOverrides: () => void;
  setDefaultBackend: (b: BackendId) => void;
  setAuthoringOpen: (id: string | null) => void;
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

type Persisted = Pick<AppState, "params" | "overrides" | "defaultBackend" | "datasets">;

function save(state: Persisted) {
  try {
    const payload: ExportedState = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      params: state.params,
      overrides: state.overrides,
      defaultBackend: state.defaultBackend,
      datasets: state.datasets,
    };
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

const initial = load();

export const useStore = create<AppState>((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    const s = get();
    save({ params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets, ...patch });
  };
  return {
    params: sanitizeParams(initial.params ?? DEFAULT_PARAMS),
    datasets: sanitizeDatasets(initial.datasets ?? EMPTY_DATASETS),
    overrides: sanitizeOverrides(initial.overrides),
    defaultBackend: VALID_BACKENDS.includes(initial.defaultBackend as BackendId) ? (initial.defaultBackend as BackendId) : "echarts",
    authoringOpen: null,
    setParam: (key, value) => {
      const def = PARAM_BY_KEY[key];
      let v: unknown = value;
      if (def && def.unit !== "choice" && typeof value === "number") {
        v = Math.min(def.max, Math.max(def.min, value));
        if (def.unit === "int") v = Math.round(v as number);
      }
      const params = { ...get().params, [key]: v } as Params;
      persist({ params });
      set({ params });
    },
    setParams: (patch) => {
      const params = sanitizeParams({ ...get().params, ...patch });
      persist({ params });
      set({ params });
    },
    resetParams: () => {
      persist({ params: DEFAULT_PARAMS });
      set({ params: { ...DEFAULT_PARAMS } });
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
    replaceOverride: (id, override) => {
      const overrides = { ...get().overrides };
      if (override) overrides[id] = override;
      else delete overrides[id];
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
      let params = get().params;
      if (story.params && !active) params = sanitizeParams({ ...params, ...story.params });
      persist({ overrides, params });
      set({ overrides, params });
    },
    clearOverride: (id) => {
      const overrides = { ...get().overrides };
      delete overrides[id];
      persist({ overrides });
      set({ overrides });
    },
    clearAllOverrides: () => {
      persist({ overrides: {} });
      set({ overrides: {} });
    },
    setDefaultBackend: (defaultBackend) => {
      persist({ defaultBackend });
      set({ defaultBackend });
    },
    setAuthoringOpen: (authoringOpen) => set({ authoringOpen }),
    exportState: () => {
      const s = get();
      return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend, datasets: s.datasets };
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
      const defaultBackend = VALID_BACKENDS.includes(obj.defaultBackend as BackendId) ? (obj.defaultBackend as BackendId) : get().defaultBackend;
      set({ params, overrides, defaultBackend, datasets });
      save({ params, overrides, defaultBackend, datasets });
      return { ok: true };
    },
    resetEverything: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      set({ params: { ...DEFAULT_PARAMS }, overrides: {}, defaultBackend: "echarts", datasets: { record: [], moves: [] } });
    },
  };
});
