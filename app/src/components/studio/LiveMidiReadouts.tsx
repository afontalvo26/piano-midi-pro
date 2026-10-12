// ============================================================
// LiveMidiReadouts — the per-note numbers in the MIDI panel.
//
// Velocity, last physical key and pitch bend change on every MIDI message. They
// used to be App state, so each message re-rendered the whole studio (~25-40 ms)
// and queued incoming MIDI behind React. These tiny components subscribe to
// `pianoKeyboardStore` instead, so only the number that changed repaints.
// ============================================================

import type { ReactNode } from "react";
import type { VelocityCalibration } from "../../utils/velocity";
import { useStorePoll } from "../../hooks/useStorePoll";
import { midiToLabel } from "../../utils/audioMidiUtils";

const useStore = useStorePoll;

/** Held-note count for the studio "Notas activas" metric card. */
export function LiveNoteCountStrong() {
  const count = useStore((s) => s.midiNotes.size);
  return <strong>{count}</strong>;
}

/** Held-note count for the game HUD metric card. */
export function LiveNoteCountText() {
  const count = useStore((s) => s.midiNotes.size);
  return <>{count}</>;
}

/** `<strong>` contents of the "Fuerza (Velocity)" metric card. */
export function LiveVelocityReadout({
  calibration,
}: {
  calibration: VelocityCalibration;
}) {
  const velocity = useStore((s) => s.velocity);
  return (
    <>
      {velocity} / 127
      {calibration.autoCalibrationEnabled && calibration.sampleCount > 8 ? (
        <span
          style={{
            fontSize: "0.65rem",
            marginLeft: 6,
            color: "rgba(229,231,235,0.55)",
          }}
        >
          ({calibration.minObserved}-{calibration.maxObserved})
        </span>
      ) : null}
    </>
  );
}

/** Percentage shown in the "Pitch Bend" metric card. */
export function LivePitchBendReadout() {
  const pitchBend = useStore((s) => s.pitchBend);
  return <strong className={pitchBend !== 0 ? "active" : ""}>{pitchBend}%</strong>;
}

/** Last physical key pressed — shown inside the MIDI settings sentence. */
export function LivePhysicalMidiLabel({
  style,
}: {
  style?: React.CSSProperties;
}): ReactNode {
  const physicalMidi = useStore((s) => s.physicalMidi);
  return (
    <strong style={style}>
      {physicalMidi !== null
        ? `${midiToLabel(physicalMidi)} (${physicalMidi})`
        : "ninguna"}
    </strong>
  );
}

/** Filled width of the velocity monitor bar. */
export function LiveVelocityMonitorBar() {
  const velocity = useStore((s) => s.velocity);
  return (
    <div
      className="velocity-monitor-bar"
      style={{ width: `${(velocity / 127) * 100}%` }}
    />
  );
}
