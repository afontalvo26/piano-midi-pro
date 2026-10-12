import { Midi } from "@tonejs/midi";
import type { SongData, SongNote, SongTrack } from "../types/song";
import { TRACK_COLORS } from "../constants/ui";
import { gmProgramToInstrument } from "./instrumentMapping";

/**
 * Parse an external MIDI file into a `SongData` payload.
 *
 * Keeps the 8 busiest melodic tracks, and the percussion channel (10) as a
 * separate `percussion` list — a drum hit is not a key the user can play, but
 * dropping it left vallenatos and boleros without their rhythm section.
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
  const parsedPercussion: SongNote[] = [];

  const isDrumTrack = (track: (typeof midi.tracks)[number]) =>
    track.channel === 9 || track.instrument?.percussion === true;

  // Melódicas: las 8 con más notas. Kits de percusión: al final de la lista.
  const melodic = midi.tracks
    .map((track, i) => ({ track, origIdx: i }))
    .filter(({ track }) => track.notes.length > 0 && !isDrumTrack(track))
    .sort((a, b) => b.track.notes.length - a.track.notes.length)
    .slice(0, 8);
  const drums = midi.tracks
    .map((track, i) => ({ track, origIdx: i }))
    .filter(({ track }) => track.notes.length > 0 && isDrumTrack(track))
    .slice(0, 2);
  const validTracks = [...melodic, ...drums];

  validTracks.forEach(({ track, origIdx }, newIdx) => {
    const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
    const noteCount = track.notes.length;
    const isDrumKit = isDrumTrack(track);

    parsedTracks.push({
      index: newIdx,
      name:
        track.name?.trim() || (isDrumKit ? "Percusión" : `Pista ${newIdx + 1}`),
      instrument: isDrumKit
        ? "GM Drum Kit"
        : gmProgramToInstrument(track.instrument?.number ?? 0, track.name),
      noteCount,
      color,
      isDrumKit,
    });

    const bucket = isDrumKit ? parsedPercussion : parsedNotes;
    track.notes.forEach((note, noteIndex) => {
      bucket.push({
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
  const duration = [...parsedNotes, ...parsedPercussion].reduce(
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
    percussion: parsedPercussion,
    tracks: parsedTracks,
  };
}
