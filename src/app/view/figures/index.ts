/** This explainer's SVG figures, registered with the kit in main.tsx. */
import type { FigureRegistry } from "@kit/charts/figures/registry";
import { Calendar } from "./Calendar";
import { Railroad } from "./Railroad";

export const FIGURES = {
  railroad: { component: Railroad, label: "Railroad schematic", blurb: "Nights as stations, names as parallel tracks, track width as the share at risk." },
  calendar: { component: Calendar, label: "Season calendar", blurb: "Capital in use per night as bars, cumulative log growth as a line." },
} satisfies FigureRegistry;

export type AppFigure = keyof typeof FIGURES;
