import { useState } from "react";
import { plainText, rich } from "./Link";

/** A "?" that reveals a short definition (its inline links work inside the tip). Flips to the left when it would run off the screen. */
export function Help({ text }: { text?: string }) {
  const [flip, setFlip] = useState(false);
  if (!text) return null;
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setFlip(r.left + 280 > window.innerWidth);
  };
  return (
    <span className="help" onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>
      <button type="button" className="help-btn" aria-label={`What is this? ${plainText(text)}`}>
        ?
      </button>
      <span role="tooltip" className={`tip${flip ? " flip" : ""}`}>
        {rich(text)}
      </span>
    </span>
  );
}
