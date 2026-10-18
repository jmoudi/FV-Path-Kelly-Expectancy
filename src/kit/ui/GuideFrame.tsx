/**
 * The guide page: in-app documentation of how the GUI works, from structured content
 * the app supplies (GuideSection[]). A left rail of section links that highlights the
 * section being read, the page's title and lede, then each section's blocks:
 * paragraphs, sub-headings, lists, small tables, key rows and callouts. No boxes; prose
 * stays within the measure (--prose-max). Sections are addressed as #<page>/<id> and
 * carry the DOM id `<page>-<id>` (sub-headings `<page>-<id>-<slug>`), so any link can
 * point at them. A Markdown block's headings are `<page>-<id>-<slug>` too.
 *
 * Inline markup in any text (see `rich` in ./Link.tsx): `code` (keys, addresses, names
 * in the code; a quote with a space in it is set without the chip), **term** (its first
 * appearance on the page is marked as a definition), [label](#href) links, {{a:Coin}}
 * for a name with its identity dot, and {icon:name} for a tool's drawn icon (the kit's
 * Icon set), so the text shows the tool as the screen draws it.
 */
import { useMemo, type ReactNode } from "react";
import { KeyLegend, type KeyBinding } from "./Settings";
import { RemoteMarkdown } from "./RemoteMarkdown";
import { useScrollSpy } from "./Shell";
import { Link, rich, useRevealTarget } from "./Link";
import "./guide.css";

export type GuideBlock =
  /** A paragraph. */
  | { kind: "p"; text: string }
  /** A sub-heading inside a section. */
  | { kind: "h"; text: string }
  /** A bulleted (or numbered) list. */
  | { kind: "list"; items: string[]; ordered?: boolean }
  /** A small table: a header row, then rows of cells. */
  | { kind: "table"; head: string[]; rows: string[][]; caption?: string }
  /** Key rows: keys rendered as <kbd>, what they do, where they apply. */
  | { kind: "keys"; rows: KeyBinding[] }
  /** A callout: "Note" (good to know, a green rule) or "Careful" (it clears or overrides something, a red rule). */
  | { kind: "callout"; tone: "note" | "careful"; text: string }
  /**
   * A Markdown file read at run time, once per page load, relative to the page (never
   * bundled), in this page's prose styles under a "Loaded <time> · Reload" line;
   * `failure` follows the plain line shown when it cannot be loaded. Its headings' ids
   * start with `idPrefix`, by default the section's own (`<page>-<id>-`).
   */
  | { kind: "markdown"; src: string; failure?: string; idPrefix?: string };

export interface GuideSection {
  id: string;
  title: string;
  body: GuideBlock[];
}

export interface GuideFrameProps {
  title: string;
  lede?: string;
  sections: GuideSection[];
  /** The section in the address (#<page>/<id>), scrolled to when it changes. */
  current?: string;
  /** The page name the section links are built from: #<page>/<id>. */
  page?: string;
}

/** Section numbers as Explain writes them: "01", "02", … */
export const guideNumber = (i: number) => String(i + 1).padStart(2, "0");

/** `code`, **term**, [label](href), {{a:Name}} and {icon:name} inside a text (the kit's `rich`). */
export function inline(text: string, terms?: Set<string>): ReactNode {
  return rich(text, { terms });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const CALLOUT_LABEL = { note: "Note", careful: "Careful" } as const;

function Block({ b, terms, idBase }: { b: GuideBlock; terms: Set<string>; idBase: string }) {
  const t = (s: string) => inline(s, terms);
  switch (b.kind) {
    case "p":
      return <p className="k-guide-p">{t(b.text)}</p>;
    case "h":
      return (
        <h3 className="k-guide-h3" id={`${idBase}-${slug(b.text)}`}>
          {t(b.text)}
        </h3>
      );
    case "list": {
      const items = b.items.map((it, i) => <li key={i}>{t(it)}</li>);
      return b.ordered ? <ol className="k-guide-list">{items}</ol> : <ul className="k-guide-list">{items}</ul>;
    }
    case "table":
      return (
        <div className="k-guide-table-wrap">
          <table className="k-guide-table">
            {b.caption && <caption>{t(b.caption)}</caption>}
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} scope="col">
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {t(c)}
                      </th>
                    ) : (
                      <td key={j}>{t(c)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "keys":
      return (
        <div className="k-guide-table-wrap">
          <KeyLegend bindings={b.rows} />
        </div>
      );
    case "callout":
      return (
        <aside className={`k-guide-callout ${b.tone}`} aria-label={CALLOUT_LABEL[b.tone]}>
          <span className="k-guide-callout-t">{CALLOUT_LABEL[b.tone]}</span> {t(b.text)}
        </aside>
      );
    case "markdown":
      return <RemoteMarkdown src={b.src} failure={b.failure} idPrefix={b.idPrefix ?? `${idBase}-`} headingShift={1} classes={{ p: "k-guide-p", list: "k-guide-list" }} />;
  }
}

export function GuideFrame({ title, lede, sections, current, page = "guide" }: GuideFrameProps) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const spied = useScrollSpy(ids, true, `${page}-`);
  const active = spied || current || ids[0];
  const href = (id: string) => `#${page}/${id}`;

  // A section in the address: scroll to it (also on first load), unless a link on this
  // page already did. A section filled after the first paint (the directives, read at
  // run time) can leave the page too short to land on; useRevealTarget holds the
  // section in place as the page grows, until the reader moves or 10 s pass.
  useRevealTarget(current ? `${page}-${current}` : undefined);

  // Each term is marked as defined where it first appears on the page.
  const terms = new Set<string>();

  return (
    <div className="k-guide">
      <nav className="k-guide-rail" aria-label={`${title}: sections`}>
        <div className="k-guide-rail-title">{title}</div>
        {sections.map((s, i) => (
          <Link key={s.id} to={href(s.id)} variant="plain" className={active === s.id ? "on" : undefined} aria-current={active === s.id ? "true" : undefined}>
            <span className="n">{guideNumber(i)}</span>
            <span>{s.title}</span>
          </Link>
        ))}
      </nav>
      <main className="k-guide-main">
        <header className="k-guide-head">
          <h1 className="page-title">{title}</h1>
          {lede && <p className="page-lede">{inline(lede, terms)}</p>}
        </header>
        {sections.map((s, i) => (
          <section key={s.id} id={`${page}-${s.id}`} className="k-guide-sec" aria-labelledby={`${page}-${s.id}-h`}>
            <h2 className="k-guide-h2" id={`${page}-${s.id}-h`}>
              <span className="n" aria-hidden="true">
                {guideNumber(i)}
              </span>
              {s.title}
            </h2>
            {s.body.map((b, j) => (
              <Block key={j} b={b} terms={terms} idBase={`${page}-${s.id}`} />
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
