/**
 * A small Markdown renderer with no dependencies, for documents the app reads at run
 * time (the Guide's Directives). It knows a subset and nothing else:
 *
 *   blocks   # headings (1–6), paragraphs, - * + bullet and 1. ordered lists (nested by
 *            indentation, an ordered list keeps its first number), > blockquotes,
 *            ``` fenced code, --- rules
 *   inline   **bold**, *italic* or _italic_, `code`, [label](href), \-escapes, and a hard
 *            line break from a trailing backslash or two trailing spaces
 *
 * Raw HTML is never interpreted: every character reaches the page as text. Links: an
 * in-app hash (#guide/keys, #view/<id>) is a route link that never reloads; http(s) and
 * mailto open in a new tab with ↗ after the label; a relative path is a plain anchor; any
 * other scheme (javascript:, data:, …) renders as text. Headings get ids from their text
 * (idPrefix + slug), so each one is linkable.
 */
import { Fragment, createElement, useMemo, type ReactNode } from "react";
import "./markdown.css";

/* ------------------------------------------------------------------ blocks */

export type MdBlock =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "list"; ordered: boolean; start: number; items: MdItem[] }
  | { t: "quote"; blocks: MdBlock[] }
  | { t: "code"; text: string; lang?: string }
  | { t: "hr" };

/** A list item: its first paragraph, then anything nested under it. */
export interface MdItem {
  text: string;
  blocks: MdBlock[];
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+-]*)[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:( +)(.*))?$/;

const blank = (l: string) => !l.trim();
const lead = (l: string) => l.length - l.trimStart().length;
const startsBlock = (l: string) => HEADING.test(l) || FENCE.test(l) || RULE.test(l) || QUOTE.test(l) || ITEM.test(l);

/** A trailing backslash or two spaces is a hard break, kept as "\n" in the paragraph's text. */
function joinLines(lines: string[]): string {
  return lines
    .map((l, k) => {
      const last = k === lines.length - 1;
      const s = l.trimStart();
      if (!last && /(\\| {2,})$/.test(s)) return s.replace(/(\\| {2,})$/, "") + "\n";
      return s.trimEnd() + (last ? "" : " ");
    })
    .join("");
}

function parseList(lines: string[], from: number): [MdBlock, number] {
  const first = ITEM.exec(lines[from])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const sibling = (l: string) => {
    const m = ITEM.exec(l);
    return m !== null && m[1].length === indent && /\d/.test(m[2]) === ordered ? m : null;
  };
  const items: MdItem[] = [];
  let i = from;
  for (;;) {
    const m = sibling(lines[i])!;
    // Continuation lines start where the item's text started (at most four spaces after the marker).
    const content = indent + m[2].length + Math.min(Math.max((m[3] ?? " ").length, 1), 4);
    const body = [m[4] ?? ""];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (blank(l)) {
        let j = i + 1;
        while (j < lines.length && blank(lines[j])) j++;
        if (j < lines.length && lead(lines[j]) > indent && !sibling(lines[j])) {
          for (; i < j; i++) body.push("");
          continue;
        }
        break;
      }
      if (lead(l) > indent && !sibling(l)) {
        body.push(l.slice(Math.min(lead(l), content)));
        i++;
        continue;
      }
      // A lazy line continues the item's last paragraph.
      if (!startsBlock(l) && body.length > 0 && !blank(body[body.length - 1])) {
        body.push(l.trim());
        i++;
        continue;
      }
      break;
    }
    const inner = parseBlocks(body);
    const head = inner[0]?.t === "p" ? (inner.shift() as { t: "p"; text: string }).text : "";
    items.push({ text: head, blocks: inner });
    // Blank lines between two items of the same list do not end it.
    let j = i;
    while (j < lines.length && blank(lines[j])) j++;
    if (j < lines.length && sibling(lines[j])) {
      i = j;
      continue;
    }
    return [{ t: "list", ordered, start, items }, i];
  }
}

/** The block structure of a document (or of the lines inside a quote or a list item). */
export function parseBlocks(input: string | string[]): MdBlock[] {
  const lines = typeof input === "string" ? input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n") : input;
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push({ t: "code", text: body.join("\n"), lang: fence[2] || undefined });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2] ?? "" });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      out.push({ t: "quote", blocks: parseBlocks(body) });
      continue;
    }
    if (ITEM.test(line)) {
      const [list, next] = parseList(lines, i);
      out.push(list);
      i = next;
      continue;
    }
    const body = [line];
    i++;
    while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i])) body.push(lines[i++]);
    out.push({ t: "p", text: joinLines(body) });
  }
  return out;
}

/* ------------------------------------------------------------------ inline */

export type MdInline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "code"; v: string }
  | { t: "strong"; c: MdInline[] }
  | { t: "em"; c: MdInline[] }
  | { t: "link"; href: string; c: MdInline[] };

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!>|~"]/;
const WORD = /[\p{L}\p{N}]/u;

/** The end of a code span opened by `n` backticks at `from`, or -1. */
function codeEnd(s: string, from: number, n: number): number {
  for (let i = from; i < s.length; ) {
    if (s[i] !== "`") {
      i++;
      continue;
    }
    let k = 0;
    while (s[i + k] === "`") k++;
    if (k === n) return i;
    i += k;
  }
  return -1;
}

/**
 * The index of `delim` (one or two of * or _) closing a span opened before `from`, or -1.
 * Escapes and code spans are skipped, and so is a span of the other width nested inside
 * (*italic* inside **bold**, and the reverse), so "**a *b***" closes both.
 */
function closing(s: string, from: number, delim: string): number {
  const ch = delim[0];
  for (let i = from; i < s.length; ) {
    const c = s[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let n = 0;
      while (s[i + n] === "`") n++;
      const end = codeEnd(s, i + n, n);
      i = end < 0 ? i + n : end + n;
      continue;
    }
    if (c !== ch) {
      i++;
      continue;
    }
    let k = 0;
    while (s[i + k] === ch) k++;
    const before = s[i - 1];
    const after = s[i + k];
    const canClose = before !== undefined && !/\s/.test(before) && (ch !== "_" || !WORD.test(after ?? ""));
    const canOpen = after !== undefined && !/\s/.test(after);
    const nested = delim.length === 1 ? k === 2 : k === 1;
    if (nested && canOpen) {
      const end = closing(s, i + k, ch.repeat(3 - delim.length));
      if (end > 0) {
        i = end + 3 - delim.length;
        continue;
      }
    }
    if (canClose && (delim.length === 1 ? k !== 2 : k >= 2)) return delim.length === 1 ? i : i + k - 2;
    i += k;
  }
  return -1;
}

/** The index of the "]" matching the "[" at `from`, or -1. */
function bracketEnd(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length && ESCAPABLE.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      let n = 0;
      while (s[i + n] === "`") n++;
      const end = codeEnd(s, i + n, n);
      if (end < 0) {
        buf += s.slice(i, i + n);
        i += n;
        continue;
      }
      flush();
      const v = s.slice(i + n, end);
      out.push({ t: "code", v: /^ .*[^ ].* $/.test(v) ? v.slice(1, -1) : v });
      i = end + n;
      continue;
    }
    if ((ch === "*" || ch === "_") && (ch === "*" || !WORD.test(s[i - 1] ?? ""))) {
      const double = s[i + 1] === ch;
      const delim = double ? ch + ch : ch;
      const open = i + delim.length;
      if (open < s.length && !/\s/.test(s[open])) {
        const end = closing(s, open, delim);
        if (end > open) {
          flush();
          out.push({ t: double ? "strong" : "em", c: parseInline(s.slice(open, end)) });
          i = end + delim.length;
          continue;
        }
      }
      buf += delim;
      i += delim.length;
      continue;
    }
    if (ch === "[") {
      const close = bracketEnd(s, i);
      if (close > i && s[close + 1] === "(") {
        const paren = s.indexOf(")", close + 2);
        const href = paren > 0 ? s.slice(close + 2, paren).trim() : "";
        if (href && !/\s/.test(href)) {
          flush();
          out.push({ t: "link", href, c: parseInline(s.slice(i + 1, close)) });
          i = paren + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** The text of inline content, without its markup. */
export function plainText(nodes: MdInline[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "br" ? " " : plainText(n.c))).join("");
}

export function slug(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "section";
}

/* ------------------------------------------------------------------ links */

/** route: an in-app hash; external: http(s), mailto or //host; plain: a relative path; unsafe: any other scheme. */
export type LinkKind = "route" | "external" | "plain" | "unsafe";

export function linkKind(href: string): LinkKind {
  if (href.startsWith("#")) return "route";
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("//")) return "external";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "unsafe";
  return "plain";
}

/** Draws one link; the app can pass its own (a router's link component) for route links. */
export type LinkRenderer = (link: { href: string; kind: Exclude<LinkKind, "unsafe">; children: ReactNode; key: string }) => ReactNode;

const defaultLink: LinkRenderer = ({ href, kind, children, key }) =>
  kind === "external" ? (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="k-md-link k-md-ext">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    <a key={key} href={href} className={kind === "route" ? "k-md-link k-md-route" : "k-md-link"}>
      {children}
    </a>
  );

/* ------------------------------------------------------------------ render */

export interface MarkdownClasses {
  root?: string;
  /** Replaces the default class of that element (k-md-p, k-md-list, …), e.g. to share a page's prose styles. */
  p?: string;
  list?: string;
  quote?: string;
  code?: string;
  /** Added to a heading's own class (k-md-h<level>), by its level after the shift. */
  h?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;
}

export interface MarkdownProps {
  text: string;
  /** Added to every heading's level (capped at 6): 1 turns ## into <h3> under a page's own <h2>. */
  headingShift?: number;
  /** Prefix of the heading ids. */
  idPrefix?: string;
  classes?: MarkdownClasses;
  link?: LinkRenderer;
}

interface Ctx {
  shift: number;
  prefix: string;
  classes: MarkdownClasses;
  link: LinkRenderer;
  seen: Map<string, number>;
}

function renderInline(nodes: MdInline[], ctx: Ctx, key = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case "text":
        return <Fragment key={k}>{n.v}</Fragment>;
      case "br":
        return <br key={k} />;
      case "code":
        return <code key={k}>{n.v}</code>;
      case "strong":
        return <strong key={k}>{renderInline(n.c, ctx, `${k}.`)}</strong>;
      case "em":
        return <em key={k}>{renderInline(n.c, ctx, `${k}.`)}</em>;
      case "link": {
        const kind = linkKind(n.href);
        const children = renderInline(n.c, ctx, `${k}.`);
        return kind === "unsafe" ? <Fragment key={k}>{children}</Fragment> : ctx.link({ href: n.href, kind, children, key: k });
      }
    }
  });
}

function headingId(text: string, ctx: Ctx): string {
  const base = slug(text);
  const n = (ctx.seen.get(base) ?? 0) + 1;
  ctx.seen.set(base, n);
  return `${ctx.prefix}${n === 1 ? base : `${base}-${n}`}`;
}

function renderBlocks(blocks: MdBlock[], ctx: Ctx, key = ""): ReactNode[] {
  const { classes } = ctx;
  return blocks.map((b, i) => {
    const k = `${key}${i}`;
    switch (b.t) {
      case "h": {
        const level = Math.min(6, Math.max(1, b.level + ctx.shift)) as 1 | 2 | 3 | 4 | 5 | 6;
        const nodes = parseInline(b.text);
        const extra = classes.h?.[level];
        return createElement(`h${level}`, { key: k, id: headingId(plainText(nodes), ctx), className: extra ? `k-md-h${level} ${extra}` : `k-md-h${level}` }, renderInline(nodes, ctx));
      }
      case "p":
        return (
          <p key={k} className={classes.p ?? "k-md-p"}>
            {renderInline(parseInline(b.text), ctx)}
          </p>
        );
      case "list": {
        const items = b.items.map((it, j) => (
          <li key={j}>
            {it.text && renderInline(parseInline(it.text), ctx, `${k}.${j}.`)}
            {it.blocks.length > 0 && renderBlocks(it.blocks, ctx, `${k}.${j}.`)}
          </li>
        ));
        const className = classes.list ?? "k-md-list";
        return b.ordered ? (
          <ol key={k} className={className} start={b.start !== 1 ? b.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={k} className={className}>
            {items}
          </ul>
        );
      }
      case "quote":
        return (
          <blockquote key={k} className={classes.quote ?? "k-md-quote"}>
            {renderBlocks(b.blocks, ctx, `${k}.`)}
          </blockquote>
        );
      case "code":
        return (
          <pre key={k} className={classes.code ?? "k-md-pre"}>
            <code data-lang={b.lang}>{b.text}</code>
          </pre>
        );
      case "hr":
        return <hr key={k} className="k-md-hr" />;
    }
  });
}

export function Markdown({ text, headingShift = 0, idPrefix = "md-", classes = {}, link = defaultLink }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const ctx: Ctx = { shift: headingShift, prefix: idPrefix, classes, link, seen: new Map() };
  return <div className={classes.root ? `k-md ${classes.root}` : "k-md"}>{renderBlocks(blocks, ctx)}</div>;
}
