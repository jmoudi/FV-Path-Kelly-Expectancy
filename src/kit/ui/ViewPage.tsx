import type { ReactNode } from "react";
import { kpiItems, sectionNumber } from "./scenarioProps";
import { AnswerStrip } from "./AnswerStrip";
import { TabbedPanel, type PanelTab } from "./TabbedPanel";
import { ViewFrame } from "./ViewFrame";
import { sectionHref, viewHref } from "./route";
import type { ScenarioView } from "@kit/charts/scenario";
import { allCharts } from "@kit/charts/scenario";
import { ChartHost } from "./ChartHost";
import { ParamInput } from "@kit/inputs/ParamInput";
import { ActionButton, Notes, SourceFigures } from "./Section";
import { Link, RichText } from "./Link";
import { InputsCaption } from "./SectionFrame";
import { useKitCopy } from "@kit/state/context";

/** One responsibility on its own page: the charts large, the context beside them. */
export function ViewPage({ scenarios, viewId, notFound }: { scenarios: ScenarioView[]; viewId: string; notFound?: ReactNode }) {
  const copy = useKitCopy();
  const flat = scenarios.flatMap((s) => s.views.map((v) => ({ scenario: s, view: v })));
  const idx = flat.findIndex((x) => x.view.id === viewId);
  if (idx < 0)
    return (
      <div className="k-view">
        <h1 className="k-view-title">No such view</h1>
        <p className="page-lede">
          {notFound ?? "Pick one from the Views menu."}
        </p>
      </div>
    );
  const { scenario, view } = flat[idx];
  const prev = flat[(idx - 1 + flat.length) % flat.length];
  const next = flat[(idx + 1) % flat.length];
  const charts = view.charts.map((id) => allCharts(scenario).find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const kpis = kpiItems(scenario, { indices: view.kpis ?? [], idBase: `view-${view.id}-fig` });
  const params = view.params ?? scenario.localParams;
  const panels: PanelTab[] = [];
  if (scenario.notes.length) panels.push({ id: "notes", label: "Derivations", render: () => <Notes notes={scenario.notes} /> });
  if (scenario.sourceFigures?.length) panels.push({ id: "quoted", label: "Quoted vs recomputed", count: scenario.sourceFigures.length, render: () => <SourceFigures view={scenario} /> });

  const main = (
    <>
      {charts.map((c) => (
        // The spec fixes the plot box's height here as everywhere (the outcomes bar stays 140px).
        <ChartHost key={c.id} spec={c} />
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
      <p className="k-claim static">
        <RichText text={scenario.claim} />
      </p>
      <p className="k-view-blurb">
        <RichText text={view.blurb} />
      </p>
      {kpis.length > 0 && <AnswerStrip items={kpis} shown={kpis.length} layout="column" />}
      {params.length > 0 && (
        <div className="k-inputs column" role="group" aria-label="Inputs for this view">
          <InputsCaption text="Inputs for this view" href={copy.links.inputs} />
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
        <Link to={sectionHref(scenario.id)} variant="plain" className="k-crumb">
          Section <span className="k-eyebrow-n">{sectionNumber(scenario)}</span> · {scenario.title}
        </Link>
      }
      title={view.title}
      prev={{ href: viewHref(prev.view.id), label: prev.view.title, title: `${prev.scenario.title} › ${prev.view.title}` }}
      next={{ href: viewHref(next.view.id), label: next.view.title, title: `${next.scenario.title} › ${next.view.title}` }}
      main={main}
      aside={aside}
    />
  );
}
