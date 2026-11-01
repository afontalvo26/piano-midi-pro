import { createArrangementResolver } from "../composition/resolveProjectTimeline.ts";
import type { ProjectDocumentV1, ProjectTrack } from "../project/model.ts";
import { validateProjectDocument } from "../project/validate.ts";
import type { TimelineEvent } from "../sequencer/timelineEvents.ts";
import { tempoMeterEvents, trackNameEvent, writeSmfType1 } from "./midiSmf.ts";

const WINDOW_TICKS = 15_360;
const MAX_RANGE_TICKS = 100_000_000;
const MAX_RESOLVED_EVENTS = 1_000_000;

export interface ArrangementMidiOptions {
  readonly startTick?: number;
  readonly endTick?: number;
  /** Same project and seed resolve the same probability/ratchets as the arrangement resolver. */
  readonly seed?: string;
}

export interface MidiExportWarning {
  readonly code: "automation-omitted" | "mix-omitted" | "instrument-omitted" |
    "source-provenance-omitted" | "overlap-ambiguous" | "range-tail-cut" |
    "probability-resolved" | "ratchet-resolved" | "muted-or-solo-filtered" | "no-notes";
  readonly count: number;
  readonly message: string;
}

export interface ArrangementMidiReport {
  readonly ppq: 960;
  readonly smfType: 1;
  readonly startTick: number;
  readonly endTick: number;
  readonly seed: string;
  readonly midiTrackCount: number;
  readonly noteCount: number;
  readonly controlCount: number;
  readonly tempoCount: number;
  readonly meterCount: number;
  readonly warnings: readonly MidiExportWarning[];
}

export interface ArrangementMidiResult {
  readonly bytes: Uint8Array;
  readonly report: ArrangementMidiReport;
}

function rangeEnd(document: ProjectDocumentV1): number {
  let end = 0;
  for (const clip of document.clips) end = Math.max(end, clip.startTick + clip.lengthTicks);
  return end;
}

function midiTrack(track: ProjectTrack): boolean {
  return track.kind === "instrument" || track.kind === "drum";
}

function channelBytes(event: Exclude<TimelineEvent, { kind: "audioClip" | "authority" }>): readonly number[] {
  const channel = event.channel;
  switch (event.kind) {
    case "cc": return [0xb0 | channel, event.controller, event.value];
    case "pitchBend": return [0xe0 | channel, event.value14 & 0x7f, event.value14 >>> 7];
    case "polyPressure": return [0xa0 | channel, event.pitch, event.pressure];
    case "channelPressure": return [0xd0 | channel, event.pressure];
    case "programChange": return [0xc0 | channel, event.program];
    case "note": return [0x90 | channel, event.pitch, event.velocity];
  }
}

function warning(code: MidiExportWarning["code"], count: number, message: string,
  warnings: MidiExportWarning[]): void {
  if (count > 0) warnings.push({ code, count, message });
}

/** Pure render core; browser UI calls the Worker client below. The original project and takes are untouched. */
export function renderArrangementMidi(document: ProjectDocumentV1,
  options: ArrangementMidiOptions = {}): ArrangementMidiResult {
  validateProjectDocument(document);
  const startTick = options.startTick ?? 0;
  const endTick = options.endTick ?? rangeEnd(document);
  const seed = options.seed ?? document.id;
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) ||
      startTick < 0 || endTick <= startTick || endTick - startTick > MAX_RANGE_TICKS ||
      typeof seed !== "string" || seed.length > 128) {
    throw new RangeError("Rango o semilla de exportación MIDI inválidos");
  }
  const tracks = document.trackOrder.map((id) => document.tracks.find((track) => track.id === id)!)
    .filter(midiTrack);
  if (tracks.length > 255) throw new RangeError("Demasiadas pistas MIDI para SMF tipo 1");
  const byTrack = new Map(tracks.map((track) => [track.id, [trackNameEvent(track.name)]]));
  const resolver = createArrangementResolver(document, { probabilitySeed: seed });
  let noteCount = 0;
  let controlCount = 0;
  let tailCut = 0;
  let overlapAmbiguous = 0;
  const overlapping = new Map<string, number>();
  let resolvedCount = 0;
  for (let windowStart = startTick; windowStart < endTick; windowStart += WINDOW_TICKS) {
    const windowEnd = Math.min(endTick, windowStart + WINDOW_TICKS);
    const events = resolver(windowStart, windowEnd, 0);
    resolvedCount += events.length;
    if (resolvedCount > MAX_RESOLVED_EVENTS) throw new RangeError("Más de un millón de eventos MIDI para exportar");
    for (const event of events) {
      if (event.kind === "audioClip") {
        throw new RangeError("Clip de audio no cabe en SMF: exporta WAV o silencia esa pista");
      }
      if (event.kind === "authority") {
        throw new RangeError("Cambio de autoridad de escena no cabe en SMF sin resolver cortes de voces");
      }
      const output = event.trackId ? byTrack.get(event.trackId) : undefined;
      if (!output) throw new RangeError(`Evento sin pista MIDI válida: ${event.eventId}`);
      const tick = event.tick - startTick;
      if (event.kind === "note") {
        const originalEnd = event.tick + event.durationTicks;
        const stopTick = Math.min(endTick, originalEnd) - startTick;
        if (originalEnd > endTick) tailCut++;
        if (stopTick <= tick) continue;
        const key = `${event.trackId}:${event.channel}:${event.pitch}`;
        if ((overlapping.get(key) ?? -1) > event.tick) overlapAmbiguous++;
        overlapping.set(key, Math.max(overlapping.get(key) ?? 0, originalEnd));
        output.push({ tick, rank: 2, sequence: event.sequence, bytes: channelBytes(event) });
        output.push({ tick: stopTick, rank: 1, sequence: event.sequence,
          bytes: [0x80 | event.channel, event.pitch, event.releaseVelocity] });
        noteCount++;
      } else {
        output.push({ tick, rank: 0, sequence: event.sequence, bytes: channelBytes(event) });
        controlCount++;
      }
    }
  }
  const conductor = tempoMeterEvents(document.tempoMap, document.meterMap, startTick, endTick);
  const bytes = writeSmfType1(conductor, tracks.map((track) => byTrack.get(track.id)!));
  const warnings: MidiExportWarning[] = [];
  warning("automation-omitted", document.automation.length,
    "La automatización de mezcla no tiene equivalente estándar en MIDI 1.0", warnings);
  const mixedTracks = tracks.filter((track) => track.mix.gainDb !== 0 || track.mix.pan !== 0 ||
    track.mix.sends.length > 0 || track.mix.effects.length > 0 || track.mix.outputBusTrackId !== undefined).length;
  warning("mix-omitted", mixedTracks + document.mix.masterEffects.length +
    (document.mix.masterGainDb !== 0 ? 1 : 0) + document.clips.filter((clip) => clip.gainDb !== 0).length,
  "Ganancia, pan, buses, envíos y efectos de Studio no se codifican en SMF", warnings);
  warning("instrument-omitted", tracks.filter((track) => track.instrument !== undefined).length,
    "El SMF conserva notas y canales, pero no incluye bancos de muestras ni presets", warnings);
  warning("source-provenance-omitted", document.takes.length,
    "El archivo MIDI no contiene bytes originales de tomas ni metadatos de procedencia", warnings);
  warning("overlap-ambiguous", overlapAmbiguous,
    "MIDI 1.0 no identifica voces solapadas de igual pitch y canal; la reimportación puede emparejar otros Note Off", warnings);
  warning("range-tail-cut", tailCut, "Notas que cruzaban el fin del rango se cortaron en ese tick", warnings);
  warning("probability-resolved", document.patterns.reduce((count, pattern) =>
    count + pattern.notes.filter((note) => note.probability !== undefined && note.probability < 1).length, 0),
  "La probabilidad se resolvió con la semilla indicada; el SMF contiene sólo el resultado", warnings);
  warning("ratchet-resolved", document.patterns.reduce((count, pattern) =>
    count + pattern.notes.filter((note) => (note.ratchetCount ?? 1) > 1).length, 0),
  "Los ratchets se exportaron como notas separadas", warnings);
  warning("muted-or-solo-filtered", document.tracks.filter((track) => track.mix.mute || track.mix.solo).length +
    document.clips.filter((clip) => clip.muted).length,
  "Mute y solo se resolvieron; el SMF sólo contiene eventos audibles del arreglo", warnings);
  warning("no-notes", noteCount === 0 ? 1 : 0, "El rango exportado no contiene notas", warnings);
  return { bytes, report: { ppq: 960, smfType: 1, startTick, endTick, seed,
    midiTrackCount: tracks.length, noteCount, controlCount,
    tempoCount: conductor.filter((event) => event.bytes[1] === 0x51).length,
    meterCount: conductor.filter((event) => event.bytes[1] === 0x58).length,
    warnings } };
}
