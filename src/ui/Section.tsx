import { useState } from "react";
import { kpiItem, sectionNumber, viewChips } from "../app/figures";
import type { PanelTab } from "../kit/ui/TabbedPanel";
import { SectionFrame } from "../kit/ui/SectionFrame";
import { useStore } from "../state/store";
import type { ChartSpec } from "../charts/spec";
import type { Action, Note, ScenarioView } from "../viewmodel/types";
import { viewOfChart } from "../viewmodel/types";
import { ChartHost } from "./ChartHost";
import { ParamInput } from "./ParamInput";
import { TableView } from "./TableView";

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

/** The section's notes and derivations, as plain prose. */
export function Notes({ notes }: { notes: Note[] }) {
  return (
    <div className="notes">
      {notes.map((n) => (
        <div className="note" key={n.title}>
          <h4>{n.title}</h4>
          <NoteBody body={n.body} />
        </div>
      ))}
    </div>
  );
}

/** An action that moves the deck, phrased as a sentence; a warning asks first. */
export function ActionButton({ a }: { a: Action }) {
  const setParams = useStore((s) => s.setParams);
  const [confirm, setConfirm] = useState(false);
  if (a.warning && confirm) {
    return (
      <span className="actions">
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
    <span className="actions">
      <button type="button" className="action-link" onClick={() => (a.warning ? setConfirm(true) : setParams(a.patch))}>
        {a.label}
      </button>
      {a.hint && <span className="hint">{a.hint}</span>}
    </span>
  );
}

/** Every figure the discussion quotes for the section, next to what the app computes. */
export function SourceFigures({ view }: { view: ScenarioView }) {
  if (!view.sourceFigures?.length) return null;
  return (
    <div className="source-figures">
      <table className="figs">
        <colgroup>
          <col className="c-label" />
          <col className="c-quoted" />
          <col className="c-app" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Figure</th>
            <th scope="col">Quoted</th>
            <th scope="col">This app</th>
            <th scope="col">Agrees?</th>
          </tr>
        </thead>
        <tbody>
          {view.sourceFigures.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td className="mono">{s.quoted}</td>
              <td className="mono">{s.computed}</td>
              <td className={`agree${s.agrees ? "" : " no"}`}>
                {s.agrees ? "yes" : "no"}
                {!s.agrees && s.why && <span className="why">{s.why}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">Recomputed from the current deck, except where the label fixes an input at the discussion's number.</p>
    </div>
  );
}

/** The section's tables, each with its title and a link to the view that holds it. */
function Tables({ view, tables }: { view: ScenarioView; tables: ChartSpec[] }) {
  return (
    <div className="panel-tables">
      {tables.map((t) => {
        const v = viewOfChart(view, t.id);
        return (
          <div key={t.id} className="panel-table" id={`chart-${t.id}`}>
            <div className="panel-table-head">
              <span className="panel-table-title">{t.title}</span>
              {v && (
                <a className="k-textlink" href={`#view/${v.id}`}>
                  {v.title} ↗
                </a>
              )}
            </div>
            <TableView spec={t} />
          </div>
        );
      })}
    </div>
  );
}

/** The panels the footer line opens: tables, derivations, quoted vs recomputed. */
export function sectionPanels(view: ScenarioView): PanelTab[] {
  const tabs: PanelTab[] = [];
  if (view.tables.length) tabs.push({ id: "tables", label: view.tables.length === 1 ? "Table" : "Tables", count: view.tables.length > 1 ? view.tables.length : undefined, render: () => <Tables view={view} tables={view.tables} /> });
  if (view.notes.length) tabs.push({ id: "notes", label: "Derivations", render: () => <Notes notes={view.notes} /> });
  if (view.sourceFigures?.length) tabs.push({ id: "quoted", label: "Quoted vs recomputed", count: view.sourceFigures.length, render: () => <SourceFigures view={view} /> });
  return tabs;
}

/** A section of the Explain page: the scenario's view-model in the kit's section skeleton. */
export function Section({ view }: { view: ScenarioView }) {
  const chart = (c: ChartSpec) => <ChartHost key={c.id} spec={c} viewId={viewOfChart(view, c.id)?.id} />;
  return (
    <SectionFrame
      id={`s-${view.id}`}
      eyebrow={`Section ${sectionNumber(view)}`}
      chips={viewChips(view)}
      title={view.title}
      lede={view.lede}
      claim={view.claim}
      answers={view.kpis.map(kpiItem)}
      answersShown={3}
      actions={view.actions?.length ? view.actions.map((a) => <ActionButton key={a.label} a={a} />) : undefined}
      inputs={view.localParams.length ? view.localParams.map((k) => <ParamInput key={k} k={k} compact />) : undefined}
      primary={view.primary.map(chart)}
      secondary={view.secondary.map(chart)}
      panels={sectionPanels(view)}
    />
  );
}
