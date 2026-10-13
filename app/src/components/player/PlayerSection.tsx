// ============================================================
// components/player/PlayerSection — everything the player needs from App.
//
// App.tsx is a 5.8 kLOC component and the player adds a lot of surface:
// engine bridge, queue drawer, now-playing view, share/playlist dialogs, the
// track context menu. Bundling all of it here keeps that file's diff to a few
// lines — App renders <PlayerSection> and hands it the engine callbacks.
//
// The bridge is one-directional by design: App owns Tone.Transport and the
// samplers, this component owns the queue and asks the engine to load/play.
// ============================================================

/* eslint-disable react-refresh/only-export-components */
// ^ Same convention as contexts/AudioContext.tsx and friends: the file exports
//   the component plus the `usePlayerUi` hook, which fast refresh cannot split.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, MouseEvent } from "react";
import type { TrackMeta } from "../../music/types";
import type { LyricLine } from "../../types/song";
import { usePlayer, type PlaybackHost } from "../../music/PlayerContext";
import { useLibrary } from "../../music/useLibrary";
import { useMediaSession } from "../../music/useMediaSession";
import { ENDED_TOLERANCE } from "../../music/constants";
import { isDemoMeta } from "../../music/ids";
import { getSessionSong } from "../../music/resolve";
import { toast } from "../../music/toast";
import { useLocalStorageState } from "../../utils/settings";
import { LyricsPanel } from "../studio/LyricsPanel";
import { PlayerBar } from "./PlayerBar";
import { NowPlaying } from "./NowPlaying";
import { QueuePanel } from "./QueuePanel";
import { TrackMenu } from "./TrackMenu";
import { ShareDialog, type SharePayload } from "./ShareDialog";
import { PlaylistDialog } from "./PlaylistDialog";
import { DetailsDialog } from "./DetailsDialog";
import { ToastHost } from "./ToastHost";
import "./player.css";

/**
 * Imperative surface the player offers to the rest of the app: opening the
 * context menu, the share sheet, the playlist dialogs… The library screen is
 * a sibling of the overlays, so this travels through context instead of
 * threading a dozen callbacks down the tree.
 */
export type PlayerUiApi = {
  openTrackMenu: (meta: TrackMeta, event: MouseEvent<HTMLElement>) => void;
  addToPlaylist: (trackIds: string[]) => void;
  createPlaylist: (seedTrackIds?: string[]) => void;
  editPlaylist: (playlistId: string) => void;
  shareTrack: (meta: TrackMeta) => void;
  sharePlaylist: (playlistId: string) => void;
  showDetails: (meta: TrackMeta) => void;
  toggleQueue: () => void;
  openNowPlaying: () => void;
  /** Loads the track into the Studio engine (no playback change). */
  practice: (meta: TrackMeta) => void;
  /** Jumps to the sheet-music screen for the loaded track. */
  openScore: (meta: TrackMeta) => void;
  /** Jumps to the rhythm game with the track loaded. */
  openGame: (meta: TrackMeta) => void;
  /** True when the destination screens exist in this render of the app. */
  canPractice: boolean;
  canOpenScore: boolean;
  canOpenGame: boolean;
};

const PlayerUiContext = createContext<PlayerUiApi | null>(null);

/** Player UI commands. Throws when used outside <PlayerSection>. */
export function usePlayerUi(): PlayerUiApi {
  const api = useContext(PlayerUiContext);
  if (!api) {
    throw new Error("usePlayerUi debe usarse dentro de <PlayerSection>");
  }
  return api;
}

export type PlayerSectionProps = {
  /** Engine hookups — see PlaybackHost. */
  bridge: Omit<PlaybackHost, "onEnded" | "getPosition">;
  /** Imperative playhead read from the transport. */
  getPosition: () => number;
  /**
   * Reported when a track reaches its natural end. Called AFTER the player's
   * own `next()` decision, so App only needs to stop the engine.
   */
  onTrackFinished?: () => void;
  onOpenStudio?: (meta: TrackMeta) => void;
  onOpenScore?: (meta: TrackMeta) => void;
  onOpenGame?: (meta: TrackMeta) => void;
  /** True when sheet music is available for the current track. */
  hasScore?: boolean;
  /**
   * Content that should be able to call `usePlayerUi()` — the library screen
   * and anything else rendered inside the app shell.
   */
  children?: ReactNode;
};

export function PlayerSection({
  bridge,
  getPosition,
  onTrackFinished,
  onOpenStudio,
  onOpenScore,
  onOpenGame,
  hasScore = false,
  children,
}: PlayerSectionProps) {
  const player = usePlayer();
  const library = useLibrary();

  const [queueOpen, setQueueOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  /**
   * Panel de letra de la zona derecha. Se persiste igual que el resto de los
   * ajustes del reproductor (`useLocalStorageState`), así que sobrevive a un
   * recargue y el reproductor del 1235 lo hereda sin tocar su carpeta: el estado
   * vive acá porque acá vive la barra que lo dispara.
   */
  const [lyricsOpen, setLyricsOpen] = useLocalStorageState(
    "pm_lyrics_open",
    false,
  );
  /** Reloj del panel de letra, muestreado a ~10 Hz (no 60: la letra no lo pide). */
  const [lyricsTime, setLyricsTime] = useState(0);
  const [menu, setMenu] = useState<{ meta: TrackMeta; x: number; y: number } | null>(null);
  const [share, setShare] = useState<SharePayload | null>(null);
  const [playlistDialog, setPlaylistDialog] = useState<
    | { mode: "create"; seedTrackIds?: string[] }
    | { mode: "edit"; playlistId: string }
    | { mode: "addTo"; trackIds: string[] }
    | null
  >(null);
  const [details, setDetails] = useState<TrackMeta | null>(null);

  // ── engine bridge ─────────────────────────────────────────────
  // Held in a ref so the registered host object stays referentially stable
  // (registering a new one on every render would thrash the provider).
  const latest = useRef({ bridge, getPosition, onTrackFinished });

  // Ref writes belong in an effect, not in the render body.
  useEffect(() => {
    latest.current = { bridge, getPosition, onTrackFinished };
  });

  useEffect(() => {
    player.registerBridge({
      load: (song) => latest.current.bridge.load(song),
      play: (offset) => latest.current.bridge.play(offset),
      pause: () => latest.current.bridge.pause(),
      stop: () => latest.current.bridge.stop(),
      seek: (sec) => latest.current.bridge.seek(sec),
      setVolume: (volume, muted) => latest.current.bridge.setVolume(volume, muted),
      getPosition: () => latest.current.getPosition(),
      onEnded: () => latest.current.onTrackFinished?.(),
    });
    // registerBridge is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── end-of-track detection ────────────────────────────────────
  // App's rAF loop resets the transport to 0 when a song finishes. We sample
  // the playhead and remember the highest value reached; a stop that follows a
  // value within `ENDED_TOLERANCE` of the duration is a natural end, anything
  // else was the user hitting stop or switching tracks.
  const lastPositionRef = useRef(0);
  const wasPlayingRef = useRef(false);
  /** High-water mark of the playhead, updated by PlayerBar's rAF loop. */
  const handlePosition = useCallback((position: number) => {
    if (position > lastPositionRef.current) lastPositionRef.current = position;
  }, []);

  const { isPlaying, duration, currentTrackId } = player;

  // Reset the high-water mark whenever a new track loads.
  useEffect(() => {
    lastPositionRef.current = 0;
    wasPlayingRef.current = false;
  }, [currentTrackId]);

  useEffect(() => {
    // Falling edge of `isPlaying` is where a completed track is detectable.
    if (wasPlayingRef.current && !isPlaying && duration > 0) {
      const reached = lastPositionRef.current;
      const finishedNaturally = reached >= duration * ENDED_TOLERANCE;
      if (finishedNaturally && !player.idle) {
        player.notifyEnded();
      }
    }
    wasPlayingRef.current = isPlaying;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, duration]);

  // ── media session + keyboard shortcuts ────────────────────────
  useMediaSession(player, {
    onOpenNowPlaying: () => setNowPlayingOpen(true),
  });

  // ── letra ─────────────────────────────────────────────────────
  //
  // La letra vive en el `SongData` ya parseado, que sólo está en la caché de
  // `music/resolve` (es pesado y nunca se persiste). `resolvedIds` hace de
  // portera: sin eso se consultaría una canción que todavía no se cargó.
  const lyrics: LyricLine[] = useMemo(() => {
    if (!currentTrackId || !player.resolvedIds.has(currentTrackId)) return [];
    return getSessionSong(currentTrackId)?.lyrics ?? [];
  }, [currentTrackId, player.resolvedIds]);

  /**
   * El botón se habilita con la pista marcada como "trae letra" (dato barato y
   * persistido, disponible al instante) o con la letra ya resuelta. Se acepta
   * cualquiera de las dos para que un catálogo viejo —sin el flag— no deje el
   * botón deshabilitado teniendo la letra delante.
   */
  const hasLyrics = Boolean(player.current?.hasLyrics) || lyrics.length > 0;

  useEffect(() => {
    if (!lyricsOpen) return;
    // Un único bucle para el panel. `getPosition()` es la fuente de verdad del
    // transporte y se lee de forma imperativa; pasarla por estado a 60 fps
    // volvería a renderizar el armazón entero, y la letra no necesita más de
    // ~10 Hz para que la palabra activa cambie cuando corresponde.
    let frame = 0;
    let last = -1;
    const tick = (now: number) => {
      if (now - last > 90) {
        last = now;
        setLyricsTime(player.getPosition());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lyricsOpen, player, currentTrackId]);

  const closeOverlays = useCallback(() => {
    setQueueOpen(false);
    setLyricsOpen(false);
    if (nowPlayingOpen) setNowPlayingOpen(false);
    else setMenu(null);
  }, [nowPlayingOpen, setLyricsOpen]);

  // ── overlays driven by custom events (see useMediaSession) ────
  useEffect(() => {
    const toggleQueue = () => setQueueOpen((open) => !open);
    // Mismo mecanismo que la cola: así una pantalla (o un atajo del futuro) puede
    // abrir la letra sin tener la barra como padre.
    const toggleLyrics = () => setLyricsOpen((open) => !open);
    window.addEventListener("pm:toggle-queue", toggleQueue);
    window.addEventListener("pm:toggle-lyrics", toggleLyrics);
    window.addEventListener("pm:close-overlays", closeOverlays);
    return () => {
      window.removeEventListener("pm:toggle-queue", toggleQueue);
      window.removeEventListener("pm:toggle-lyrics", toggleLyrics);
      window.removeEventListener("pm:close-overlays", closeOverlays);
    };
  }, [closeOverlays, setLyricsOpen]);

  // ── handlers ──────────────────────────────────────────────────

  const openMenu = useCallback((meta: TrackMeta, event: MouseEvent<HTMLElement>) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect?.();
    // Keyboard activation reports 0,0 — fall back to the element's own box.
    const x = event.clientX || (rect ? rect.left + rect.width / 2 : 0);
    const y = event.clientY || (rect ? rect.bottom : 0);
    setMenu({ meta, x, y });
  }, []);

  const handleSharePlaylist = useCallback(
    (playlistId: string) => {
      const playlist = library.getPlaylist(playlistId);
      if (!playlist) return;
      const tracks = library.resolveMany(playlist.trackIds);
      const shareableTracks = tracks.filter((meta) => isDemoMeta(meta));
      if (shareableTracks.length === 0) {
        toast.error(
          "Esta playlist solo tiene archivos locales: el link no tendría la música detrás.",
        );
        return;
      }
      setShare({
        kind: "collection",
        name: playlist.name,
        description: playlist.description,
        emoji: playlist.emoji,
        color: playlist.color,
        colorAlt: playlist.colorAlt,
        tracks: shareableTracks,
      });
    },
    [library],
  );

  const handleShareTrack = useCallback((meta: TrackMeta) => {
    setShare({ kind: "track", meta });
  }, []);

  const api: PlayerUiApi = {
    openTrackMenu: openMenu,
    addToPlaylist: (trackIds) => setPlaylistDialog({ mode: "addTo", trackIds }),
    createPlaylist: (seedTrackIds) => setPlaylistDialog({ mode: "create", seedTrackIds }),
    editPlaylist: (playlistId) => setPlaylistDialog({ mode: "edit", playlistId }),
    shareTrack: handleShareTrack,
    sharePlaylist: handleSharePlaylist,
    showDetails: (meta) => setDetails(meta),
    toggleQueue: () => setQueueOpen((open) => !open),
    openNowPlaying: () => setNowPlayingOpen(true),
    practice: (meta) => onOpenStudio?.(meta),
    openScore: (meta) => onOpenScore?.(meta),
    openGame: (meta) => onOpenGame?.(meta),
    canPractice: Boolean(onOpenStudio),
    canOpenScore: Boolean(onOpenScore),
    canOpenGame: Boolean(onOpenGame),
  };

  return (
    /* One real flex item of `.app-container`, so the bar and the workspace
       stack vertically instead of the bar landing beside the workspace.
       `.app-shell` inside holds the screens and takes the leftover height. */
    <div className="pm-section">
      <PlayerBar
        onExpand={() => setNowPlayingOpen(true)}
        onToggleQueue={() => setQueueOpen((open) => !open)}
        queueOpen={queueOpen}
        onOpenStudio={
          onOpenStudio
            ? () => {
                if (player.current) onOpenStudio(player.current);
              }
            : undefined
        }
        onOpenScore={
          onOpenScore
            ? () => {
                if (player.current) onOpenScore(player.current);
              }
            : undefined
        }
        onOpenGame={
          onOpenGame
            ? () => {
                if (player.current) onOpenGame(player.current);
              }
            : undefined
        }
        hasScore={hasScore}
        onPositionTick={handlePosition}
        lyricsOpen={lyricsOpen}
        onToggleLyrics={() => setLyricsOpen((open) => !open)}
        hasLyrics={hasLyrics}
        onShare={handleShareTrack}
      />

      {/* Screens rendered inside the shell can drive the player's overlays. */}
      <PlayerUiContext.Provider value={api}>{children}</PlayerUiContext.Provider>

      {/* The queue drawer is suppressed while the full-screen player is open —
          it would sit behind an opaque overlay. Deriving this instead of
          syncing it with an effect avoids a state update during commit. */}
      {queueOpen && !nowPlayingOpen && (
        <aside className="pm-drawer" aria-label="Cola de reproducción">
          <QueuePanel onClose={() => setQueueOpen(false)} />
        </aside>
      )}

      {/* Panel de letra: la "zona derecha". Es hermano de los overlays, no parte
          de una pantalla, así que sigue a la canción esté el usuario donde esté
          —Studio, Juego, Partitura o la biblioteca— igual que la propia barra.
          Se cierra solo al abrir la vista de reproducción completa, que ya trae
          su propia pestaña de letra, para no mostrar dos letras a la vez. */}
      {lyricsOpen && !nowPlayingOpen && (
        <aside
          className="pm-drawer pm-drawer--lyrics"
          aria-label="Letra de la canción"
        >
          <LyricsPanel
            lines={lyrics}
            currentTime={lyricsTime}
            duration={player.duration}
            songTitle={player.current?.title}
            /* Mismo camino de seek que el resto del reproductor. */
            onSeek={player.seek}
            onClose={() => setLyricsOpen(false)}
          />
        </aside>
      )}

      <NowPlaying
        open={nowPlayingOpen}
        onClose={() => setNowPlayingOpen(false)}
        onShare={handleShareTrack}
        onAddToPlaylist={(meta) => setPlaylistDialog({ mode: "addTo", trackIds: [meta.id] })}
        onOpenStudio={onOpenStudio}
        onOpenScore={onOpenScore}
        onOpenGame={onOpenGame}
      />

      {menu && (
        <TrackMenu
          meta={menu.meta}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onShare={handleShareTrack}
          onShowDetails={(meta) => setDetails(meta)}
          onOpenStudio={onOpenStudio}
          onOpenScore={onOpenScore}
          onOpenGame={onOpenGame}
        />
      )}

      <ShareDialog payload={share} onClose={() => setShare(null)} />

      {playlistDialog?.mode === "create" && (
        <PlaylistDialog
          mode="create"
          seedTrackIds={playlistDialog.seedTrackIds}
          onClose={() => setPlaylistDialog(null)}
        />
      )}
      {playlistDialog?.mode === "edit" && (
        <PlaylistDialog
          mode="edit"
          playlistId={playlistDialog.playlistId}
          onClose={() => setPlaylistDialog(null)}
        />
      )}
      {playlistDialog?.mode === "addTo" && (
        <PlaylistDialog
          mode="addTo"
          trackIds={playlistDialog.trackIds}
          onClose={() => setPlaylistDialog(null)}
        />
      )}

      <DetailsDialog meta={details} onClose={() => setDetails(null)} />

      <ToastHost />
    </div>
  );
}
