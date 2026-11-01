import type { MeterPoint, TempoPoint } from "../project/model.ts";

export interface TimedMidiBytes {
  readonly tick: number;
  /** Config/CC, then Note Off, then Note On. */
  readonly rank: number;
  readonly sequence: number;
  readonly bytes: readonly number[];
}

const MAX_TRACK_BYTES = 64 * 1024 * 1024;
const MAX_VLQ = 0x0fffffff;

function push16(output: number[], value: number): void {
  output.push((value >>> 8) & 255, value & 255);
}

function push32(output: number[], value: number): void {
  output.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VLQ) {
    throw new RangeError("Delta SMF fuera del rango VLQ");
  }
  const bytes = [value & 0x7f];
  for (let rest = value >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

function meta(type: number, data: readonly number[]): number[] {
  return [0xff, type, ...vlq(data.length), ...data];
}

function encodeTrack(events: readonly TimedMidiBytes[]): number[] {
  const body: number[] = [];
  let previousTick = 0;
  for (const event of [...events].sort((a, b) => a.tick - b.tick || a.rank - b.rank ||
    a.sequence - b.sequence)) {
    if (!Number.isSafeInteger(event.tick) || event.tick < previousTick) throw new RangeError("Tick SMF inválido");
    body.push(...vlq(event.tick - previousTick), ...event.bytes);
    if (body.length > MAX_TRACK_BYTES) throw new RangeError("Pista SMF excede 64 MiB");
    previousTick = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const track = [0x4d, 0x54, 0x72, 0x6b];
  push32(track, body.length);
  for (const byte of body) track.push(byte);
  return track;
}

export function trackNameEvent(name: string): TimedMidiBytes {
  const label = new TextEncoder().encode(name);
  if (label.byteLength > 1024) throw new RangeError("Nombre de pista SMF demasiado largo");
  return { tick: 0, rank: 0, sequence: -1, bytes: meta(0x03, Array.from(label)) };
}

export function tempoMeterEvents(tempoMap: readonly TempoPoint[], meterMap: readonly MeterPoint[],
  startTick: number, endTick: number): TimedMidiBytes[] {
  const tempo = tempoMap.filter((point) => point.tick <= startTick).at(-1);
  const meter = meterMap.filter((point) => point.tick <= startTick).at(-1);
  if (!tempo || !meter) throw new RangeError("Mapa de tempo o compás sin origen");
  const events: TimedMidiBytes[] = [trackNameEvent("Tempo y compás")];
  const addTempo = (point: TempoPoint, tick: number): void => {
    const value = point.microsPerQuarter;
    events.push({ tick, rank: 0, sequence: 0,
      bytes: meta(0x51, [(value >>> 16) & 255, (value >>> 8) & 255, value & 255]) });
  };
  const addMeter = (point: MeterPoint, tick: number): void => {
    events.push({ tick, rank: 0, sequence: 1,
      bytes: meta(0x58, [point.numerator, Math.log2(point.denominator), 24, 8]) });
  };
  addTempo(tempo, 0);
  addMeter(meter, 0);
  for (const point of tempoMap) if (point.tick > startTick && point.tick < endTick) addTempo(point, point.tick - startTick);
  for (const point of meterMap) if (point.tick > startTick && point.tick < endTick) addMeter(point, point.tick - startTick);
  return events;
}

/** One conductor track plus one track per project MIDI track; all tracks use 960 PPQ. */
export function writeSmfType1(conductor: readonly TimedMidiBytes[], tracks: readonly (readonly TimedMidiBytes[])[]): Uint8Array {
  if (tracks.length > 255) throw new RangeError("SMF admite máximo 255 pistas musicales en esta versión");
  const encoded = [encodeTrack(conductor), ...tracks.map(encodeTrack)];
  const output = [0x4d, 0x54, 0x68, 0x64];
  push32(output, 6);
  push16(output, 1);
  push16(output, encoded.length);
  push16(output, 960);
  for (const track of encoded) {
    if (output.length + track.length > MAX_TRACK_BYTES) throw new RangeError("SMF completo excede 64 MiB");
    for (const byte of track) output.push(byte);
  }
  return Uint8Array.from(output);
}
