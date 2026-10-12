// ============================================================
// music/ids — stable identity for songs.
//
// The app never had song ids: everything was matched by `title`, which
// breaks the moment two files share a name and makes playlists fragile.
// Ids here are *derived from the source*, never random, so the same file
// resolves to the same id on every cold start without persisting anything.
//
// Formats (kept short on purpose — they end up in share links):
//   demo   →  d.<public path>       e.g. d./demo/fur_elise.mid
//   upload →  u.<name>:<bytes>      e.g. u.mysong.mid:48213
//   score  →  s.<name>
// ============================================================

import type { TrackMeta, TrackOrigin, TrackSourceInfo } from "./types";
import type { SongData } from "../types/song";

const DEMO_PREFIX = "d.";
const UPLOAD_PREFIX = "u.";
const SCORE_PREFIX = "s.";

/**
 * Characters that would make an id ambiguous when it travels through a URL
 * query string, a `data-` attribute or a `localStorage` key. We percent-encode
 * exactly these (and nothing else) so ids stay human-readable.
 */
const UNSAFE = /[#?&=%\s]/g;

function scrub(value: string): string {
  return value.replace(UNSAFE, (c) => encodeURIComponent(c));
}

function unscrub(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function demoTrackId(path: string): string {
  return DEMO_PREFIX + scrub(path);
}

export function uploadTrackId(fileName: string, bytes = 0): string {
  return `${UPLOAD_PREFIX}${scrub(fileName)}:${bytes}`;
}

export function scoreTrackId(fileName: string): string {
  return SCORE_PREFIX + scrub(fileName);
}

export function isDemoTrackId(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

/** Splits an id back into its origin + reference. Returns null when malformed. */
export function parseTrackId(
  id: string,
): { origin: TrackOrigin; ref: string; bytes: number } | null {
  if (id.startsWith(DEMO_PREFIX)) {
    return { origin: "demo", ref: unscrub(id.slice(DEMO_PREFIX.length)), bytes: 0 };
  }
  if (id.startsWith(SCORE_PREFIX)) {
    return { origin: "score", ref: unscrub(id.slice(SCORE_PREFIX.length)), bytes: 0 };
  }
  if (id.startsWith(UPLOAD_PREFIX)) {
    const body = id.slice(UPLOAD_PREFIX.length);
    const sep = body.lastIndexOf(":");
    if (sep === -1) return { origin: "upload", ref: unscrub(body), bytes: 0 };
    const ref = unscrub(body.slice(0, sep));
    const bytes = Number(body.slice(sep + 1)) || 0;
    return { origin: "upload", ref, bytes };
  }
  return null;
}

/**
 * Filenames land in ids, and `/demo/` paths encode the curated pack. Neither
 * is worth showing raw, so turn `CarlosVives_-_La_Gota_Fria.kar` into
 * `Carlos Vives - La Gota Fria` for the "unknown artist" fallback.
 */
export function humanizeRef(ref: string): string {
  const base = ref.split("/").pop() ?? ref;
  return base
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Inverse of the id builders — rebuilds the provenance block for a song. */
export function sourceInfoFor(song: SongData, id: string): TrackSourceInfo {
  const parsed = parseTrackId(id);
  if (parsed) {
    return { origin: parsed.origin, ref: parsed.ref, bytes: parsed.bytes };
  }
  // Unparseable id (legacy data) — treat the source label as the reference.
  return { origin: "upload", ref: song.source || song.title, bytes: 0 };
}

/**
 * Derives the stable id for a `SongData`. Prefers an id already stamped on the
 * object, and otherwise reconstructs it from provenance fields.
 *
 * Every producer of `SongData` is expected to stamp `trackId` (the demo loader
 * and both importers do). The reconstruction below is the fallback for
 * hand-built objects; note that it CANNOT recognise a demo, because `source`
 * alone does not identify the file — an unrecognised demo would silently be
 * filed as an upload, which is exactly the bug that made the whole catalogue
 * unplayable once. `demoPath` is therefore the last-chance signal.
 */
export function idForSong(song: SongData): string {
  if (song.trackId) return song.trackId;

  const source = song.source ?? "";
  if (source === "Demo incluida") {
    if (!song.demoPath) {
      throw new Error(
        `Canción demo sin demoPath ni trackId: "${song.title}". ` +
          "El cargador de demos debe estampar ambos campos.",
      );
    }
    return demoTrackId(song.demoPath);
  }
  if (source === "MusicXML") {
    return scoreTrackId(song.uploadName ?? song.title);
  }
  if (source === "Archivo subido") {
    return uploadTrackId(song.uploadName ?? song.title, song.uploadBytes ?? 0);
  }
  // Fallback for anything hand-constructed: title + duration is stable enough.
  return uploadTrackId(song.title, 0);
}

/** Convenience alias used by components that only need "is this a demo?". */
export function isDemoMeta(meta: TrackMeta | undefined): boolean {
  return meta?.source.origin === "demo";
}
