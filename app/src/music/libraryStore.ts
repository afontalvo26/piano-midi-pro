// ============================================================
// music/libraryStore — the player's brain.
//
// A framework-free observable store so playback state can be read from
// outside React (media session handlers, keyboard shortcuts, the transport
// completion callback) without prop drilling through App.tsx.
//
// Persisted under a single key. Deliberately small: only metadata, ids and
// user intent — never note data (see music/types.ts).
// ============================================================

import type {
  HistoryEntry,
  LibraryState,
  PlayerSettings,
  Playlist,
  RepeatMode,
  TrackMeta,
  TrackSourceInfo,
} from "./types";
import type { SongData } from "../types/song";
import { PLAYLIST_EMOJIS, PLAYLIST_PALETTES, mergeTrackMeta, toTrackMeta } from "./meta";

const LIBRARY_KEY = "piano_player_library_v1";
const PLAYER_KEY = "piano_player_settings_v1";
const HISTORY_LIMIT = 120;
const MAX_PLAYLISTS = 200;
const MAX_PLAYLIST_ITEMS = 500;

const LIBRARY_VERSION = 1;

function emptyLibrary(): LibraryState {
  return {
    version: LIBRARY_VERSION,
    tracks: {},
    trackOrder: [],
    playlists: [],
    liked: [],
    playCounts: {},
    history: [],
  };
}

const DEFAULT_SETTINGS: PlayerSettings = {
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: "off",
  autoplay: true,
};

// ── persistence helpers ────────────────────────────────────────

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** localStorage can vanish (private mode) or fill up — never let it throw. */
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled storage — the session keeps working in memory */
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Shuffle that never places the current track first (it is already playing). */
function shuffled(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── state ──────────────────────────────────────────────────────

export type QueueEntry = {
  /** Unique per queue slot so the same track can appear twice. */
  uid: string;
  trackId: string;
  /**
   * `false` marks a slot that was picked to be *shown*, not started (a MIDI
   * imported into the Studio): the engine loads it and waits for the user.
   * A normal slot omits it, which means "play it".
   */
  autoStart?: boolean;
};

export type LibrarySnapshot = {
  library: LibraryState;
  settings: PlayerSettings;
  // ── playback / queue ──
  queue: QueueEntry[];
  /** Index into `queue` of the track currently loaded. -1 when stopped. */
  index: number;
  /** True while a track is loaded but not advancing (paused). */
  paused: boolean;
  /** User requested these tracks play next, ahead of the normal order. */
  playNextQueue: QueueEntry[];
  /** Shuffled traversal order over `queue`, rebuilt when shuffle turns on. */
  shuffleOrder: string[] | null;
  origin: { kind: string; label: string; id?: string } | null;
};

let snapshot: LibrarySnapshot = {
  library: emptyLibrary(),
  settings: { ...DEFAULT_SETTINGS },
  queue: [],
  index: -1,
  paused: true,
  playNextQueue: [],
  shuffleOrder: null,
  origin: null,
};

const listeners = new Set<() => void>();
let libraryDirty = false;
let saveScheduled = false;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Coalesces bursts of mutations (play counts, history) into one write. */
function scheduleSave(): void {
  libraryDirty = true;
  if (saveScheduled) return;
  saveScheduled = true;
  const flush = () => {
    saveScheduled = false;
    if (!libraryDirty) return;
    libraryDirty = false;
    writeJson(LIBRARY_KEY, snapshot.library);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 1200 });
  } else {
    setTimeout(flush, 400);
  }
}

function setState(patch: Partial<LibrarySnapshot>, persist = false): void {
  snapshot = { ...snapshot, ...patch };
  if (persist) scheduleSave();
  emit();
}

function setLibrary(patch: Partial<LibraryState>, persist = true): void {
  setState({ library: { ...snapshot.library, ...patch } }, persist);
}

export function initLibraryStore(): void {
  const stored = readJson<Partial<LibraryState>>(LIBRARY_KEY, {});
  const library: LibraryState = {
    ...emptyLibrary(),
    ...stored,
    tracks: stored.tracks ?? {},
    trackOrder: stored.trackOrder ?? [],
    playlists: Array.isArray(stored.playlists) ? stored.playlists : [],
    liked: Array.isArray(stored.liked) ? stored.liked : [],
    playCounts: stored.playCounts ?? {},
    history: Array.isArray(stored.history) ? stored.history : [],
    version: LIBRARY_VERSION,
  };

  const storedSettings = readJson<Partial<PlayerSettings>>(PLAYER_KEY, {});
  const settings: PlayerSettings = { ...DEFAULT_SETTINGS, ...storedSettings };
  settings.volume = Math.min(1, Math.max(0, settings.volume));

  snapshot = { ...snapshot, library, settings };
  emit();

  // Dev-only handle for the measurement harnesses, same precedent as
  // `__PMP_TRANSPORT__` in App.tsx: lets a script read the *real* queue and
  // index while the bar is playing, instead of inferring them from the DOM.
  // Stripped from production builds; nothing in the app reads it.
  if (import.meta.env.DEV) {
    (window as unknown as { __PMP_PLAYER__?: unknown }).__PMP_PLAYER__ = {
      getSnapshot,
      getCurrentTrackId,
      getTrack,
    };
  }
}

// ── selectors ──────────────────────────────────────────────────

export function getSnapshot(): LibrarySnapshot {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrack(id: string | null | undefined): TrackMeta | undefined {
  if (!id) return undefined;
  return snapshot.library.tracks[id];
}

export function getTrackIds(): string[] {
  return snapshot.library.trackOrder;
}

export function isLiked(id: string): boolean {
  return snapshot.library.liked.includes(id);
}

export function getQueue(): QueueEntry[] {
  return snapshot.queue;
}

export function getCurrentEntry(): QueueEntry | null {
  const { queue, index } = snapshot;
  if (index < 0 || index >= queue.length) return null;
  return queue[index];
}

export function getCurrentTrackId(): string | null {
  return getCurrentEntry()?.trackId ?? null;
}

export function getTrackMetaSafe(id: string | null): TrackMeta | null {
  return getTrack(id) ?? null;
}

// ── catalogue ──────────────────────────────────────────────────

/**
 * Registers parsed songs in the catalogue. Called with the full list every
 * time the demo pack finishes loading, so it must be idempotent and cheap:
 * only changed rows produce a new state object.
 */
export function registerTracks(
  entries: { song: SongData; source: TrackSourceInfo }[],
): void {
  if (entries.length === 0) return;
  const tracks = { ...snapshot.library.tracks };
  const order = [...snapshot.library.trackOrder];
  let changed = false;

  for (const { song, source } of entries) {
    const fresh = toTrackMeta(song, source);
    const previous = tracks[fresh.id];
    const merged = mergeTrackMeta(fresh, previous);
    if (
      !previous ||
      previous.title !== merged.title ||
      previous.artist !== merged.artist ||
      previous.album !== merged.album ||
      previous.duration !== merged.duration ||
      previous.hasLyrics !== merged.hasLyrics ||
      previous.noteCount !== merged.noteCount
    ) {
      changed = true;
    }
    tracks[fresh.id] = merged;
    if (!previous) order.push(fresh.id);
  }

  if (!changed) return;
  setLibrary({ tracks, trackOrder: order });
}

/** Drops tracks that are no longer resolvable (deleted uploads). */
export function pruneTracks(validIds: string[]): void {
  const valid = new Set(validIds);
  const tracks: Record<string, TrackMeta> = {};
  let changed = false;
  for (const [id, meta] of Object.entries(snapshot.library.tracks)) {
    if (valid.has(id)) tracks[id] = meta;
    else changed = true;
  }
  if (!changed) return;
  setLibrary({
    tracks,
    trackOrder: snapshot.library.trackOrder.filter((id) => valid.has(id)),
  });
}

/** Records an explicit play: bumps the counter and stamps `lastPlayedAt`. */
export function recordPlay(trackId: string): void {
  const counts = { ...snapshot.library.playCounts };
  counts[trackId] = (counts[trackId] ?? 0) + 1;

  const meta = snapshot.library.tracks[trackId];
  const tracks = meta
    ? { ...snapshot.library.tracks, [trackId]: { ...meta, lastPlayedAt: Date.now() } }
    : snapshot.library.tracks;

  const history: HistoryEntry[] = [
    { trackId, at: Date.now() },
    ...snapshot.library.history.filter((h) => h.trackId !== trackId),
  ].slice(0, HISTORY_LIMIT);

  setLibrary({ playCounts: counts, tracks, history });
}

export function clearHistory(): void {
  setLibrary({ history: [] });
}

// ── likes ──────────────────────────────────────────────────────

export function toggleLike(trackId: string): boolean {
  const liked = snapshot.library.liked.includes(trackId)
    ? snapshot.library.liked.filter((id) => id !== trackId)
    : [trackId, ...snapshot.library.liked];
  setLibrary({ liked });
  return liked.includes(trackId);
}

// ── playlists ──────────────────────────────────────────────────

export function createPlaylist(input: {
  name: string;
  description?: string;
  emoji?: string;
  color?: string;
  colorAlt?: string;
  trackIds?: string[];
}): Playlist {
  const palette =
    PLAYLIST_PALETTES[snapshot.library.playlists.length % PLAYLIST_PALETTES.length];
  const now = Date.now();
  const playlist: Playlist = {
    id: newId("pl"),
    name: input.name.trim().slice(0, 80) || "Nueva playlist",
    description: (input.description ?? "").slice(0, 200),
    emoji: input.emoji || PLAYLIST_EMOJIS[snapshot.library.playlists.length % PLAYLIST_EMOJIS.length],
    color: input.color || palette.color,
    colorAlt: input.colorAlt || palette.colorAlt,
    items: (input.trackIds ?? []).slice(0, MAX_PLAYLIST_ITEMS).map((trackId) => ({
      trackId,
      addedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
  setLibrary({
    playlists: [playlist, ...snapshot.library.playlists].slice(0, MAX_PLAYLISTS),
  });
  return playlist;
}

export function updatePlaylist(
  id: string,
  patch: Partial<Pick<Playlist, "name" | "description" | "emoji" | "color" | "colorAlt">>,
): void {
  setLibrary({
    playlists: snapshot.library.playlists.map((p) =>
      p.id === id
        ? {
            ...p,
            ...patch,
            name: patch.name !== undefined ? patch.name.trim().slice(0, 80) || p.name : p.name,
            updatedAt: Date.now(),
          }
        : p,
    ),
  });
}

export function deletePlaylist(id: string): void {
  const target = snapshot.library.playlists.find((p) => p.id === id);
  if (!target || target.system) return;
  setLibrary({ playlists: snapshot.library.playlists.filter((p) => p.id !== id) });
}

export function addToPlaylist(id: string, trackIds: string[]): number {
  const target = snapshot.library.playlists.find((p) => p.id === id);
  if (!target || target.system) return 0;

  const existing = new Set(target.items.map((item) => item.trackId));
  const fresh = trackIds.filter((trackId) => !existing.has(trackId));
  if (fresh.length === 0) return 0;

  const now = Date.now();
  const items = [
    ...fresh.map((trackId) => ({ trackId, addedAt: now })),
    ...target.items,
  ].slice(0, MAX_PLAYLIST_ITEMS);

  setLibrary({
    playlists: snapshot.library.playlists.map((p) =>
      p.id === id ? { ...p, items, updatedAt: now } : p,
    ),
  });
  return fresh.length;
}

export function removeFromPlaylist(id: string, trackId: string): void {
  setLibrary({
    playlists: snapshot.library.playlists.map((p) =>
      p.id === id
        ? {
            ...p,
            items: p.items.filter((item) => item.trackId !== trackId),
            updatedAt: Date.now(),
          }
        : p,
    ),
  });
}

export function reorderPlaylist(id: string, from: number, to: number): void {
  const target = snapshot.library.playlists.find((p) => p.id === id);
  if (!target || target.system) return;
  if (from === to || from < 0 || to < 0 || from >= target.items.length) return;

  const items = [...target.items];
  const [moved] = items.splice(from, 1);
  items.splice(Math.min(to, items.length), 0, moved);
  setLibrary({
    playlists: snapshot.library.playlists.map((p) =>
      p.id === id ? { ...p, items, updatedAt: Date.now() } : p,
    ),
  });
}

// ── generated collections ──────────────────────────────────────

/** Track ids for the virtual "Me gusta" playlist, in the order hearted. */
export function likedTrackIds(): string[] {
  const known = snapshot.library.liked.filter((id) => snapshot.library.tracks[id]);
  return known;
}

export function historyTrackIds(): string[] {
  return snapshot.library.history
    .map((h) => h.trackId)
    .filter((id) => snapshot.library.tracks[id]);
}

export function mostPlayedTrackIds(limit = 50): string[] {
  const counts = snapshot.library.playCounts;
  return Object.keys(counts)
    .filter((id) => (counts[id] ?? 0) > 0 && snapshot.library.tracks[id])
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    .slice(0, limit);
}

export function recentlyPlayedTrackIds(limit = 50): string[] {
  return Object.values(snapshot.library.tracks)
    .filter((meta) => meta.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, limit)
    .map((meta) => meta.id);
}

// ── player settings ────────────────────────────────────────────

export function setVolume(volume: number): void {
  const next = Math.min(1, Math.max(0, volume));
  // Dragging the slider is an explicit "I want sound" gesture, so it clears
  // mute. Otherwise a muted player looks broken: the slider moves, nothing
  // plays. Muting itself sets volume-independent state, so this can't loop.
  const settings = { ...snapshot.settings, volume: next, muted: false };
  setState({ settings });
  writeJson(PLAYER_KEY, settings);
}

export function setMuted(muted: boolean): void {
  const settings = { ...snapshot.settings, muted };
  setState({ settings });
  writeJson(PLAYER_KEY, settings);
}

export function toggleMuted(): void {
  setMuted(!snapshot.settings.muted);
}

export function setRepeat(repeat: RepeatMode): void {
  const settings = { ...snapshot.settings, repeat };
  setState({ settings });
  writeJson(PLAYER_KEY, settings);
}

export function cycleRepeat(): RepeatMode {
  const order: RepeatMode[] = ["off", "all", "one"];
  const next = order[(order.indexOf(snapshot.settings.repeat) + 1) % order.length];
  setRepeat(next);
  return next;
}

export function setAutoplay(autoplay: boolean): void {
  const settings = { ...snapshot.settings, autoplay };
  setState({ settings });
  writeJson(PLAYER_KEY, settings);
}

function rebuildShuffle(anchorUid: string | null, queue: QueueEntry[]): string[] {
  const uids = queue.map((entry) => entry.uid);
  if (!anchorUid || !uids.includes(anchorUid)) return shuffled(uids);
  // The anchor stays first: it is the track the user just asked for, so it
  // must play immediately — only *what follows* is randomised.
  return [anchorUid, ...shuffled(uids.filter((uid) => uid !== anchorUid))];
}

export function setShuffle(on: boolean): void {
  const settings = { ...snapshot.settings, shuffle: on };
  const current = getCurrentEntry();
  setState({
    settings,
    shuffleOrder: on ? rebuildShuffle(current?.uid ?? null, snapshot.queue) : null,
  });
  writeJson(PLAYER_KEY, settings);
}

export function toggleShuffle(): boolean {
  const next = !snapshot.settings.shuffle;
  setShuffle(next);
  return next;
}

// ── queue ──────────────────────────────────────────────────────

let uidCounter = 0;
function entryFor(trackId: string): QueueEntry {
  uidCounter += 1;
  return { uid: `q${uidCounter}_${trackId}`, trackId };
}

export function setQueue(
  trackIds: string[],
  startTrackId: string,
  origin: LibrarySnapshot["origin"] = null,
  options: { autoplay?: boolean } = {},
): void {
  const queue = trackIds.map(entryFor);
  const index = Math.max(
    0,
    queue.findIndex((entry) => entry.trackId === startTrackId),
  );
  // `autoplay: false` is the "load it, don't start it" selection (a Studio
  // import, "Tocar" in the library). The flag rides on the slot rather than on
  // the snapshot, so the next genuine selection plays normally instead of
  // inheriting the mute intent.
  if (options.autoplay === false && queue[index]) {
    queue[index] = { ...queue[index], autoStart: false };
  }
  const anchorUid = queue[index]?.uid ?? null;
  setState({
    queue,
    index,
    origin,
    playNextQueue: [],
    // A brand-new queue reshuffles from scratch, anchored on the requested
    // track — reusing the old order would replay it in the previous sequence.
    shuffleOrder: snapshot.settings.shuffle
      ? rebuildShuffle(anchorUid, queue)
      : null,
  });
}

export function addToQueue(trackIds: string[], next = false): void {
  const entries = trackIds.map(entryFor);
  if (entries.length === 0) return;

  if (next) {
    setState({ playNextQueue: [...snapshot.playNextQueue, ...entries] });
    return;
  }
  setState({
    queue: [...snapshot.queue, ...entries],
    shuffleOrder: snapshot.shuffleOrder
      ? [...snapshot.shuffleOrder, ...entries.map((entry) => entry.uid)]
      : null,
  });
}

export function removeFromQueue(uid: string): void {
  const position = snapshot.queue.findIndex((entry) => entry.uid === uid);
  if (position === -1) return;
  const queue = snapshot.queue.filter((entry) => entry.uid !== uid);
  let index = snapshot.index;
  if (position < index) index -= 1;
  else if (position === index) index = Math.min(index, queue.length - 1);
  setState({
    queue,
    index,
    shuffleOrder: snapshot.shuffleOrder?.filter((value) => value !== uid) ?? null,
  });
}

export function reorderQueue(from: number, to: number): void {
  const queue = [...snapshot.queue];
  if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) {
    return;
  }
  const currentUid = queue[snapshot.index]?.uid;
  const [moved] = queue.splice(from, 1);
  queue.splice(to, 0, moved);
  const index = currentUid ? queue.findIndex((entry) => entry.uid === currentUid) : snapshot.index;
  setState({ queue, index: index === -1 ? snapshot.index : index });
}

export function clearUpcoming(): void {
  const current = getCurrentEntry();
  setState({
    queue: current ? [current] : [],
    index: current ? 0 : -1,
    playNextQueue: [],
    shuffleOrder: current ? [current.uid] : null,
  });
}

export function setIndex(index: number): void {
  if (index < 0 || index >= snapshot.queue.length) return;
  setState({ index });
}

export function setIndexByUid(uid: string): void {
  const index = snapshot.queue.findIndex((entry) => entry.uid === uid);
  if (index === -1) return;
  setState({ index, playNextQueue: snapshot.playNextQueue.filter((e) => e.uid !== uid) });
}

/**
 * Mete `trackId` justo delante de la ranura actual y salta a ella.
 *
 * Lo usa "canción anterior" cuando la actual es la PRIMERA de la cola (no hay
 * ranura anterior que recorrer): en vez de reiniciar la misma canción desde una
 * posición de 1-2 s —que se siente como que el botón no hace nada— se vuelve a
 * la última que sonó antes, sin perder la cola.
 */
export function insertBeforeCurrent(trackId: string): boolean {
  if (!snapshot.library.tracks[trackId]) return false;
  const entry = entryFor(trackId);
  const at = snapshot.index < 0 ? 0 : snapshot.index;
  const queue = [...snapshot.queue];
  queue.splice(at, 0, entry);
  setState({
    queue,
    index: at,
    playNextQueue: snapshot.playNextQueue,
    shuffleOrder: snapshot.shuffleOrder ? [entry.uid, ...snapshot.shuffleOrder] : null,
  });
  return true;
}

/** Pops the next entry that the user explicitly queued with "reproducir siguiente". */
export function consumePlayNext(): QueueEntry | null {
  if (snapshot.playNextQueue.length === 0) return null;
  const [head, ...rest] = snapshot.playNextQueue;
  setState({ playNextQueue: rest });
  return head;
}

export function setPaused(paused: boolean): void {
  if (snapshot.paused === paused) return;
  setState({ paused });
}

export function setOrigin(origin: LibrarySnapshot["origin"]): void {
  setState({ origin });
}

/** The linear (non-shuffled) position of the current track. */
export function currentIndex(): number {
  return snapshot.index;
}

export const libraryStore = {
  init: initLibraryStore,
  subscribe,
  getSnapshot,
  getTrack,
  getTrackIds,
  getCurrentTrackId,
  getCurrentEntry,
  isLiked,
  registerTracks,
  pruneTracks,
  recordPlay,
  clearHistory,
  toggleLike,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  reorderPlaylist,
  likedTrackIds,
  historyTrackIds,
  mostPlayedTrackIds,
  recentlyPlayedTrackIds,
  setVolume,
  setMuted,
  toggleMuted,
  setRepeat,
  cycleRepeat,
  setAutoplay,
  setShuffle,
  toggleShuffle,
  setQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearUpcoming,
  setIndex,
  setIndexByUid,
  insertBeforeCurrent,
  consumePlayNext,
  setPaused,
  setOrigin,
};
