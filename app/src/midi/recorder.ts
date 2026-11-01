import type { MidiEvent } from "./message.ts";

type RecordedKind = "noteOn" | "noteOff" | "cc" | "pitchBend" |
  "polyPressure" | "channelPressure" | "programChange";
type RecordedMessage = Extract<MidiEvent, { kind: RecordedKind }>;

export interface MidiRecorderStart {
  readonly timeStamp: number;
  readonly tempo: number;
  readonly timeSignature?: readonly [number, number];
}

export interface MidiRecordOptions {
  /** The pitch actually played after any intentional app transposition. */
  readonly playedNote?: number;
  /** Zero based output channel, while event.channel remains the observed source. */
  readonly playedChannel?: number;
}

export interface MidiRecordedEvent {
  readonly event: RecordedMessage;
  readonly relativeMs: number;
  readonly playedNote?: number;
  readonly playedChannel: number;
  readonly synthetic: boolean;
  readonly sequence: number;
}

export interface MidiRecorderSnapshot {
  readonly recording: boolean;
  readonly overflowed: boolean;
  readonly events: readonly MidiRecordedEvent[];
  readonly tempoChanges: readonly { atMs: number; bpm: number }[];
}

const PPQ = 480;
const DEFAULT_CAPACITY = 100_000;

function validMidiNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 127;
}

function isRecordedMessage(event: MidiEvent): event is RecordedMessage {
  return event.kind === "noteOn" || event.kind === "noteOff" || event.kind === "cc" ||
    event.kind === "pitchBend" || event.kind === "polyPressure" ||
    event.kind === "channelPressure" || event.kind === "programChange";
}

function noteKey(event: Extract<RecordedMessage, { kind: "noteOn" | "noteOff" }>): string {
  return `${event.inputId}\0${event.channel}\0${event.note}`;
}

function channelKey(event: RecordedMessage, channel = event.channel): string {
  return `${event.inputId}\0${channel}`;
}

function tempoValid(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= 10 && bpm <= 1000;
}

interface PendingNote {
  readonly event: Extract<RecordedMessage, { kind: "noteOn" }>;
  readonly playedNote: number;
  readonly playedChannel: number;
}

interface TimedBytes {
  readonly tick: number;
  readonly sequence: number;
  readonly bytes: readonly number[];
}

function push32(output: number[], value: number): void {
  output.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function push16(output: number[], value: number): void {
  output.push((value >>> 8) & 255, value & 255);
}

function append(output: number[], bytes: readonly number[]): void {
  for (const byte of bytes) output.push(byte);
}

function variableLength(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new RangeError("MIDI delta time outside variable-length range");
  }
  const result = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    result.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return result;
}

function meta(type: number, data: readonly number[]): number[] {
  return [0xff, type, ...variableLength(data.length), ...data];
}

function midiTrack(events: readonly TimedBytes[]): number[] {
  const body: number[] = [];
  let previousTick = 0;
  for (const event of [...events].sort((a, b) => a.tick - b.tick || a.sequence - b.sequence)) {
    append(body, variableLength(event.tick - previousTick));
    append(body, event.bytes);
    previousTick = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const output = [0x4d, 0x54, 0x72, 0x6b]; // MTrk
  push32(output, body.length);
  append(output, body);
  return output;
}

/**
 * Local MIDI performance capture. Clock/System/SysEx are deliberately not
 * recorded: exporting them into an SMF track would imply a supported sync or
 * device-programming contract that the app does not have.
 */
export class MidiRecorder {
  private readonly capacity: number;
  private readonly log: MidiRecordedEvent[] = [];
  private readonly active = new Map<string, PendingNote[]>();
  private readonly pedalDown = new Map<string, { event: RecordedMessage; playedChannel: number }>();
  private readonly tempos: { atMs: number; bpm: number }[] = [];
  private startedAt = 0;
  private lastMs = 0;
  private nextSequence = 0;
  private running = false;
  private started = false;
  private isOverflowed = false;
  private timeSignature: readonly [number, number] = [4, 4];

  constructor(capacity = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1_000_000) {
      throw new RangeError("MIDI recorder capacity must be 1..1000000");
    }
    this.capacity = capacity;
  }

  /** Scalar telemetry without copying the event log as snapshot() does. */
  get eventCount(): number {
    return this.log.length;
  }

  get isRecording(): boolean {
    return this.running;
  }

  start(options: MidiRecorderStart): void {
    if (this.running) throw new Error("stop MIDI recording before starting another");
    if (!Number.isFinite(options.timeStamp) || options.timeStamp < 0 || !tempoValid(options.tempo)) {
      throw new RangeError("invalid MIDI recorder start time or tempo");
    }
    const [num, den] = options.timeSignature ?? [4, 4];
    if (!Number.isInteger(num) || num < 1 || num > 32 || ![1, 2, 4, 8, 16, 32, 64].includes(den)) {
      throw new RangeError("invalid MIDI time signature");
    }
    this.log.length = 0;
    this.active.clear();
    this.pedalDown.clear();
    this.tempos.length = 0;
    this.tempos.push({ atMs: 0, bpm: options.tempo });
    this.startedAt = options.timeStamp;
    this.lastMs = 0;
    this.nextSequence = 0;
    this.running = true;
    this.started = true;
    this.isOverflowed = false;
    this.timeSignature = [num, den];
  }

  private relativeTime(timeStamp: number): number {
    const candidate = Number.isFinite(timeStamp) ? Math.max(0, timeStamp - this.startedAt) : this.lastMs;
    this.lastMs = Math.max(this.lastMs, candidate);
    return this.lastMs;
  }

  record(event: MidiEvent, options: MidiRecordOptions = {}): boolean {
    if (!this.running || !isRecordedMessage(event)) return false;
    if (this.log.length >= this.capacity) {
      this.isOverflowed = true;
      return false;
    }
    // Keep an owned copy: the caller may reuse or mutate its diagnostic buffer.
    const captured = { ...event, raw: event.raw.slice() } as RecordedMessage;
    let playedNote = options.playedNote;
    if (playedNote !== undefined && !validMidiNumber(playedNote)) throw new RangeError("invalid played MIDI note");
    if (options.playedChannel !== undefined &&
        (!Number.isInteger(options.playedChannel) || options.playedChannel < 0 || options.playedChannel > 15)) {
      throw new RangeError("invalid played MIDI channel");
    }
    const relativeMs = this.relativeTime(captured.timeStamp);
    let playedChannel = options.playedChannel ?? captured.channel;

    if (captured.kind === "noteOn") {
      playedNote ??= captured.note;
      const key = noteKey(captured);
      const pending = this.active.get(key) ?? [];
      pending.push({ event: captured, playedNote, playedChannel });
      this.active.set(key, pending);
    } else if (captured.kind === "noteOff") {
      const key = noteKey(captured);
      const pending = this.active.get(key);
      const matchingIndex = options.playedChannel === undefined
        ? 0 : pending?.findIndex((note) => note.playedChannel === options.playedChannel) ?? -1;
      const matched = pending?.splice(matchingIndex >= 0 ? matchingIndex : 0, 1)[0];
      if (pending?.length === 0) this.active.delete(key);
      playedNote = matched?.playedNote ?? playedNote ?? captured.note;
      playedChannel = matched?.playedChannel ?? playedChannel;
    } else if (captured.kind === "cc" && captured.controller === 64) {
      if (captured.value >= 64) this.pedalDown.set(channelKey(captured), { event: captured, playedChannel });
      else this.pedalDown.delete(channelKey(captured));
    }

    this.log.push({ event: captured, relativeMs, playedNote, playedChannel, synthetic: false, sequence: this.nextSequence++ });
    return true;
  }

  setTempo(timeStamp: number, bpm: number): void {
    if (!this.running || !tempoValid(bpm)) throw new RangeError("recorder is stopped or tempo is invalid");
    const atMs = this.relativeTime(timeStamp);
    const last = this.tempos[this.tempos.length - 1]!;
    if (last.bpm === bpm) return;
    if (last.atMs === atMs) this.tempos[this.tempos.length - 1] = { atMs, bpm };
    else this.tempos.push({ atMs, bpm });
  }

  stop(timeStamp: number): MidiRecorderSnapshot {
    if (!this.running) return this.snapshot();
    const relativeMs = this.relativeTime(timeStamp);
    for (const pending of this.active.values()) {
      for (const note of pending) {
        const { inputId, channel } = note.event;
        const status = 0x80 | channel;
        const event: Extract<RecordedMessage, { kind: "noteOff" }> = {
          kind: "noteOff", inputId, channel, status,
          timeStamp: this.startedAt + relativeMs,
          raw: Uint8Array.from([status, note.event.note, 0]),
          note: note.event.note, releaseVelocity: 0,
        };
        if (this.log.length >= this.capacity) {
          this.isOverflowed = true;
        } else {
          this.log.push({ event, relativeMs, playedNote: note.playedNote, playedChannel: note.playedChannel, synthetic: true, sequence: this.nextSequence++ });
        }
      }
    }
    this.active.clear();
    for (const source of this.pedalDown.values()) {
      if (source.event.kind !== "cc") continue;
      const status = 0xb0 | source.event.channel;
      const event: Extract<RecordedMessage, { kind: "cc" }> = {
        kind: "cc", inputId: source.event.inputId, channel: source.event.channel, status,
        timeStamp: this.startedAt + relativeMs,
        raw: Uint8Array.from([status, 64, 0]), controller: 64, value: 0,
      };
      if (this.log.length >= this.capacity) {
        this.isOverflowed = true;
      } else {
        this.log.push({ event, relativeMs, playedChannel: source.playedChannel, synthetic: true, sequence: this.nextSequence++ });
      }
    }
    this.pedalDown.clear();
    this.running = false;
    return this.snapshot();
  }

  snapshot(): MidiRecorderSnapshot {
    return {
      recording: this.running,
      overflowed: this.isOverflowed,
      events: this.log.slice(),
      tempoChanges: this.tempos.slice(),
    };
  }

  private ticksAt(relativeMs: number): number {
    let ticks = 0;
    let previousMs = 0;
    let bpm = this.tempos[0]!.bpm;
    for (const change of this.tempos.slice(1)) {
      if (change.atMs > relativeMs) break;
      ticks += (change.atMs - previousMs) * bpm * PPQ / 60_000;
      previousMs = change.atMs;
      bpm = change.bpm;
    }
    return Math.round(ticks + (relativeMs - previousMs) * bpm * PPQ / 60_000);
  }

  toMidiBytes(): Uint8Array {
    if (!this.started || this.running) throw new Error("stop MIDI recording before export");
    if (this.isOverflowed) throw new Error("MIDI recording exceeded event capacity");
    const tempoTrack: TimedBytes[] = [];
    this.tempos.forEach((change, sequence) => {
      const micros = Math.round(60_000_000 / change.bpm);
      tempoTrack.push({
        tick: this.ticksAt(change.atMs), sequence,
        bytes: meta(0x51, [(micros >>> 16) & 255, (micros >>> 8) & 255, micros & 255]),
      });
    });
    const [numerator, denominator] = this.timeSignature;
    tempoTrack.push({
      tick: 0, sequence: -1,
      bytes: meta(0x58, [numerator, Math.log2(denominator), 24, 8]),
    });

    const tracks = new Map<string, MidiRecordedEvent[]>();
    for (const item of this.log) {
      const key = channelKey(item.event, item.playedChannel);
      const track = tracks.get(key) ?? [];
      track.push(item);
      tracks.set(key, track);
    }

    const output = [0x4d, 0x54, 0x68, 0x64]; // MThd
    push32(output, 6);
    push16(output, 1); // SMF type 1
    push16(output, 1 + tracks.size);
    push16(output, PPQ);
    append(output, midiTrack(tempoTrack));

    const ports = new Map<string, number>();
    for (const items of tracks.values()) {
      const first = items[0]!.event;
      if (!ports.has(first.inputId)) ports.set(first.inputId, ports.size);
      const port = ports.get(first.inputId)!;
      if (port > 127) throw new RangeError("SMF supports at most 128 MIDI port numbers");
      const label = new TextEncoder().encode(`Input ${first.inputId} / channel ${items[0]!.playedChannel + 1}`);
      const events: TimedBytes[] = [
        { tick: 0, sequence: -2, bytes: meta(0x03, Array.from(label)) },
        { tick: 0, sequence: -1, bytes: meta(0x21, [port]) },
      ];
      for (const item of items) {
        const event = item.event;
        let bytes: number[];
        switch (event.kind) {
          case "noteOn": bytes = [0x90 | item.playedChannel, item.playedNote ?? event.note, event.velocity]; break;
          case "noteOff": bytes = [0x80 | item.playedChannel, item.playedNote ?? event.note, event.releaseVelocity]; break;
          case "cc": bytes = [0xb0 | item.playedChannel, event.controller, event.value]; break;
          case "polyPressure": bytes = [0xa0 | item.playedChannel, item.playedNote ?? event.note, event.pressure]; break;
          case "channelPressure": bytes = [0xd0 | item.playedChannel, event.pressure]; break;
          case "programChange": bytes = [0xc0 | item.playedChannel, event.program]; break;
          case "pitchBend": bytes = [0xe0 | item.playedChannel, event.value14 & 0x7f, event.value14 >>> 7]; break;
        }
        events.push({ tick: this.ticksAt(item.relativeMs), sequence: item.sequence, bytes });
      }
      append(output, midiTrack(events));
    }
    return Uint8Array.from(output);
  }
}
