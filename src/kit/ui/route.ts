import { useEffect, useRef, useState } from "react";
import { useBus } from "@kit/events/react";

/**
 * Hash routes. Two shapes are built in, because kit frames link to them: a view page
 * (#view/<id>) and a section of the sections page (#s-<id>). The app names its other
 * pages, its landing page (also the default for an empty or unknown hash) and any
 * aliases in a RouteConfig, a module constant it passes to useRoute. A page's part is
 * #<page>/<part> (a section of the guide page: #guide/keys). #el-<id> is not a route:
 * it is an anchor on the open page, which `Link` (./Link.tsx) scrolls to.
 *
 * The shell calls useRoute once; every move to another route is announced as
 * route:changed on the event bus, so nothing else needs its own hashchange listener.
 * An #el-<id> in the address is no move: the open page stays and nothing is announced
 * (the link that scrolled there says route:jumped).
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
/** An in-page anchor: the element with DOM id `id` on whatever page is open (`Link` scrolls to it). */
export const anchorHref = (id: string) => `#el-${id}`;

/** The route a hash names, or null when it names none (an unknown word, an in-page anchor). An empty hash is the home page. */
export function matchHash(hash: string, cfg: RouteConfig): Route | null {
  const h = hash.replace(/^#/, "");
  if (!h) return { page: cfg.home };
  const v = /^view\/([\w-]+)$/.exec(h);
  if (v) return { page: "view", id: v[1] };
  const s = /^s-([\w-]+)$/.exec(h);
  if (s) return { page: cfg.sectionsPage, section: s[1] };
  // #<page>/<part>: a part of one of the app's pages (a section of a guide page).
  const sub = /^([\w-]+)\/([\w-]+)$/.exec(h);
  if (sub && cfg.pages.includes(cfg.aliases?.[sub[1]] ?? sub[1])) return { page: cfg.aliases?.[sub[1]] ?? sub[1], section: sub[2] };
  const name = cfg.aliases?.[h] ?? h;
  return cfg.pages.includes(name) ? { page: name } : null;
}

export function parseHash(hash: string, cfg: RouteConfig): Route {
  return matchHash(hash, cfg) ?? { page: cfg.home };
}

/**
 * The DOM id of the element a route's part names: a section of the sections page is
 * `s-<id>`, the part of another page `<page>-<part>` (the guide's section "keys" is
 * `guide-keys`). Undefined for a route without a part.
 */
export function partElementId(r: Route, cfg: RouteConfig): string | undefined {
  if (!r.section) return undefined;
  return r.page === cfg.sectionsPage ? `s-${r.section}` : `${r.page}-${r.section}`;
}

/*
 * The app's routes, registered by useRoute (or setRouteConfig), so a Link can tell a
 * jump within the open page from a switch to another page without being handed them.
 */
let activeConfig: RouteConfig | null = null;

export function setRouteConfig(cfg: RouteConfig | null): void {
  activeConfig = cfg;
}

export function routeConfig(): RouteConfig | null {
  return activeConfig;
}

export function hrefFor(r: Route, cfg: RouteConfig): string {
  if (r.page === "view" && r.id) return viewHref(r.id);
  if (r.page === cfg.sectionsPage && r.section) return sectionHref(r.section);
  if (r.section) return `#${r.page}/${r.section}`;
  return `#${r.page}`;
}

const sameRoute = (a: Route, b: Route) => a.page === b.page && a.id === b.id && a.section === b.section;

/** The route in the address, kept current; call it once, in the shell (route:changed tells everyone else). */
export function useRoute(cfg: RouteConfig): Route {
  const bus = useBus();
  // Registered during render, so links rendered in the same pass already know the routes.
  activeConfig = cfg;
  const [route, setRoute] = useState<Route>(() => parseHash(typeof location !== "undefined" ? location.hash : "", cfg));
  const current = useRef(route);
  useEffect(() => {
    const on = () => {
      // An in-page anchor (#el-<id>) in the address keeps the page that is open.
      if (/^#el-/.test(location.hash)) return;
      const from = current.current;
      const to = parseHash(location.hash, cfg);
      current.current = to;
      setRoute(to);
      if (!sameRoute(from, to)) bus.emit("route:changed", { from, to });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [cfg, bus]);
  return route;
}

/** The view open now, from the hash, or null on any other page. */
function currentViewId(): string | null {
  const m = typeof location !== "undefined" ? /^#?view\/([\w-]+)$/.exec(location.hash) : null;
  return m ? m[1] : null;
}

/**
 * The view one step before or after the current page in `order` (the views' reading
 * order, from the view-model), or from a non-view page the first or the last.
 */
export function neighbourView(order: readonly string[], dir: 1 | -1, current: string | null = currentViewId()): string | null {
  if (!order.length) return null;
  const i = current != null ? order.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? order[0] : order[order.length - 1];
  return order[(i + dir + order.length) % order.length];
}

/** Go to the neighbouring view in `order`. Returns false when there is none. */
export function stepView(order: readonly string[], dir: 1 | -1): boolean {
  const id = neighbourView(order, dir);
  if (!id) return false;
  location.hash = viewHref(id);
  return true;
}
