/**
 * Greedy placement of text labels in a plot box, so that no two labels overlap.
 *
 * Generic: it knows boxes and candidates, nothing about charts' meaning. Each item
 * offers its candidate positions in order of preference; the first that neither
 * overlaps a label already placed nor leaves the bounds wins. When every candidate
 * collides, the least bad one (smallest overlap plus area outside the bounds) is used.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Candidate<T> {
  box: Box;
  value: T;
}

export interface Placed<T> {
  /** Index of the item in the input list. */
  item: number;
  /** Index of the candidate chosen. */
  choice: number;
  value: T;
  box: Box;
  /** True when no candidate was free and the least bad one was taken. */
  forced: boolean;
}

/** Minimum gap kept between two labels, in px. */
export const LABEL_GAP = 2;

export function overlapArea(a: Box, b: Box, gap = LABEL_GAP): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + gap;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + gap;
  return w > 0 && h > 0 ? w * h : 0;
}

export function overlaps(a: Box, b: Box, gap = LABEL_GAP): boolean {
  return overlapArea(a, b, gap) > 0;
}

/** Area of `box` that lies outside `bounds`. */
export function outsideArea(box: Box, bounds: Box): number {
  const area = Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
  const w = Math.max(0, Math.min(box.x1, bounds.x1) - Math.max(box.x0, bounds.x0));
  const h = Math.max(0, Math.min(box.y1, bounds.y1) - Math.max(box.y0, bounds.y0));
  return area - w * h;
}

/**
 * Place every item. `fixed` boxes (labels that never move) are obstacles from the
 * start. Items are placed in input order, so earlier items get their preferred spot.
 */
export function placeLabels<T>(items: Candidate<T>[][], bounds: Box, fixed: Box[] = []): Placed<T>[] {
  const taken: Box[] = [...fixed];
  const out: Placed<T>[] = [];
  items.forEach((cands, item) => {
    if (!cands.length) return;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const b = cands[i].box;
      const clash = taken.reduce((s, t) => s + overlapArea(b, t), 0);
      const out = outsideArea(b, bounds);
      if (clash === 0 && out <= 0.5) {
        best = i;
        bestScore = 0;
        break;
      }
      // Leaving the frame is worse than touching another label.
      const score = clash + 4 * out;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const c = cands[best];
    taken.push(c.box);
    out.push({ item, choice: best, value: c.value, box: c.box, forced: bestScore > 0 });
  });
  return out;
}

/** Relative advance widths for a proportional UI font, in em. */
const NARROW = new Set("il.,:;!|'`()[]{}ı1 ");
const WIDE = new Set("mwMW%×—@");

/**
 * Estimated width of a text in px. Deterministic, so every backend computes the
 * same placements; it errs on the wide side.
 */
export function estimateTextWidth(text: string, fontPx = 10.5): number {
  let em = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) em += 0.32;
    else if (WIDE.has(ch)) em += 0.86;
    else if (ch >= "A" && ch <= "Z") em += 0.66;
    else em += 0.56;
  }
  return em * fontPx;
}
