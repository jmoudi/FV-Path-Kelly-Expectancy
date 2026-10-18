/**
 * A Markdown document read at run time and drawn by Markdown.tsx. The text is data: it is
 * fetched, never compiled into the bundle, so editing the file changes the page on the
 * next load without a rebuild.
 *
 * - Once per page load: the first mount fetches; every later mount (leaving the page and
 *   coming back) reuses that answer. Reload fetches again, past the browser's cache.
 * - The address is resolved against the page (document.baseURI), so a file published
 *   next to index.html is found wherever the build is served from.
 * - Above the text: "Loaded <time> · Reload". When the fetch fails (a missing file, a
 *   host that blocks it, offline, or an HTML page served in its place) one plain line
 *   says so, with Reload; a copy loaded earlier stays below it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { Markdown, type MarkdownProps } from "./Markdown";

export interface RemoteText {
  /** The text of the last successful load. */
  text?: string;
  /** When the last successful load finished (ms since the epoch). */
  loadedAt?: number;
  /** Why the last attempt failed; cleared by the next success. */
  error?: string;
  /** A fetch is in flight. */
  pending: boolean;
}

const IDLE: RemoteText = { pending: true };
const entries = new Map<string, RemoteText>();
const listeners = new Map<string, Set<() => void>>();

function set(src: string, next: RemoteText) {
  entries.set(src, next);
  listeners.get(src)?.forEach((f) => f());
}

/** The document's address, resolved against the page. */
export function resolveSrc(src: string): string {
  try {
    return typeof document !== "undefined" ? new URL(src, document.baseURI).href : src;
  } catch {
    return src;
  }
}

async function fetchText(src: string, fresh: boolean): Promise<void> {
  const prev = entries.get(src) ?? IDLE;
  set(src, { ...prev, pending: true });
  try {
    // Accept leaves out text/html, so a dev server's page fallback does not answer for a missing file.
    const res = await fetch(resolveSrc(src), { cache: fresh ? "reload" : "no-cache", headers: { Accept: "text/markdown, text/plain;q=0.9" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`);
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text) || /text\/html/i.test(res.headers.get("content-type") ?? "")) throw new Error("the server sent a web page instead of the file");
    set(src, { text, loadedAt: Date.now(), pending: false });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    set(src, { ...(entries.get(src) ?? IDLE), error: reason === "Failed to fetch" ? "the request was blocked or the network is down" : reason, pending: false });
  }
}

const inflight = new Map<string, Promise<void>>();

/** Starts the one load of this page's life, unless it has started already; resolves when it is done. */
export function loadOnce(src: string): Promise<void> {
  if (!entries.has(src)) inflight.set(src, fetchText(src, false));
  return inflight.get(src) ?? Promise.resolve();
}

/** Fetches again, past the browser's cache. */
export function reload(src: string): Promise<void> {
  const p = fetchText(src, true);
  inflight.set(src, p);
  return p;
}

/** What is known of the document now. */
export function peek(src: string): RemoteText {
  return entries.get(src) ?? IDLE;
}

/** Forget every load (tests). */
export function forgetRemoteText(): void {
  entries.clear();
  inflight.clear();
}

function subscribe(src: string, f: () => void): () => void {
  let s = listeners.get(src);
  if (!s) listeners.set(src, (s = new Set()));
  s.add(f);
  return () => void s!.delete(f);
}

export function useRemoteText(src: string): RemoteText {
  const state = useSyncExternalStore(
    (f) => subscribe(src, f),
    () => peek(src),
    () => IDLE,
  );
  useEffect(() => {
    void loadOnce(src);
  }, [src]);
  return state;
}

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export interface RemoteMarkdownProps extends Omit<MarkdownProps, "text"> {
  /** The file, relative to the page (e.g. "directives.md"). */
  src: string;
  /** A sentence after "Could not load <src>: <reason>." (where the file comes from, what to do). */
  failure?: string;
}

export function RemoteMarkdown({ src, failure, ...md }: RemoteMarkdownProps) {
  const { text, loadedAt, error, pending } = useRemoteText(src);
  const again = (
    <button type="button" className="k-md-reload" onClick={() => void reload(src)} disabled={pending}>
      Reload
    </button>
  );
  return (
    <div className="k-md-remote">
      {error ? (
        <p className="k-md-fail" role="status">
          {`Could not load ${src}: ${error}.`}
          {failure ? ` ${failure}` : ""}
          {text !== undefined && loadedAt !== undefined ? ` Below is the copy loaded at ${clock(loadedAt)}.` : ""} {pending ? "Reloading…" : again}
        </p>
      ) : (
        <p className="k-md-status" role="status">
          {text === undefined ? (
            <span>Loading {src}…</span>
          ) : (
            <>
              <span>{pending ? "Reloading…" : `Loaded ${clock(loadedAt!)}`}</span>
              <span aria-hidden="true">·</span>
              {again}
            </>
          )}
        </p>
      )}
      {text !== undefined && <Markdown text={text} {...md} />}
    </div>
  );
}
