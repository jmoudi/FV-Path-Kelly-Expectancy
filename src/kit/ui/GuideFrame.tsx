/**
 * The guide page: in-app documentation of how the GUI works, from structured content
 * the app supplies (GuideSection[]). A left rail of section links that highlights the
 * section being read, the page's title and lede, then each section's blocks:
 * paragraphs, sub-headings, lists, small tables and key rows. No boxes; prose stays
 * within the measure (--prose-max). Sections are addressed as #<page>/<id>.
 *
 * Inline markup in any text: `code` (keys, addresses, names in the code; a quote with a
 * space in it is set without the chip), **term**, [label](#href) links, and {icon:name}
 * for a tool's drawn icon (the kit's Icon set), so the text shows the tool as the screen
 * draws it.
 */
import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { KeyLegend, type KeyBinding } from "./Settings";
import { useScrollSpy } from "./Shell";
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
  | { kind: "keys"; rows: KeyBinding[] };

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

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|\{icon:[a-z]+\})/g;

/** What a screen reader says for an icon in the text (the drawn icon itself is decorative). */
const ICON_WORD: Partial<Record<IconName, string>> = { open: "open in its view", table: "show the numbers", settings: "settings", play: "run", pause: "pause", stop: "stop", restore: "back to the value before", next: "next", more: "more" };

/** Section numbers as Explain writes them: "01", "02", … */
export const guideNumber = (i: number) => String(i + 1).padStart(2, "0");

/** `code`, **term**, [label](href) and {icon:name} inside a text. */
export function inline(text: string): ReactNode {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) {
      const body = part.slice(1, -1);
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
          <Icon name={icon[1] as IconName} size={13} className="k-guide-icon" />
          <span className="sr-only">{ICON_WORD[icon[1] as IconName] ?? icon[1]}</span>
        </Fragment>
      );
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]}>{link[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Block({ b }: { b: GuideBlock }) {
  switch (b.kind) {
    case "p":
      return <p className="k-guide-p">{inline(b.text)}</p>;
    case "h":
      return <h3 className="k-guide-h3">{inline(b.text)}</h3>;
    case "list": {
      const items = b.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      return b.ordered ? <ol className="k-guide-list">{items}</ol> : <ul className="k-guide-list">{items}</ul>;
    }
    case "table":
      return (
        <div className="k-guide-table-wrap">
          <table className="k-guide-table">
            {b.caption && <caption>{inline(b.caption)}</caption>}
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} scope="col">
                    {inline(h)}
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
                        {inline(c)}
                      </th>
                    ) : (
                      <td key={j}>{inline(c)}</td>
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
  }
}

export function GuideFrame({ title, lede, sections, current, page = "guide" }: GuideFrameProps) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const spied = useScrollSpy(ids, true, "g-");
  const active = spied || current || ids[0];
  const href = (id: string) => `#${page}/${id}`;

  // A section in the address: scroll to it (also on first load).
  useEffect(() => {
    if (current) document.getElementById(`g-${current}`)?.scrollIntoView({ block: "start" });
  }, [current]);

  return (
    <div className="k-guide">
      <nav className="k-guide-rail" aria-label={`${title}: sections`}>
        <div className="k-guide-rail-title">{title}</div>
        {sections.map((s, i) => (
          <a
            key={s.id}
            href={href(s.id)}
            className={active === s.id ? "on" : undefined}
            aria-current={active === s.id ? "true" : undefined}
            onClick={(e) => {
              // The same address again does not fire hashchange: scroll here.
              if (location.hash === href(s.id)) {
                e.preventDefault();
                document.getElementById(`g-${s.id}`)?.scrollIntoView({ block: "start" });
              }
            }}
          >
            <span className="n">{guideNumber(i)}</span>
            <span>{s.title}</span>
          </a>
        ))}
      </nav>
      <main className="k-guide-main">
        <header className="k-guide-head">
          <h1 className="page-title">{title}</h1>
          {lede && <p className="page-lede">{inline(lede)}</p>}
        </header>
        {sections.map((s, i) => (
          <section key={s.id} id={`g-${s.id}`} className="k-guide-sec" aria-labelledby={`g-${s.id}-h`}>
            <h2 className="k-guide-h2" id={`g-${s.id}-h`}>
              <span className="n" aria-hidden="true">
                {guideNumber(i)}
              </span>
              {s.title}
            </h2>
            {s.body.map((b, j) => (
              <Block key={j} b={b} />
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
