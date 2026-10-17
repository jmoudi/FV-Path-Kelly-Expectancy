import { useEffect, useState } from "react";

export type Route = { page: "tour"; section?: string } | { page: "view"; id: string } | { page: "settings" };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h === "settings") return { page: "settings" };
  const m = /^view\/([\w-]+)$/.exec(h);
  if (m) return { page: "view", id: m[1] };
  const s = /^s-([\w-]+)$/.exec(h);
  if (s) return { page: "tour", section: s[1] };
  return { page: "tour" };
}

export function hrefFor(r: Route): string {
  if (r.page === "settings") return "#settings";
  if (r.page === "view") return `#view/${r.id}`;
  return r.section ? `#s-${r.section}` : "#tour";
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
