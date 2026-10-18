/**
 * Generic pieces of the app shell, lifted out of App.tsx: the sections page's scroll spy,
 * the [ / ] keys between views (when the app has them) and the crash screen. The app
 * keeps its own top bar and page switch (src/app/App.tsx) and composes these.
 */
import { useEffect, useState } from "react";
import { useKit } from "@kit/state/context";
import { isEditableTarget } from "@kit/sweeps/useSweeps";
import { stepView } from "./route";

/** The id (without `prefix`) of the element `#<prefix><id>` in the reading band of the viewport. */
export function useScrollSpy(ids: string[], enabled: boolean, prefix = "s-"): string {
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!enabled || !("IntersectionObserver" in window)) return;
    const els = ids.map((id) => document.getElementById(`${prefix}${id}`)).filter((x): x is HTMLElement => !!x);
    // Every element in the band now, not only those whose crossing this batch reports: a long
    // section already in the band when its neighbour leaves must still win.
    const inBand = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target);
          else inBand.delete(e.target);
        }
        const hit = [...inBand].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (hit) setActive(hit.id.slice(prefix.length));
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids, enabled, prefix]);
  return active;
}

/**
 * Plain [ and ] step to the previous or next view, in reading order, from any page.
 * Not while focus is in an editable field or a select (typing wins there), not with
 * Ctrl or ⌘ (those cycle sweep presets), and not while a dialog is open.
 */
export function useViewKeys(blocked: boolean) {
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || (e.key !== "[" && e.key !== "]")) return;
      const el = document.activeElement;
      if (isEditableTarget(el) || el?.tagName === "SELECT") return;
      if (stepView(e.key === "]" ? 1 : -1)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked]);
}

/** What the whole app shows when rendering throws: the error, a retry, and a reset of the saved state. */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  const resetEverything = useKit((s) => s.resetEverything);
  return (
    <div className="page">
      <div className="dialog" style={{ margin: "40px auto" }}>
        <h3>Something broke</h3>
        <p>{error.message}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={retry}>
            Try again
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetEverything();
              retry();
            }}
          >
            Reset the app's saved state
          </button>
        </div>
      </div>
    </div>
  );
}
