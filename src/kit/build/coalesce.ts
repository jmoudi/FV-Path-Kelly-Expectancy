/**
 * Build-request coalescing and the "rendered" signal, independent of what is built.
 *
 * BuildQueue: at most one request is in flight; while it runs, only the newest
 * request waits (older waiting ones are dropped, never sent). Every answer that is
 * newer than the last one shown is shown, so a stream of requests (a sweep, a fast
 * drag) renders each answer as it arrives instead of only the very latest request.
 *
 * SettleTracker: the page marks each shown answer as rendered (after the commit,
 * in the next animation frame) with the time its request was made. "Has a build
 * requested at or after t rendered?" is then one comparison, which is what a
 * frame-locked sweep waits on: a request made after a commit carries that commit.
 */

export interface Dispatch<Req> {
  id: number;
  req: Req;
  requestedAt: number;
}

export class BuildQueue<Req> {
  private nextId = 0;
  private inFlight: number | null = null;
  private inFlightReq: Dispatch<Req> | null = null;
  private waiting: Dispatch<Req> | null = null;
  private lastShown = 0;
  private latest = 0;
  private requested = new Map<number, number>();

  constructor(
    private readonly send: (d: Dispatch<Req>) => void,
    private readonly now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  ) {}

  /** Queue a request; returns its id. */
  request(req: Req): number {
    const id = ++this.nextId;
    const d: Dispatch<Req> = { id, req, requestedAt: this.now() };
    this.latest = id;
    this.requested.set(id, d.requestedAt);
    if (this.inFlight == null) this.dispatch(d);
    else {
      if (this.waiting) this.requested.delete(this.waiting.id);
      this.waiting = d;
    }
    return id;
  }

  private dispatch(d: Dispatch<Req>) {
    this.inFlight = d.id;
    this.inFlightReq = d;
    this.send(d);
  }

  /**
   * An answer arrived for request `id`. Sends the waiting request, if any, and says
   * whether to show this answer (it is newer than the last one shown) and when its
   * request was made.
   */
  answer(id: number): { show: boolean; requestedAt: number } {
    if (this.inFlight === id) {
      this.inFlight = null;
      this.inFlightReq = null;
    }
    const requestedAt = this.requested.get(id) ?? -Infinity;
    for (const k of [...this.requested.keys()]) if (k <= id) this.requested.delete(k);
    const show = id > this.lastShown;
    if (show) this.lastShown = id;
    if (this.inFlight == null && this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      this.dispatch(w);
    }
    return { show, requestedAt };
  }

  /** The backend failed: forget what is in flight and hand back the newest unanswered request to run elsewhere. */
  fail(): Dispatch<Req> | null {
    const lost = this.waiting ?? this.inFlightReq;
    this.inFlight = null;
    this.inFlightReq = null;
    this.waiting = null;
    return lost;
  }

  /** A request is newer than the last answer shown. */
  get pending(): boolean {
    return this.latest > this.lastShown;
  }

  get busy(): boolean {
    return this.inFlight != null;
  }

  /** Whether `id` is the newest request made. */
  isLatest(id: number): boolean {
    return id === this.latest;
  }

  /** Mark `id` as shown without an answer from the queue (an inline build). */
  shown(id: number): boolean {
    this.requested.delete(id);
    if (id <= this.lastShown) return false;
    this.lastShown = id;
    return true;
  }
}

export class SettleTracker<R = unknown> {
  private renderedAt = -Infinity;
  private listeners = new Set<() => void>();
  /** The last result rendered. */
  latest: R | null = null;
  /** How many answers have rendered. */
  count = 0;

  /** An answer whose request was made at `requestedAt` has rendered. */
  markRendered(requestedAt: number, result: R | null): void {
    this.renderedAt = Math.max(this.renderedAt, requestedAt);
    if (result != null) this.latest = result;
    this.count++;
    this.listeners.forEach((f) => f());
  }

  /** Has a build requested at or after `t` rendered? */
  settledSince(t: number): boolean {
    return this.renderedAt >= t;
  }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
}
