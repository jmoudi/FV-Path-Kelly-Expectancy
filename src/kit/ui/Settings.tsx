import type { ReactNode } from "react";

/** One group of settings: a sentence-case heading, an optional one-line blurb, its controls. */
export function SettingsGroup({ id, title, blurb, children, wide }: { id?: string; title: string; blurb?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`k-settings-group${wide ? " wide" : ""}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 className="k-settings-h" id={id ? `${id}-h` : undefined}>
        {title}
      </h2>
      {blurb && <p className="k-settings-blurb">{blurb}</p>}
      <div className="k-settings-body">{children}</div>
    </section>
  );
}

/** Settings groups laid out in two columns on wide screens, one on narrow ones. */
export function SettingsLayout({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={`k-settings${compact ? " compact" : ""}`}>{children}</div>;
}

/** A labelled control row: label left, control right; stacks on narrow screens. */
export function SettingRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="k-setting-row">
      <div className="k-setting-label">
        <span>{label}</span>
        {hint && <span className="k-setting-hint">{hint}</span>}
      </div>
      <div className="k-setting-control">{children}</div>
    </div>
  );
}

export interface KeyBinding {
  /** Key names, each rendered as a <kbd>; "/" between alternatives. */
  keys: string[];
  action: string;
  /** Where the binding applies, e.g. "on the active input". */
  scope?: string;
}

/** The hotkey legend: one row per binding. */
export function KeyLegend({ bindings }: { bindings: KeyBinding[] }) {
  return (
    <table className="k-keys">
      <tbody>
        {bindings.map((b) => (
          <tr key={b.action}>
            <td className="k-keys-keys">
              {b.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && <span className="k-keys-or"> / </span>}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </td>
            <td className="k-keys-action">
              {b.action}
              {b.scope && <span className="k-keys-scope"> · {b.scope}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A segmented choice: one of a few options, each a button. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : undefined} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
