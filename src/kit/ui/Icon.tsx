import type { ReactNode } from "react";

/**
 * The kit's icons: one 16-unit grid, one 1.5px stroke, round caps, drawn in the
 * current text colour, so every tool reads at the same weight (font glyphs such as
 * ⊞ ⚙ ↗ ❚❚ ▸ come in as many weights as fonts). Decorative: the button carries the
 * accessible name.
 */
export type IconName = "open" | "table" | "settings" | "play" | "pause" | "stop" | "restore" | "next" | "more";

const PATHS: Record<IconName, ReactNode> = {
  // An arrow out of the box, up and to the right.
  open: <path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5 7 9" />,
  // A table: a frame, a header rule and a column rule.
  table: <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6" />,
  // A gear: six teeth on a ring, and the hub.
  settings: (
    <>
      <path d="M6.44 3.46L6.52 1.57L9.48 1.57L9.56 3.46A4.8 4.8 0 0 1 11.15 4.38L12.83 3.5L14.31 6.07L12.71 7.08A4.8 4.8 0 0 1 12.71 8.92L14.31 9.93L12.83 12.5L11.15 11.62A4.8 4.8 0 0 1 9.56 12.54L9.48 14.43L6.52 14.43L6.44 12.54A4.8 4.8 0 0 1 4.85 11.62L3.17 12.5L1.69 9.93L3.29 8.92A4.8 4.8 0 0 1 3.29 7.08L1.69 6.07L3.17 3.5L4.85 4.38A4.8 4.8 0 0 1 6.44 3.46Z" strokeWidth="1.25" />
      <circle cx="8" cy="8" r="2" strokeWidth="1.25" />
    </>
  ),
  play: <path d="M5 3.5v9l7-4.5z" fill="currentColor" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2" />,
  stop: <path d="M4.5 4.5h7v7h-7z" fill="currentColor" />,
  // A circular arrow back (counter-clockwise).
  restore: <path d="M3.5 5.5A5 5 0 1 1 3 9M3.5 2.5v3h3" />,
  next: <path d="M6 4l4 4-4 4" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r="0.6" fill="currentColor" />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" />
      <circle cx="12.5" cy="8" r="0.6" fill="currentColor" />
    </>
  ),
};

export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`k-icon${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
