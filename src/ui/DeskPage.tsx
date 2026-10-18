import { deskColumns, deskGroups } from "../app/desk/grid";
import type { ChartSpec } from "../charts/spec";
import { DeskGrid } from "../kit/ui/DeskGrid";
import { Segmented } from "../kit/ui/Settings";
import { marketPatch, type Market } from "../model/params";
import { useStore } from "../state/store";
import { pct, x2 } from "../viewmodel/derived";
import type { DeskView } from "../viewmodel/desk";
import type { ScenarioView } from "../viewmodel/types";
import { allCharts } from "../viewmodel/types";
import { ChartHost } from "./ChartHost";

const MARKETS: { value: Market; label: string; title: string }[] = [
  { value: "fair", label: "Fair market", title: "q = b/(1+b): the chain prices the tail fairly, premium 0" },
  { value: "discussion", label: "Discussion case", title: "q such that a clean coin season has probability 55%" },
  { value: "custom", label: "Custom", title: "q as typed in the deck" },
];

function chartById(scenarios: ScenarioView[], id: string): ChartSpec | undefined {
  for (const s of scenarios) {
    const c = allCharts(s).find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** The fair-market switch: wired to params.market through the schema's patch. */
function MarketSwitch({ desk }: { desk: DeskView }) {
  const params = useStore((s) => s.params);
  const setParams = useStore((s) => s.setParams);
  const value = desk.market.actual;
  return (
    <div className="desk-market">
      <Segmented ariaLabel="Market" options={MARKETS} value={value} onChange={(m) => setParams(marketPatch(m, params))} />
      <p className="desk-line">{desk.market.line}</p>
      {desk.market.sizingNote && <p className="desk-line strong">{desk.market.sizingNote}</p>}
      <p className="desk-line muted">
        The market sets the deck's loss rate q, so every figure on this page and every section moves with it.{" "}
        <a className="k-textlink" href={`#view/${desk.market.viewId}`}>
          Which loss rate to plug in ↗
        </a>
      </p>
    </div>
  );
}

/**
 * The Desk, the landing page: given my book, what happens? The policy grid for one
 * season and N seasons, how much to risk a night, whether the record can tell, and the
 * market the deck assumes. Data from the DeskView; no boxes.
 */
export function DeskPage({ desk, scenarios, pending }: { desk: DeskView; scenarios: ScenarioView[]; pending: boolean }) {
  const heat = chartById(scenarios, desk.sizing.chartId);
  const s = desk.sizing;
  return (
    <div className="desk">
      <header className="desk-head">
        <h1 className="page-title">Desk</h1>
        <p className="page-lede">Given the deck's inputs, what each policy does over one season and over {desk.seasons} chained, how much to risk a night, and whether a track record can settle the loss rate.</p>
      </header>

      <div className="desk-blocks">
      <section className="desk-block desk-book" aria-labelledby="desk-book">
        <h2 className="k-block-h" id="desk-book">
          Your book
        </h2>
        <DeskGrid columns={deskColumns(desk)} groups={deskGroups(desk)} busy={pending} />
        <p className="caption">Each row opens the view that explains it. Season ends are in tranche units; the threshold is {x2(desk.threshold)} the starting tranche.</p>
      </section>

      <section className="desk-block desk-size" aria-labelledby="desk-size">
        <h2 className="k-block-h" id="desk-size">
          How much to risk a night
        </h2>
        <div className="desk-sizing">
          <div className="desk-sizing-chart">{heat ? <ChartHost spec={heat} viewId={s.viewId} /> : <p className="caption">The sizing grid is computing…</p>}</div>
          <div className="desk-sizing-figs">
            <div className="k-fig hero">
              <div className="k-fig-v">{pct(s.robust)}</div>
              <div className="k-fig-l">Robust risk a night</div>
            </div>
            <div className="k-fig">
              <div className="k-fig-v" style={{ color: "var(--c)" }}>
                {pct(s.risk)}
              </div>
              <div className="k-fig-l">You risk a night</div>
            </div>
            <div className="k-fig">
              <div className="k-fig-v">{pct(s.nightKelly)}</div>
              <div className="k-fig-l">Growth-optimal at the deck's rate</div>
            </div>
            <p className="desk-line">{s.text}</p>
            <a className="k-textlink" href={`#view/${s.viewId}`}>
              How much to risk a night ↗
            </a>
          </div>
        </div>
      </section>

      <section className="desk-block desk-record" aria-labelledby="desk-record">
        <h2 className="k-block-h" id="desk-record">
          Can the record tell
        </h2>
        <p className="desk-verdict">
          <a href={`#view/${desk.calibration.viewId}`}>{desk.calibration.sentence}</a>
        </p>
      </section>

      <section className="desk-block desk-market-block" aria-labelledby="desk-market">
        <h2 className="k-block-h" id="desk-market">
          Market
        </h2>
        <MarketSwitch desk={desk} />
      </section>
      </div>
    </div>
  );
}
