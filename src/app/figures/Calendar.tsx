import { linearTicks } from "@kit/charts/resolve";
import { THEME, withAlpha } from "@kit/charts/theme";
import type { FigureProps } from "@kit/charts/figures/registry";
import { FIGURE_FONT, TOKENS, figureNumber, numParam } from "@kit/charts/figures/tokens";

interface DayRow {
  day: number;
  week: number;
  weekday: number;
  names: number;
  capital: number;
  losses: number;
  cumLog: number | null;
  expectedCumLog: number;
}

const WEEKDAYS = ["M", "T", "W", "T", "F"];

/**
 * A season by the calendar: trading days in weeks of five. Each night's bar is the
 * share of the tranche in use, one segment per name (red when that name hit max
 * loss); the line is the cumulative log growth of this sampled season, the dashed
 * line its expectation, and the dashed horizontal the median night's capital use.
 *
 * Params: days, fraction (Kelly per name), medianCapital, medianNames.
 */
export function Calendar({ spec, width }: FigureProps) {
  // The data table carries weeks and weekdays 1-based for the reader; the layout is 0-based.
  const rows = spec.data.rows.map((r) => ({
    day: Number(r.day),
    week: Number(r.week) - 1,
    weekday: Number(r.weekday) - 1,
    names: Number(r.names),
    capital: Number(r.capital),
    losses: Number(r.losses),
    cumLog: typeof r.cumLog === "number" && Number.isFinite(r.cumLog) ? r.cumLog : null,
    expectedCumLog: Number(r.expectedCumLog),
  })) as DayRow[];
  const prm = spec.params;
  const medianCapital = numParam(prm, "medianCapital", 0);
  const medianNames = Math.round(numParam(prm, "medianNames", 0));
  const height = spec.height ?? 280;
  const W = Math.max(260, width);
  const left = 46;
  const right = 60;
  const top = 26;
  const bottom = 40;
  const plotW = W - left - right;
  const plotH = Math.max(60, height - top - bottom);
  const weeks = rows.length ? Math.max(...rows.map((r) => r.week)) + 1 : 1;
  const weekGap = Math.max(6, Math.min(18, plotW * 0.014));
  const bw = Math.max(2, (plotW - (weeks - 1) * weekGap) / (weeks * 5));
  const xOf = (r: DayRow) => left + r.week * (5 * bw + weekGap) + r.weekday * bw;
  const yCap = (c: number) => top + plotH * (1 - Math.max(0, Math.min(1, c)));

  // Growth axis: the realized and expected lines, with zero always inside.
  const gVals = [0, ...rows.map((r) => r.expectedCumLog), ...rows.map((r) => r.cumLog).filter((v): v is number => v != null)];
  let gMin = Math.min(...gVals);
  let gMax = Math.max(...gVals);
  if (gMax - gMin < 1e-6) {
    gMin -= 0.01;
    gMax += 0.01;
  }
  const pad = (gMax - gMin) * 0.08;
  gMin -= pad;
  gMax += pad;
  const ruined = rows.some((r) => r.cumLog == null);
  const gTicks = linearTicks(gMin, gMax, 4);
  const yG = (g: number) => top + plotH * (1 - (g - gMin) / (gMax - gMin));
  const gFmt = (v: number) => figureNumber(v, "pct");

  const barColor = withAlpha(TOKENS.ink, 0.34);
  const lossColor = withAlpha(THEME.roles.loss, 0.9);
  const text = { fontFamily: FIGURE_FONT.family, fontSize: FIGURE_FONT.label } as const;
  const mono = { fontFamily: FIGURE_FONT.mono, fontSize: FIGURE_FONT.label } as const;

  const realized: string[] = [`${left},${yG(0)}`];
  const expected: string[] = [`${left},${yG(0)}`];
  let ruinAt: { x: number } | null = null;
  for (const r of rows) {
    const x = xOf(r) + bw / 2;
    expected.push(`${x},${yG(r.expectedCumLog)}`);
    if (r.cumLog != null) realized.push(`${x},${yG(r.cumLog)}`);
    else if (!ruinAt) {
      realized.push(`${x},${yG(gMin)}`);
      ruinAt = { x };
    }
  }
  const weekRows = Array.from({ length: weeks }, (_, w) => rows.filter((r) => r.week === w));
  const inner = bw >= 6 ? 1 : 0;
  const medianLabel = `median night ${figureNumber(medianCapital, "pct")} in use (${medianNames} name${medianNames === 1 ? "" : "s"})`;

  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {/* Capital axis on the left, growth axis on the right. */}
      {[0, 0.5, 1].map((c) => (
        <g key={c}>
          <line x1={left} x2={W - right} y1={yCap(c)} y2={yCap(c)} stroke={TOKENS.grid} strokeWidth={1} />
          <text x={left - 6} y={yCap(c) + 4} textAnchor="end" fill={TOKENS.muted} style={mono}>
            {figureNumber(c, "pct")}
          </text>
        </g>
      ))}
      <text x={left - 6} y={top - 10} textAnchor="end" fill={TOKENS.muted} style={text}>
        in use
      </text>
      {gTicks.map((g) => (
        <text key={g} x={W - right + 6} y={yG(g) + 4} textAnchor="start" fill={TOKENS.muted} style={mono}>
          {gFmt(g)}
        </text>
      ))}
      <text x={W - right + 6} y={top - 10} textAnchor="start" fill={TOKENS.muted} style={text}>
        log growth
      </text>
      <line x1={left} x2={W - right} y1={yG(0)} y2={yG(0)} stroke={withAlpha(TOKENS.muted, 0.5)} strokeWidth={1} strokeDasharray="1 3" />
      {/* Bars: one segment per name, losses on top in red. */}
      {rows.map((r) => {
        if (r.names <= 0) return null;
        const x = xOf(r);
        const seg = (plotH * r.capital) / r.names;
        return (
          <g key={r.day}>
            {Array.from({ length: r.names }, (_, i) => {
              const yTop = yCap(((i + 1) * r.capital) / r.names);
              const lost = i >= r.names - r.losses;
              return <rect key={i} x={x + inner} y={yTop + inner / 2} width={Math.max(1, bw - 2 * inner)} height={Math.max(0.5, seg - inner)} fill={lost ? lossColor : barColor} />;
            })}
          </g>
        );
      })}
      {/* Week labels, weekday letters, empty weeks. */}
      {weekRows.map((days, w) => {
        if (!days.length) return null;
        const x0 = xOf(days[0]);
        const x1 = xOf(days[days.length - 1]) + bw;
        const empty = days.every((r) => r.names === 0);
        return (
          <g key={w}>
            <text x={(x0 + x1) / 2} y={top + plotH + 30} textAnchor="middle" fill={TOKENS.muted} style={text}>
              week {w + 1}
            </text>
            {bw >= 16 && days.map((r) => <text key={r.day} x={xOf(r) + bw / 2} y={top + plotH + 14} textAnchor="middle" fill={withAlpha(TOKENS.muted, 0.8)} style={mono}>{WEEKDAYS[r.weekday]}</text>)}
            {empty && bw >= 7 && (
              <text x={(x0 + x1) / 2} y={yCap(0.5)} textAnchor="middle" fill={TOKENS.muted} style={text}>
                empty week
              </text>
            )}
          </g>
        );
      })}
      {/* The median night's capital use. */}
      {medianCapital > 0 && (
        <>
          <line x1={left} x2={W - right} y1={yCap(medianCapital)} y2={yCap(medianCapital)} stroke={TOKENS.ink2} strokeWidth={1} strokeDasharray="4 4" />
          <rect x={left + 2} y={yCap(medianCapital) - 18} width={medianLabel.length * 6.3 + 8} height={16} rx={3} fill={withAlpha(TOKENS.surface, 0.88)} />
          <text x={left + 6} y={yCap(medianCapital) - 6} textAnchor="start" fill={TOKENS.ink2} style={text}>
            {medianLabel}
          </text>
        </>
      )}
      {/* Expected and realized cumulative log growth. */}
      <polyline points={expected.join(" ")} fill="none" stroke={TOKENS.muted} strokeWidth={1.2} strokeDasharray="5 4" />
      <polyline points={realized.join(" ")} fill="none" stroke={TOKENS.ink} strokeWidth={2} strokeLinejoin="round" />
      {ruinAt && (
        <>
          <circle cx={ruinAt.x} cy={yG(gMin)} r={4} fill={THEME.roles.loss} />
          <text x={ruinAt.x + 6} y={yG(gMin) - 4} textAnchor="start" fill={THEME.roles.loss} style={text}>
            ruined
          </text>
        </>
      )}
      {!ruined && rows.length > 0 && rows[rows.length - 1].cumLog != null && (
        <text x={xOf(rows[rows.length - 1]) + bw / 2} y={yG(rows[rows.length - 1].cumLog as number) - 7} textAnchor="end" fill={TOKENS.ink} style={text}>
          {gFmt(rows[rows.length - 1].cumLog as number)}
        </text>
      )}
    </svg>
  );
}
