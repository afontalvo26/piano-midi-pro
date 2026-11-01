// ============================================================
// pianoKeyboardStore — reactive state for the on-screen keyboard.
//
// Why this exists
// ───────────────
// Keeping live MIDI notes outside the Studio component avoids a full screen
// render for every keypress and keeps the event handler responsive to chords.
//
// The keyboard is the only thing that must repaint on every keypress, so the
// hot note sets live here instead. Components subscribe and re-render on their
// own; the rest of the app is untouched by live playing.
//
// ============================================================

/** One immutable snapshot shared by all subscribers until something changes. */
export interface PianoKeyboardSnapshot {
  /** Notes currently held physically (MIDI input, computer keyboard, mouse). */
  midiNotes: ReadonlySet<number>;
  /** Raw velocity (1..127) of the last strike, for the live readouts. */
  velocity: number;
  /** Last physical key pressed, as sent by the controller. */
  physicalMidi: number | null;
  /** Pitch-bend amount in percent (-100..100). */
  pitchBend: number;
}

const EMPTY: ReadonlySet<number> = new Set<number>();
const DEFAULT_NOTE_SOURCE = Symbol("default-keyboard-note-source");
type NoteSource = string | typeof DEFAULT_NOTE_SOURCE;

class PianoKeyboardStore {
  private listeners = new Set<() => void>();
  private notificationFrame = 0;
  private notificationPending = false;

  private midiInternal = new Set<number>();
  private sourceNotes = new Map<NoteSource, Map<number, number>>();
  private noteTotals = new Map<number, number>();
  private velocityInternal = 0;
  private physicalMidiInternal: number | null = null;
  private pitchBendInternal = 0;

  private snapshot: PianoKeyboardSnapshot = {
    midiNotes: EMPTY,
    velocity: 0,
    physicalMidi: null,
    pitchBend: 0,
  };

  /** Optional non-React observers, called without blocking audio on errors. */
  private observers = new Set<(s: PianoKeyboardSnapshot) => void>();

  subscribe = (listener: () => void): (() => void) => {
    if (this.listeners.size === 0 && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.listeners.add(listener);
    // The store may have changed between the subscriber's render and effect.
    this.notificationPending = true;
    this.scheduleNotification();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        if (this.notificationFrame !== 0) {
          cancelAnimationFrame(this.notificationFrame);
          this.notificationFrame = 0;
        }
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", this.onVisibilityChange);
        }
      }
    };
  };

  getSnapshot = (): PianoKeyboardSnapshot => this.snapshot;

  /** Re-evaluate selectors after their props change, using the shared frame. */
  requestRefresh = (): void => {
    this.notificationPending = true;
    this.scheduleNotification();
  };

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

  noteOn(midi: number, sourceId?: string): void {
    const source = sourceId ?? DEFAULT_NOTE_SOURCE;
    let held = this.sourceNotes.get(source);
    if (!held) {
      held = new Map();
      this.sourceNotes.set(source, held);
    }
    held.set(midi, (held.get(midi) ?? 0) + 1);

    const total = this.noteTotals.get(midi) ?? 0;
    this.noteTotals.set(midi, total + 1);
    if (total === 0) {
      this.midiInternal.add(midi);
      this.publish();
    }
  }

  noteOff(midi: number, sourceId?: string): void {
    const source = sourceId ?? DEFAULT_NOTE_SOURCE;
    const held = this.sourceNotes.get(source);
    const count = held?.get(midi) ?? 0;
    if (!held || count === 0) return;

    if (count === 1) held.delete(midi);
    else held.set(midi, count - 1);
    if (held.size === 0) this.sourceNotes.delete(source);

    const remaining = (this.noteTotals.get(midi) ?? 0) - 1;
    if (remaining > 0) {
      this.noteTotals.set(midi, remaining);
    } else {
      this.noteTotals.delete(midi);
      this.midiInternal.delete(midi);
      this.publish();
    }
  }

  /** Release only this input's held keys, retaining other sources' notes. */
  releaseSource(sourceId?: string): void {
    const source = sourceId ?? DEFAULT_NOTE_SOURCE;
    const held = this.sourceNotes.get(source);
    if (!held) return;
    this.sourceNotes.delete(source);

    let visibleChanged = false;
    for (const [midi, count] of held) {
      const remaining = (this.noteTotals.get(midi) ?? 0) - count;
      if (remaining > 0) {
        this.noteTotals.set(midi, remaining);
      } else {
        this.noteTotals.delete(midi);
        visibleChanged = this.midiInternal.delete(midi) || visibleChanged;
      }
    }
    if (visibleChanged) this.publish();
  }

  clearMidi(): void {
    if (this.sourceNotes.size === 0 && this.midiInternal.size === 0) return;
    this.sourceNotes.clear();
    this.noteTotals.clear();
    if (this.midiInternal.size === 0) return;
    this.midiInternal.clear();
    this.publish();
  }

  // ── Live readouts (MIDI stats panel, velocity monitor) ───────

  /** Raw velocity of the last strike. */
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

  // ── Internals ────────────────────────────────────────────────

  private publish(): void {
    this.snapshot = {
      midiNotes: new Set(this.midiInternal),
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
    this.notificationPending = true;
    this.scheduleNotification();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      if (this.notificationFrame !== 0) {
        cancelAnimationFrame(this.notificationFrame);
        this.notificationFrame = 0;
      }
    } else {
      this.scheduleNotification();
    }
  };

  private scheduleNotification(): void {
    if (!this.notificationPending || this.listeners.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.notificationFrame !== 0) return;
    if (typeof requestAnimationFrame !== "function") {
      this.flushNotifications();
      return;
    }
    this.notificationFrame = requestAnimationFrame(() => {
      this.notificationFrame = 0;
      this.flushNotifications();
    });
  }

  private flushNotifications(): void {
    if (typeof document !== "undefined" && document.hidden) return;
    this.notificationPending = false;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* ignore subscriber errors — audio must keep flowing */
      }
    }
  }
}

/** Singleton — one keyboard, one source of truth. */
export const pianoKeyboardStore = new PianoKeyboardStore();
