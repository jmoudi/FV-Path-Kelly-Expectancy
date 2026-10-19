/**
 * The one motion a refused change makes: the field shakes once, a 200 ms horizontal
 * translate (locks.css, `.k-shake`), at most once in 600 ms however many refusals a
 * wheel or a drag produces. React-free, so the synthetic input can call it on its root.
 */
export const SHAKE_MS = 200;
const SPACING_MS = 600;
const lastShake = new WeakMap<Element, number>();

export function shakeElement(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const t = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (t - (lastShake.get(el) ?? -Infinity) < SPACING_MS) return;
  lastShake.set(el, t);
  el.classList.remove("k-shake");
  // Restart the animation: read layout between removing and adding the class.
  void el.offsetWidth;
  el.classList.add("k-shake");
  window.setTimeout(() => el.classList.remove("k-shake"), SHAKE_MS + 20);
}
