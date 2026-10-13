/// <reference lib="webworker" />
// Web Worker for parsing MIDI files off the main thread.
//
// Receives raw ArrayBuffers, returns the structured SongData payload.
// Keeps the UI thread responsive even when parsing 100+ demos at startup.

import { Midi } from "@tonejs/midi";
import { extractLyrics } from "../utils/midiLyrics";
import type { LyricLine } from "../utils/midiLyrics";
import { gmProgramToInstrument } from "../utils/instrumentMapping";
import { controlValueAt, timeSignatureOf } from "../utils/midiControlChanges";

const TRACK_COLORS = [
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#fbbf24",
] as const;

// Nota histórica: acá vivía una copia inline con una tabla GM de 16 entradas.
// Todo lo que no estuviera en esa lista (fretless bass, tenor sax, marimba,
// pads, armónica, guitarras…) caía al default y sonaba como PIANO — la mitad
// de una banda de salsa terminaba siendo piano. `instrumentMapping.ts` no
// importa nada, así que se puede usar tal cual desde el worker y las dos
// rutas (worker y parseo en el hilo principal) asignan el mismo instrumento.

interface ParseRequest {
  type: "parse";
  id: string;
  buffer: ArrayBuffer;
  title: string;
  artist: string;
  defaultBpm: number;
  source?: string;
}

interface ParsedTrackOut {
  index: number;
  name: string;
  instrument: string;
  noteCount: number;
  color: string;
  /** Canal 10: la pista es un kit de percusión. */
  isDrumKit?: boolean;
}

interface ParsedNoteOut {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
  /** CC7 del canal en el instante de la nota (0..1). Ausente = el archivo no trae. */
  volume?: number;
  /** CC11 del canal en el instante de la nota (0..1). Ausente = el archivo no trae. */
  expression?: number;
}

interface ParsedSongOut {
  title: string;
  source: string;
  duration: number;
  bpm: number;
  /** Compás del archivo, para la jerarquía métrica del Groove. */
  timeSignature?: [number, number];
  notes: ParsedNoteOut[];
  /** Canal 10: golpes de percusión, aparte de las notas tocables. */
  percussion: ParsedNoteOut[];
  tracks: ParsedTrackOut[];
  /** Synchronised karaoke lyrics, empty when the file has none. */
  lyrics: LyricLine[];
}

type ParseResponse =
  | { type: "parsed"; id: string; song: ParsedSongOut }
  | { type: "error"; id: string; error: string };

self.addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const msg = event.data;
  if (msg.type !== "parse") return;

  try {
    const midi = new Midi(msg.buffer);
    const tracks: ParsedTrackOut[] = [];
    const notes: ParsedNoteOut[] = [];
    const percussion: ParsedNoteOut[] = [];

    // El canal 10 ya no se tira: se separa en `percussion` para que el
    // piano-roll y el juego sigan viendo sólo notas tocables, pero el
    // transporte pueda agendarlas contra el DrumKitEngine. Los kits van al
    // final de la lista para no correr los índices de las pistas melódicas.
    const isDrumTrack = (track: (typeof midi.tracks)[number]) =>
      track.channel === 9 || track.instrument?.percussion === true;
    const withNotes = midi.tracks
      .map((track, i) => ({ track, origIdx: i }))
      .filter(({ track }) => track.notes.length > 0 && !isDrumTrack(track))
      .slice(0, 8);
    const drumTracks = midi.tracks
      .map((track, i) => ({ track, origIdx: i }))
      .filter(({ track }) => track.notes.length > 0 && isDrumTrack(track))
      .slice(0, 2);
    const validTracks = [...withNotes, ...drumTracks];

    validTracks.forEach(({ track, origIdx }, newIdx) => {
      const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
      const isDrumKit = isDrumTrack(track);
      tracks.push({
        index: newIdx,
        name:
          track.name?.trim() ||
          (isDrumKit ? "Percusión" : `Pista ${newIdx + 1}`),
        instrument: isDrumKit
          ? "GM Drum Kit"
          : gmProgramToInstrument(track.instrument?.number ?? 0, track.name),
        noteCount: track.notes.length,
        color,
        isDrumKit,
      });
      const bucket = isDrumKit ? percussion : notes;
      track.notes.forEach((note, noteIndex) => {
        bucket.push({
          id: `${isDrumKit ? "perc" : "demo"}-${msg.id}-${origIdx}-${noteIndex}`,
          midi: note.midi,
          time: note.time,
          duration: Math.max(0.04, note.duration),
          velocity: note.velocity || 0.75,
          trackIndex: newIdx,
          // CC7 (nivel de mezcla del autor) y CC11 (expresión) muestreados en el
          // instante de la nota: es lo que el archivo dice y hasta ahora se
          // descartaba. Ver engine/playbackGain.ts.
          volume: controlValueAt(track.controlChanges, 7, note.time),
          expression: controlValueAt(track.controlChanges, 11, note.time),
        });
      });
    });

    notes.sort((a, b) => a.time - b.time);
    const duration = [...notes, ...percussion].reduce(
      (max, note) => Math.max(max, note.time + note.duration),
      0,
    );
    const bpm = Math.round(midi.header.tempos[0]?.bpm || msg.defaultBpm);

    // Karaoke lyrics. Converted with the header's own tempo map so the times
    // live in exactly the same domain as `note.time` — that is what keeps the
    // lyrics locked to the music when BPM or playback rate changes.
    const lyrics = extractLyrics(
      msg.buffer,
      midi.header.ticksToSeconds.bind(midi.header),
    );

    const response: ParseResponse = {
      type: "parsed",
      id: msg.id,
      song: {
        title: `${msg.artist} - ${msg.title}`,
        source: msg.source ?? "Demo incluida",
        duration,
        bpm,
        timeSignature: timeSignatureOf(midi.header),
        notes,
        percussion,
        tracks,
        lyrics,
      },
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  } catch (err) {
    const response: ParseResponse = {
      type: "error",
      id: msg.id,
      error: err instanceof Error ? err.message : "Parse failed",
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  }
});

export {};
