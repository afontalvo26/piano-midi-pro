// ============================================================
// music/types — data model for the Spotify-style player section.
//
// Everything the player needs to render a shelf, a playlist row or the
// now-playing bar lives here. Note data (midi notes, tracks, lyrics) is
// deliberately NOT part of this model: it is several MB for the shipped
// catalogue and can never fit in localStorage. The player keeps a light
// "catalogue" of metadata and resolves the heavy `SongData` on demand
// through `music/resolve`.
// ============================================================

import type { Genre } from "../types/song";

/** Where a track came from. Drives the stable id scheme and sharing rules. */
export type TrackOrigin = "demo" | "upload" | "score";

/** Provenance metadata that is cheap to persist and survives a cold start. */
export type TrackSourceInfo = {
  origin: TrackOrigin;
  /**
   * Demo tracks: the public path passed to `fetch` (e.g. `/demo/fur_elise.mid`).
   * Uploads: the original filename.
   */
  ref: string;
  /** Demo tracks: file size is unknown client-side, so this stays 0. */
  bytes?: number;
};

/** Lightweight, persistable description of one playable piece. */
export type TrackMeta = {
  /** Stable identity — see `music/ids.ts`. Never changes for a given song. */
  id: string;
  title: string;
  /** Empty string means "unknown artist" (uploads usually have none). */
  artist: string;
  /**
   * Derived grouping key. For the shipped catalogue this is the artist, so
   * browsing by album collapses to browsing by artist — which is what the
   * curated packs actually are.
   */
  album: string;
  genre?: Genre;
  duration: number;
  bpm: number;
  noteCount: number;
  trackCount: number;
  /** True when the source MIDI carried a lyric track (.kar files). */
  hasLyrics: boolean;
  source: TrackSourceInfo;
  /** Epoch ms of the last time this track was opened/played. */
  lastPlayedAt?: number;
};

/** One entry in a playlist. `addedAt` drives "recently added" ordering. */
export type PlaylistItem = {
  trackId: string;
  addedAt: number;
};

/** A user-created (or auto-generated) ordered collection of tracks. */
export type Playlist = {
  id: string;
  name: string;
  description: string;
  /** Emoji shown on top of the generated gradient cover. */
  emoji: string;
  /** Two hex colours for the generated cover gradient. */
  color: string;
  colorAlt: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
  /**
   * Pinned playlists cannot be deleted and are never reordered by the user —
   * used by the virtual "Me gusta" and "Historial" entries.
   */
  system?: boolean;
  /** System playlists are filled by the app, not by drag & drop. */
  autoKind?: "liked" | "history" | "mostPlayed" | "recent";
};

/** A single "played this track" event, newest first. */
export type HistoryEntry = {
  trackId: string;
  at: number;
};

/** How the active queue should pick the next track once one finishes. */
export type RepeatMode = "off" | "all" | "one";

/** Where the current queue came from — shown in the now-playing header. */
export type QueueOriginKind =
  | "track"
  | "playlist"
  | "genre"
  | "artist"
  | "album"
  | "liked"
  | "history"
  | "search"
  | "library"
  | "radio";

export type QueueOrigin = {
  kind: QueueOriginKind;
  /** Human label, e.g. the playlist name. Empty for ad-hoc queues. */
  label: string;
  /** Playlist id / genre id / artist name, when the origin has one. */
  id?: string;
};

/** The complete persisted state of the library half of the player. */
export type LibraryState = {
  version: number;
  /** Metadata for every known track, keyed by stable id. */
  tracks: Record<string, TrackMeta>;
  /** Insertion order of `tracks`, used as the default library ordering. */
  trackOrder: string[];
  playlists: Playlist[];
  /** Track ids the user hearted. */
  liked: string[];
  /** Play counts keyed by track id. */
  playCounts: Record<string, number>;
  /** Recently played, newest first, capped. */
  history: HistoryEntry[];
};

/** Volume/repeat/shuffle settings that should survive a page reload. */
export type PlayerSettings = {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Autoplay a similar continuation when the queue runs out. */
  autoplay: boolean;
};

export type ViewMode = "grid" | "list";

/**
 * A playlist as the UI consumes it: either a stored `Playlist` or one of the
 * generated collections (Me gusta / Más escuchadas / Recién escuchadas /
 * Historial), which have no stored items but a computed `trackIds` list.
 */
export type PlaylistView = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  colorAlt: string;
  trackIds: string[];
  updatedAt: number;
  /** Pinned collections that cannot be renamed or deleted. */
  system: boolean;
  /** Generated from play counts / likes / history rather than stored. */
  auto: boolean;
};
