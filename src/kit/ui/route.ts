import { useEffect, useState } from "react";

/**
 * Hash routes. Two shapes are built in, because kit frames link to them: a view page
 * (#view/<id>) and a section of the sections page (#s-<id>). The app names its other
 * pages, its landing page (also the default for an empty or unknown hash) and any
 * aliases in a RouteConfig, a module constant it passes to useRoute. A page's part is
 * #<page>/<part> (a section of the guide page: #guide/keys).
 */
export interface Route {
  page: string;
  /** The view id on page "view". */
  id?: string;
  /** The section to scroll to on the sections page, or the part of another page (#<page>/<part>). */
  section?: string;
}

export interface RouteConfig {
  /** The page for an empty or unknown hash. */
  home: string;
  /** Pages addressed as #<name>. */
  pages: readonly string[];
  /** Other names that open a page, e.g. { tour: "explain" }. */
  aliases?: Record<string, string>;
  /** The page whose sections #s-<id> scrolls to. */
  sectionsPage: string;
}

export const viewHref = (id: string) => `#view/${id}`;
export const sectionHref = (id: string) => `#s-${id}`;

export function parseHash(hash: string, cfg: RouteConfig): Route {
  const h = hash.replace(/^#/, "");
  const v = /^view\/([\w-]+)$/.exec(h);
  if (v) return { page: "view", id: v[1] };
  const s = /^s-([\w-]+)$/.exec(h);
  if (s) return { page: cfg.sectionsPage, section: s[1] };
  // #<page>/<part>: a part of one of the app's pages (a section of a guide page).
  const sub = /^([\w-]+)\/([\w-]+)$/.exec(h);
  if (sub && cfg.pages.includes(cfg.aliases?.[sub[1]] ?? sub[1])) return { page: cfg.aliases?.[sub[1]] ?? sub[1], section: sub[2] };
  const name = cfg.aliases?.[h] ?? h;
  return cfg.pages.includes(name) ? { page: name } : { page: cfg.home };
}

export function hrefFor(r: Route, cfg: RouteConfig): string {
  if (r.page === "view" && r.id) return viewHref(r.id);
  if (r.page === cfg.sectionsPage && r.section) return sectionHref(r.section);
  if (r.section) return `#${r.page}/${r.section}`;
  return `#${r.page}`;
}

export function useRoute(cfg: RouteConfig): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(typeof location !== "undefined" ? location.hash : "", cfg));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash, cfg));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [cfg]);
  return route;
}

/*
 * The reading order of the views, registered by the app once the view-model exists,
 * so a key handler can step through them without knowing the view-model.
 */
let viewOrder: string[] = [];

export function setViewOrder(ids: string[]): void {
  viewOrder = ids.slice();
}

/** The view open now, from the hash, or null on any other page. */
function currentViewId(): string | null {
  const m = typeof location !== "undefined" ? /^#?view\/([\w-]+)$/.exec(location.hash) : null;
  return m ? m[1] : null;
}

/** The view one step before or after the current page (from a non-view page: the first or the last). */
export function neighbourView(dir: 1 | -1, current: string | null = currentViewId()): string | null {
  if (!viewOrder.length) return null;
  const i = current != null ? viewOrder.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? viewOrder[0] : viewOrder[viewOrder.length - 1];
  return viewOrder[(i + dir + viewOrder.length) % viewOrder.length];
}

/** Go to the neighbouring view. Returns false when there is none. */
export function stepView(dir: 1 | -1): boolean {
  const id = neighbourView(dir);
  if (!id) return false;
  location.hash = viewHref(id);
  return true;
}
