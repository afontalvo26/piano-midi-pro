/**
 * midiImport — importar un MIDI propio en el reproductor.
 *
 * Replica `parseMidiFile` de `app/src/App.tsx` (líneas ~3004-3125) en lo que
 * hace al REPRODUCTOR, sin el piano. Las reglas de parseo se copian tal cual
 * porque no son cosméticas: si el reproductor armara las pistas en otro orden,
 * la misma canción tendría otros índices de pista y el mezclador guardado
 * apuntaría a otra cosa.
 *
 *   1. La percusión (canal 10) se SEPARA en `percussion` en vez de descartarse:
 *      va al `DrumKitEngine`, no al piano-roll.
 *   2. Las pistas melódicas se ordenan por cantidad de notas (la más ocupada
 *      primero) y se cortan en 8; el kit va al final, para que los índices de
 *      las melódicas no dependan de si el archivo trae batería.
 *   3. El id sale del nombre + tamaño del archivo: reimportar el mismo archivo
 *      conserva sus "me gusta", su historial y sus playlists.
 */

import { Midi } from "@tonejs/midi";
import type { SongData, SongNote, SongTrack } from "@app/types/song";
import { TRACK_COLORS } from "@app/constants/ui";
import { gmProgramToInstrument } from "@app/utils/instrumentMapping";
import { extractLyrics } from "@app/utils/midiLyrics";
import { idForSong, sourceInfoFor, uploadTrackId } from "@app/music/ids";
import { libraryStore } from "@app/music/libraryStore";
import { putSessionSong } from "@app/music/resolve";

/** Extensiones que el reproductor acepta (los `.kar` son MIDI con letra). */
export const MIDI_EXTENSIONS = [".mid", ".midi", ".kar", ".rmi"] as const;

export function isMidiFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return MIDI_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Parsea un archivo MIDI del usuario y lo deja listo para reproducir.
 *
 * @returns el `SongData` parseado, ya registrado en la biblioteca.
 */
export async function importMidiFile(file: File): Promise<SongData> {
  const bytes = await file.arrayBuffer();
  const midi = new Midi(bytes);
  const parsedTracks: SongTrack[] = [];
  const parsedNotes: SongNote[] = [];
  const parsedPercussion: SongNote[] = [];

  const isDrumTrack = (track: (typeof midi.tracks)[number]) =>
    track.channel === 9 || track.instrument?.percussion === true;

  const melodic = midi.tracks
    .map((track, origIdx) => ({ track, origIdx }))
    .filter(({ track }) => track.notes.length > 0 && !isDrumTrack(track))
    .sort((a, b) => b.track.notes.length - a.track.notes.length)
    .slice(0, 8);
  const drums = midi.tracks
    .map((track, origIdx) => ({ track, origIdx }))
    .filter(({ track }) => track.notes.length > 0 && isDrumTrack(track))
    .slice(0, 2);
  const validTracks = [...melodic, ...drums];

  validTracks.forEach(({ track, origIdx }, newIdx) => {
    const isDrumKit = isDrumTrack(track);
    const noteCount = track.notes.length;

    parsedTracks.push({
      index: newIdx,
      name:
        track.name?.trim() || (isDrumKit ? "Percusión" : `Pista ${newIdx + 1}`),
      instrument: isDrumKit
        ? "GM Drum Kit"
        : gmProgramToInstrument(track.instrument?.number ?? 0, track.name),
      noteCount,
      color: TRACK_COLORS[newIdx % TRACK_COLORS.length],
      isDrumKit,
    });

    const bucket = isDrumKit ? parsedPercussion : parsedNotes;
    track.notes.forEach((note, noteIndex) => {
      bucket.push({
        // El id lleva el índice ORIGINAL de la pista y el de la nota: dos notas
        // del mismo tiempo y altura en pistas distintas no colisionan.
        id: `${isDrumKit ? "perc" : "midi"}-${origIdx}-${noteIndex}-${note.midi}`,
        midi: note.midi,
        time: note.time,
        duration: Math.max(0.04, note.duration),
        velocity: note.velocity || 0.75,
        trackIndex: newIdx,
      });
    });
  });

  parsedNotes.sort((a, b) => a.time - b.time);
  const duration = [...parsedNotes, ...parsedPercussion].reduce(
    (max, note) => Math.max(max, note.time + note.duration),
    0,
  );

  const uploadName = file.name;
  const song: SongData = {
    title: uploadName.replace(/\.[^.]+$/, ""),
    source: "Archivo subido",
    duration,
    bpm: Math.round(midi.header.tempos[0]?.bpm || 120),
    notes: parsedNotes,
    percussion: parsedPercussion,
    tracks: parsedTracks,
    trackId: uploadTrackId(uploadName, file.size),
    uploadName,
    uploadBytes: file.size,
    // Los `.kar` traen la letra embebida: se levanta igual que en el piano.
    lyrics: extractLyrics(bytes, midi.header.ticksToSeconds.bind(midi.header)),
  };

  // Registrada en la biblioteca y cacheada en la sesión: `resolveTrack` la
  // encuentra sin volver a pedir el archivo (que ya no existe en disco).
  const id = idForSong(song);
  putSessionSong(song);
  libraryStore.registerTracks([
    { song, source: sourceInfoFor(song, id) },
  ]);

  return song;
}
