/**
 * Parameter locks in the GUI (the state and the solver: kit/state/createAppStore.ts and
 * kit/state/constraints.ts).
 *
 * - `Padlock`: the icon, open or closed (the kit's `lock` and `unlock` icons).
 * - `LockToggle`: the padlock button of one parameter or linked key. On a field it shows
 *   while the pointer is over the field or focus is inside it (always on a touch screen),
 *   and stays on, in the accent, while the key is locked. `onlyWhenLocked` draws it only
 *   then (the reduced deck); `withText` adds "Lock" / "Locked" (Settings, the ⚙ popover).
 * - `useRefusalShake(match)`: a ref whose element shakes once when a refusal matches.
 * - `useStoryBlocks(chartId, stories)`: "blocked: <name> is locked" for each story the
 *   locks would refuse.
 * - `LocksChip`: "Locks (n)" for the deck's second row, listing every lock with Unlock
 *   and Unlock all; nothing while no key is locked.
 */
import { useRef } from "react";
import type { Story } from "@kit/charts/spec";
import type { KitEvents } from "@kit/events/types";
import { useBusEvent } from "@kit/events/react";
import { useKit, useKitSweeps, useSchema } from "@kit/state/context";
import { Icon } from "@kit/ui/Icon";
import { MenuButton } from "@kit/ui/Menu";
import { shakeElement } from "./shake";
import "./locks.css";

/** The kit's padlock icons (ui/Icon.tsx: `lock`, `unlock`), so copy can name them as {icon:lock}. */
export function Padlock({ closed, size = 13 }: { closed: boolean; size?: number }) {
  return <Icon name={closed ? "lock" : "unlock"} size={size} className="k-padlock" />;
}

/** Whether a key is locked now. */
export function useLocked(k: string | undefined): boolean {
  return useKit((s) => !!k && !!s.locks?.[k]);
}

export function LockToggle({ k, label, onlyWhenLocked, withText }: { k: string; label?: string; onlyWhenLocked?: boolean; withText?: boolean }) {
  const locked = useLocked(k);
  const lockParam = useKit((s) => s.lockParam);
  const lockLabel = useKit((s) => s.lockLabel);
  if (onlyWhenLocked && !locked) return null;
  const name = label ?? lockLabel(k);
  return (
    <button
      type="button"
      className={`k-lock${locked ? " on" : ""}${withText ? " text" : ""}`}
      aria-pressed={locked}
      aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
      title={locked ? `${name} is locked: hand edits, sweeps, stories, the market switch and imports leave it where it is. Click to unlock it.` : `Lock ${name}: hold its value against every change`}
      onClick={(e) => {
        e.stopPropagation();
        lockParam(k, !locked);
      }}
    >
      <Padlock closed={locked} />
      {withText && <span>{locked ? "Locked" : "Lock"}</span>}
    </button>
  );
}

/** A ref for the element that shakes when a refused change matches. */
export function useRefusalShake<T extends HTMLElement>(match: (e: KitEvents["param:refused"]) => boolean) {
  const ref = useRef<T>(null);
  useBusEvent("param:refused", (e) => {
    if (match(e)) shakeElement(ref.current);
  });
  return ref;
}

/** "blocked: Loss rate per name is locked", by story id, for the stories the locks would refuse now. */
export function useStoryBlocks(chartId: string, stories: Story[]): Record<string, string> {
  // Only while something is locked does a story need checking; then it follows the parameters.
  const locks = useKit((s) => (s.locks && Object.keys(s.locks).length ? s.locks : null));
  const params = useKit((s) => (locks ? s.params : null));
  const storyRefusals = useKit((s) => s.storyRefusals);
  const lockLabel = useKit((s) => s.lockLabel);
  const out: Record<string, string> = {};
  if (!locks || !params) return out;
  for (const st of stories) {
    const r = storyRefusals(chartId, st)[0];
    if (r) out[st.id] = `blocked: ${r.by ? lockLabel(r.by) : "the locks"} ${r.by ? "is locked" : "leave no room"}`;
  }
  return out;
}

/** The value a lock holds, as the deck prints it. */
function useLockValue(): (key: string) => string {
  const schema = useSchema();
  const sweeps = useKitSweeps();
  const params = useKit((s) => s.params);
  const linked = useKit((s) => s.linked);
  return (key) => {
    const def = schema.byKey[key];
    const v = params[key];
    if (def?.unit === "choice") return def.choices?.find((c) => c.value === v)?.label ?? String(v);
    if (def && typeof v === "number") return sweeps.format(key).value(v);
    return linked?.[key]?.text?.(params) ?? "";
  };
}

/** "Locks (2)" in the deck's second row: what is locked, at what value, and Unlock. */
export function LocksChip() {
  const locks = useKit((s) => s.locks);
  const lockParam = useKit((s) => s.lockParam);
  const unlockAll = useKit((s) => s.unlockAll);
  const lockLabel = useKit((s) => s.lockLabel);
  const schema = useSchema();
  const linked = useKit((s) => s.linked);
  const valueOf = useLockValue();
  const keys = Object.keys(locks ?? {});
  if (!keys.length) return null;
  return (
    <MenuButton
      className="k-locks-chip"
      panelClassName="k-locks-menu"
      align="end"
      title={`Locked: ${keys.map(lockLabel).join(", ")}`}
      label={
        <>
          <Padlock closed />
          <span>Locks ({keys.length})</span>
        </>
      }
    >
      {(close) => (
        <div className="k-locks" role="group" aria-label="Locked parameters">
          <div className="k-locks-title">Locked</div>
          <ul className="k-locks-list">
            {keys.map((k) => {
              const sym = schema.byKey[k]?.short ?? linked?.[k]?.short;
              return (
                <li key={k} data-key={k}>
                  <span className="k-locks-name">
                    {lockLabel(k)}
                    {sym && <span className="sym"> {sym}</span>}
                  </span>
                  <span className="k-locks-value">{valueOf(k)}</span>
                  <button type="button" className="btn small quiet" role="menuitem" onClick={() => lockParam(k, false)} aria-label={`Unlock ${lockLabel(k)}`}>
                    Unlock
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="k-locks-foot">
            <button
              type="button"
              className="btn small"
              role="menuitem"
              onClick={() => {
                unlockAll();
                close();
              }}
            >
              Unlock all
            </button>
            <span className="caption">The padlock beside a field locks it again.</span>
          </div>
        </div>
      )}
    </MenuButton>
  );
}
