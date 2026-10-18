import { useEffect, useRef, useState, type FC } from "react";
import type { ChartSpec } from "../spec";
import type { FigureProps } from "./index";

/**
 * Hosts a figure inside the chart host's plot box: measures the box's width and
 * hands it to the figure component, so the SVG re-fits itself when the column
 * changes. The height is the spec's and never changes with content.
 */
export function FigureFrame({ spec, Figure, height }: { spec: ChartSpec; Figure: FC<FigureProps> | null; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="figure-frame" style={{ width: "100%", height, position: "relative", overflow: "hidden" }} role="img" aria-label={spec.title}>
      {Figure && width > 0 ? <Figure spec={{ ...spec, height }} width={width} /> : null}
      {!Figure && <div className="caption">No figure named {String(spec.figure)}.</div>}
    </div>
  );
}
