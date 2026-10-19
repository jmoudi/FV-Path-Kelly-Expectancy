/**
 * The locks, out loud: a notice when a parameter is locked or unlocked, when a change is
 * refused (a warning that names the parameter and says how to unlock it), and when a
 * lock stops a sweep. One notice id per lock (`lock-<key>`), so a wheel or a sweep that
 * hits a locked field shows one notice, not thirty. The words are data
 * (src/app/data/copy/locks.ts).
 */
import { LOCK_COPY, lockValueText } from "@app/data/copy/locks";
import { useStore } from "@app/store";
import { useAppBus, useAppEvent } from "./bus";

export function useLockAnnouncements(): void {
  const bus = useAppBus();
  useAppEvent("param:locked", (e) => {
    const s = useStore.getState();
    const label = s.lockLabel(e.key);
    bus.emit("notice", e.locked ? { kind: "info", id: `lock-${e.key}`, text: LOCK_COPY.locked(label, lockValueText(e.key, s.params)) } : { kind: "info", id: `lock-${e.key}`, text: LOCK_COPY.unlocked(label) });
  });
  useAppEvent("param:refused", (e) => {
    const s = useStore.getState();
    const by = e.by ?? e.key;
    bus.emit("notice", {
      kind: "warn",
      id: `lock-${by || e.key}`,
      text: LOCK_COPY.refused({ key: e.key, by, detail: e.detail, source: e.source, keyLabel: s.lockLabel(e.key), byLabel: by ? s.lockLabel(by) : "", kept: lockValueText(e.key, s.params) }),
    });
  });
  useAppEvent("sweep:stopped", (e) => {
    if (e.reason !== "lock") return;
    const s = useStore.getState();
    bus.emit("notice", { kind: "warn", id: `lock-${e.key}`, text: LOCK_COPY.sweepStopped(s.lockLabel(e.key), lockValueText(e.key, s.params), !!s.locks[e.key]) });
  });
}
