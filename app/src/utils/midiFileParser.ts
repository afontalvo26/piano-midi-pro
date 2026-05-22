import { Midi } from "@tonejs/midi";
import type { SongData, SongNote, SongTrack } from "../types/song";
import { TRACK_COLORS } from "../constants/ui";
import { gmProgramToInstrument } from "./instrumentMapping";

/**
 * Parse an external MIDI file into a `SongData` payload.
 *
 * Filters out drum/percussion tracks (channel 10), keeps only the 8 tracks
 * with the most notes, sorts notes chronologically, and infers the song's
 * tempo and total duration.
 *
 * Pure: only depends on the provided file and module-level constants.
 *
 * @param file Browser `File` containing a `.mid`/`.midi` payload.
 * @param sourceLabel Optional label stored as `SongData.source` (defaults to
 *   `"Archivo subido"`).
 */
export async function parseMidiFile(
  file: File,
  sourceLabel: string = "Archivo subido",
): Promise<SongData> {
  const bytes = await file.arrayBuffer();
  const midi = new Midi(bytes);
  const parsedTracks: SongTrack[] = [];
  const parsedNotes: SongNote[] = [];

  // Filtrar: solo pistas con notas, sin percusión (channel 10), max 8
  const validTracks = midi.tracks
    .map((track, i) => ({ track, origIdx: i }))
    .filter(({ track }) => {
      if (track.notes.length === 0) return false;
      // Omitir pistas de percusión (channel 10)
      const isDrums =
        track.channel === 9 ||
        track.channel === 10 ||
        track.instrument?.percussion === true ||
        (track.name?.toLowerCase().match(/drum|perc|kit|beat/) ?? false);
      return !isDrums;
    })
    .sort((a, b) => b.track.notes.length - a.track.notes.length) // más notas primero
    .slice(0, 8); // máximo 8 pistas

  validTracks.forEach(({ track, origIdx }, newIdx) => {
    const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
    const noteCount = track.notes.length;

    parsedTracks.push({
      index: newIdx,
      name: track.name?.trim() || `Pista ${newIdx + 1}`,
      instrument: gmProgramToInstrument(
        track.instrument?.number ?? 0,
        track.name,
      ),
      noteCount,
      color,
    });

    track.notes.forEach((note, noteIndex) => {
      parsedNotes.push({
        id: `midi-${origIdx}-${noteIndex}-${note.midi}`,
        midi: note.midi,
        time: note.time,
        duration: Math.max(0.04, note.duration),
        velocity: note.velocity || 0.75,
        trackIndex: newIdx,
      });
    });
  });

  parsedNotes.sort((a, b) => a.time - b.time);
  const duration = parsedNotes.reduce(
    (max, note) => Math.max(max, note.time + note.duration),
    0,
  );
  const bpm = Math.round(midi.header.tempos[0]?.bpm || 120);

  return {
    title: file.name.replace(/\.[^.]+$/, ""),
    source: sourceLabel,
    duration,
    bpm,
    notes: parsedNotes,
    tracks: parsedTracks,
  };
}
