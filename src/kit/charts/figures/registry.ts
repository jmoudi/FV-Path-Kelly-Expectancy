/**
 * The figure registry: charts drawn by a React component (SVG) rather than a chart
 * backend. A `figure` spec names one of these; the chart host renders it through the
 * registry, the ⊞ table shows the spec's data, and ⚙ offers only the height.
 * The app registers its figures once at start-up (registerFigures); the kit knows none.
 */
import type { FC } from "react";
import type { ChartSpec } from "../spec";

export interface FigureProps {
  spec: ChartSpec;
  /** The width the host gives the figure, in px; the figure fits itself to it. */
  width: number;
}

export interface FigureEntry {
  component: FC<FigureProps>;
  label: string;
  blurb: string;
  /** Plot height when the spec sets none. */
  defaultHeight?: number;
}

export type FigureRegistry = Record<string, FigureEntry>;

/** Default plot height of a figure, when neither the spec nor the entry sets one. */
export const FIGURE_DEFAULT_HEIGHT = 260;

const registry: FigureRegistry = {};

/** Called once by the app before the first render. Later calls add or replace entries. */
export function registerFigures(entries: FigureRegistry): void {
  Object.assign(registry, entries);
}

/** The figure a spec asks for, or null when the spec is not a figure or names an unknown one. */
export function figureFor(spec: ChartSpec): FC<FigureProps> | null {
  if (spec.kind !== "figure" || !spec.figure) return null;
  return registry[spec.figure]?.component ?? null;
}

export function figureInfo(name: string | undefined): FigureEntry | undefined {
  return name ? registry[name] : undefined;
}
