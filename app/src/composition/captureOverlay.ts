import type { MidiRecordedEvent, MidiRecorderSnapshot } from "../midi/recorder.ts";
import type { MeterPoint, ProjectNote, TempoPoint } from "../project/model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export interface CaptureOverlayOptions {
  /** performance.now() passed to MidiRecorder.start(). */
  readonly startPerfMs: number;
  /** Absolute project tick at the same instant. The returned notes start locally at tick zero. */
  readonly startTick: number;
  readonly nowPerfMs: number;
  readonly tempoMap: readonly TempoPoint[];
  readonly meterMap: readonly MeterPoint[];
}

type NoteOn = MidiRecordedEvent & { readonly event: Extract<MidiRecordedEvent["event"], { kind: "noteOn" }> };
type NoteOff = MidiRecordedEvent & { readonly event: Extract<MidiRecordedEvent["event"], { kind: "noteOff" }> };

interface OpenNote {
  readonly on: NoteOn;
  off?: NoteOff;
}

interface PendingQueue {
  readonly indexes: number[];
  head: number;
}

function noteKey(entry: NoteOn | NoteOff): string {
  const event = entry.event;
  return `${event.inputId}\0${event.channel}\0${event.note}\0${entry.playedChannel}\0${entry.playedNote ?? event.note}`;
}

/**
 * Read-only view of an open MIDI take. The recorder owns raw events; this helper
 * never confirms a project command or changes the take. Open notes grow until
 * nowPerfMs, while released notes retain their exact captured duration.
 */
export function createCaptureOverlay(snapshot: MidiRecorderSnapshot,
  options: CaptureOverlayOptions): ProjectNote[] {
  if (!Number.isFinite(options.startPerfMs) || options.startPerfMs < 0 ||
      !Number.isFinite(options.nowPerfMs) || options.nowPerfMs < 0 ||
      !Number.isSafeInteger(options.startTick) || options.startTick < 0) {
    throw new RangeError("Tiempo de captura inválido");
  }
  const clock = new MusicalClock(options.tempoMap, options.meterMap);
  const originSeconds = clock.tickToSeconds(options.startTick);
  const notes: OpenNote[] = [];
  const pending = new Map<string, PendingQueue>();
  let latestRelativeMs = 0;
  for (const entry of snapshot.events) {
    if (!Number.isFinite(entry.relativeMs) || entry.relativeMs < latestRelativeMs ||
        !Number.isSafeInteger(entry.sequence) || entry.sequence < 0) {
      throw new RangeError("Eventos MIDI fuera de orden o con tiempo inválido");
    }
    latestRelativeMs = entry.relativeMs;
    if (entry.event.kind === "noteOn") {
      const on = entry as NoteOn;
      const index = notes.push({ on }) - 1;
      const key = noteKey(on);
      const queue = pending.get(key) ?? { indexes: [], head: 0 };
      queue.indexes.push(index);
      pending.set(key, queue);
    } else if (entry.event.kind === "noteOff") {
      const off = entry as NoteOff;
      const key = noteKey(off);
      const queue = pending.get(key);
      if (!queue || queue.head >= queue.indexes.length) continue;
      notes[queue.indexes[queue.head++]!]!.off = off;
      if (queue.head === queue.indexes.length) pending.delete(key);
    }
  }
  const openEndMs = snapshot.recording
    ? Math.max(latestRelativeMs, options.nowPerfMs - options.startPerfMs)
    : latestRelativeMs;
  const toLocalTick = (relativeMs: number): number =>
    clock.secondsToTick(originSeconds + relativeMs / 1000, "nearest") - options.startTick;
  return notes.map(({ on, off }) => {
    const startTick = toLocalTick(on.relativeMs);
    const endMs = Math.max(on.relativeMs, off?.relativeMs ?? openEndMs);
    const durationTick = Math.max(1, toLocalTick(endMs) - startTick);
    const playedPitch = on.playedNote ?? on.event.note;
    return {
      id: `capture:${options.startPerfMs}:${on.sequence}`,
      startTick, durationTick, pitch: playedPitch,
      velocity: on.event.velocity, releaseVelocity: off?.event.releaseVelocity ?? 0,
      channel: on.playedChannel,
      origin: {
        kind: "captured", sourcePitch: on.event.note, playedPitch,
        inputId: on.event.inputId, sourceChannel: on.event.channel,
        sourceSequence: on.sequence, captureStartMs: on.relativeMs,
        ...(off ? { captureDurationMs: Math.max(0, off.relativeMs - on.relativeMs) } : {}),
        originalVelocity: on.event.velocity,
      },
    };
  });
}
