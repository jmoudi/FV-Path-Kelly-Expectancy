/**
 * The replayer's and the undo stack's key names, as the hints and the guide print them
 * (⌘ on a Mac, Ctrl elsewhere). Worker-safe and React-free, so copy modules can import
 * it; the key handler itself is useSweepHotkeys in useSweeps.ts.
 */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const mod = IS_MAC ? "⌘" : "Ctrl";

export const HOTKEY_HINTS = {
  toggle: `${mod}+Enter`,
  stop: `${mod}+.`,
  prev: `${mod}+[`,
  next: `${mod}+]`,
  all: `${mod}+Shift+Enter`,
  undo: `${mod}+Z`,
  redo: `${mod}+Shift+Z`,
};
