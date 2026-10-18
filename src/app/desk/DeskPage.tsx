import { MarketSwitch } from "@app/deck/MarketSwitch";
import { deskColumns, deskGroups } from "./grid";
import type { ChartSpec } from "@kit/charts/spec";
import { DeskGrid } from "@kit/ui/DeskGrid";
import { pct, x2 } from "@kit/charts/numbers";
import type { DeskView } from "./desk";
import type { ScenarioView } from "@app/scenarios/types";
import { allCharts } from "@app/scenarios/types";
import { ChartHost } from "@kit/ui/ChartHost";

function chartById(scenarios: ScenarioView[], id: string): ChartSpec | undefined {
  for (const s of scenarios) {
    const c = allCharts(s).find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** Block 4: the deck's market switch (the same one the full deck holds) and what it moves. */
function MarketBlock({ desk }: { desk: DeskView }) {
  return (
    <div className="desk-market">
      <MarketSwitch customFocusId="param-lossRate" />
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
              <div className="k-fig-v">{pct(s.risk)}</div>
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
        <MarketBlock desk={desk} />
      </section>
      </div>
    </div>
  );
}
