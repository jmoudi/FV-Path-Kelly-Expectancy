/**
 * In-app links. `Link` renders every link inside the app; nothing it does reloads the
 * page. Its `to` is one of:
 *
 * - a route (`#desk`, `#explain`, `#s-<section>`, `#view/<id>`, `#guide/<part>`,
 *   `#settings`): the hash changes and the router renders. When the route is a part of
 *   the page already open (another section of Explain, another section of the Guide)
 *   and that part is on screen, the link scrolls there smoothly instead, below the
 *   sticky top bar and deck, marks it for a moment, and records the address in the
 *   history without the browser's jump;
 * - an in-page anchor (`#el-<id>`, see `anchorHref`): the element with DOM id `<id>` on
 *   the open page, scrolled to and marked the same way; the address stays the page's;
 * - anything else (`https://…`): an external link, in a new tab, with "↗" after it.
 *
 * Ctrl- or ⌘-click and a middle click open a new tab with the same address (the route,
 * or for an in-page anchor the page it is on). Enter follows a focused link.
 *
 * Text links are underlined (`.k-link`); `variant="plain"` keeps the behaviour without
 * the underline, for rails, chips, crumbs and icon buttons.
 *
 * Scrolling to a target is this module's alone: `followLink` for a click, and
 * `useRevealTarget` for a page that opens on a part (the address on load, or a link from
 * another page), which also holds the target in place while content above it arrives.
 * A jump within the open page is announced on the bus as `route:jumped`.
 *
 * `rich(text)` renders inline markup in any copy string: `[label](to)` through Link,
 * `code` (a quote with a space in it is set without the chip), **term**, {{a:Name}} (a
 * name after its 8px identity dot, role a, b, c, good or loss) and {icon:name} (a tool's
 * drawn icon, as the screen shows it). Strings stay plain data, so view-models built in
 * a worker can carry links; `plainText` strips the markup for titles and labels.
 */
import { forwardRef, Fragment, useEffect, type AnchorHTMLAttributes, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { Bus } from "@kit/events/bus";
import { useOptionalBus } from "@kit/events/react";
import { Icon, type IconName } from "./Icon";
import { matchHash, parseHash, partElementId, routeConfig, type Route, type RouteConfig } from "./route";

export type LinkTarget =
  /** An element of the open page, by DOM id. */
  | { kind: "anchor"; elementId: string }
  /** A route; `samePage` when it is a part of the page open now, `elementId` the part's element. */
  | { kind: "route"; hash: string; route: Route | null; samePage: boolean; elementId?: string }
  | { kind: "external"; href: string };

/** What a link points at, from the routes and the address now. Pure: the tests read it. */
export function resolveLink(to: string, cfg: RouteConfig | null, currentHash: string): LinkTarget {
  if (!to.startsWith("#")) return { kind: "external", href: to };
  const h = to.slice(1);
  if (h.startsWith("el-")) return { kind: "anchor", elementId: h.slice(3) };
  if (!cfg) return { kind: "route", hash: to, route: null, samePage: false };
  const r = matchHash(to, cfg);
  // A word that is no route names an element of this page (`#chart-x`).
  if (!r) return { kind: "anchor", elementId: h };
  const cur = /^#?el-/.test(currentHash) ? null : parseHash(currentHash, cfg);
  const samePage = !!cur && cur.page === r.page && (r.page !== "view" || cur.id === r.id);
  const elementId = partElementId(r, cfg);
  return elementId ? { kind: "route", hash: to, route: r, samePage, elementId } : { kind: "route", hash: to, route: r, samePage };
}

/*
 * A jump a link has started, so the page that renders the route next does not scroll a
 * second time (handled) or knows to mark the target (not handled yet: another page).
 */
let pending: { id: string; handled: boolean; at: number } | null = null;

function takePending(id: string): { handled: boolean } | null {
  const p = pending;
  if (!p || p.id !== id || Date.now() - p.at > 4000) return null;
  pending = null;
  return p;
}

const FLASH_MS = 1800;

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll an element to the top of the reading area (its scroll-margin keeps it below
 * the sticky top bar and deck), optionally smoothly and with a brief mark.
 */
export function revealElement(el: HTMLElement, { smooth = true, highlight = true, focus = false }: { smooth?: boolean; highlight?: boolean; focus?: boolean } = {}): void {
  el.scrollIntoView({ behavior: smooth && !reducedMotion() ? "smooth" : "auto", block: "start" });
  if (highlight) {
    el.classList.remove("k-flash");
    // Restart the mark if it is still running from an earlier jump.
    void el.offsetWidth;
    el.classList.add("k-flash");
    window.setTimeout(() => el.classList.remove("k-flash"), FLASH_MS);
  }
  if (focus) {
    // Keyboard and screen-reader users continue from the target, as after a native jump.
    if (!el.matches("a[href], button, input, select, textarea, [tabindex]")) {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("data-k-target", "");
    }
    el.focus({ preventScroll: true });
  }
}

/** Put a route in the address without the browser's jump, and tell the router (and every hashchange listener). */
function pushHash(hash: string): void {
  const oldURL = location.href;
  history.pushState(null, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: location.href }));
}

/** What following a link did. */
export type Followed = "scrolled" | "routed" | "external" | "none";

/**
 * Follow a link as a plain click would. With a bus, a jump within the open page says
 * `route:jumped` (after `route:changed`, when the address moved to another part).
 */
export function followLink(to: string, bus?: Bus | null): Followed {
  const t = resolveLink(to, routeConfig(), location.hash);
  if (t.kind === "external") {
    window.open(t.href, "_blank", "noopener,noreferrer");
    return "external";
  }
  if (t.kind === "anchor") {
    const el = document.getElementById(t.elementId);
    if (el) {
      revealElement(el, { focus: true });
      bus?.emit("route:jumped", { to, elementId: t.elementId });
      return "scrolled";
    }
    if (to.startsWith("#el-")) return "none";
    location.hash = to;
    return "routed";
  }
  const el = t.elementId ? document.getElementById(t.elementId) : null;
  if (t.samePage && el) {
    if (location.hash !== t.hash) {
      pending = { id: t.elementId!, handled: true, at: Date.now() };
      pushHash(t.hash);
    }
    revealElement(el, { focus: true });
    bus?.emit("route:jumped", { to, elementId: t.elementId! });
    return "scrolled";
  }
  if (location.hash === t.hash) return "none";
  if (t.elementId) pending = { id: t.elementId, handled: false, at: Date.now() };
  location.hash = t.hash;
  return "routed";
}

/** What a reader does that ends a hold: their own scrolling, a tap, a key, a click. */
const READER_MOVES = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
const HOLD_MS = 10_000;

/**
 * Keep a target at the top of the reading area while the page grows: content drawn
 * after the first paint (charts on their first use, a document read at run time) can
 * push the target down or leave the page too short to land on. Lands again on every
 * change of the page's size until the reader moves or 10 s pass. Returns the release.
 */
function holdTarget(el: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const land = () => {
    if (el.isConnected) el.scrollIntoView({ block: "start" });
  };
  const ro = new ResizeObserver(land);
  ro.observe(document.body);
  let timer = 0;
  const release = () => {
    ro.disconnect();
    window.clearTimeout(timer);
    for (const t of READER_MOVES) window.removeEventListener(t, release, true);
  };
  for (const t of READER_MOVES) window.addEventListener(t, release, { capture: true, passive: true });
  timer = window.setTimeout(release, HOLD_MS);
  return release;
}

/**
 * On a page that renders a route's part: scroll to it when the address names it (also
 * on the first load), unless a link on this page already did, and hold it there while
 * the page grows. A jump from another page marks it. The one place a page scrolls to
 * the part in its address; pages call this instead of scrolling themselves.
 */
export function useRevealTarget(elementId: string | undefined, ready = true): void {
  useEffect(() => {
    if (!elementId || !ready) return;
    const p = takePending(elementId);
    if (p?.handled) return;
    const el = document.getElementById(elementId);
    if (!el) return;
    revealElement(el, { smooth: false, highlight: !!p, focus: !!p });
    return holdTarget(el);
  }, [elementId, ready]);
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** A route (`#view/<id>`), an in-page anchor (`#el-<id>`) or an external address. */
  to: string;
  /** "text" (default): underlined. "plain": the same behaviour, styled by its own class. */
  variant?: "text" | "plain";
  children?: ReactNode;
}

const modified = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

/** Open the page this link is on in a new tab (an in-page anchor has no address of its own). */
function openHere() {
  window.open(location.href, "_blank", "noopener");
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, variant = "text", className, onClick, onAuxClick, children, ...rest }, ref) {
  const bus = useOptionalBus();
  const external = !to.startsWith("#");
  const inPage = to.startsWith("#el-");
  const cls = [variant === "text" ? "k-link" : null, className].filter(Boolean).join(" ") || undefined;
  return (
    <a
      ref={ref}
      href={to}
      className={cls}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || external) return;
        if (e.button !== 0 || modified(e)) {
          // A new tab gets the same address; the browser does that for a route by itself.
          if (inPage && !e.altKey) {
            e.preventDefault();
            openHere();
          }
          return;
        }
        e.preventDefault();
        followLink(to, bus);
      }}
      onAuxClick={(e) => {
        onAuxClick?.(e);
        if (!e.defaultPrevented && inPage && e.button === 1) {
          e.preventDefault();
          openHere();
        }
      }}
    >
      {children}
      {external && <span aria-hidden="true"> ↗</span>}
    </a>
  );
});

// ---------- inline markup ----------

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|\{\{(?:a|b|c|good|loss):[^}]+\}\}|\{icon:[a-z]+\})/g;

/** What a screen reader says for an icon in the text (the drawn icon itself is decorative). */
const ICON_WORD: Partial<Record<IconName, string>> = { open: "open in its view", table: "show the numbers", settings: "settings", play: "run", pause: "pause", stop: "stop", restore: "back to the value before", next: "next", more: "more", lock: "padlock (locked)", unlock: "padlock" };

export interface RichOptions {
  /**
   * Terms already defined on this page (lower case). A **term** not in it yet is its
   * first appearance: marked as a definition (`k-term first`) and added.
   */
  terms?: Set<string>;
}

/** `[label](to)` through Link, `code`, **term**, {{role:Name}} and {icon:name} inside a text. */
export function rich(text: string, opts: RichOptions = {}): ReactNode {
  if (!text) return null;
  const parts = text.split(INLINE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      const body = part.slice(1, -1);
      // A quote (a sentence, a label with spaces) reads as text, not as a token's chip.
      return (
        <code key={i} className={/\s/.test(body) ? "quote" : undefined}>
          {body}
        </code>
      );
    }
    const icon = /^\{icon:([a-z]+)\}$/.exec(part);
    if (icon)
      return (
        <Fragment key={i}>
          <Icon name={icon[1] as IconName} size={13} className="k-inline-icon" />
          <span className="sr-only">{ICON_WORD[icon[1] as IconName] ?? icon[1]}</span>
        </Fragment>
      );
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const term = part.slice(2, -2);
      let first = false;
      if (opts.terms) {
        const k = term.toLowerCase();
        first = !opts.terms.has(k);
        if (first) opts.terms.add(k);
      }
      return (
        <strong key={i} className={opts.terms ? `k-term${first ? " first" : ""}` : undefined}>
          {term}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link)
      return (
        <Link key={i} to={link[2]}>
          {link[1]}
        </Link>
      );
    const dot = /^\{\{(a|b|c|good|loss):([^}]+)\}\}$/.exec(part);
    if (dot)
      return (
        <span key={i} className="dot k-named" style={{ "--tone": `var(--${dot[1]})` } as CSSProperties}>
          {dot[2]}
        </span>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** The same text without its markup: for titles, aria labels and anything drawn as plain text. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\{\{(?:a|b|c|good|loss):([^}]+)\}\}/g, "$1")
    .replace(/\{icon:([a-z]+)\}/g, (_, n: string) => ICON_WORD[n as IconName] ?? n);
}

/** A copy string with its inline markup rendered. */
export function RichText({ text, terms }: { text: string | undefined; terms?: Set<string> }) {
  return <>{text ? rich(text, { terms }) : null}</>;
}
