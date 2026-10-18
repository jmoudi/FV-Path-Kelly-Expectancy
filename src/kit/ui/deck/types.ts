/**
 * The deck frame's props. Generic: nothing here knows what the inputs or figures
 * mean. The app renders its own input widgets into the slots and formats its own
 * numbers; the frame lays them out, keeps the drawer, and reports its height.
 */
import type { ReactNode } from "react";

/** One input in the deck: the app's rendered widget, plus an optional line under it. */
export interface DeckField {
  id: string;
  node: ReactNode;
  /** Rendered under the field (e.g. a linked read-only figure that turns into a box on click). */
  below?: ReactNode;
  /** Kept in the reduced row on a phone (≤ 700px). */
  phone?: boolean;
}

/** A group of fields in the reduced deck's first row, under a small caption. */
export interface InputGroup {
  id: string;
  caption: string;
  fields: DeckField[];
}

/** One headline number of the status row: the value large and in ink, the label small under it. */
export interface Figure {
  id: string;
  label: string;
  value: string;
  /** Tooltip with the full definition. */
  title?: string;
}

/** What the status row's figures describe: a name, its parameters, its colour. */
export interface StatusLead {
  title: string;
  detail?: string;
  /** Identity colour (e.g. "var(--c)"): an 8px dot before the title, which stays ink. */
  color?: string;
  tooltip?: string;
}

/** One entry of the persistent mini-legend. */
export interface LegendItem {
  id: string;
  label: string;
  /** CSS colour of the swatch. */
  color: string;
}

/** A row of the drawer's figure table: label and basis left, value right. */
export interface FigureRow {
  id: string;
  label: string;
  basis?: string;
  value: string;
  /** The identity colour of the one policy the figure belongs to: a dot before the label. The value stays ink. */
  color?: string;
  /** Rendered after the label, typically a "?" help. */
  help?: ReactNode;
}

export interface Definition {
  term: string;
  def: string;
}

interface DrawerSectionBase {
  id: string;
  /** The section heading (sentence case). */
  title: string;
  /** One line under the heading. */
  blurb?: string;
  /** A line after the section's body. */
  note?: ReactNode;
}

/** A section of the drawer: fields, a figure table, a definition list, or anything else. */
export type DrawerSection = DrawerSectionBase &
  ({ kind: "fields"; fields: DeckField[] } | { kind: "figures"; rows: FigureRow[] } | { kind: "definitions"; items: Definition[] } | { kind: "custom"; node: ReactNode });

/** Words the frame shows; every one has a default. */
export interface DeckText {
  expand: string;
  collapse: string;
  /** The phone's button that opens the drawer as a bottom sheet. */
  allInputs: string;
  drawerTitle: string;
  computing: string;
}

export interface DeckProps {
  /** Row 1: the input groups, set apart by distance and a hairline. */
  groups: InputGroup[];
  /** Row 2: what the figures describe. */
  lead?: StatusLead;
  /** Row 2: the headline figures. */
  status: Figure[];
  /** Row 2: a muted comparison line after the figures. */
  note?: string;
  /** Row 2: the persistent mini-legend. */
  legend: LegendItem[];
  /** Row 2: a slot that is always reserved (e.g. the active input's sweep strip). */
  strip?: ReactNode;
  /** The strip holds only a placeholder: on a phone its line is not drawn. */
  stripIdle?: boolean;
  /** The drawer's sections, in order. */
  drawer: DrawerSection[];
  /** Rendered in the drawer's header, above the scrolling sections (e.g. the active input's strip, which the drawer covers in row 2). */
  drawerTop?: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Render nothing (and report a height of 0). */
  hidden?: boolean;
  /** A newer result is on its way: values dim. */
  pending?: boolean;
  /** CSS variable set on <html> to the reduced deck's rendered height. Default "--deck-h". */
  heightVar?: string;
  text?: Partial<DeckText>;
  /** Media query under which the phone layout applies. Must match the stylesheet. Default "(max-width: 700px)". */
  phoneQuery?: string;
}
