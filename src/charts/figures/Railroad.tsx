import type { ColorRole } from "../spec";
import { roleColor, withAlpha } from "../theme";
import type { FigureProps } from "./index";
import { FIGURE_FONT, TOKENS, figureNumber, numParam, strParam } from "./tokens";

/**
 * The railroad schematic. Nights are stations along the line (time steps outside the
 * log); at each station the tranche splits into one track per name and merges again
 * after it (bets inside the log). A track's width is the share of the tranche that
 * name risks; the reserve runs straight through every station.
 *
 * Params: nights, names, trackShare, reserveShare, totalAtRisk, gain, color.
 */
export function Railroad({ spec, width }: FigureProps) {
  const prm = spec.params;
  const n = Math.max(1, Math.round(numParam(prm, "nights", 20)));
  const k = Math.max(1, Math.round(numParam(prm, "names", 3)));
  const share = Math.max(0, numParam(prm, "trackShare", 1 / k));
  const reserve = Math.max(0, Math.min(1, numParam(prm, "reserveShare", Math.max(0, 1 - k * share))));
  const total = Math.max(0, Math.min(1, numParam(prm, "totalAtRisk", k * share)));
  const trackColor = roleColor(strParam(prm, "color", "c") as ColorRole);
  const height = spec.height ?? 240;
  const W = Math.max(240, width);
  const left = 14;
  const right = 14;
  const top = 40;
  const bottom = 60;
  const plotW = W - left - right;
  const plotH = Math.max(56, height - top - bottom);
  const cy = top + plotH / 2;

  // Stations: every night when they fit, otherwise the first few, one slot left open as a
  // gap, and the last night.
  const minPitch = 46;
  const slotCount = Math.max(3, Math.min(n, Math.floor(plotW / minPitch)));
  const gapped = slotCount < n;
  const pitch = plotW / slotCount;
  const gapSlot = slotCount - 2;
  const slots: { night: number; slot: number }[] = gapped ? [...Array.from({ length: slotCount - 2 }, (_, i) => ({ night: i + 1, slot: i })), { night: n, slot: slotCount - 1 }] : Array.from({ length: n }, (_, i) => ({ night: i + 1, slot: i }));
  const firstHidden = slotCount - 1;
  const lastHidden = n - 1;
  const xAt = (slot: number) => left + pitch * (slot + 0.5);

  // Thickness: the whole tranche is `scale` px; each track and the reserve take their share of it.
  const scale = Math.min(26, plotH * 0.34);
  const nameW = Math.max(1.5, share * scale);
  const reserveW = reserve * scale;
  // Tracks alternate above and below the reserve, nearest first, spread over the height on offer.
  const ranks = Math.ceil(k / 2);
  const half = plotH / 2 - 6;
  const fanGap = Math.max(nameW + 3, Math.min(18, (half - reserveW / 2 - nameW) / Math.max(1, ranks)));
  const offsets = Array.from({ length: k }, (_, i) => {
    const rank = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    return side * (reserveW / 2 + fanGap / 2 + nameW / 2 + rank * fanGap);
  });
  const extent = Math.max(...offsets.map(Math.abs)) + nameW / 2 + 3;
  const squeeze = Math.min(1, (plotH / 2 - 4) / extent);
  const fanH = extent * squeeze;

  const splitPath = (x: number, off: number) => {
    const x0 = x - pitch * 0.46;
    const x1 = x - pitch * 0.15;
    const x2 = x + pitch * 0.15;
    const x3 = x + pitch * 0.46;
    const d = (x1 - x0) * 0.55;
    const y = cy + off * squeeze;
    return `M${x0},${cy} C${x0 + d},${cy} ${x1 - d},${y} ${x1},${y} L${x2},${y} C${x2 + d},${y} ${x3 - d},${cy} ${x3},${cy}`;
  };

  const labelEvery = pitch >= 26 ? 1 : pitch >= 16 ? 2 : 5;
  const gapStart = gapped ? xAt(gapSlot) - pitch * 0.5 + 3 : 0;
  const gapEnd = gapped ? xAt(gapSlot) + pitch * 0.5 - 3 : 0;
  const first = xAt(0);
  const last = xAt(slots[slots.length - 1].slot);
  const pct = (v: number) => figureNumber(v, "pct");
  const text = { fontFamily: FIGURE_FONT.family, fontSize: FIGURE_FONT.label } as const;
  const mono = { fontFamily: FIGURE_FONT.mono, fontSize: FIGURE_FONT.label } as const;
  const wide = W >= 680;
  const namesWord = `${k} name${k === 1 ? "" : "s"}`;
  const outsideLabel = wide ? `${n} nights, one station each · outside the log: the season multiplies one factor per night` : `${n} nights · outside the log`;
  const insideLabel = wide ? `${namesWord} on one night · inside the log: outcomes add before the log is taken` : `${namesWord} on one night · inside the log`;
  const reserveLabel = total >= 0.995 ? "no reserve" : `reserve ${pct(reserve)}${wide ? " runs through" : ""}`;
  const widthLabel = wide ? `track width ∝ share at risk · each name ${pct(share)} · ${reserveLabel}` : `width ∝ share at risk · name ${pct(share)} · ${reserveLabel}`;

  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {/* The whole tranche, as the trunk; the reserve runs through at its own width. */}
      <line x1={left} x2={W - right} y1={cy} y2={cy} stroke={withAlpha(TOKENS.ink, 0.1)} strokeWidth={scale} strokeLinecap="butt" />
      {reserveW > 0.4 && <line x1={left} x2={W - right} y1={cy} y2={cy} stroke={withAlpha(TOKENS.muted, 0.55)} strokeWidth={reserveW} />}
      {gapped && (
        <>
          <rect x={gapStart} y={cy - scale / 2 - 1} width={Math.max(0, gapEnd - gapStart)} height={scale + 2} fill={TOKENS.surface} />
          <line x1={gapStart} x2={gapEnd} y1={cy} y2={cy} stroke={TOKENS.muted} strokeWidth={1} strokeDasharray="2 4" />
          <text x={xAt(gapSlot)} y={cy - fanH - 8} textAnchor="middle" fill={TOKENS.muted} style={text}>
            {firstHidden === lastHidden ? `night ${firstHidden}` : `nights ${firstHidden}–${lastHidden}`}
          </text>
        </>
      )}
      {/* Stations: the platform band, the tracks that split off and merge back, the night number. */}
      {slots.map(({ night, slot }) => {
        const x = xAt(slot);
        return (
          <g key={night}>
            <rect x={x - pitch * 0.15} y={cy - fanH - 2} width={pitch * 0.3} height={2 * fanH + 4} rx={3} fill={withAlpha(TOKENS.ink, 0.05)} />
            {offsets.map((off, i) => (
              <path key={i} d={splitPath(x, off)} fill="none" stroke={trackColor} strokeWidth={nameW} strokeLinecap="round" opacity={0.9} />
            ))}
            {(night === 1 || night === n || (night - 1) % labelEvery === 0) && (
              <text x={x} y={top + plotH + 16} textAnchor="middle" fill={TOKENS.muted} style={mono}>
                {night}
              </text>
            )}
          </g>
        );
      })}
      {/* Outside the log: the nights, one factor each. */}
      <line x1={first} x2={last} y1={top - 14} y2={top - 14} stroke={TOKENS.muted} strokeWidth={1} markerEnd="url(#rr-arrow)" />
      <defs>
        <marker id="rr-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={TOKENS.muted} />
        </marker>
      </defs>
      <text x={first} y={top - 20} textAnchor="start" fill={TOKENS.ink2} style={text}>
        {outsideLabel}
      </text>
      {wide && (
        <text x={W - right} y={top - 20} textAnchor="end" fill={TOKENS.muted} style={mono}>
          growth = Σ nights log(1 + Σ names f·r)
        </text>
      )}
      {/* Inside the log: the names on one night, under the first station. */}
      <line x1={first - pitch * 0.15} x2={first + pitch * 0.15} y1={top + plotH + 24} y2={top + plotH + 24} stroke={TOKENS.ink2} strokeWidth={1} />
      <text x={first - pitch * 0.15} y={top + plotH + 38} textAnchor="start" fill={TOKENS.ink2} style={text}>
        {insideLabel}
      </text>
      <text x={W - right} y={top + plotH + (wide ? 38 : 52)} textAnchor="end" fill={TOKENS.muted} style={text}>
        {widthLabel}
      </text>
    </svg>
  );
}
