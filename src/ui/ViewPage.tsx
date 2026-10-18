import { kpiItem, sectionNumber } from "../app/figures";
import { AnswerStrip } from "../kit/ui/AnswerStrip";
import { TabbedPanel, type PanelTab } from "../kit/ui/TabbedPanel";
import { ViewFrame } from "../kit/ui/ViewFrame";
import type { ScenarioView } from "../viewmodel/types";
import { allCharts } from "../viewmodel/types";
import { ChartHost } from "./ChartHost";
import { ParamInput } from "./ParamInput";
import { ActionButton, Notes, SourceFigures } from "./Section";

/** One responsibility on its own page: the charts large, the context beside them. */
export function ViewPage({ scenarios, viewId }: { scenarios: ScenarioView[]; viewId: string }) {
  const flat = scenarios.flatMap((s) => s.views.map((v) => ({ scenario: s, view: v })));
  const idx = flat.findIndex((x) => x.view.id === viewId);
  if (idx < 0)
    return (
      <div className="k-view">
        <h1 className="k-view-title">No such view</h1>
        <p className="page-lede">
          Pick one from the Views menu, or go back to the <a href="#desk">Desk</a>.
        </p>
      </div>
    );
  const { scenario, view } = flat[idx];
  const prev = flat[(idx - 1 + flat.length) % flat.length];
  const next = flat[(idx + 1) % flat.length];
  const charts = view.charts.map((id) => allCharts(scenario).find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const kpis = (view.kpis ?? []).map((i) => scenario.kpis[i]).filter(Boolean);
  const params = view.params ?? scenario.localParams;
  const panels: PanelTab[] = [];
  if (scenario.notes.length) panels.push({ id: "notes", label: "Derivations", render: () => <Notes notes={scenario.notes} /> });
  if (scenario.sourceFigures?.length) panels.push({ id: "quoted", label: "Quoted vs recomputed", count: scenario.sourceFigures.length, render: () => <SourceFigures view={scenario} /> });

  const main = (
    <>
      {charts.map((c) => (
        <ChartHost key={c.id} spec={c.kind === "table" ? c : { ...c, height: Math.max(c.height ?? 300, c.kind === "heatmap" || c.kind === "figure" ? (c.height ?? 300) : 360) }} />
      ))}
      {scenario.actions && scenario.actions.length > 0 && (
        <div className="actions">
          {scenario.actions.map((a) => (
            <ActionButton key={a.label} a={a} />
          ))}
        </div>
      )}
    </>
  );

  const aside = (
    <>
      <p className="k-claim static">{scenario.claim}</p>
      <p className="k-view-blurb">{view.blurb}</p>
      {kpis.length > 0 && <AnswerStrip items={kpis.map(kpiItem)} shown={kpis.length} layout="column" />}
      {params.length > 0 && (
        <div className="k-inputs column" role="group" aria-label="Inputs for this view">
          <div className="k-caption">Inputs for this view</div>
          <div className="k-inputs-row">
            {params.map((k) => (
              <ParamInput key={k} k={k} compact />
            ))}
          </div>
        </div>
      )}
      {panels.length > 0 && <TabbedPanel tabs={panels} label="More on this view" />}
    </>
  );

  return (
    <ViewFrame
      eyebrow={
        <a href={`#s-${scenario.id}`} className="k-crumb">
          Section {sectionNumber(scenario)} · {scenario.title}
        </a>
      }
      title={view.title}
      prev={{ href: `#view/${prev.view.id}`, label: prev.view.title, title: `${prev.scenario.title} › ${prev.view.title}` }}
      next={{ href: `#view/${next.view.id}`, label: next.view.title, title: `${next.scenario.title} › ${next.view.title}` }}
      main={main}
      aside={aside}
    />
  );
}
