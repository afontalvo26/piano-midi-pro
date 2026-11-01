// ============================================================
// PianoKeyboard — the on-screen keyboard.
//
// This is the only part of the UI that must repaint on every live note, so it
// subscribes to `pianoKeyboardStore` directly instead of receiving note state
// from PianoApp.tsx. Keeping the hot note sets out of React state is what prevents a
// keypress from re-rendering (and stalling) the whole studio — see the store's
// header comment for the measurements behind this.
//
// The struck velocity (which drives the press-depth CSS variable) is written
// straight into the key elements from an effect, so this component does not read
// mutable refs during render.
// ============================================================

import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import { isBlackKey, midiToLabel } from "../../utils/audioMidiUtils";
import { useStorePoll } from "../../hooks/useStorePoll";

/** Mirrors the note label setting in Studio. */
export type NoteNameMode = "none" | "name";

export interface PianoKeyboardProps {
  /** MIDI notes currently mapped to the visible range, in order. */
  visibleNotes: number[];
  /** Struck velocity per held note — shared with App's keyboard handler. */
  activeNoteVelocitiesRef: RefObject<Map<number, number>>;
  showNoteNames: NoteNameMode;
  keyFxColor: string;
  keyFxGlow: number;
  onKeyMouseDown: (midi: number) => void;
  onKeyMouseUp: (midi: number) => void;
}

export function PianoKeyboard({
  visibleNotes,
  activeNoteVelocitiesRef,
  showNoteNames,
  keyFxColor,
  keyFxGlow,
  onKeyMouseDown,
  onKeyMouseUp,
}: PianoKeyboardProps) {
  const heldNotes = useStorePoll((s) => s.midiNotes);


  const keyElsRef = useRef(new Map<number, HTMLDivElement>());
  const registerKey = (midi: number) => (el: HTMLDivElement | null) => {
    if (el) keyElsRef.current.set(midi, el);
    else keyElsRef.current.delete(midi);
  };

  // Apply the struck depth after every repaint (and once on mount).
  useLayoutEffect(() => {
    const velocities = activeNoteVelocitiesRef.current;
    keyElsRef.current.forEach((el, midi) => {
      const depth = heldNotes.has(midi) ? (velocities?.get(midi) ?? 0.75) : 0;
      el.style.setProperty("--press-depth", String(depth));
    });
  });

  const glowPx = `${Math.round(keyFxGlow * 30)}px`;
  const visibleWhiteNotes = visibleNotes.filter((m) => !isBlackKey(m));
  const numWhiteKeys = visibleWhiteNotes.length;
  const whiteKeyWidthPercent = numWhiteKeys > 0 ? 100 / numWhiteKeys : 0;
  const blackKeyWidthPercent = whiteKeyWidthPercent * 0.6;

  const keyClass = (midi: number, variant: "white" | "black"): string => {
    return `piano-key-element ${variant} ${heldNotes.has(midi) ? "active-press" : ""}`;
  };

  return (
    <div className="piano-wrapper">
      {/* White keys container */}
      <div
        className="white-keys-container"
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {visibleWhiteNotes.map((midi) => (
          <div
            key={midi}
            ref={registerKey(midi)}
            className={keyClass(midi, "white")}
            style={
              {
                flexGrow: 1,
                "--active-key-color": keyFxColor,
                "--active-key-glow": glowPx,
                "--press-depth": 0,
              } as CSSProperties
            }
            onPointerDown={(e) => { e.preventDefault(); onKeyMouseDown(midi); }}
            onPointerUp={() => onKeyMouseUp(midi)}
            onPointerCancel={() => onKeyMouseUp(midi)}
            onPointerEnter={(e) => {
              if (e.buttons === 1) onKeyMouseDown(midi);
            }}
            onPointerLeave={() => {
              if (heldNotes.has(midi)) onKeyMouseUp(midi);
            }}
          >
            <div className="piano-key-velvet-strip" />
            {showNoteNames !== "none" && (
              <span className="piano-key-label">
                {midiToLabel(midi)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Black keys overlay container */}
      <div
        className="black-keys-container"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        {visibleNotes.filter(isBlackKey).map((midi) => {
          const prevWhiteIndex = visibleWhiteNotes.indexOf(midi - 1);
          let leftPercent = 0;
          let isVisible = true;

          if (prevWhiteIndex !== -1) {
            leftPercent = (prevWhiteIndex + 1) * whiteKeyWidthPercent;
          } else {
            const nextWhiteIndex = visibleWhiteNotes.indexOf(midi + 1);
            if (nextWhiteIndex !== -1) {
              leftPercent = nextWhiteIndex * whiteKeyWidthPercent;
            } else {
              isVisible = false;
            }
          }

          if (!isVisible) return null;

          return (
            <div
              key={midi}
              ref={registerKey(midi)}
              className={keyClass(midi, "black")}
              style={
                {
                  position: "absolute",
                  left: `${leftPercent - blackKeyWidthPercent / 2}%`,
                  width: `${blackKeyWidthPercent}%`,
                  height: "60%",
                  pointerEvents: "auto",
                  "--active-key-color": keyFxColor,
                  "--active-key-glow": glowPx,
                  "--press-depth": 0,
                } as CSSProperties
              }
              onPointerDown={(e) => { e.preventDefault(); onKeyMouseDown(midi); }}
              onPointerUp={() => onKeyMouseUp(midi)}
              onPointerCancel={() => onKeyMouseUp(midi)}
              onPointerEnter={(e) => {
                if (e.buttons === 1) onKeyMouseDown(midi);
              }}
              onPointerLeave={() => {
                if (heldNotes.has(midi)) onKeyMouseUp(midi);
              }}
            >
              <div className="piano-key-velvet-strip" />
              {showNoteNames !== "none" && (
                <span className="piano-key-label">
                  {midiToLabel(midi)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
