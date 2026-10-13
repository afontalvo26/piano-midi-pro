// ============================================================
// music/resolve — turns a track id back into playable `SongData`.
//
// The catalogue only stores metadata, so playback has to rehydrate the heavy
// payload. Three sources, in order of cost:
//
//   1. an in-memory cache (the same session already resolved it)
//   2. a parsed upload held by App.tsx (notes are only alive in memory)
//   3. the shipped MIDI on disk, re-fetched and re-parsed
//
// Demo tracks are the expensive case (~3.5 s for all 117), so resolution is
// always scoped to a single track and memoised per id.
// ============================================================

import { Midi } from "@tonejs/midi";
import type { SongData, SongNote, SongTrack, Genre } from "../types/song";
import { TRACK_COLORS } from "../constants/ui";
import { gmProgramToInstrument } from "../utils/instrumentMapping";
import { extractLyrics } from "../utils/midiLyrics";
import { controlValueAt, timeSignatureOf } from "../utils/midiControlChanges";
import { parseDemoInWorker } from "../utils/midiWorkerClient";
import { DEMO_SONGS } from "../constants/demoSongs";
import { isDemoTrackId, parseTrackId } from "./ids";

/** Demo metadata indexed by the public path, for artist/genre/bpm at load. */
const DEMO_BY_PATH = new Map(DEMO_SONGS.map((song) => [song.path, song]));

const resolved = new Map<string, SongData>();
const inflight = new Map<string, Promise<SongData | null>>();

/** Songs the app has parsed in this session (demos + uploads), by id. */
const sessionSongs = new Map<string, SongData>();

export class TrackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackUnavailableError";
  }
}

/** Registers a session-parsed song so playback never has to re-fetch it. */
export function putSessionSong(song: SongData): void {
  if (!song.trackId) return;
  sessionSongs.set(song.trackId, song);
}

export function getSessionSong(trackId: string): SongData | undefined {
  return sessionSongs.get(trackId);
}

export function forgetSessionSong(trackId: string): void {
  sessionSongs.delete(trackId);
  resolved.delete(trackId);
}

/** True when the track can be resolved right now without touching the network. */
export function isResolved(trackId: string): boolean {
  return resolved.has(trackId) || sessionSongs.has(trackId);
}

/**
 * Parses a MIDI byte buffer into `SongData` using the same rules as the demo
 * loader in App.tsx: drop percussion, keep the 8 busiest tracks, normalise
 * durations. Kept here so both paths agree on track indices.
 */
export async function parseMidiBytes(
  bytes: ArrayBuffer,
  options: {
    id: string;
    title: string;
    artist?: string;
    genre?: Genre;
    defaultBpm?: number;
    trackId: string;
    /** Public path, for demo tracks. */
    demoPath?: string;
  },
): Promise<SongData> {
  // Worker first: parsing 117 files on the main thread is what makes the
  // catalogue take seconds to appear.
  try {
    const parsed = await parseDemoInWorker({
      id: options.id,
      buffer: bytes.slice(0),
      title: options.title,
      artist: options.artist ?? "",
      defaultBpm: options.defaultBpm ?? 120,
    });
    if (parsed) {
      // The worker builds notes/tracks/lyrics but knows nothing about the
      // player's identity fields, so stamp them on here.
      return {
        ...parsed,
        artist: options.artist || undefined,
        genre: options.genre,
        trackId: options.trackId,
        demoPath: options.demoPath ?? parsed.demoPath,
      };
    }
  } catch {
    /* worker unavailable — fall through to the in-thread parse */
  }

  const midi = new Midi(bytes);
  const tracks: SongTrack[] = [];
  const notes: SongNote[] = [];
  const percussion: SongNote[] = [];

  // El canal 10 se conserva pero aparte: son golpes de percusión, no teclas.
  const isDrumTrack = (track: (typeof midi.tracks)[number]) =>
    track.channel === 9 || track.instrument?.percussion === true;
  const melodic = midi.tracks
    .filter((track) => track.notes.length > 0 && !isDrumTrack(track))
    .slice(0, 8);
  const drums = midi.tracks
    .filter((track) => track.notes.length > 0 && isDrumTrack(track))
    .slice(0, 2);
  const valid = [...melodic, ...drums];

  valid.forEach((track, newIdx) => {
    const isDrumKit = isDrumTrack(track);
    tracks.push({
      index: newIdx,
      name:
        track.name?.trim() || (isDrumKit ? "Percusión" : `Pista ${newIdx + 1}`),
      instrument: isDrumKit
        ? "GM Drum Kit"
        : gmProgramToInstrument(track.instrument?.number ?? 0, track.name),
      noteCount: track.notes.length,
      color: TRACK_COLORS[newIdx % TRACK_COLORS.length],
      isDrumKit,
    });
    const bucket = isDrumKit ? percussion : notes;
    track.notes.forEach((note, noteIndex) => {
      bucket.push({
        id: `${options.trackId}-${newIdx}-${noteIndex}`,
        midi: note.midi,
        time: note.time,
        duration: Math.max(0.04, note.duration),
        velocity: note.velocity || 0.75,
        trackIndex: newIdx,
        // CC7 (nivel de mezcla) y CC11 (expresión) del archivo, por nota.
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

  return {
    title: options.artist ? `${options.artist} - ${options.title}` : options.title,
    source: "Demo incluida",
    duration,
    bpm: Math.round(midi.header.tempos[0]?.bpm || options.defaultBpm || 120),
    timeSignature: timeSignatureOf(midi.header),
    notes,
    percussion,
    tracks,
    artist: options.artist,
    genre: options.genre,
    trackId: options.trackId,
    demoPath: options.demoPath,
    lyrics: extractLyrics(bytes, midi.header.ticksToSeconds.bind(midi.header)),
  };
}

/** Fetches + parses one shipped demo track. Cached for the session. */
async function loadDemoTrack(trackId: string, path: string): Promise<SongData | null> {
  const meta = DEMO_BY_PATH.get(path);
  if (!meta) return null;

  const response = await fetch(path);
  if (!response.ok) {
    throw new TrackUnavailableError(
      `No se pudo descargar "${meta.title}" (${response.status})`,
    );
  }
  const bytes = await response.arrayBuffer();
  const song = await parseMidiBytes(bytes, {
    id: trackId,
    trackId,
    title: meta.title,
    artist: meta.artist,
    genre: meta.genre,
    defaultBpm: meta.bpm,
    demoPath: path,
  });
  return song;
}

/**
 * Resolves a track id to playable song data, or throws
 * `TrackUnavailableError` when the source is gone (deleted upload, offline
 * demo fetch, unknown id).
 */
export async function resolveTrack(trackId: string): Promise<SongData> {
  const cached = resolved.get(trackId) ?? sessionSongs.get(trackId);
  if (cached) return cached;

  const pending = inflight.get(trackId);
  if (pending) {
    const song = await pending;
    if (!song) throw new TrackUnavailableError("No se pudo cargar la canción");
    return song;
  }

  const task = (async (): Promise<SongData | null> => {
    const parsed = parseTrackId(trackId);
    if (!parsed) {
      throw new TrackUnavailableError("Identificador de canción inválido");
    }

    if (parsed.origin === "demo" && isDemoTrackId(trackId)) {
      return loadDemoTrack(trackId, parsed.ref);
    }

    // Uploads and scores only exist in memory. App.tsx re-registers them on
    // every cold start through the session cache; if it is not there, the
    // original file has to be re-imported.
    throw new TrackUnavailableError(
      `"${parsed.ref}" es un archivo importado. Volvé a subirlo para escucharlo.`,
    );
  })();

  inflight.set(trackId, task);
  try {
    const song = await task;
    if (song) resolved.set(trackId, song);
    return song as SongData;
  } finally {
    inflight.delete(trackId);
  }
}

/** Fire-and-forget warm-up used to prefetch the next queued track. */
export function prefetchTrack(trackId: string): void {
  if (resolved.has(trackId) || sessionSongs.has(trackId) || inflight.has(trackId)) return;
  void resolveTrack(trackId).catch(() => {
    /* prefetch is best effort */
  });
}

/** Number of tracks currently held in memory (used by the diagnostics panel). */
export function resolvedCount(): number {
  return new Set([...resolved.keys(), ...sessionSongs.keys()]).size;
}
