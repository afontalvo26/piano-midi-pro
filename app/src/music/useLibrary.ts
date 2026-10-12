// ============================================================
// music/useLibrary — the UI's read path into the library store.
//
// Thin wrapper over `useSyncExternalStore` so shelves, grids and dialogs all
// observe the exact same snapshot (and therefore cannot disagree about, say,
// whether a playlist still exists).
// ============================================================

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { libraryStore as store, type LibrarySnapshot } from "./libraryStore";
import { AUTO_PLAYLIST_IDS, paletteFor } from "./meta";
import type { PlaylistView, TrackMeta } from "./types";

const SUBSCRIBE = store.subscribe.bind(store);
const GET_SNAPSHOT = store.getSnapshot.bind(store);

export type UseLibraryResult = {
  /** Every known track, in catalogue order. */
  tracks: TrackMeta[];
  byId: Record<string, TrackMeta>;
  playlists: PlaylistView[];
  /** The four generated collections, always present. */
  autoPlaylists: PlaylistView[];
  likedIds: string[];
  historyIds: string[];
  mostPlayedIds: string[];
  recentlyPlayedIds: string[];
  playCounts: Record<string, number>;
  /** Distinct artists, alphabetical. */
  artists: string[];
  /** Distinct "albums" (per-artist packs), alphabetical. */
  albums: string[];
  /** Genre → track count, only for genres actually present. */
  genreCounts: Map<string, number>;
  getTrack: (id: string | null | undefined) => TrackMeta | undefined;
  getPlaylist: (id: string) => PlaylistView | null;
  /** Resolves a mixed list of ids to metadata, dropping unknown ones. */
  resolveMany: (ids: string[]) => TrackMeta[];
  totalDuration: (ids: string[]) => number;
};

function buildAutoPlaylists(
  library: LibrarySnapshot["library"],
  liked: string[],
  history: string[],
  mostPlayed: string[],
  recent: string[],
): PlaylistView[] {
  const now = Date.now();
  const known = (id: string) => Boolean(library.tracks[id]);
  return [
    {
      id: AUTO_PLAYLIST_IDS.liked,
      name: "Me gusta",
      description: "Las canciones que marcaste con el corazón",
      emoji: "❤️",
      ...paletteFor("liked"),
      trackIds: liked.filter(known),
      updatedAt: now,
      system: true,
      auto: true,
    },
    {
      id: AUTO_PLAYLIST_IDS.mostPlayed,
      name: "Más escuchadas",
      description: "Tu top por cantidad de reproducciones",
      emoji: "📈",
      ...paletteFor("mostPlayed"),
      trackIds: mostPlayed.filter(known),
      updatedAt: now,
      system: true,
      auto: true,
    },
    {
      id: AUTO_PLAYLIST_IDS.recent,
      name: "Recién escuchadas",
      description: "Lo último que sonó en tu biblioteca",
      emoji: "🕒",
      ...paletteFor("recent"),
      trackIds: recent.filter(known),
      updatedAt: now,
      system: true,
      auto: true,
    },
    {
      id: AUTO_PLAYLIST_IDS.history,
      name: "Historial",
      description: "Todo lo que pasó por el reproductor",
      emoji: "🕰️",
      ...paletteFor("history"),
      trackIds: history.filter(known),
      updatedAt: now,
      system: true,
      auto: true,
    },
  ];
}

export function useLibrary(): UseLibraryResult {
  const snapshot = useSyncExternalStore(SUBSCRIBE, GET_SNAPSHOT, GET_SNAPSHOT);
  const { library } = snapshot;

  const tracks = useMemo(
    () =>
      library.trackOrder
        .map((id) => library.tracks[id])
        .filter((meta): meta is TrackMeta => Boolean(meta)),
    [library.trackOrder, library.tracks],
  );

  const likedIds = useMemo(
    () => library.liked.filter((id) => library.tracks[id]),
    [library.liked, library.tracks],
  );

  const historyIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of library.history) {
      if (seen.has(entry.trackId)) continue;
      if (!library.tracks[entry.trackId]) continue;
      seen.add(entry.trackId);
      out.push(entry.trackId);
    }
    return out;
  }, [library.history, library.tracks]);

  const mostPlayedIds = useMemo(
    () =>
      Object.keys(library.playCounts)
        .filter((id) => library.tracks[id] && library.playCounts[id] > 0)
        .sort((a, b) => library.playCounts[b] - library.playCounts[a]),
    [library.playCounts, library.tracks],
  );

  const recentlyPlayedIds = useMemo(
    () =>
      Object.values(library.tracks)
        .filter((meta) => (meta.lastPlayedAt ?? 0) > 0)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
        .map((meta) => meta.id),
    [library.tracks],
  );

  const playlists = useMemo<PlaylistView[]>(
    () =>
      library.playlists.map((playlist) => ({
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
      })),
    [library.playlists],
  );

  const autoPlaylists = useMemo(
    () =>
      buildAutoPlaylists(library, likedIds, historyIds, mostPlayedIds, recentlyPlayedIds),
    [library, likedIds, historyIds, mostPlayedIds, recentlyPlayedIds],
  );

  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const meta of tracks) if (meta.artist) set.add(meta.artist);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [tracks]);

  const albums = useMemo(() => {
    const set = new Set<string>();
    for (const meta of tracks) if (meta.album) set.add(meta.album);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [tracks]);

  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meta of tracks) {
      if (!meta.genre) continue;
      counts.set(meta.genre, (counts.get(meta.genre) ?? 0) + 1);
    }
    return counts;
  }, [tracks]);

  const getTrack = useCallback(
    (id: string | null | undefined) => (id ? library.tracks[id] : undefined),
    [library.tracks],
  );

  const getPlaylist = useCallback(
    (id: string) => {
      const auto = autoPlaylists.find((playlist) => playlist.id === id);
      if (auto) return auto;
      return playlists.find((playlist) => playlist.id === id) ?? null;
    },
    [autoPlaylists, playlists],
  );

  const resolveMany = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => library.tracks[id])
        .filter((meta): meta is TrackMeta => Boolean(meta)),
    [library.tracks],
  );

  const totalDuration = useCallback(
    (ids: string[]) =>
      ids.reduce((sum, id) => sum + (library.tracks[id]?.duration ?? 0), 0),
    [library.tracks],
  );

  return {
    tracks,
    byId: library.tracks,
    playlists,
    autoPlaylists,
    likedIds,
    historyIds,
    mostPlayedIds,
    recentlyPlayedIds,
    playCounts: library.playCounts,
    artists,
    albums,
    genreCounts,
    getTrack,
    getPlaylist,
    resolveMany,
    totalDuration,
  };
}

export { AUTO_PLAYLIST_IDS };
