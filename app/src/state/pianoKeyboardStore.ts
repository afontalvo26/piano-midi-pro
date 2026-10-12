// ============================================================
// pianoKeyboardStore — reactive state for the on-screen keyboard.
//
// Why this exists
// ───────────────
// Live MIDI notes used to live in `useState` inside App.tsx. Every keypress
// therefore re-rendered the *entire* studio tree (sidebar, transport bar,
// mixer, settings, score panel, 37 piano keys, …) which measured ~30-50 ms per
// note. A fast run of 16 notes/s saturated the main thread, MIDI events queued
// up behind those renders and notes reached `triggerAttack` up to ~115 ms late —
// which a player perceives as keys being ignored.
//
// The keyboard is the only thing that must repaint on every keypress, so the
// hot note sets live here instead. Components subscribe and re-render on their
// own; the rest of the app is untouched by live playing.
//
// The canvas visualizer keeps reading `stateRef.current.activeNotes`, so the
// store writes through to that ref as well (see App.tsx).
// ============================================================

/** One immutable snapshot shared by all subscribers until something changes. */
export interface PianoKeyboardSnapshot {
  /** Notes currently held physically (MIDI input, computer keyboard, mouse). */
  midiNotes: ReadonlySet<number>;
  /** Ghost-assist notes coming up in the game chart. */
  assistNotes: ReadonlySet<number>;
  /** Notes inside the hit window right now (game mode). */
  hitReadyNotes: ReadonlySet<number>;
  /** Notes currently sounding from song playback (not held keys). */
  playbackNotes: ReadonlySet<number>;
  /** Raw velocity (1..127) of the last strike, for the live readouts. */
  velocity: number;
  /** Last physical key pressed, as sent by the controller. */
  physicalMidi: number | null;
  /** Pitch-bend amount in percent (-100..100). */
  pitchBend: number;
}

const EMPTY: ReadonlySet<number> = new Set<number>();

class PianoKeyboardStore {
  private listeners = new Set<() => void>();

  private midiInternal = new Set<number>();
  private assistInternal = new Set<number>();
  private hitReadyInternal = new Set<number>();
  private playbackInternal = new Set<number>();
  private velocityInternal = 0;
  private physicalMidiInternal: number | null = null;
  private pitchBendInternal = 0;

  private snapshot: PianoKeyboardSnapshot = {
    midiNotes: EMPTY,
    assistNotes: EMPTY,
    hitReadyNotes: EMPTY,
    playbackNotes: EMPTY,
    velocity: 0,
    physicalMidi: null,
    pitchBend: 0,
  };

  /**
   * Extra observers that are *not* React — e.g. the write-through into
   * `stateRef.current.midiNotes`, so canvas/game code sees notes immediately.
   */
  private observers = new Set<(s: PianoKeyboardSnapshot) => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PianoKeyboardSnapshot => this.snapshot;

  /** Register a non-React observer; returns an unsubscribe function. */
  observe = (fn: (s: PianoKeyboardSnapshot) => void): (() => void) => {
    this.observers.add(fn);
    return () => {
      this.observers.delete(fn);
    };
  };

  // ── Live notes ───────────────────────────────────────────────

  /** The mutable set of held notes — for synchronous `.has()` checks. */
  get midiNotes(): ReadonlySet<number> {
    return this.midiInternal;
  }

  noteOn(midi: number): void {
    if (this.midiInternal.has(midi)) return;
    this.midiInternal.add(midi);
    this.publish();
  }

  noteOff(midi: number): void {
    if (!this.midiInternal.delete(midi)) return;
    this.publish();
  }

  clearMidi(): void {
    if (this.midiInternal.size === 0) return;
    this.midiInternal.clear();
    this.publish();
  }

  // ── Live readouts (MIDI stats panel, velocity monitor) ───────

  /**
   * Raw velocity of the last strike. Only the two small readout components
   * subscribe to this — it must never re-render the studio.
   */
  setVelocity(rawVelocity: number): void {
    if (this.velocityInternal === rawVelocity) return;
    this.velocityInternal = rawVelocity;
    this.publish();
  }

  setPhysicalMidi(midi: number | null): void {
    if (this.physicalMidiInternal === midi) return;
    this.physicalMidiInternal = midi;
    this.publish();
  }

  setPitchBend(percent: number): void {
    if (this.pitchBendInternal === percent) return;
    this.pitchBendInternal = percent;
    this.publish();
  }

  // ── Game highlight sets ──────────────────────────────────────

  /**
   * Publish the notes currently sounding from song playback. Called from the
   * transport's rAF loop, so it must stay cheap and must publish only when the
   * set really changed.
   */
  setPlaybackNotes(notes: ReadonlySet<number>): void {
    if (setsEqual(notes, this.playbackInternal)) return;
    this.playbackInternal = new Set(notes);
    this.publish();
  }

  /** Replace the assist/hit-ready sets. Pass `undefined` to leave one alone. */
  setGameHighlights(
    assist: ReadonlySet<number> | undefined,
    hitReady: ReadonlySet<number> | undefined,
  ): void {
    let changed = false;
    if (assist !== undefined && !setsEqual(assist, this.assistInternal)) {
      this.assistInternal = new Set(assist);
      changed = true;
    }
    if (hitReady !== undefined && !setsEqual(hitReady, this.hitReadyInternal)) {
      this.hitReadyInternal = new Set(hitReady);
      changed = true;
    }
    if (changed) this.publish();
  }

  clearGameHighlights(): void {
    if (this.assistInternal.size === 0 && this.hitReadyInternal.size === 0) return;
    this.assistInternal = new Set();
    this.hitReadyInternal = new Set();
    this.publish();
  }

  // ── Internals ────────────────────────────────────────────────

  private publish(): void {
    this.snapshot = {
      midiNotes: new Set(this.midiInternal),
      assistNotes: this.assistInternal,
      hitReadyNotes: this.hitReadyInternal,
      playbackNotes: this.playbackInternal,
      velocity: this.velocityInternal,
      physicalMidi: this.physicalMidiInternal,
      pitchBend: this.pitchBendInternal,
    };
    for (const fn of this.observers) {
      try {
        fn(this.snapshot);
      } catch {
        /* an observer must never break note handling */
      }
    }
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* ignore subscriber errors — audio must keep flowing */
      }
    }
  }
}

function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

/** Singleton — one keyboard, one source of truth. */
export const pianoKeyboardStore = new PianoKeyboardStore();
