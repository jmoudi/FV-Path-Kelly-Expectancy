import type { ReactNode } from "react";

/**
 * Small shapes the kit frames take. An app turns its own view-model into these; the
 * kit never sees the app's types.
 */

/** One number with its label: an answer-strip figure, a view-page figure, a desk cell. */
export interface FigureItem {
  /** Stable key; defaults to the label. */
  id?: string;
  value: string;
  label: string;
  /** One muted line under the label: the basis of the number. */
  sub?: string;
  /**
   * The identity colour of the one policy (series, alternative) the figure belongs to,
   * e.g. "var(--a)": drawn as an 8px dot before the label. The value is always ink.
   */
  dot?: string;
  /** Rendered after the label, e.g. a "?" help button. */
  help?: ReactNode;
  /** Where the figure is explained (a view, `#view/<id>`): the label becomes a link. */
  href?: string;
  /** DOM id of the figure, so links can point at it. */
  elId?: string;
}

/** A link in a menu, a chip row or a breadcrumb. */
export interface LinkItem {
  href: string;
  label: string;
  /** Hover text. */
  title?: string;
  /** Marks the page the reader is on. */
  current?: boolean;
}

/** A titled group of links (one section's views in the Views menu). */
export interface LinkGroup {
  id: string;
  title: string;
  items: LinkItem[];
}
