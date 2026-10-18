/**
 * Which events this explainer tells the reader about, as notices: an import that
 * succeeded or failed, and a story that moved the deck or put it back. A cross-cutting
 * feature in one place: it listens on the bus and emits `notice`; the kit's <Notices>
 * shows them. The words are data (src/app/data/copy/notices.ts).
 */
import { NOTICE_COPY } from "@app/data/copy/notices";
import { useAppBus, useAppEvent } from "./bus";

export function useAnnouncements(): void {
  const bus = useAppBus();
  useAppEvent("state:imported", (e) => {
    bus.emit("notice", e.ok ? { kind: "info", id: "import", text: NOTICE_COPY.imported } : { kind: "error", id: "import", text: NOTICE_COPY.importFailed(e.error ?? "") });
  });
  // One id for both: when a story replaces another, the "moves" line replaces the "back" line.
  useAppEvent("story:cleared", (e) => {
    const text = NOTICE_COPY.storyBack(e.before, e.after);
    if (text) bus.emit("notice", { kind: "info", id: "story", text });
  });
  useAppEvent("story:applied", (e) => {
    const text = NOTICE_COPY.storyMoved(e.label, e.before, e.after);
    if (text) bus.emit("notice", { kind: "info", id: "story", text });
  });
}
