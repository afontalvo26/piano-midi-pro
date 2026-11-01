import { formatMidiHex, type MidiEvent } from "./message.ts";

/** No audio, MIDI Out, filesystem, network or device operations live here. */
export interface MidiPhysicalTracePort {
  readonly id: string;
  readonly name?: string | null;
  readonly manufacturer?: string | null;
  readonly type?: "input" | "output";
  readonly state?: string | null;
  readonly connection?: string | null;
}

export interface MidiPhysicalTraceStart {
  /** performance.now() sampled when capture starts. */
  readonly nowMs: number;
  readonly selectedInputId: string;
  readonly ports?: readonly MidiPhysicalTracePort[];
  readonly wallTimeIso?: string;
  readonly timeOriginMs?: number;
}

export interface MidiPhysicalTraceMessageContext {
  /** performance.now() sampled at the very beginning of onmidimessage. */
  readonly handlerTimeMs: number;
  readonly selectedInputId: string;
  readonly inputName?: string | null;
  readonly inputState?: string | null;
  readonly inputConnection?: string | null;
}

export interface MidiPhysicalTraceMessage {
  readonly type: "message";
  readonly sequence: number;
  readonly eventTimeMs: number;
  readonly handlerTimeMs: number;
  /** Handler entry minus Web MIDI Event.timeStamp. A negative value is retained. */
  readonly dispatchDelayMs: number;
  readonly inputId: string;
  readonly inputName: string;
  readonly inputState: string;
  readonly inputConnection: string;
  readonly selectedInputId: string;
  readonly rawHex: string;
  readonly rawLength: number;
  readonly rawTruncated: boolean;
  readonly kind: MidiEvent["kind"];
  /** MIDI channel 0..15, or absent for system messages. */
  readonly channel?: number;
  readonly number?: number;
  readonly value?: number;
}

export interface MidiPhysicalTracePortChange {
  readonly type: "port-change";
  readonly sequence: number;
  readonly atMs: number;
  readonly selectedInputId: string;
  readonly port: MidiPhysicalTracePort;
}

export interface MidiPhysicalTraceRoute {
  readonly type: "route";
  readonly sequence: number;
  readonly messageSequence: number;
  readonly atMs: number;
  /** Short semantic marker supplied by the app, e.g. note-attacked. */
  readonly code: string;
  readonly attackId?: number;
  readonly activeVoices?: number;
}

export type MidiPhysicalTraceRecord =
  | MidiPhysicalTraceMessage | MidiPhysicalTracePortChange | MidiPhysicalTraceRoute;

export interface MidiPhysicalTraceSnapshot {
  readonly version: 1;
  readonly startedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly wallTimeIso: string | null;
  readonly timeOriginMs: number | null;
  readonly durationLimitMs: number;
  readonly capacity: number;
  readonly capturing: boolean;
  readonly selectedInputId: string;
  readonly initialPorts: readonly MidiPhysicalTracePort[];
  readonly initialPortsOmitted: number;
  readonly overwrittenRecords: number;
  readonly records: readonly MidiPhysicalTraceRecord[];
}

const MAX_TEXT = 256;
const MAX_RAW_BYTES = 64;
const MAX_INITIAL_PORTS = 64;

function text(value: string | null | undefined): string {
  return Array.from((value ?? "").slice(0, MAX_TEXT), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
}

function safePort(port: MidiPhysicalTracePort): MidiPhysicalTracePort {
  return {
    id: text(port.id), name: text(port.name), manufacturer: text(port.manufacturer),
    ...(port.type === "input" || port.type === "output" ? { type: port.type } : {}),
    state: text(port.state), connection: text(port.connection),
  };
}

function numberAndValue(event: MidiEvent): { number?: number; value?: number } {
  switch (event.kind) {
    case "noteOn": return { number: event.note, value: event.velocity };
    case "noteOff": return { number: event.note, value: event.releaseVelocity };
    case "cc": return { number: event.controller, value: event.value };
    case "polyPressure": return { number: event.note, value: event.pressure };
    case "channelPressure": return { value: event.pressure };
    case "pitchBend": return { value: event.value14 };
    case "programChange": return { number: event.program };
    case "songPosition": return { value: event.position16th };
    case "songSelect": return { value: event.song };
    case "mtcQuarterFrame": return { value: event.value };
    default: return {};
  }
}

function validTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("trace time must be finite and nonnegative");
}

/**
 * A bounded 30-second local trace of the SAME Web MIDI stream App already
 * handles. Recording is O(1) per message; JSON is built only on request.
 * The caller owns start/stop controls, the 30-second UI timer and any download.
 */
export class MidiPhysicalTrace {
  private readonly records: (MidiPhysicalTraceRecord | undefined)[];
  private readonly durationLimitMs: number;
  private readonly capacity: number;
  private writeIndex = 0;
  private length = 0;
  private nextSequence = 0;
  private overwrittenRecords = 0;
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private wallTimeIso: string | null = null;
  private timeOriginMs: number | null = null;
  private selectedInputId = "";
  private initialPorts: MidiPhysicalTracePort[] = [];
  private initialPortsOmitted = 0;
  private capturing = false;

  constructor(options: { capacity?: number; durationLimitMs?: number } = {}) {
    const capacity = options.capacity ?? 8192;
    const durationLimitMs = options.durationLimitMs ?? 30_000;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16384) {
      throw new RangeError("trace capacity must be 1..16384");
    }
    if (!Number.isInteger(durationLimitMs) || durationLimitMs < 1 || durationLimitMs > 60_000) {
      throw new RangeError("trace duration must be 1..60000 ms");
    }
    this.capacity = capacity;
    this.durationLimitMs = durationLimitMs;
    this.records = new Array(capacity);
  }

  get isCapturing(): boolean { return this.capturing; }

  start(options: MidiPhysicalTraceStart): void {
    validTime(options.nowMs);
    if (this.capturing) throw new Error("stop the current MIDI trace before starting another");
    this.records.fill(undefined);
    this.writeIndex = 0;
    this.length = 0;
    this.nextSequence = 0;
    this.overwrittenRecords = 0;
    this.startedAtMs = options.nowMs;
    this.endedAtMs = null;
    this.wallTimeIso = options.wallTimeIso ? text(options.wallTimeIso) : null;
    this.timeOriginMs = options.timeOriginMs !== undefined && Number.isFinite(options.timeOriginMs)
      ? options.timeOriginMs : null;
    this.selectedInputId = text(options.selectedInputId);
    this.initialPorts = (options.ports ?? []).slice(0, MAX_INITIAL_PORTS).map(safePort);
    this.initialPortsOmitted = Math.max(0, (options.ports?.length ?? 0) - MAX_INITIAL_PORTS);
    this.capturing = true;
  }

  private accepts(atMs: number): boolean {
    validTime(atMs);
    if (!this.capturing || this.startedAtMs === null) return false;
    if (atMs - this.startedAtMs >= this.durationLimitMs) {
      this.capturing = false;
      this.endedAtMs = this.startedAtMs + this.durationLimitMs;
      return false;
    }
    return true;
  }

  private append(record: Omit<MidiPhysicalTraceRecord, "sequence">): number {
    const sequence = this.nextSequence++;
    this.records[this.writeIndex] = { ...record, sequence } as MidiPhysicalTraceRecord;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.length < this.capacity) this.length++;
    else this.overwrittenRecords++;
    return sequence;
  }

  /** Returns a sequence for optional route markers, or null when inactive. */
  recordMessage(event: MidiEvent, context: MidiPhysicalTraceMessageContext): number | null {
    if (!this.accepts(context.handlerTimeMs)) return null;
    const raw = event.raw.subarray(0, MAX_RAW_BYTES);
    return this.append({
      type: "message",
      eventTimeMs: event.timeStamp,
      handlerTimeMs: context.handlerTimeMs,
      dispatchDelayMs: context.handlerTimeMs - event.timeStamp,
      inputId: text(event.inputId),
      inputName: text(context.inputName),
      inputState: text(context.inputState),
      inputConnection: text(context.inputConnection),
      selectedInputId: text(context.selectedInputId),
      rawHex: formatMidiHex(raw),
      rawLength: event.raw.length,
      rawTruncated: event.raw.length > MAX_RAW_BYTES,
      kind: event.kind,
      ...( "channel" in event ? { channel: event.channel } : {}),
      ...numberAndValue(event),
    } as Omit<MidiPhysicalTraceMessage, "sequence">);
  }

  recordPortChange(port: MidiPhysicalTracePort, atMs: number, selectedInputId: string): boolean {
    if (!this.accepts(atMs)) return false;
    const change: Omit<MidiPhysicalTracePortChange, "sequence"> = {
      type: "port-change", atMs, selectedInputId: text(selectedInputId), port: safePort(port),
    };
    this.append(change);
    return true;
  }

  /** Optional routing marker; never schedules or touches the audio engine. */
  recordRoute(messageSequence: number | null, code: string, atMs: number,
    metrics: { attackId?: number | null; activeVoices?: number | null } = {}): boolean {
    if (messageSequence === null || !Number.isInteger(messageSequence) || messageSequence < 0 ||
        !this.accepts(atMs)) return false;
    const attackId = metrics.attackId;
    const activeVoices = metrics.activeVoices;
    this.append({
      type: "route", messageSequence, atMs, code: text(code).slice(0, 64),
      ...(attackId !== null && attackId !== undefined && Number.isFinite(attackId) ? { attackId } : {}),
      ...(activeVoices !== null && activeVoices !== undefined && Number.isFinite(activeVoices)
        ? { activeVoices } : {}),
    } as Omit<MidiPhysicalTraceRoute, "sequence">);
    return true;
  }

  stop(nowMs: number): MidiPhysicalTraceSnapshot {
    validTime(nowMs);
    if (this.capturing) {
      this.capturing = false;
      this.endedAtMs = Math.max(this.startedAtMs ?? nowMs, nowMs);
    }
    return this.snapshot();
  }

  snapshot(): MidiPhysicalTraceSnapshot {
    const records: MidiPhysicalTraceRecord[] = [];
    const first = (this.writeIndex - this.length + this.capacity) % this.capacity;
    for (let i = 0; i < this.length; i++) {
      const record = this.records[(first + i) % this.capacity];
      if (record) records.push(record.type === "port-change"
        ? { ...record, port: { ...record.port } } : { ...record });
    }
    return {
      version: 1,
      startedAtMs: this.startedAtMs,
      endedAtMs: this.endedAtMs,
      wallTimeIso: this.wallTimeIso,
      timeOriginMs: this.timeOriginMs,
      durationLimitMs: this.durationLimitMs,
      capacity: this.capacity,
      capturing: this.capturing,
      selectedInputId: this.selectedInputId,
      initialPorts: this.initialPorts.map((port) => ({ ...port })),
      initialPortsOmitted: this.initialPortsOmitted,
      overwrittenRecords: this.overwrittenRecords,
      records,
    };
  }

  toJSON(): string { return JSON.stringify(this.snapshot()); }
}
