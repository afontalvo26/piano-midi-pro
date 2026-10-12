// ============================================================
// music/meta — derives browsing metadata from raw `SongData`.
//
// The catalogue has no album tag, no cover art and no year. Rather than
// asking the user to fill 117 forms, everything Spotify needs is derived:
// the artist comes from the tag the demo pack already carries, and the
// "album" is the artist itself — which is exactly what these curated packs
// are (one performer, many songs).
// ============================================================

import type { Playlist, PlaylistView, TrackMeta, TrackSourceInfo } from "./types";
import type { SongData } from "../types/song";
import { idForSong, humanizeRef } from "./ids";

const ARTIST_MAX = 42;

/** Trims a raw artist tag and rejects obvious placeholders. */
function cleanArtist(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  // The demo loader prefixes nothing, but uploads sometimes land with the
  // whole path as the artist — keep only the last path segment.
  const last = value.split("/").pop() ?? value;
  return last.slice(0, ARTIST_MAX);
}

/**
 * Fallback artist for a track with no tag. Demo files encode the performer in
 * the filename (`BinomioDeOro_-_El_Osito_Dormilon.kar`), so that is a good
 * guess; uploads just get a generic bucket.
 */
export function deriveArtist(song: SongData, source: TrackSourceInfo): string {
  const tagged = cleanArtist(song.artist);
  if (tagged) return tagged;
  if (source.origin === "demo") return "Artistas varios";
  if (source.origin === "score") return "Partituras importadas";
  return "Mis importaciones";
}

/**
 * The "album" grouping key. For demos the curated pack *is* the artist, so we
 * reuse it; uploads collapse into two buckets so the album grid stays useful
 * instead of exploding into one album per file.
 */
export function deriveAlbum(artist: string, source: TrackSourceInfo): string {
  if (source.origin === "demo") return artist;
  if (source.origin === "score") return "Partituras importadas";
  return "Mis importaciones";
}

/**
 * Strips the `artist - ` prefix that older code baked into demo titles so the
 * player can show title and artist as separate columns without repeating the
 * performer twice.
 */
export function splitTitle(rawTitle: string, artist: string): string {
  if (!artist) return rawTitle;
  const separators = [" - ", " – ", " — "];
  for (const sep of separators) {
    const prefix = `${artist}${sep}`;
    if (rawTitle.startsWith(prefix)) return rawTitle.slice(prefix.length).trim();
  }
  return rawTitle;
}

/** Builds the persistable catalogue row for a song. */
export function toTrackMeta(song: SongData, source: TrackSourceInfo): TrackMeta {
  const artist = deriveArtist(song, source);
  return {
    id: idForSong(song),
    title: splitTitle(song.title, artist) || song.title,
    artist,
    album: deriveAlbum(artist, source),
    genre: song.genre,
    duration: Math.max(0, song.duration),
    bpm: Math.max(1, Math.round(song.bpm)),
    noteCount: song.notes.length,
    trackCount: song.tracks.length,
    hasLyrics: (song.lyrics?.length ?? 0) > 0,
    source,
  };
}

/**
 * Keeps the user's stats when a track is re-registered on a later cold start.
 * Without this, re-parsing the demo pack would wipe play counts and the
 * `lastPlayedAt` used for "Recién escuchadas".
 */
export function mergeTrackMeta(
  incoming: TrackMeta,
  previous: TrackMeta | undefined,
): TrackMeta {
  if (!previous) return incoming;
  return {
    ...incoming,
    lastPlayedAt: previous.lastPlayedAt,
  };
}

/** Playlist names that are generated on the fly and cannot be edited. */
export const AUTO_PLAYLIST_IDS = {
  liked: "__liked__",
  history: "__history__",
  mostPlayed: "__most_played__",
  recent: "__recent__",
} as const;

export type AutoPlaylistId =
  (typeof AUTO_PLAYLIST_IDS)[keyof typeof AUTO_PLAYLIST_IDS];

/**
 * A playlist as the UI consumes it: either a stored `Playlist` or one of the
 * generated ones (Me gusta / Historial / Más escuchadas / Recién escuchadas),
 * which have no stored items but a computed `trackIds` list.
 */
export function playlistView(playlist: Playlist): PlaylistView {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    emoji: playlist.emoji,
    color: playlist.color,
    colorAlt: playlist.colorAlt,
    trackIds: playlist.items.map((item) => item.trackId),
    updatedAt: playlist.updatedAt,
    system: Boolean(playlist.system),
    auto: Boolean(playlist.autoKind),
  };
}

/** Default cover palettes offered when creating a playlist. */
export const PLAYLIST_PALETTES: { color: string; colorAlt: string }[] = [
  { color: "#8b5cf6", colorAlt: "#d946ef" },
  { color: "#06b6d4", colorAlt: "#3b82f6" },
  { color: "#f59e0b", colorAlt: "#ef4444" },
  { color: "#10b981", colorAlt: "#06b6d4" },
  { color: "#f43f5e", colorAlt: "#a855f7" },
  { color: "#ec4899", colorAlt: "#8b5cf6" },
  { color: "#a855f7", colorAlt: "#ec4899" },
  { color: "#0ea5e9", colorAlt: "#6366f1" },
];

export const PLAYLIST_EMOJIS = [
  "🎵",
  "🔥",
  "🌙",
  "💃",
  "🎹",
  "🌹",
  "🚗",
  "☕",
  "🎉",
  "💔",
  "🌴",
  "⭐",
];

/** Deterministic palette pick so a generated cover never changes on reload. */
export function paletteFor(seed: string): { color: string; colorAlt: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PLAYLIST_PALETTES.length;
  return PLAYLIST_PALETTES[index];
}

/** Formats seconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "1 h 12 min" / "12 min" / "48 s" — the subtitle Spotify shows on playlists. */
export function formatTotalDuration(seconds: number): string {
  if (seconds <= 0) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.round(seconds)} s`;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "Hoy", "Ayer", "hace 3 días" — used by the history shelf. */
export function formatRelativeDay(at: number, now = Date.now()): string {
  const day = 86_400_000;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const diff = startOfToday - new Date(at).setHours(0, 0, 0, 0);
  if (diff <= 0) return "Hoy";
  if (diff <= day) return "Ayer";
  const days = Math.round(diff / day);
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem.`;
  return new Date(at).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

export { humanizeRef };
