import { useState } from "react";
import { useStore } from "../state/store";
import type { Action, KPI, Note, ScenarioView } from "../viewmodel/types";
import { ChartHost } from "./ChartHost";
import { Help } from "./Help";
import { ParamInput } from "./ParamInput";

function NoteBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/);
  return (
    <>
      {blocks.map((blk, i) => {
        const lines = blk.split("\n");
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{blk}</p>;
      })}
    </>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  return (
    <div className="expander-body">
      {notes.map((n) => (
        <div className="note" key={n.title}>
          <h4>{n.title}</h4>
          <NoteBody body={n.body} />
        </div>
      ))}
    </div>
  );
}

export function KpiTile({ k }: { k: KPI }) {
  return (
    <div className={`kpi${k.color ? ` role-${k.color}` : ""}`}>
      <div className="l">
        <span>{k.label}</span>
        <Help text={k.help} />
      </div>
      <div className="v" title={k.value}>
        {k.value}
      </div>
      {k.sub && <div className="s">{k.sub}</div>}
    </div>
  );
}

function ActionButton({ a }: { a: Action }) {
  const setParams = useStore((s) => s.setParams);
  const [confirm, setConfirm] = useState(false);
  if (a.warning && confirm) {
    return (
      <span className="actions" style={{ gap: 8 }}>
        <span className="warn">{a.warning}</span>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setParams(a.patch);
            setConfirm(false);
          }}
        >
          Do it anyway
        </button>
        <button type="button" className="btn small quiet" onClick={() => setConfirm(false)}>
          Keep the deck
        </button>
      </span>
    );
  }
  return (
    <span className="actions" style={{ gap: 8 }}>
      <button type="button" className="btn" onClick={() => (a.warning ? setConfirm(true) : setParams(a.patch))} title={a.hint}>
        {a.label}
      </button>
      {a.hint && <span className="hint">{a.hint}</span>}
    </span>
  );
}

export function Section({ view }: { view: ScenarioView }) {
  const head = view.kpis.slice(0, 2);
  const more = view.kpis.slice(2);
  return (
    <section className="section" id={`s-${view.id}`} aria-labelledby={`h-${view.id}`}>
      <div className="section-head">
        <div className="eyebrow">
          <span className="n">{String(view.number).padStart(2, "0")}</span>
          <span>{view.eyebrow}</span>
        </div>
        <h2 id={`h-${view.id}`}>{view.title}</h2>
        <p className="question">{view.question}</p>
        <p className="lede">{view.lede}</p>
      </div>

      {head.length > 0 && (
        <div className="kpi-row">
          <div className="kpis">
            {head.map((k) => (
              <KpiTile key={k.label} k={k} />
            ))}
          </div>
          {more.length > 0 && (
            <details className="kpi-more">
              <summary>{more.length} more figure{more.length === 1 ? "" : "s"}</summary>
              <div className="kpis">
                {more.map((k) => (
                  <KpiTile key={k.label} k={k} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="stack">
        {view.primary.map((c) => (
          <ChartHost key={c.id} spec={c} />
        ))}
      </div>

      {view.secondary.length > 0 && (
        <div className="grid-2">
          {view.secondary.map((c) => (
            <ChartHost key={c.id} spec={c} />
          ))}
        </div>
      )}

      {view.actions && view.actions.length > 0 && (
        <div className="actions">
          {view.actions.map((a) => (
            <ActionButton key={a.label} a={a} />
          ))}
        </div>
      )}

      <div className="section-tail">
        {view.localParams.length > 0 && (
          <details className="expander">
            <summary>Tune this section</summary>
            <div className="params-compact">
              {view.localParams.map((k) => (
                <ParamInput key={k} k={k} compact />
              ))}
            </div>
          </details>
        )}
        {view.tables.map((t) => (
          <details className="expander" key={t.id}>
            <summary>{t.title}</summary>
            <div className="expander-body">
              <ChartHost spec={t} />
            </div>
          </details>
        ))}
        {view.notes.length > 0 && (
          <details className="expander">
            <summary>Notes and derivations</summary>
            <Notes notes={view.notes} />
          </details>
        )}
        {view.sourceFigures && view.sourceFigures.length > 0 && (
          <details className="expander">
            <summary>Figures quoted in the discussion, recomputed here</summary>
            <div className="expander-body">
              <table className="figs">
                <thead>
                  <tr>
                    <th scope="col">Figure</th>
                    <th scope="col">Quoted</th>
                    <th scope="col">This app</th>
                  </tr>
                </thead>
                <tbody>
                  {view.sourceFigures.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="mono">{s.quoted}</td>
                      <td className="mono">{s.computed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption">Recomputed from the current deck. Small differences are rounding in the discussion; large ones mean the deck has moved away from its inputs.</p>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
