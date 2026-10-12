// ============================================================
// music/PlayerContext — orchestration layer for the player.
//
// Two halves talk through a small "bridge":
//
//   • this context owns *intent*  — the queue, what plays next, shuffle,
//     repeat, likes, play counts, media session, keyboard shortcuts
//   • App.tsx owns *the engine*  — Tone.Transport, the samplers and the
//     notes. It registers callbacks in `bridge` on mount.
//
// That split is deliberate: App.tsx is 5.8 kLOC and its transport code is
// load-bearing, so the player drives it instead of replacing it.
//
// Rendering note: the playhead is NEVER React state here. It advances at
// 60 fps and publishing it from this provider would re-render the entire app
// shell on every frame. Consumers read it imperatively through
// `getPosition()` and animate their own DOM (see PlayerBar), or sample it in
// a local ref (see NowPlaying's lyrics highlight).
// ============================================================

/* eslint-disable react-refresh/only-export-components */
// ^ Same convention as contexts/AudioContext.tsx and friends: this file exports
//   the provider component plus the `usePlayer` hook, which fast refresh cannot
//   split without a second module and a circular import.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SongData } from "../types/song";
import type { PlaylistView, QueueOriginKind, RepeatMode, TrackMeta } from "./types";
import { RESTART_THRESHOLD } from "./constants";
import {
  libraryStore as store,
  type LibrarySnapshot,
  type QueueEntry,
} from "./libraryStore";
import { TrackUnavailableError, prefetchTrack, putSessionSong, resolveTrack } from "./resolve";

// ── bridge between App.tsx (engine) and the player (intent) ─────

export type PlaybackHost = {
  /** Loads a song into the engine without starting it. */
  load: (song: SongData) => void;
  /**
   * Starts playback from `offsetSec`. Resolves once the engine is actually
   * running — building the audio graph can take a moment on a cold start.
   */
  play: (offsetSec?: number) => void | Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  setVolume: (volume: number, muted: boolean) => void;
  /** Authoritative playhead of the engine, in seconds. */
  getPosition: () => number;
  /** Engine reports the track reached its end naturally. */
  onEnded?: () => void;
};

export type PlayerContextValue = {
  // current
  currentTrackId: string | null;
  current: TrackMeta | null;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  /** True until a track has been loaded at least once. */
  idle: boolean;
  // modes
  shuffle: boolean;
  repeat: RepeatMode;
  autoplay: boolean;
  volume: number;
  muted: boolean;
  // collections
  queue: QueueEntry[];
  queueIndex: number;
  queueOrigin: LibrarySnapshot["origin"];
  likedIds: string[];
  historyIds: string[];
  playCounts: Record<string, number>;
  resolvedIds: Set<string>;
  // transport commands
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (sec: number, options?: { relative?: boolean }) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  /** Advances the mode and returns the new one (for toasts). */
  cycleRepeat: () => RepeatMode;
  setAutoplay: (on: boolean) => void;
  // queue commands
  playTrack: (trackId: string) => void;
  playCollection: (
    trackIds: string[],
    options?: {
      startAt?: string;
      origin?: { kind: QueueOriginKind; label: string; id?: string };
    },
  ) => void;
  addToQueue: (trackIds: string[], next?: boolean) => void;
  removeFromQueue: (uid: string) => void;
  reorderQueue: (from: number, to: number) => void;
  jumpToQueueIndex: (index: number) => void;
  clearUpcoming: () => void;
  startRadio: (seedTrackId: string) => void;
  // likes
  toggleLike: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
  // collections
  getPlaylistView: (id: string) => PlaylistView | null;
  // engine glue
  registerBridge: (host: PlaybackHost) => void;
  /** Imperative playhead read (seconds). Not reactive by design. */
  getPosition: () => number;
  /** Called by App when the loaded track reaches its natural end. */
  notifyEnded: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

const RADIO_SIZE = 25;

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(() => store.getSnapshot());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());

  const bridgeRef = useRef<PlaybackHost | null>(null);
  const loadTokenRef = useRef(0);
  /** Guards against the engine's completion callback firing twice. */
  const advancingRef = useRef(false);
  /** Fallback playhead for when no engine is attached yet. */
  const positionRef = useRef(0);

  // ── store subscription ────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot()));
    // Hydrate from the store once on mount. Deferred to a microtask because
    // `initLibraryStore()` already ran in main.tsx, so this is a no-op in
    // practice — but it must not become a synchronous cascading render if the
    // store ever gains async hydration.
    queueMicrotask(() => setSnapshot(store.getSnapshot()));
    return unsubscribe;
  }, []);

  const { library, settings, queue, index, origin } = snapshot;
  const currentEntry = index >= 0 && index < queue.length ? queue[index] : null;
  const currentTrackId = currentEntry?.trackId ?? null;
  const current = currentTrackId ? library.tracks[currentTrackId] ?? null : null;
  const duration = current?.duration ?? 0;

  // ── engine glue ───────────────────────────────────────────────

  const registerBridge = useCallback((host: PlaybackHost) => {
    bridgeRef.current = host;
  }, []);

  /** Imperative playhead read — the engine is authoritative when attached. */
  const getPosition = useCallback(() => {
    const host = bridgeRef.current;
    if (!host) return positionRef.current;
    const value = host.getPosition();
    positionRef.current = value;
    return value;
  }, []);

  /** Picks the next queue entry honouring "play next", shuffle and repeat. */
  const computeNext = useCallback((): { index: number; entry: QueueEntry } | null => {
    const state = store.getSnapshot();
    const { queue: q, index: i, settings: s } = state;
    if (q.length === 0) return null;

    // Explicit "reproducir siguiente" always wins over the traversal order.
    const explicit = store.consumePlayNext();
    if (explicit) {
      const found = q.findIndex((entry) => entry.uid === explicit.uid);
      if (found !== -1) return { index: found, entry: q[found] };
    }

    if (s.shuffle && state.shuffleOrder && state.shuffleOrder.length > 0) {
      const order = state.shuffleOrder.filter((uid) =>
        q.some((entry) => entry.uid === uid),
      );
      if (order.length === 0) return null;

      const currentUid = q[i]?.uid;
      const cursor = currentUid ? order.indexOf(currentUid) : -1;
      // A track that is not in the shuffled order (just queued) plays first;
      // afterwards we continue from the top of the order.
      const nextPosition = cursor === -1 ? 0 : cursor + 1;
      const atEnd = nextPosition >= order.length;

      if (atEnd && s.repeat === "off") return null;
      const uid = order[atEnd ? 0 : nextPosition];
      const found = q.findIndex((entry) => entry.uid === uid);
      return found === -1 ? null : { index: found, entry: q[found] };
    }

    if (i + 1 < q.length) return { index: i + 1, entry: q[i + 1] };
    if (s.repeat === "all") return { index: 0, entry: q[0] };
    return null;
  }, []);

  const computeNextRef = useRef(computeNext);
  useEffect(() => {
    computeNextRef.current = computeNext;
  }, [computeNext]);

  /**
   * Self-reference for `loadEntry`'s skip-broken-track recursion. Going through
   * a ref (rather than calling `loadEntry` directly) keeps the callback's
   * identity stable and avoids the temporal-dead-zone reference the linter
   * flags when a `useCallback` names itself.
   */
  const loadEntryRef = useRef<
    ((targetIndex: number, playNow: boolean, offset?: number, depth?: number) => Promise<void>) | null
  >(null);

  /** Loads a queue entry into the engine and optionally starts playback. */
  const loadEntry = useCallback(
    async (targetIndex: number, playNow: boolean, offset = 0, depth = 0) => {
      const state = store.getSnapshot();
      const entry = state.queue[targetIndex];
      if (!entry) return;

      const token = ++loadTokenRef.current;
      setIsLoading(true);
      setError(null);

      let song: SongData;
      try {
        song = await resolveTrack(entry.trackId);
      } catch (err) {
        if (token !== loadTokenRef.current) return;
        setIsLoading(false);
        setError(
          err instanceof TrackUnavailableError
            ? err.message
            : "No se pudo cargar la canción",
        );
        // Don't stall the queue on one broken track: hop to the next one.
        // Capped, because a completely unresolvable queue (every file moved
        // away) would otherwise walk the whole list and blow the render depth.
        const hop = computeNextRef.current();
        if (hop && depth < 3) {
          store.setIndex(hop.index);
          void loadEntryRef.current?.(hop.index, true, 0, depth + 1);
        } else {
          setIsPlaying(false);
          if (depth >= 3) {
            setError(
              "No se pudo reproducir: las canciones de esta lista ya no están disponibles.",
            );
          }
        }
        return;
      }

      if (token !== loadTokenRef.current) return;

      putSessionSong(song);
      setResolvedIds((prev) => {
        if (prev.has(entry.trackId)) return prev;
        const next = new Set(prev);
        next.add(entry.trackId);
        return next;
      });

      positionRef.current = offset;
      const host = bridgeRef.current;
      host?.load(song);
      setIsLoading(false);
      setIsPlaying(playNow);

      if (playNow) {
        store.recordPlay(entry.trackId);
        // The engine may still be building its audio graph on a cold start;
        // `play` resolves once the transport is genuinely running.
        void Promise.resolve(host?.play(offset)).catch(() => {
          setIsPlaying(false);
        });
      }
    },
    [],
  );

  // Load whenever the *slot* changes (uid, not trackId — the same song can
  // legitimately occupy two slots).
  const loadedUidRef = useRef<string | null>(null);

  // Keep `loadEntryRef` pointing at the current callback.
  useEffect(() => {
    loadEntryRef.current = loadEntry;
  }, [loadEntry]);

  useEffect(() => {
    if (!currentEntry) {
      loadedUidRef.current = null;
      return;
    }
    if (loadedUidRef.current === currentEntry.uid) return;
    loadedUidRef.current = currentEntry.uid;
    void loadEntryRef.current?.(index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.uid]);

  // Prefetch the upcoming track so advancing feels instant.
  useEffect(() => {
    const upcoming = queue[index + 1];
    if (upcoming) prefetchTrack(upcoming.trackId);
  }, [queue, index]);

  // Push volume into the engine whenever it changes.
  useEffect(() => {
    bridgeRef.current?.setVolume(settings.volume, settings.muted);
  }, [settings.volume, settings.muted]);

  // ── transport commands (stable identities) ────────────────────

  const play = useCallback(() => {
    const state = store.getSnapshot();
    if (state.index < 0 || state.queue.length === 0) {
      // Nothing queued yet: play the whole library.
      const ids = store.getTrackIds();
      if (ids.length === 0) return;
      store.setQueue(ids, ids[0], { kind: "library", label: "Toda la biblioteca" });
      return;
    }
    const entry = state.queue[state.index];
    store.recordPlay(entry.trackId);
    setIsPlaying(true);
    // `play` may need to build the audio engine first, so it can reject.
    void Promise.resolve(bridgeRef.current?.play(positionRef.current)).catch(() => {
      setIsPlaying(false);
    });
  }, []);

  const pause = useCallback(() => {
    bridgeRef.current?.pause();
    store.setPaused(true);
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (store.getSnapshot().paused) play();
    else pause();
  }, [pause, play]);

  const next = useCallback(() => {
    const target = computeNextRef.current();
    if (target) {
      store.setIndex(target.index);
      return;
    }
    if (store.getSnapshot().settings.repeat === "one") {
      positionRef.current = 0;
      bridgeRef.current?.seek(0);
      store.recordPlay(store.getCurrentTrackId() ?? "");
      bridgeRef.current?.play(0);
      setIsPlaying(true);
      return;
    }
    pause();
  }, [pause]);

  const previous = useCallback(() => {
    // Spotify's rule: past a few seconds, "previous" restarts the track.
    if (getPosition() > RESTART_THRESHOLD) {
      positionRef.current = 0;
      bridgeRef.current?.seek(0);
      return;
    }
    const state = store.getSnapshot();
    const { queue: q, index: i, settings: s, shuffleOrder } = state;

    if (s.shuffle && shuffleOrder && shuffleOrder.length > 0) {
      const currentUid = q[i]?.uid;
      const cursor = currentUid ? shuffleOrder.indexOf(currentUid) : -1;
      const anchor = cursor === -1 ? 0 : cursor;
      const previousUid =
        shuffleOrder[(anchor - 1 + shuffleOrder.length) % shuffleOrder.length];
      const found = q.findIndex((entry) => entry.uid === previousUid);
      if (found !== -1 && found !== i) {
        store.setIndex(found);
        return;
      }
    }
    if (i > 0) {
      store.setIndex(i - 1);
      return;
    }
    if (s.repeat === "all" && q.length > 0) {
      store.setIndex(q.length - 1);
      return;
    }
    positionRef.current = 0;
    bridgeRef.current?.seek(0);
  }, [getPosition]);

  const seek = useCallback((value: number, options?: { relative?: boolean }) => {
    const meta = store.getTrack(store.getCurrentTrackId());
    const max = meta?.duration ?? 0;
    const target = options?.relative ? getPosition() + value : value;
    const clamped = max > 0 ? Math.min(Math.max(0, target), max) : Math.max(0, target);
    positionRef.current = clamped;
    bridgeRef.current?.seek(clamped);
  }, [getPosition]);

  const setVolume = useCallback((volume: number) => store.setVolume(volume), []);
  const toggleMute = useCallback(() => store.toggleMuted(), []);
  const toggleShuffle = useCallback(() => store.toggleShuffle(), []);
  const cycleRepeat = useCallback(() => store.cycleRepeat(), []);
  const setAutoplay = useCallback((on: boolean) => store.setAutoplay(on), []);

  // ── collection commands ───────────────────────────────────────

  const playTrack = useCallback((trackId: string) => {
    if (!store.getTrack(trackId)) return;
    const rest = store.getTrackIds().filter((id) => id !== trackId);
    store.setQueue([trackId, ...rest], trackId, {
      kind: "track",
      label: "Reproducción",
    });
  }, []);

  const playCollection = useCallback<PlayerContextValue["playCollection"]>(
    (trackIds, options) => {
      const ids = uniqueIds(trackIds).filter((id) => store.getTrack(id));
      if (ids.length === 0) return;
      const startAt =
        options?.startAt && ids.includes(options.startAt) ? options.startAt : ids[0];
      store.setQueue(ids, startAt, options?.origin ?? null);
    },
    [],
  );

  const addToQueue = useCallback(
    (trackIds: string[], next = false) => store.addToQueue(trackIds, next),
    [],
  );
  const removeFromQueue = useCallback((uid: string) => store.removeFromQueue(uid), []);
  const reorderQueue = useCallback(
    (from: number, to: number) => store.reorderQueue(from, to),
    [],
  );
  const jumpToQueueIndex = useCallback((target: number) => store.setIndex(target), []);
  const clearUpcoming = useCallback(() => store.clearUpcoming(), []);

  /** Radio: the seed, then its artist, its genre, then the rest, shuffled. */
  const startRadio = useCallback((seedTrackId: string) => {
    const seed = store.getTrack(seedTrackId);
    if (!seed) return;
    const all = store.getTrackIds();
    const sameArtist = all.filter(
      (id) => id !== seedTrackId && store.getTrack(id)?.artist === seed.artist,
    );
    const sameGenre = all.filter(
      (id) => id !== seedTrackId && store.getTrack(id)?.genre === seed.genre,
    );
    const ordered = uniqueIds([
      seedTrackId,
      ...sameArtist,
      ...sameGenre,
      ...all.filter((id) => id !== seedTrackId),
    ]).slice(0, RADIO_SIZE);

    // Radio means "keep it going", so make the surrounding modes agree:
    // shuffle on, and repeat all so it does not stop after a single pass.
    if (!store.getSnapshot().settings.shuffle) store.setShuffle(true);
    if (store.getSnapshot().settings.repeat === "off") store.setRepeat("all");
    store.setQueue(ordered, seedTrackId, {
      kind: "radio",
      label: `Radio de ${seed.artist || seed.title}`,
      id: seed.artist,
    });
  }, []);

  const toggleLike = useCallback((trackId: string) => store.toggleLike(trackId), []);
  const isLiked = useCallback(
    (trackId: string) => library.liked.includes(trackId),
    [library.liked],
  );

  const getPlaylistView = useCallback(
    (id: string): PlaylistView | null => {
      const playlist = library.playlists.find((p) => p.id === id);
      if (!playlist) return null;
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
    },
    [library.playlists],
  );

  // ── engine end-of-track callback ──────────────────────────────

  const notifyEnded = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 300);

    const state = store.getSnapshot();
    if (state.settings.repeat === "one") {
      positionRef.current = 0;
      bridgeRef.current?.seek(0);
      bridgeRef.current?.play(0);
      setIsPlaying(true);
      return;
    }
    const target = computeNextRef.current();
    if (target) {
      store.setIndex(target.index);
      return;
    }
    // Queue exhausted → radio continuation when autoplay is on.
    if (state.settings.autoplay) {
      const seed = store.getCurrentTrackId();
      if (seed) {
        startRadio(seed);
        return;
      }
    }
    positionRef.current = 0;
    bridgeRef.current?.seek(0);
    setIsPlaying(false);
    store.setPaused(true);
  }, [startRadio]);

  // ── public value ──────────────────────────────────────────────

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrackId,
      current,
      duration,
      isPlaying,
      isLoading,
      error,
      idle: !currentEntry,
      shuffle: settings.shuffle,
      repeat: settings.repeat,
      autoplay: settings.autoplay,
      volume: settings.volume,
      muted: settings.muted,
      queue,
      queueIndex: index,
      queueOrigin: origin,
      likedIds: library.liked,
      historyIds: library.history.map((entry) => entry.trackId),
      playCounts: library.playCounts,
      resolvedIds,
      play,
      pause,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setAutoplay,
      playTrack,
      playCollection,
      addToQueue,
      removeFromQueue,
      reorderQueue,
      jumpToQueueIndex,
      clearUpcoming,
      startRadio,
      toggleLike,
      isLiked,
      getPlaylistView,
      registerBridge,
      getPosition,
      notifyEnded,
    }),
    [
      currentTrackId,
      current,
      duration,
      isPlaying,
      isLoading,
      error,
      currentEntry,
      settings,
      queue,
      index,
      origin,
      library.liked,
      library.history,
      library.playCounts,
      resolvedIds,
      play,
      pause,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setAutoplay,
      playTrack,
      playCollection,
      addToQueue,
      removeFromQueue,
      reorderQueue,
      jumpToQueueIndex,
      clearUpcoming,
      startRadio,
      toggleLike,
      isLiked,
      getPlaylistView,
      registerBridge,
      getPosition,
      notifyEnded,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error("usePlayer debe usarse dentro de <PlayerProvider>");
  }
  return value;
}
