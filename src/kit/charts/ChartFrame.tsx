import { forwardRef, type ReactNode, type Ref } from "react";

export interface ChartFrameProps {
  /** DOM id of the frame. */
  id?: string;
  title: ReactNode;
  /** The encoding only: "x night · y tranche · red = ruined". */
  subtitle?: ReactNode;
  /** Icon buttons (open, table, settings). Shown on hover or keyboard focus only. */
  tools?: ReactNode;
  /** A short tag in the plot box's bottom-right corner (the backend, when it is not the default). Never changes the height. */
  tag?: ReactNode;
  /** Keep the tools visible (a panel they opened is showing). */
  toolsPinned?: boolean;
  /** A row of story links under the title. */
  stories?: ReactNode;
  /** One line under the stories: the active story's answer. */
  storyNote?: ReactNode;
  /** Plot-box height in px. Fixed: the content (plot, table, error) never changes it. */
  boxHeight: number;
  /** "fixed" for charts; "max" for a table that is the chart (short tables do not pad). */
  boxMode?: "fixed" | "max";
  /** What the box shows: the plot element, the table, a figure. */
  children: ReactNode;
  /** Laid over the box content (errors), inside the box. */
  overlay?: ReactNode;
  /** One line under the box: caption and backend tag. */
  footer?: ReactNode;
  /** Ref to the plot box, for placing a popover beside it. */
  boxRef?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * The chart frame: borderless, title and encoding subtitle, tools on hover, story
 * links, and a plot box whose height is fixed by the spec. Anything the chart can
 * show instead of itself (the numbers, an error) renders inside the same box.
 */
export const ChartFrame = forwardRef<HTMLElement, ChartFrameProps>(function ChartFrame(p, ref) {
  return (
    <figure ref={ref} id={p.id} className={`k-chart${p.toolsPinned ? " pinned" : ""}${p.className ? ` ${p.className}` : ""}`}>
      <figcaption className="k-chart-head">
        <div className="k-chart-titles">
          <div className="k-chart-title">{p.title}</div>
          {p.subtitle && <div className="k-chart-sub">{p.subtitle}</div>}
        </div>
        {p.tools && <div className="k-chart-tools">{p.tools}</div>}
      </figcaption>
      {p.stories && <div className="k-chart-stories">{p.stories}</div>}
      {/* The answer line keeps its slot whenever there are stories, so picking one moves nothing. */}
      {(p.storyNote || p.stories) && <div className="k-chart-note">{p.storyNote}</div>}
      <div ref={p.boxRef} className={`k-chart-box ${p.boxMode ?? "fixed"}`} style={p.boxMode === "max" ? { maxHeight: p.boxHeight } : { height: p.boxHeight }}>
        {p.children}
        {p.tag && <span className="k-chart-tag">{p.tag}</span>}
        {p.overlay && <div className="k-chart-overlay">{p.overlay}</div>}
      </div>
      {p.footer && <div className="k-chart-foot">{p.footer}</div>}
    </figure>
  );
});
