import type { ReactNode } from "react";
import { Link } from "./Link";
import type { LinkItem } from "./types";

export interface ViewFrameProps {
  /** Breadcrumb eyebrow, e.g. a link "Section 03 · Calibration". */
  eyebrow?: ReactNode;
  title: string;
  prev?: LinkItem;
  next?: LinkItem;
  /** The charts, left. */
  main: ReactNode;
  /** The context, right (below at 1000px and narrower). */
  aside?: ReactNode;
}

/**
 * One responsibility on its own page: breadcrumb eyebrow, title, previous and next
 * links, the charts large on the left and the context beside them. Borderless.
 */
export function ViewFrame({ eyebrow, title, prev, next, main, aside }: ViewFrameProps) {
  return (
    <article className="k-view" aria-labelledby="k-view-title">
      <header className="k-view-head">
        <div className="k-view-crumbs">
          {eyebrow && <div className="k-eyebrow">{eyebrow}</div>}
          <h1 className="k-view-title" id="k-view-title">
            {title}
          </h1>
        </div>
        {(prev || next) && (
          <nav className="k-view-nav" aria-label="Neighbouring views">
            {prev && (
              <Link to={prev.href} rel="prev" title={prev.title}>
                ← {prev.label}
              </Link>
            )}
            {next && (
              <Link to={next.href} rel="next" title={next.title}>
                {next.label} →
              </Link>
            )}
          </nav>
        )}
      </header>
      <div className={`k-view-body${aside ? "" : " single"}`}>
        <div className="k-view-main">{main}</div>
        {aside && <aside className="k-view-aside">{aside}</aside>}
      </div>
    </article>
  );
}
