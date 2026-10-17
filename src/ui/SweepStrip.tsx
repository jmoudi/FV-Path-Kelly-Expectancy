import { DEFAULT_PARAMS, isSweepable, PARAM_BY_KEY, type Params } from "../model/params";
import { useStore } from "../state/store";
import { HOTKEY_HINTS } from "./useSweeps";

/**
 * The discreet preview under the active input: which presets exist, which one is
 * linked, and the run state. Clicking a name links it; the play button runs it.
 */
export function SweepStrip({ inputKey, compact }: { inputKey: string; compact?: boolean }) {
  const presets = useStore((s) => s.presets);
  const linked = useStore((s) => s.links[inputKey]);
  const run = useStore((s) => s.runs[inputKey]);
  const linkPreset = useStore((s) => s.linkPreset);
  const cyclePreset = useStore((s) => s.cyclePreset);
  const toggleSweep = useStore((s) => s.toggleSweep);
  const stopSweep = useStore((s) => s.stopSweep);
  const setParam = useStore((s) => s.setParam);
  const value = useStore((s) => s.params[inputKey as keyof Params]);
  const def = PARAM_BY_KEY[inputKey];
  if (!def || def.unit === "choice") return null;
  const dflt = DEFAULT_PARAMS[inputKey as keyof Params];
  const running = !!run && run.startedAt != null;
  if (!isSweepable(def)) {
    return (
      <div className="sweep-strip" role="group" aria-label={`${def.label}: not swept`}>
        <span className="sweep-strip-label">not swept</span>
        {value !== dflt && (
          <button type="button" className="chip tiny" onClick={() => setParam(inputKey as keyof Params, dflt)} title="Back to the discussion's value">
            ↺ default
          </button>
        )}
      </div>
    );
  }
  const linkedPreset = presets.find((p) => p.id === linked);
  return (
    <div className="sweep-strip" role="group" aria-label={`Sweep presets for ${def.label}`}>
      <span className="sweep-strip-label">sweep</span>
      {compact ? (
        // One chip: the linked preset; clicking it moves to the next one.
        <button type="button" className={`chip tiny${linkedPreset ? " on" : ""}`} onClick={() => (linkedPreset ? cyclePreset(inputKey, 1) : presets[0] && linkPreset(inputKey, presets[0].id))} title={`${linkedPreset ? "Next preset" : "Link a preset"} (${HOTKEY_HINTS.next}); the full deck lists them all`} disabled={!presets.length}>
          {linkedPreset ? `${linkedPreset.name} ▸` : "link a preset"}
        </button>
      ) : (
        presets.map((p) => (
          <button key={p.id} type="button" className={`chip tiny${linked === p.id ? " on" : ""}`} onClick={() => linkPreset(inputKey, linked === p.id ? null : p.id)} title={p.name}>
            {p.name}
          </button>
        ))
      )}
      <button type="button" className={`chip tiny play${running ? " on" : ""}`} onClick={() => toggleSweep(inputKey)} title={`${running ? "Pause" : run ? "Resume" : "Run"} (${HOTKEY_HINTS.toggle})`} disabled={!linked && !presets.length}>
        {running ? "❚❚ pause" : run ? "▶ resume" : "▶ run"}
      </button>
      {run && (
        <button type="button" className="chip tiny" onClick={() => stopSweep(inputKey)} title={`Stop (${HOTKEY_HINTS.stop})`}>
          ■ stop
        </button>
      )}
      {value !== dflt && (
        <button type="button" className="chip tiny" onClick={() => setParam(inputKey as keyof Params, dflt)} title="Back to the discussion's value">
          ↺ default
        </button>
      )}
      <span className="sweep-strip-keys">
        {HOTKEY_HINTS.toggle} run · {HOTKEY_HINTS.prev} {HOTKEY_HINTS.next} switch · {HOTKEY_HINTS.undo} undo
      </span>
    </div>
  );
}
