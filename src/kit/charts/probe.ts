/**
 * Render probes: what a chart backend actually drew, read back from the library's
 * own model or its DOM, in terms every backend can be compared on. The parity
 * harness (./parity.ts, scripts/parity.mjs) compares them backend against backend.
 *
 * Positions and lengths are shares of the plot box (0 = left or bottom edge,
 * 1 = right or top edge), so they do not depend on how many px each library
 * spends on its axes.
 */

export type MarkKind = "bar" | "line" | "point" | "area" | "band";

export interface SeriesProbe {
  /** The series key (its field), with "~band" for the fill of a band. */
  key: string;
  kind: MarkKind;
  /**
   * Marks drawn: bars with a non-zero value, symbols, or the points a line or an
   * area passes through, counted inside the position axis range.
   */
  count: number;
  /** Bars: summed length along the value axis, as a share of that axis. Bands: area of the fill's bounding box as a share of the plot. */
  extent?: number;
  /** Bars: length-weighted centre along the position axis, as a share of that axis. */
  center?: number;
  /** Bars: median thickness across the position axis, in px. */
  thickness?: number;
}

export interface AxisProbe {
  kind: "linear" | "log" | "category";
  min?: number;
  max?: number;
  /** Categories in screen order: left to right, or top to bottom up the side. */
  categories?: string[];
}

export interface RenderProbe {
  backend: string;
  kind: "xy" | "heatmap";
  /** Bars run along the horizontal axis. */
  horizontal: boolean;
  /** The plot height the spec asked for (the host may raise it), which sets the tick count. */
  height?: number;
  /** The axis along the bottom, and the one up the left side. */
  h?: AxisProbe;
  v?: AxisProbe;
  series: SeriesProbe[];
  /** Reference lines drawn (vertical and horizontal). */
  lines: number;
  /** Shaded bands drawn (annotations, not series). */
  areas: number;
  /** Annotation dots drawn. */
  dots: number;
  /** Annotation labels drawn. */
  labels: number;
  /** Heatmap cells that carry a value. */
  cells?: number;
}

const KEY = "__chartProbe";

/** Attach a probe to the element a backend drew into, for headless tests to call. */
export function exposeProbe(el: HTMLElement, probe: () => Promise<RenderProbe>): void {
  Object.defineProperty(el, KEY, { value: probe, configurable: true, enumerable: false, writable: true });
}

export function readProbe(el: Element | null): (() => Promise<RenderProbe>) | undefined {
  return el ? ((el as unknown as Record<string, unknown>)[KEY] as (() => Promise<RenderProbe>) | undefined) : undefined;
}

/** Count of finite numbers in [lo, hi] (inclusive, with a little slack for rounding). */
export function inRange(v: unknown, lo: number, hi: number): boolean {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  const slack = Math.abs(hi - lo) * 1e-9 + 1e-12;
  return v >= Math.min(lo, hi) - slack && v <= Math.max(lo, hi) + slack;
}

/** Accumulates bar geometry into the probe's extent and centre. */
export class BarAccumulator {
  private len = 0;
  private moment = 0;
  constructor(
    private readonly valueAxisPx: number,
    private readonly positionAxisPx: number,
  ) {}
  /**
   * `length` along the value axis and `center` along the position axis, both in px
   * from the axis start. Bars centred outside the plot are clipped away by the
   * library and not counted, whatever geometry it still keeps for them.
   */
  add(length: number, center: number, thickness?: number): void {
    const l = Math.abs(length);
    if (!(l > 0) || !Number.isFinite(center)) return;
    if (center < -0.5 || center > this.positionAxisPx + 0.5) return;
    this.len += l;
    this.moment += l * center;
    if (thickness != null && Number.isFinite(thickness)) this.widths.push(Math.abs(thickness));
  }
  private widths: number[] = [];
  extent(): number {
    return this.valueAxisPx > 0 ? this.len / this.valueAxisPx : 0;
  }
  center(): number | undefined {
    return this.len > 0 && this.positionAxisPx > 0 ? this.moment / this.len / this.positionAxisPx : undefined;
  }
  /** Median bar thickness in px, when thicknesses were given. */
  thickness(): number | undefined {
    if (!this.widths.length) return undefined;
    const w = [...this.widths].sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  }
}
