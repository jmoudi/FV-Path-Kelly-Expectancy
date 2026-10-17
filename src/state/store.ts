import { create } from "zustand";
import type { BackendId, SpecOverride } from "../charts/spec";
import { DEFAULT_PARAMS, PARAM_BY_KEY, sanitizeParams, type Params } from "../model/params";

const STORAGE_KEY = "tranche-replay:v1";
const EXPORT_VERSION = 1;

export interface ExportedState {
  version: number;
  exportedAt: string;
  params: Params;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
}

interface AppState {
  params: Params;
  overrides: Record<string, SpecOverride>;
  defaultBackend: BackendId;
  authoringOpen: string | null;
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  setParams: (patch: Partial<Params>) => void;
  resetParams: () => void;
  setOverride: (id: string, patch: SpecOverride) => void;
  clearOverride: (id: string) => void;
  clearAllOverrides: () => void;
  setDefaultBackend: (b: BackendId) => void;
  setAuthoringOpen: (id: string | null) => void;
  exportState: () => ExportedState;
  importState: (text: string) => { ok: true } | { ok: false; error: string };
}

function load(): Partial<ExportedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ExportedState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(state: Pick<AppState, "params" | "overrides" | "defaultBackend">) {
  try {
    const payload: ExportedState = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      params: state.params,
      overrides: state.overrides,
      defaultBackend: state.defaultBackend,
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
    if (v && typeof v === "object") out[k] = v as SpecOverride;
  }
  return out;
}

const initial = load();

export const useStore = create<AppState>((set, get) => ({
  params: sanitizeParams(initial.params ?? DEFAULT_PARAMS),
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
    set((s) => {
      const params = { ...s.params, [key]: v } as Params;
      save({ ...s, params });
      return { params };
    });
  },
  setParams: (patch) =>
    set((s) => {
      const params = sanitizeParams({ ...s.params, ...patch });
      save({ ...s, params });
      return { params };
    }),
  resetParams: () =>
    set((s) => {
      save({ ...s, params: DEFAULT_PARAMS });
      return { params: { ...DEFAULT_PARAMS } };
    }),
  setOverride: (id, patch) =>
    set((s) => {
      const overrides = { ...s.overrides, [id]: { ...(s.overrides[id] ?? {}), ...patch } };
      save({ ...s, overrides });
      return { overrides };
    }),
  clearOverride: (id) =>
    set((s) => {
      const overrides = { ...s.overrides };
      delete overrides[id];
      save({ ...s, overrides });
      return { overrides };
    }),
  clearAllOverrides: () =>
    set((s) => {
      save({ ...s, overrides: {} });
      return { overrides: {} };
    }),
  setDefaultBackend: (defaultBackend) =>
    set((s) => {
      save({ ...s, defaultBackend });
      return { defaultBackend };
    }),
  setAuthoringOpen: (authoringOpen) => set({ authoringOpen }),
  exportState: () => {
    const s = get();
    return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), params: s.params, overrides: s.overrides, defaultBackend: s.defaultBackend };
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
    const defaultBackend = VALID_BACKENDS.includes(obj.defaultBackend as BackendId) ? (obj.defaultBackend as BackendId) : get().defaultBackend;
    set({ params, overrides, defaultBackend });
    save({ params, overrides, defaultBackend });
    return { ok: true };
  },
}));
