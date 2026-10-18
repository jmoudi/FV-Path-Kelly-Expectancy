/**
 * When may the wheel change a number field instead of scrolling the page? When the
 * field is focused, or when the pointer has rested on it for `hoverMs` with no page
 * scroll in progress. Anything else leaves the wheel to the page, so passing over a
 * field while scrolling never changes it.
 */

export const HOVER_MS = 400;

let lastScrollAt = -Infinity;
let watching = false;

/** Start recording page (and nested scroller) scrolls; idempotent. */
export function watchPageScroll(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  // Scroll events do not bubble; capturing on window sees the page and every inner scroller.
  window.addEventListener("scroll", () => (lastScrollAt = now()), { capture: true, passive: true });
}

/** When the page (or any scroller) last scrolled. */
export function lastPageScrollAt(): number {
  return lastScrollAt;
}

export interface WheelGateState {
  /** Focus is inside the field. */
  focused: boolean;
  /** When the pointer entered the field; null when it is not over it. */
  hoverSince: number | null;
  now: number;
  /** When the page last scrolled. */
  lastScrollAt: number;
  hoverMs?: number;
}

export function wheelAllowed(s: WheelGateState): boolean {
  if (s.focused) return true;
  if (s.hoverSince == null) return false;
  // A scroll restarts the hover clock: the field may have moved under a resting pointer.
  const since = Math.max(s.hoverSince, s.lastScrollAt);
  return s.now - since >= (s.hoverMs ?? HOVER_MS);
}

/**
 * Wheel deltas in pixels, accumulated so a trackpad's many small deltas step once per
 * notch's worth of travel while a mouse notch steps once. Returns the whole steps to
 * take (positive = up).
 */
export class WheelAccumulator {
  private acc = 0;
  constructor(private readonly notchPx = 50) {}
  push(e: { deltaY: number; deltaX?: number; deltaMode?: number }): number {
    const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX ?? 0) ? e.deltaY : (e.deltaX ?? 0);
    const px = raw * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(px) >= this.notchPx) {
      this.acc = 0;
      return px < 0 ? 1 : -1;
    }
    this.acc += px;
    const steps = Math.trunc(this.acc / this.notchPx);
    if (steps !== 0) this.acc -= steps * this.notchPx;
    return -steps;
  }
  reset(): void {
    this.acc = 0;
  }
}
