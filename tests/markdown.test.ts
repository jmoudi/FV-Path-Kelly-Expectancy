import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, linkKind, parseBlocks, parseInline, slug, type LinkRenderer, type MarkdownProps } from "@kit/ui/Markdown";
import { RemoteMarkdown, forgetRemoteText, loadOnce, peek, reload } from "@kit/ui/RemoteMarkdown";
import { GUIDE_SECTIONS } from "@app/data/copy/guide";

const md = (text: string, props: Partial<MarkdownProps> = {}) => renderToStaticMarkup(createElement(Markdown, { text, ...props }));
/** The markup inside the root <div class="k-md">. */
const inner = (text: string, props: Partial<MarkdownProps> = {}) => md(text, props).replace(/^<div class="k-md">/, "").replace(/<\/div>$/, "");

describe("Markdown blocks", () => {
  it("headings: levels shifted, ids from their text, unique; #word is not a heading", () => {
    expect(inner("## Part one", { headingShift: 1, idPrefix: "g-" })).toBe('<h3 id="g-part-one" class="k-md-h3">Part one</h3>');
    expect(inner("# A\n\n# A")).toBe('<h1 id="md-a" class="k-md-h1">A</h1><h1 id="md-a-2" class="k-md-h1">A</h1>');
    expect(inner("###### Six", { headingShift: 3 })).toContain("<h6");
    expect(inner("## Closing hashes ##")).toBe('<h2 id="md-closing-hashes" class="k-md-h2">Closing hashes</h2>');
    expect(inner("### The owner’s `docs/` & **words**")).toContain('id="md-the-owner-s-docs-and-words"');
    expect(inner("#hashtag")).toBe('<p class="k-md-p">#hashtag</p>');
  });

  it("paragraphs: lines join with a space, a blank line splits, a trailing backslash or two spaces breaks", () => {
    expect(inner("one\ntwo\n\nthree")).toBe('<p class="k-md-p">one two</p><p class="k-md-p">three</p>');
    expect(inner("quote\\\n→ where it landed")).toBe('<p class="k-md-p">quote<br/>→ where it landed</p>');
    expect(inner("a  \nb")).toBe('<p class="k-md-p">a<br/>b</p>');
  });

  it("lists: bullets, ordered lists keep their first number, nesting, continuation lines, blank lines between items", () => {
    expect(inner("- a\n- b")).toBe('<ul class="k-md-list"><li>a</li><li>b</li></ul>');
    expect(inner("12. twelve\n13. thirteen")).toBe('<ol class="k-md-list" start="12"><li>twelve</li><li>thirteen</li></ol>');
    expect(inner("1. one")).toBe('<ol class="k-md-list"><li>one</li></ol>');
    expect(inner("- a\n  - a1\n  - a2\n- b")).toBe('<ul class="k-md-list"><li>a<ul class="k-md-list"><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
    expect(inner("3. “quote”\\\n   → landed\n\n4. next")).toBe('<ol class="k-md-list" start="3"><li>“quote”<br/>→ landed</li><li>next</li></ol>');
    expect(inner("- first line\n  goes on\nlazily")).toBe('<ul class="k-md-list"><li>first line goes on lazily</li></ul>');
    // A different marker kind starts another list; a paragraph after a blank line ends it.
    expect(inner("- a\n1. b\n\npara")).toBe('<ul class="k-md-list"><li>a</li></ul><ol class="k-md-list"><li>b</li></ol><p class="k-md-p">para</p>');
    // Not lists: a marker without a space after it.
    expect(inner("*Not taken:* boxes\n-3 is a number")).toBe('<p class="k-md-p"><em>Not taken:</em> boxes -3 is a number</p>');
  });

  it("blockquotes hold blocks; fences keep their text verbatim; --- is a rule", () => {
    expect(inner("> said\n> - one\n> - two")).toBe('<blockquote class="k-md-quote"><p class="k-md-p">said</p><ul class="k-md-list"><li>one</li><li>two</li></ul></blockquote>');
    expect(inner("```ts\nconst a = **b**;\n<b>x</b>\n```")).toBe('<pre class="k-md-pre"><code data-lang="ts">const a = **b**;\n&lt;b&gt;x&lt;/b&gt;</code></pre>');
    expect(inner("a\n\n---\n\nb")).toBe('<p class="k-md-p">a</p><hr class="k-md-hr"/><p class="k-md-p">b</p>');
  });

  it("parses the structure without rendering", () => {
    expect(parseBlocks("## H\n\ntext\n- x\n  - y")).toEqual([
      { t: "h", level: 2, text: "H" },
      { t: "p", text: "text" },
      { t: "list", ordered: false, start: 1, items: [{ text: "x", blocks: [{ t: "list", ordered: false, start: 1, items: [{ text: "y", blocks: [] }] }] }] },
    ]);
  });

  it("takes a page's own classes for paragraphs and lists", () => {
    expect(inner("p\n\n- i", { classes: { p: "k-guide-p", list: "k-guide-list" } })).toBe('<p class="k-guide-p">p</p><ul class="k-guide-list"><li>i</li></ul>');
    expect(md("x", { classes: { root: "doc" } })).toBe('<div class="k-md doc"><p class="k-md-p">x</p></div>');
    expect(inner("## h", { classes: { h: { 2: "big" } } })).toBe('<h2 id="md-h" class="k-md-h2 big">h</h2>');
  });
});

describe("Markdown inline", () => {
  const p = (s: string) => inner(s).replace(/^<p class="k-md-p">/, "").replace(/<\/p>$/, "");

  it("bold, italic, code, nested, escaped", () => {
    expect(p("**bold** and *it* and _it_ and `co*de*`")).toBe("<strong>bold</strong> and <em>it</em> and <em>it</em> and <code>co*de*</code>");
    expect(p("**see `src/kit` and *this***")).toBe("<strong>see <code>src/kit</code> and <em>this</em></strong>");
    expect(p("*an **inner** bold*")).toBe("<em>an <strong>inner</strong> bold</em>");
    expect(p("snake_case_name and 2 * 3 * 4 and f* = p − q/b")).toBe("snake_case_name and 2 * 3 * 4 and f* = p − q/b");
    expect(p("\\*not italic\\* and \\`not code\\`")).toBe("*not italic* and `not code`");
    expect(p("`` a `tick` ``")).toBe("<code>a `tick`</code>");
    expect(p("an *unclosed star")).toBe("an *unclosed star");
  });

  it("never interprets raw HTML", () => {
    const html = md('<script>alert(1)</script> <b onclick="x">b</b>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|<b |<img/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("links: in-app hashes are route links, http(s) open a new tab, other schemes are text", () => {
    expect(linkKind("#guide/keys")).toBe("route");
    expect(linkKind("https://example.com")).toBe("external");
    expect(linkKind("mailto:a@b.c")).toBe("external");
    expect(linkKind("docs/x.md")).toBe("plain");
    expect(linkKind("javascript:alert(1)")).toBe("unsafe");
    expect(linkKind("data:text/html,x")).toBe("unsafe");
    expect(p("[Keys](#guide/keys)")).toBe('<a href="#guide/keys" class="k-md-link k-md-route">Keys</a>');
    expect(p("[site](https://example.com)")).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="k-md-link k-md-ext">site<span aria-hidden="true"> ↗</span></a>');
    expect(p("[file](docs/x.md)")).toBe('<a href="docs/x.md" class="k-md-link">file</a>');
    expect(p("[click](javascript:alert(1))")).not.toContain("<a");
    expect(p("[**bold** `code`](#desk)")).toBe('<a href="#desk" class="k-md-link k-md-route"><strong>bold</strong> <code>code</code></a>');
    expect(p("[not a link] (#desk) and [x]()")).toBe("[not a link] (#desk) and [x]()");
  });

  it("hands route links to the app's own link component", () => {
    const link: LinkRenderer = ({ href, kind, children, key }) => createElement("a", { key, href, "data-route": kind === "route" ? "yes" : "no" }, children);
    expect(inner("[a](#view/x) [b](https://e.org)", { link })).toBe('<p class="k-md-p"><a href="#view/x" data-route="yes">a</a> <a href="https://e.org" data-route="no">b</a></p>');
  });

  it("slugs and the inline tree", () => {
    expect(slug("Feedback 1 (“5/10”)")).toBe("feedback-1-5-10");
    expect(slug("…")).toBe("section");
    expect(parseInline("a **b** [c](#d)")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "link", href: "#d", c: [{ t: "text", v: "c" }] },
    ]);
  });
});

describe("a Markdown file read at run time", () => {
  const SRC = "directives.md";
  const ok = (text: string, type = "text/markdown") => new Response(text, { status: 200, headers: { "content-type": type } });

  afterEach(() => {
    forgetRemoteText();
    vi.unstubAllGlobals();
  });

  it("is fetched once per page load, however often it is asked for, and again on Reload", async () => {
    const fetch = vi.fn(async () => ok("## Directives\n\ntext"));
    vi.stubGlobal("fetch", fetch);
    await Promise.all([loadOnce(SRC), loadOnce(SRC), loadOnce(SRC)]);
    await loadOnce(SRC);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([SRC, expect.objectContaining({ cache: "no-cache" })]);
    expect(peek(SRC)).toMatchObject({ text: "## Directives\n\ntext", pending: false });
    expect(peek(SRC).error).toBeUndefined();
    await reload(SRC);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual([SRC, expect.objectContaining({ cache: "reload" })]);
  });

  it("says plainly why it failed: a status, a page served in its place, a blocked request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })));
    await loadOnce(SRC);
    expect(peek(SRC)).toMatchObject({ error: "HTTP 404 Not Found", pending: false });
    expect(peek(SRC).text).toBeUndefined();

    forgetRemoteText();
    vi.stubGlobal("fetch", vi.fn(async () => ok("<!doctype html><html></html>", "text/html")));
    await loadOnce(SRC);
    expect(peek(SRC).error).toMatch(/web page/);

    forgetRemoteText();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await loadOnce(SRC);
    expect(peek(SRC).error).toBe("the request was blocked or the network is down");
  });

  it("keeps the copy it has when a reload fails, and clears the error on the next success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok("first")));
    await loadOnce(SRC);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await reload(SRC);
    expect(peek(SRC)).toMatchObject({ text: "first", error: "the request was blocked or the network is down" });
    vi.stubGlobal("fetch", vi.fn(async () => ok("second")));
    await reload(SRC);
    expect(peek(SRC).text).toBe("second");
    expect(peek(SRC).error).toBeUndefined();
  });

  it("renders a loading line before the answer (and fetches nothing while rendering)", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(createElement(RemoteMarkdown, { src: SRC }));
    expect(html).toContain("Loading directives.md…");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the Guide's last section reads directives.md", () => {
    const last = GUIDE_SECTIONS[GUIDE_SECTIONS.length - 1];
    expect(last.id).toBe("directives");
    expect(last.body.some((b) => b.kind === "markdown" && b.src === "directives.md")).toBe(true);
  });
});

describe("docs/DIRECTIVES.md", () => {
  const text = readFileSync(new URL("../docs/DIRECTIVES.md", import.meta.url), "utf8");
  const blocks = parseBlocks(text);

  it("has its four parts, and the directives numbered 1, 2, 3, … across the messages", () => {
    const parts = blocks.filter((b) => b.t === "h" && b.level === 2).map((b) => (b as { text: string }).text);
    expect(parts).toEqual(["1. The owner's directives", "2. The implied design", "3. The decisions taken", "4. Open questions for the owner"]);
    const part1 = blocks.slice(0, blocks.findIndex((b) => b.t === "h" && b.text.startsWith("2.")));
    const lists = part1.filter((b): b is Extract<typeof b, { t: "list" }> => b.t === "list" && b.ordered);
    const numbers = lists.flatMap((l) => l.items.map((_, i) => l.start + i));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    // Every directive is a quote, then a line break, then where it landed.
    for (const l of lists) for (const it of l.items) expect(it.text).toMatch(/^“[^]+”\n→ /);
  });

  it("renders without stray markup, and links only inside the app", () => {
    const html = md(text, { headingShift: 1 });
    const visible = html.replace(/<[^>]+>/g, "");
    expect(visible).not.toMatch(/\*\*|\\$|\]\(/m);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs) expect(linkKind(h)).toBe("route");
  });
});
