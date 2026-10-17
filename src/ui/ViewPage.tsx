import type { ScenarioView } from "../viewmodel/types";
import { allCharts } from "../viewmodel/types";
import { ChartHost } from "./ChartHost";
import { ParamInput } from "./ParamInput";
import { ActionButton, KpiTile, Notes, SourceFigures } from "./Section";

export interface ViewRef {
  scenario: ScenarioView;
  viewId: string;
}

/** One responsibility on its own page: the charts large, the context beside them. */
export function ViewPage({ scenarios, viewId }: { scenarios: ScenarioView[]; viewId: string }) {
  const flat = scenarios.flatMap((s) => s.views.map((v) => ({ scenario: s, view: v })));
  const idx = flat.findIndex((x) => x.view.id === viewId);
  if (idx < 0)
    return (
      <div className="viewpage">
        <p className="caption">No such view. Pick one from the Views menu.</p>
      </div>
    );
  const { scenario, view } = flat[idx];
  const prev = flat[(idx - 1 + flat.length) % flat.length];
  const next = flat[(idx + 1) % flat.length];
  const charts = view.charts.map((id) => allCharts(scenario).find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const kpis = (view.kpis ?? []).map((i) => scenario.kpis[i]).filter(Boolean);
  const params = view.params ?? scenario.localParams;
  return (
    <div className="viewpage">
      <div className="view-head">
        <div className="view-crumbs">
          <a href={`#s-${scenario.id}`} className="crumb">
            {scenario.title}
          </a>
          <span className="crumb-sep">›</span>
          <h2>{view.title}</h2>
        </div>
        <div className="view-nav">
          <a href={`#view/${prev.view.id}`} className="btn small quiet" title={`${prev.scenario.title} › ${prev.view.title}`}>
            ← {prev.view.title}
          </a>
          <a href={`#view/${next.view.id}`} className="btn small quiet" title={`${next.scenario.title} › ${next.view.title}`}>
            {next.view.title} →
          </a>
        </div>
      </div>
      <div className="view-body">
        <div className="view-charts">
          {charts.map((c) => (
            <ChartHost key={c.id} spec={c.kind === "table" ? c : { ...c, height: Math.max(c.height ?? 300, c.kind === "heatmap" ? c.height ?? 300 : 360) }} />
          ))}
          {scenario.actions && scenario.actions.length > 0 && (
            <div className="actions">
              {scenario.actions.map((a) => (
                <ActionButton key={a.label} a={a} />
              ))}
            </div>
          )}
        </div>
        <aside className="view-context">
          <div className="claim static">{scenario.claim}</div>
          <p className="view-blurb">{view.blurb}</p>
          {kpis.length > 0 && (
            <div className="kpis one-col">
              {kpis.map((k) => (
                <KpiTile key={k.label} k={k} />
              ))}
            </div>
          )}
          {params.length > 0 && (
            <div className="view-params">
              <h4>Inputs for this view</h4>
              {params.map((k) => (
                <ParamInput key={k} k={k} compact />
              ))}
            </div>
          )}
          {scenario.notes.length > 0 && (
            <details className="expander">
              <summary>Notes and derivations</summary>
              <Notes notes={scenario.notes} />
            </details>
          )}
          <SourceFigures view={scenario} />
        </aside>
      </div>
    </div>
  );
}
