import { valueText } from "@app/params/sweepAnchors";
import { DEFAULT_PARAMS, type Params } from "@app/params/params";
import { isSweepable } from "@kit/inputs/schema";
import { PARAM_BY_KEY } from "@app/params/schema";
import { useStore } from "../state/store";
import { describeFor, HOTKEY_HINTS } from "./useSweeps";

/**
 * The sweep strip: one line, in the deck's reserved slot (compact) or under a field.
 * In compact form it has a fixed width (--sweep-strip-w) whatever its state, so
 * starting, pausing or stopping a sweep never moves what sits beside it; on a phone
 * it falls back to symbols ("q 3.07% · 12 / 18 · stop").
 *
 * While a sweep runs it is a status line, "sweeping Loss rate per name 2.71% · step
 * 7 / 18 · Ctrl+. stop", and it follows the running sweep even when another input is
 * active. Otherwise it shows the active input's linked preset (click for the next
 * one), run or resume, stop when paused, and "↺ before sweep" when the input sits
 * elsewhere than before its last sweep. Without an input it says how to start.
 *
 * Whitespace between the flex items is not drawn; it keeps the text readable when
 * copied or read aloud.
 */
export function SweepStrip({ inputKey, compact }: { inputKey: string | null; compact?: boolean }) {
  const runs = useStore((s) => s.runs);
  const params = useStore((s) => s.params);
  const presets = useStore((s) => s.presets);
  const links = useStore((s) => s.links);
  const origins = useStore((s) => s.sweepOrigins);
  const linkPreset = useStore((s) => s.linkPreset);
  const cyclePreset = useStore((s) => s.cyclePreset);
  const toggleSweep = useStore((s) => s.toggleSweep);
  const stopSweep = useStore((s) => s.stopSweep);
  const restoreSweep = useStore((s) => s.restoreSweep);
  const setParam = useStore((s) => s.setParam);

  const cls = `sweep-strip sw${compact ? " compact" : ""}`;
  const runningKey = Object.values(runs).find((r) => r.startedAt != null)?.key;
  // A running sweep owns the strip; otherwise the active input does.
  const key = inputKey && runs[inputKey] ? inputKey : (runningKey ?? inputKey);
  const def = key ? PARAM_BY_KEY[key] : undefined;
  if (!key || !def || def.unit === "choice") {
    return (
      <div className={cls} role="status">
        <span className="sw-hint">Focus an input to sweep it · {HOTKEY_HINTS.undo} undoes</span>
      </div>
    );
  }
  const value = params[key as keyof Params] as number;
  const run = runs[key];
  const origin = run?.origin ?? origins[key];
  const dflt = DEFAULT_PARAMS[key as keyof Params];
  const name = (
    <span className="sw-name" title={def.label}>
      <span className="sw-wide">{def.label}</span>
      <span className="sw-narrow">{def.short ?? def.shortLabel ?? def.label}</span>
    </span>
  );

  if (!isSweepable(def)) {
    return (
      <div className={`${cls} named`} role="group" aria-label={`${def.label}: not swept`}>
        {name} <span className="sw-label">not swept</span>{" "}
        {value !== dflt && (
          <button type="button" className="chip tiny" onClick={() => setParam(key as keyof Params, dflt)} title="Back to the discussion's value">
            ↺ default
          </button>
        )}
      </div>
    );
  }

  const plan = run?.plan ?? null;
  const rank = plan ? (plan.ranks[Math.max(0, run.index)] ?? 1) : 0;
  const word = plan?.kind === "scenarios" ? "spot" : "step";
  const position = plan ? (
    <span className="sw-step">
      <span className="sw-wide">{word} </span>
      {rank} / {plan.count}
    </span>
  ) : null;

  if (run && run.startedAt != null) {
    return (
      <div className={`${cls} sweeping named`} role="status" aria-live="off">
        <button type="button" className="sw-icon" onClick={() => toggleSweep(key)} title={`Pause (${HOTKEY_HINTS.toggle})`} aria-label="Pause the sweep">
          ❚❚
        </button>{" "}
        <span className="sw-label sw-wide">sweeping</span> {name} <span className="sw-value">{valueText(def, value)}</span>{" "}
        {position && (
          <>
            <span className="sw-sep">·</span> {position}{" "}
          </>
        )}
        <span className="sw-sep">·</span>{" "}
        <button type="button" className="sw-link" onClick={() => stopSweep(key)} title={`Stop and keep ${valueText(def, value)}; ${HOTKEY_HINTS.undo} puts back ${valueText(def, run.origin)}`}>
          <span className="sw-wide">{HOTKEY_HINTS.stop} </span>stop
        </button>
      </div>
    );
  }

  const linkedId = links[key];
  const linked = presets.find((p) => p.id === linkedId);
  const paused = !!run;
  const showRestore = origin != null && value !== origin;
  return (
    <div className={`${cls} named`} role="group" aria-label={`Sweep for ${def.label}`}>
      {/* Idle, the deck's slot names the input by its short word label (its symbol on a phone). */}
      {compact && (
        <>
          <span className="sw-name" title={`${def.label}: the input the sweep hotkeys act on`}>
            <span className="sw-wide">{def.shortLabel ?? def.label}</span>
            <span className="sw-narrow">{def.short ?? def.shortLabel ?? def.label}</span>
          </span>{" "}
        </>
      )}
      {compact || presets.length <= 1 ? (
        <button
          type="button"
          className={`chip tiny sw-preset${linked ? " on" : ""}`}
          onClick={() => (linked ? cyclePreset(key, 1) : presets[0] && linkPreset(key, presets[0].id))}
          title={linked ? `${describeFor(key, linked, params)}. Click for the next preset (${HOTKEY_HINTS.next}).` : "Link a preset to this input"}
          disabled={!presets.length}
        >
          {linked ? `${linked.name} ▸` : "link a preset"}
        </button>
      ) : (
        presets.map((p) => (
          <button key={p.id} type="button" className={`chip tiny${linkedId === p.id ? " on" : ""}`} onClick={() => linkPreset(key, linkedId === p.id ? null : p.id)} title={describeFor(key, p, params)}>
            {p.name}
          </button>
        ))
      )}{" "}
      <button type="button" className="chip tiny play" onClick={() => toggleSweep(key)} title={`${paused ? "Resume" : "Run"} (${HOTKEY_HINTS.toggle})`} aria-label={paused ? "Resume the sweep" : "Run the sweep"} disabled={!linked && !presets.length}>
        ▶<span className="sw-wide"> {paused ? "resume" : "run"}</span>
      </button>{" "}
      {paused && (
        <>
          {position && !compact && <span className="sw-paused">paused · {position}</span>}{" "}
          <button type="button" className="chip tiny" onClick={() => stopSweep(key)} title={`Stop and keep the value (${HOTKEY_HINTS.stop})`} aria-label="Stop the sweep">
            ■{!compact && <span className="sw-wide"> stop</span>}
          </button>{" "}
        </>
      )}
      {showRestore && (
        <button type="button" className="chip tiny" onClick={() => restoreSweep(key)} title={`Put back ${valueText(def, origin)}, the value before the sweep (${HOTKEY_HINTS.undo})`} aria-label="Back to the value before the sweep">
          ↺<span className="sw-wide"> before sweep</span>
        </button>
      )}
      {!compact && (
        <span className="sw-keys">
          {HOTKEY_HINTS.toggle} run · {HOTKEY_HINTS.prev} {HOTKEY_HINTS.next} switch · {HOTKEY_HINTS.undo} undo
        </span>
      )}
    </div>
  );
}
