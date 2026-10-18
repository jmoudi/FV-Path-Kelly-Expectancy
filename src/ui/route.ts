import { useEffect, useState } from "react";

/**
 * Hash routes. `#desk` is the landing page and the default for an empty or unknown
 * hash; `#explain` is the guided tour, with `#tour` and `#s-<section>` as aliases;
 * `#view/<id>` is one responsibility on its own page; `#settings` the full settings.
 */
export type Route = { page: "desk" } | { page: "explain"; section?: string } | { page: "view"; id: string } | { page: "settings" };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h === "settings") return { page: "settings" };
  if (h === "explain" || h === "tour") return { page: "explain" };
  const m = /^view\/([\w-]+)$/.exec(h);
  if (m) return { page: "view", id: m[1] };
  const s = /^s-([\w-]+)$/.exec(h);
  if (s) return { page: "explain", section: s[1] };
  return { page: "desk" };
}

export function hrefFor(r: Route): string {
  if (r.page === "settings") return "#settings";
  if (r.page === "view") return `#view/${r.id}`;
  if (r.page === "explain") return r.section ? `#s-${r.section}` : "#explain";
  return "#desk";
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(typeof location !== "undefined" ? location.hash : ""));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/*
 * The reading order of the views, registered by the app once the view-model exists,
 * so a key handler can step through them without knowing the view-model. The one
 * handler that binds [ and ] is App.tsx's useViewKeys.
 */
let viewOrder: string[] = [];

export function setViewOrder(ids: string[]): void {
  viewOrder = ids.slice();
}

/** The view one step before or after the current page (from a non-view page: the first or the last). */
export function neighbourView(dir: 1 | -1, current: Route = parseHash(typeof location !== "undefined" ? location.hash : "")): string | null {
  if (!viewOrder.length) return null;
  const i = current.page === "view" ? viewOrder.indexOf(current.id) : -1;
  if (i < 0) return dir === 1 ? viewOrder[0] : viewOrder[viewOrder.length - 1];
  return viewOrder[(i + dir + viewOrder.length) % viewOrder.length];
}

/** Go to the neighbouring view. Returns false when there is none. */
export function stepView(dir: 1 | -1): boolean {
  const id = neighbourView(dir);
  if (!id) return false;
  location.hash = `#view/${id}`;
  return true;
}
