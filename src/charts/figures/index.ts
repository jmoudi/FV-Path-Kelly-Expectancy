/**
 * The figure registry: charts drawn by a React component (SVG) rather than a chart
 * backend. A `figure` spec names one of these; the chart host renders it through the
 * registry, the ⊞ table shows the spec's data, and ⚙ offers only the height.
 */
import type { FC } from "react";
import type { ChartSpec, FigureName } from "../spec";
import { Calendar } from "./Calendar";
import { Railroad } from "./Railroad";

export interface FigureProps {
  spec: ChartSpec;
  /** The width the host gives the figure, in px; the figure fits itself to it. */
  width: number;
}

export const FIGURES: Record<FigureName, FC<FigureProps>> = {
  railroad: Railroad,
  calendar: Calendar,
};

export const FIGURE_INFO: Record<FigureName, { label: string; blurb: string }> = {
  railroad: { label: "Railroad schematic", blurb: "Nights as stations, names as parallel tracks, track width as the share at risk." },
  calendar: { label: "Season calendar", blurb: "Capital in use per night as bars, cumulative log growth as a line." },
};

/** The figure a spec asks for, or null when the spec is not a figure or names an unknown one. */
export function figureFor(spec: ChartSpec): FC<FigureProps> | null {
  if (spec.kind !== "figure" || !spec.figure) return null;
  return FIGURES[spec.figure] ?? null;
}

/** Default plot height of a figure, when the spec does not set one. */
export const FIGURE_DEFAULT_HEIGHT = 260;

export { FigureFrame } from "./FigureFrame";
