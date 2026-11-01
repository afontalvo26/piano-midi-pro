import { PROJECT_PPQ, type MeterPoint, type ProjectExpressionEvent, type ProjectNote,
  type ProjectPattern, type TempoPoint } from "./model.ts";
import { validateStandalonePattern } from "./validate.ts";

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_TRACKS = 256;
const MAX_EVENTS = 1_000_000;
const MAX_SOURCE_TICK = 100_000_000_000;

export class RecordedTakeConversionError extends Error {
  readonly code: "missing" | "oversize" | "invalid-smf" | "unsupported" | "unpaired-note";

  constructor(code: "missing" | "oversize" | "invalid-smf" | "unsupported" | "unpaired-note", message: string) {
    super(message);
    this.name = "RecordedTakeConversionError";
    this.code = code;
  }
}

export interface RecordedTakeSource {
  getBytes(id: string): Promise<Uint8Array | null>;
}

export interface ConvertRecordedTakeOptions {
  readonly patternId: string;
  readonly patternName?: string;
  readonly nextId?: () => string;
}

export interface RecordedTakeConversionReport {
  readonly takeId: string;
  readonly sourceSha256: string;
  readonly sourceByteLength: number;
  readonly sourcePpq: number;
  readonly trackCount: number;
  readonly noteCount: number;
  readonly expressionCount: number;
  readonly ignoredMetaEvents: number;
  readonly ignoredSysExEvents: number;
  readonly roundedPositions: number;
  readonly normalizedZeroDurations: number;
  readonly defaultTempoInserted: boolean;
  readonly defaultMeterInserted: boolean;
  readonly sourceTempoEvents: readonly {
    readonly sourceTick: number; readonly sourceTrackIndex: number; readonly sourceSequence: number;
    readonly microsPerQuarter: number;
  }[];
  readonly sourceMeterEvents: readonly {
    readonly sourceTick: number; readonly sourceTrackIndex: number; readonly sourceSequence: number;
    readonly numerator: number; readonly denominator: number;
  }[];
}

export interface ConvertedRecordedTake {
  readonly pattern: ProjectPattern;
  readonly tempoMap: readonly TempoPoint[];
  readonly meterMap: readonly MeterPoint[];
  readonly report: RecordedTakeConversionReport;
}

interface NoteStart {
  readonly tick: number;
  readonly velocity: number;
  readonly sequence: number;
}

interface TimedPoint<T> {
  readonly tick: number;
  readonly sequence: number;
  readonly value: T;
}

class Cursor {
  readonly bytes: Uint8Array;
  readonly end: number;
  offset: number;

  constructor(bytes: Uint8Array, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.end = end;
    this.offset = start;
  }

  private require(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.end) {
      throw new RecordedTakeConversionError("invalid-smf", `Archivo MIDI truncado en byte ${this.offset}`);
    }
  }

  byte(): number {
    this.require(1);
    return this.bytes[this.offset++]!;
  }

  peek(): number {
    this.require(1);
    return this.bytes[this.offset]!;
  }

  word(): number {
    return (this.byte() << 8) | this.byte();
  }

  dword(): number {
    return ((this.byte() * 0x1000000) + (this.byte() << 16) + (this.byte() << 8) + this.byte()) >>> 0;
  }

  skip(length: number): void {
    this.require(length);
    this.offset += length;
  }

  vlq(): number {
    let value = 0;
    for (let index = 0; index < 4; index++) {
      const byte = this.byte();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new RecordedTakeConversionError("invalid-smf", `Delta MIDI malformado en byte ${this.offset}`);
  }
}

function invalid(message: string): never {
  throw new RecordedTakeConversionError("invalid-smf", message);
}

function sortedMap<T extends { tick: number }>(points: readonly TimedPoint<T>[], fallback: T): { map: T[]; inserted: boolean } {
  const sorted = [...points].sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
  const map: T[] = [];
  for (const item of sorted) {
    if (map.at(-1)?.tick === item.tick) map[map.length - 1] = item.value;
    else map.push(item.value);
  }
  const inserted = map.length === 0 || map[0]!.tick !== 0;
  if (inserted) map.unshift(fallback);
  return { map, inserted };
}

function sha256(bytes: Uint8Array): Promise<string> {
  return globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource).then((buffer) =>
    Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join(""));
}

/** Parses only a bounded SMF copy returned by RecordingLibrary.getBytes; it never writes a take. */
export async function convertRecordedTake(source: RecordedTakeSource, takeId: string,
  options: ConvertRecordedTakeOptions): Promise<ConvertedRecordedTake> {
  const bytes = await source.getBytes(takeId);
  if (!bytes) throw new RecordedTakeConversionError("missing", "La toma MIDI ya no está disponible");
  if (!(bytes instanceof Uint8Array) || bytes.length < 14) invalid("La toma no contiene una cabecera SMF completa");
  if (bytes.length > MAX_BYTES) throw new RecordedTakeConversionError("oversize", "La toma MIDI excede 32 MiB");
  const originalHash = await sha256(bytes);
  const cursor = new Cursor(bytes);
  if (cursor.dword() !== 0x4d546864) invalid("Falta la cabecera MThd");
  const headerLength = cursor.dword();
  if (headerLength < 6 || headerLength > 1024 || cursor.offset + headerLength > bytes.length) invalid("Longitud MThd inválida");
  const format = cursor.word();
  const trackCount = cursor.word();
  const division = cursor.word();
  cursor.skip(headerLength - 6);
  if (format > 1) throw new RecordedTakeConversionError("unsupported", "SMF tipo 2 no está soportado");
  if (trackCount < 1 || trackCount > MAX_TRACKS || (format === 0 && trackCount !== 1)) invalid("Cantidad de pistas SMF inválida");
  if ((division & 0x8000) !== 0) throw new RecordedTakeConversionError("unsupported", "División SMPTE no soportada");
  if (division < 1) invalid("PPQ SMF inválido");
  const sourcePpq = division;
  let roundedPositions = 0;
  const toProjectTick = (sourceTick: number, countRound = true): number => {
    const numerator = sourceTick * PROJECT_PPQ;
    if (!Number.isSafeInteger(numerator)) invalid("Tick MIDI fuera del rango seguro");
    if (countRound && numerator % sourcePpq !== 0) roundedPositions++;
    return Math.round(numerator / sourcePpq);
  };
  const nextId = options.nextId ?? (() => globalThis.crypto.randomUUID());
  const notes: ProjectNote[] = [];
  const expression: ProjectExpressionEvent[] = [];
  const tempoPoints: TimedPoint<TempoPoint>[] = [];
  const meterPoints: TimedPoint<MeterPoint>[] = [];
  const sourceTempoEvents: RecordedTakeConversionReport["sourceTempoEvents"][number][] = [];
  const sourceMeterEvents: RecordedTakeConversionReport["sourceMeterEvents"][number][] = [];
  let sequence = 0;
  let eventCount = 0;
  let ignoredMetaEvents = 0;
  let ignoredSysExEvents = 0;
  let normalizedZeroDurations = 0;
  let maximumTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (cursor.dword() !== 0x4d54726b) invalid(`Falta MTrk en pista ${trackIndex}`);
    const length = cursor.dword();
    if (cursor.offset + length > bytes.length) invalid(`Pista ${trackIndex} truncada`);
    const track = new Cursor(bytes, cursor.offset, cursor.offset + length);
    cursor.skip(length);
    let sourceTick = 0;
    let runningStatus = 0;
    let ended = false;
    const active = new Map<string, NoteStart[]>();
    while (track.offset < track.end) {
      if (++eventCount > MAX_EVENTS) throw new RecordedTakeConversionError("oversize", "Demasiados eventos MIDI");
      sourceTick += track.vlq();
      if (sourceTick > MAX_SOURCE_TICK) throw new RecordedTakeConversionError("oversize", "Duración MIDI fuera del límite");
      const projectTick = toProjectTick(sourceTick);
      maximumTick = Math.max(maximumTick, projectTick);
      const status = track.peek() >= 0x80 ? track.byte() : runningStatus;
      if (status === 0) invalid(`Running status sin estado en pista ${trackIndex}`);
      const eventSequence = sequence++;
      if (status === 0xff) {
        runningStatus = 0;
        const type = track.byte();
        const size = track.vlq();
        const payload = track.offset;
        track.skip(size);
        if (type === 0x2f) {
          if (size !== 0 || track.offset !== track.end) invalid(`End-of-track inválido en pista ${trackIndex}`);
          ended = true;
          break;
        }
        if (type === 0x51) {
          if (size !== 3) invalid("Meta tempo malformada");
          const micros = (bytes[payload]! << 16) | (bytes[payload + 1]! << 8) | bytes[payload + 2]!;
          if (micros < 60_000 || micros > 6_000_000) invalid("Tempo fuera del rango del proyecto");
          tempoPoints.push({ tick: projectTick, sequence: eventSequence,
            value: { tick: projectTick, microsPerQuarter: micros } });
          sourceTempoEvents.push({ sourceTick, sourceTrackIndex: trackIndex,
            sourceSequence: eventSequence, microsPerQuarter: micros });
        } else if (type === 0x58) {
          if (size !== 4) invalid("Meta compás malformada");
          const numerator = bytes[payload]!;
          const exponent = bytes[payload + 1]!;
          if (numerator < 1 || numerator > 32 || exponent > 6) invalid("Compás fuera del rango del proyecto");
          meterPoints.push({ tick: projectTick, sequence: eventSequence,
            value: { tick: projectTick, numerator, denominator: 2 ** exponent } });
          sourceMeterEvents.push({ sourceTick, sourceTrackIndex: trackIndex,
            sourceSequence: eventSequence, numerator, denominator: 2 ** exponent });
        } else ignoredMetaEvents++;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        runningStatus = 0;
        track.skip(track.vlq());
        ignoredSysExEvents++;
        continue;
      }
      if (status >= 0xf0) invalid(`Estado MIDI no permitido 0x${status.toString(16)}`);
      runningStatus = status;
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = track.byte();
      const data2 = kind === 0xc0 || kind === 0xd0 ? 0 : track.byte();
      if (data1 > 127 || data2 > 127) invalid("Byte de datos MIDI fuera de 0..127");
      const tick = projectTick;
      const source = { sourcePpq, sourceTick, sourceTrackIndex: trackIndex };
      if (kind === 0x90 && data2 > 0) {
        const key = `${channel}:${data1}`;
        const pending = active.get(key) ?? [];
        pending.push({ tick: sourceTick, velocity: data2, sequence: eventSequence });
        active.set(key, pending);
      } else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
        const key = `${channel}:${data1}`;
        const pending = active.get(key);
        const start = pending?.shift();
        if (!start) throw new RecordedTakeConversionError("unpaired-note", `Note Off sin Note On en pista ${trackIndex}, canal ${channel + 1}, nota ${data1}`);
        if (pending?.length === 0) active.delete(key);
        const startTick = toProjectTick(start.tick, false);
        let durationTick = tick - startTick;
        if (durationTick < 1) { durationTick = 1; normalizedZeroDurations++; }
        notes.push({ id: nextId(), startTick, durationTick, pitch: data1, velocity: start.velocity,
          releaseVelocity: data2, channel,
          origin: { kind: "imported", playedPitch: data1, sourcePpq, sourceStartTick: start.tick,
            sourceDurationTick: sourceTick - start.tick, sourceTrackIndex: trackIndex,
            sourceSequence: start.sequence,
            originalVelocity: start.velocity } });
      } else {
        const base = { id: nextId(), tick, channel, sequence: eventSequence, ...source };
        switch (kind) {
          case 0xa0: expression.push({ ...base, kind: "polyPressure", pitch: data1, pressure: data2 }); break;
          case 0xb0: expression.push({ ...base, kind: "cc", controller: data1, value: data2 }); break;
          case 0xc0: expression.push({ ...base, kind: "programChange", program: data1 }); break;
          case 0xd0: expression.push({ ...base, kind: "channelPressure", pressure: data1 }); break;
          case 0xe0: expression.push({ ...base, kind: "pitchBend", value14: (data2 << 7) | data1 }); break;
          default: invalid(`Estado MIDI no soportado 0x${kind.toString(16)}`);
        }
      }
    }
    if (!ended) invalid(`Falta end-of-track en pista ${trackIndex}`);
    if (active.size > 0) throw new RecordedTakeConversionError("unpaired-note", `Note On sin Note Off en pista ${trackIndex}`);
  }
  if (cursor.offset !== bytes.length) invalid("Bytes adicionales fuera de pistas SMF");
  notes.sort((a, b) => a.startTick - b.startTick || a.origin.sourceTrackIndex! - b.origin.sourceTrackIndex! ||
    a.origin.sourceSequence! - b.origin.sourceSequence!);
  expression.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
  const tempo = sortedMap(tempoPoints, { tick: 0, microsPerQuarter: 500_000 });
  const meter = sortedMap(meterPoints, { tick: 0, numerator: 4, denominator: 4 });
  const pattern: ProjectPattern = {
    id: options.patternId, name: options.patternName ?? `Toma ${takeId}`.slice(0, 100), version: 1,
    lengthTicks: Math.max(1, maximumTick + 1), notes, expression,
  };
  validateStandalonePattern(pattern);
  return {
    pattern, tempoMap: tempo.map, meterMap: meter.map,
    report: { takeId, sourceSha256: originalHash, sourceByteLength: bytes.byteLength,
      sourcePpq, trackCount, noteCount: notes.length, expressionCount: expression.length,
      ignoredMetaEvents, ignoredSysExEvents, roundedPositions, normalizedZeroDurations,
      defaultTempoInserted: tempo.inserted, defaultMeterInserted: meter.inserted,
      sourceTempoEvents, sourceMeterEvents },
  };
}
