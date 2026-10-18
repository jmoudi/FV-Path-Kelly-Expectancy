/**
 * Bar layout shared by every backend: whether bar series sit side by side, on top
 * of each other or stacked, how thick a bar is, and where each series' bar sits
 * relative to its position. Computing this once is what keeps three chart libraries
 * from each inventing their own grouping (one of them offset bars that did not
 * share a position, and drew one off the axis).
 */

export interface PositionAxis {
  min: number;
  max: number;
  scale: "linear" | "log";
  categorical: boolean;
}

export interface BarSeriesInput {
  key: string;
  /** Positions (x values, or categories) at which the series has a finite value. */
  positions: (number | string)[];
}

export type BarMode = "single" | "group" | "overlay" | "stack";

export interface BarPlan {
  mode: BarMode;
  /** Series keys in drawing order. */
  keys: string[];
  /**
   * Bar thickness along the position axis in px, for numeric positions. Null on a
   * categorical axis, where the band decides: the bars of one category fill
   * BAND_FILL of it.
   */
  thicknessPx: number | null;
  /** Centre offset of each series' bar from its position, in px along the position axis. */
  offsetsPx: Record<string, number>;
}

/** Share of a category's band the bars of that category fill (the rest is the gap). */
export const BAND_FILL = 0.75;
/** Gap between two bars of one group on a numeric axis, in px. */
export const GROUP_GAP_PX = 1;

/** Map a value on the axis to px from the axis start (0 … axisPx). */
export function toPx(v: number, axis: PositionAxis, axisPx: number): number {
  if (axis.scale === "log") {
    const lo = Math.log10(axis.min);
    const hi = Math.log10(axis.max);
    return ((Math.log10(v) - lo) / (hi - lo || 1)) * axisPx;
  }
  return ((v - axis.min) / (axis.max - axis.min || 1)) * axisPx;
}

/** Move a value by `px` along the axis and return the new value. */
export function shiftByPx(v: number, px: number, axis: PositionAxis, axisPx: number): number {
  if (!px) return v;
  if (axis.scale === "log") {
    const decadesPerPx = (Math.log10(axis.max) - Math.log10(axis.min)) / Math.max(1, axisPx);
    return v * Math.pow(10, px * decadesPerPx);
  }
  return v + (px * (axis.max - axis.min)) / Math.max(1, axisPx);
}

/** The data-unit width of `px` on a linear axis. */
export function spanOfPx(px: number, axis: PositionAxis, axisPx: number): number {
  return (px * (axis.max - axis.min)) / Math.max(1, axisPx);
}

/**
 * Plan the bars. Series that ever share a position are grouped side by side;
 * series whose positions never meet are overlaid at their own positions (grouping
 * them would push each bar away from where it belongs).
 */
export function planBars(series: BarSeriesInput[], opts: { axis: PositionAxis; axisPx: number; stack?: boolean; thicknessPx?: number }): BarPlan {
  const keys = series.map((s) => s.key);
  const offsetsPx: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const m = series.length;
  let mode: BarMode = m <= 1 ? "single" : opts.stack ? "stack" : "overlay";
  if (mode === "overlay") {
    const seen = new Map<string, number>();
    for (const s of series) for (const p of new Set(s.positions.map(String))) seen.set(p, (seen.get(p) ?? 0) + 1);
    if ([...seen.values()].some((c) => c > 1)) mode = "group";
  }
  if (opts.axis.categorical) return { mode, keys, thicknessPx: null, offsetsPx };
  // Thickness: the hint, else a share of the typical (median) spacing between two
  // positions; either way never so thick that neighbouring groups run into each other.
  const all = [...new Set(series.flatMap((s) => s.positions.filter((p): p is number => typeof p === "number")))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < all.length; i++) gaps.push(toPx(all[i], opts.axis, opts.axisPx) - toPx(all[i - 1], opts.axis, opts.axisPx));
  gaps.sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  const perPosition = mode === "group" ? m : 1;
  const fit = Number.isFinite(gap) ? (gap * BAND_FILL - (perPosition - 1) * GROUP_GAP_PX) / perPosition : Infinity;
  let thickness = opts.thicknessPx ?? 0;
  if (!thickness) thickness = Number.isFinite(fit) ? fit : opts.axisPx / 8;
  thickness = Math.max(1, Math.min(48, thickness, fit));
  if (mode === "group") {
    const step = thickness + GROUP_GAP_PX;
    series.forEach((s, i) => (offsetsPx[s.key] = (i - (m - 1) / 2) * step));
  }
  return { mode, keys, thicknessPx: thickness, offsetsPx };
}

/**
 * Bases of stacked bars: for each series, the running total of the earlier series
 * at the same position (positive and negative values stack separately).
 */
export function stackBases(values: (number | null)[][]): (number | null)[][] {
  const n = values[0]?.length ?? 0;
  const pos = new Array<number>(n).fill(0);
  const neg = new Array<number>(n).fill(0);
  return values.map((row) =>
    row.map((v, i) => {
      if (v == null || !Number.isFinite(v)) return null;
      const b = v >= 0 ? pos[i] : neg[i];
      if (v >= 0) pos[i] += v;
      else neg[i] += v;
      return b;
    }),
  );
}

/**
 * Vertices of a stepped line. "after" holds each value until the next point;
 * "middle" changes level halfway between two points and extends the first and last
 * levels by the same half step, so every point owns a flat segment centred on it.
 */
export function stepVertices(points: [number, number | null][], mode: "after" | "middle"): [number, number | null][] {
  const out: [number, number | null][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    const next = points[i + 1];
    if (mode === "after") {
      out.push([x, y]);
      if (next && y != null) out.push([next[0], y]);
      continue;
    }
    const prev = points[i - 1];
    const left = prev ? (prev[0] + x) / 2 : next ? x - (next[0] - x) / 2 : x;
    const right = next ? (x + next[0]) / 2 : prev ? x + (x - prev[0]) / 2 : x;
    if (y == null) {
      out.push([x, null]);
      continue;
    }
    out.push([left, y], [right, y]);
  }
  return out;
}
