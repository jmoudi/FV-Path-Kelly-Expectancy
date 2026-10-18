import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "./Link";
import type { LinkItem } from "./types";

/**
 * Whether the side panel fits the window under the sticky bars: only then does it stick
 * beside the charts. A taller one scrolls with the page, so nothing in it is ever out of
 * reach or cut off by a hidden scroll box.
 */
function useFits(): [RefObject<HTMLElement>, boolean] {
  const ref = useRef<HTMLElement>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const css = getComputedStyle(document.documentElement);
      const bars = (parseFloat(css.getPropertyValue("--topbar-h")) || 0) + (parseFloat(css.getPropertyValue("--deck-h")) || 0);
      setFits(el.scrollHeight <= window.innerHeight - bars - 48);
    };
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return [ref, fits];
}

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
  const [asideRef, fits] = useFits();
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
        {aside && (
          <aside ref={asideRef} className={`k-view-aside${fits ? " sticky" : ""}`}>
            {aside}
          </aside>
        )}
      </div>
    </article>
  );
}
