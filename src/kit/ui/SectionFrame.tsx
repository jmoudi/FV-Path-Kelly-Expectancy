import type { ReactNode } from "react";
import { AnswerStrip } from "./AnswerStrip";
import { TabbedPanel, type PanelTab } from "./TabbedPanel";
import type { FigureItem, LinkItem } from "./types";

export interface SectionFrameProps {
  /** DOM id of the section (the anchor the rail and the hash scroll to). */
  id: string;
  /** The small mono line above the title, e.g. "Section 03". */
  eyebrow: ReactNode;
  /** Links to the section's own pages, shown to the right of the eyebrow. */
  chips?: LinkItem[];
  title: string;
  /** The one question the section answers. Kept to 68 characters a line. */
  lede?: ReactNode;
  /** The one statement the section defends: a narrow aside floated inside the prose column. */
  claim?: ReactNode;
  /** The answer strip: the first is the hero number. */
  answers?: FigureItem[];
  /** How many answers show before "+N more figures". */
  answersShown?: number;
  /** Sentence-shaped actions (links that move the deck), under the answers. */
  actions?: ReactNode;
  /** The section's own inputs, as an open row of fields directly above the primary chart. */
  inputs?: ReactNode;
  inputsCaption?: string;
  /** Full-width charts, borderless. */
  primary: ReactNode[];
  /** Two columns, one at 900px and below. */
  secondary?: ReactNode[];
  /** The footer line of text links and the one tabbed panel it opens. */
  panels?: PanelTab[];
  panelHeight?: number;
}

/**
 * The tour's section skeleton, top to bottom: header (eyebrow and chips, title),
 * prose column (lede with the claim floated inside it, answer strip), inputs row,
 * primary chart, secondary charts, footer line. Spacing and hairlines come from
 * kit.css; nothing in it is boxed.
 */
export function SectionFrame(p: SectionFrameProps) {
  const headingId = `${p.id}-h`;
  return (
    <section className="k-section" id={p.id} aria-labelledby={headingId}>
      <header className="k-section-head">
        <div className="k-eyebrow">
          <span className="k-eyebrow-text">{p.eyebrow}</span>
          {p.chips && p.chips.length > 0 && (
            <span className="k-chips">
              {p.chips.map((c) => (
                <a key={c.href} href={c.href} className="k-chip-link" title={c.title}>
                  {c.label}
                  <span aria-hidden="true"> ↗</span>
                </a>
              ))}
            </span>
          )}
        </div>
        <h2 className="k-h2" id={headingId}>
          {p.title}
        </h2>
      </header>
      <div className="k-prose">
        {p.claim && <aside className="k-claim">{p.claim}</aside>}
        {p.lede && <p className="k-lede">{p.lede}</p>}
        {p.answers && p.answers.length > 0 && <AnswerStrip items={p.answers} shown={p.answersShown} />}
        {p.actions && <div className="k-section-actions">{p.actions}</div>}
      </div>
      {p.inputs && (
        <div className="k-inputs" role="group" aria-label={p.inputsCaption ?? "Inputs for this section"}>
          <div className="k-caption">{p.inputsCaption ?? "Inputs for this section"}</div>
          <div className="k-inputs-row">{p.inputs}</div>
        </div>
      )}
      <div className="k-primary">{p.primary}</div>
      {p.secondary && p.secondary.length > 0 && <div className="k-secondary">{p.secondary}</div>}
      {p.panels && p.panels.length > 0 && (
        <div className="k-section-foot">
          <TabbedPanel tabs={p.panels} height={p.panelHeight} label={`More on ${p.title}`} />
        </div>
      )}
    </section>
  );
}
