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
  claimAudio,
  releaseAudio,
  setAudioYieldHandler,
  subscribeAudioLock,
  // Se importa con alias porque el contexto expone su PROPIA función `takeOver`,
  // que además de tomar el lock tiene que arrancar el motor. Sin el alias, el
  // import y la variable local chocan.
  takeAudioOver as claimAudioForcefully,
} from "./playerAudioLock";
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
  /**
   * `true` cuando OTRA pestaña está usando el audio.
   *
   * Con varias pestañas abiertas, cada una tiene su propio motor de audio y
   * compiten por la CPU y el dispositivo de salida: la que está sonando se pone
   * lenta y lagueada. Cuando esto pasa, esta pestaña no reproduce y la barra
   * ofrece tomar el control.
   */
  heldElsewhere: boolean;
  /** Toma el audio a la fuerza, pausando la otra pestaña. */
  takeAudioOver: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  /** Advances the mode and returns the new one (for toasts). */
  cycleRepeat: () => RepeatMode;
  setAutoplay: (on: boolean) => void;
  // queue commands
  playTrack: (trackId: string) => void;
  /**
   * Makes `trackId` the current track **without** starting it — the path the
   * Studio (importing a MIDI) and the library's "Tocar" take. The bar shows it
   * and its controls operate; the engine stays stopped until the user asks.
   */
  loadTrack: (trackId: string) => void;
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
  /**
   * `true` cuando el audio lo tiene OTRA pestaña.
   *
   * Varias pestañas sonando a la vez compiten por la CPU y el dispositivo de
   * salida, y la que suena se pone lenta y lagueada. La coordinación vive en
   * `music/playerAudioLock`; acá sólo se refleja para que la barra lo muestre y
   * ofrezca tomar el control.
   */
  const [heldElsewhere, setHeldElsewhere] = useState(false);

  const bridgeRef = useRef<PlaybackHost | null>(null);
  const loadTokenRef = useRef(0);
  /**
   * Qué carga es dueña del spinner de "Cargando…".
   *
   * Sin esto, una carga que se cancela a mitad de camino dejaba el spinner
   * encendido para siempre: la canción se quedaba "cargando y no cargaba". Sólo
   * lo apaga quien lo encendió, así una carga vieja no le borra el spinner a la
   * nueva que sí va a cargar.
   */
  const loadingOwnerRef = useRef(0);
  /** Guards against the engine's completion callback firing twice. */
  const advancingRef = useRef(false);
  /** Fallback playhead for when no engine is attached yet. */
  const positionRef = useRef(0);
  /**
   * Latest `isPlaying` for callbacks that must stay identity-stable. The
   * play/pause button renders the opposite of this value, so it has to decide
   * from the very same value it draws (see `toggle`).
   */
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /**
   * Escucha quién tiene el audio y PAUSA si lo toma otra pestaña.
   *
   * La pausa se hace acá dentro y no en un efecto que observe `heldElsewhere`: el
   * lint del proyecto prohíbe escribir estado en un efecto
   * (`react-hooks/set-state-in-effect`), y con razón — un render extra por cada
   * cambio. Acá el estado se escribe en respuesta a un evento externo, que es
   * justo donde corresponde.
   *
   * Ojo con el orden: `setTransportPlaying` está definido más abajo y NO puede
   * referenciarse desde este efecto sin entrar en su lista de dependencias, lo que
   * volvería a suscribir el canal en cada render. Por eso la pausa se hace con
   * `bridgeRef` e `isPlayingRef` —los dos son refs estables— y se llama a
   * `store.setPaused` directamente, que es lo que `setTransportPlaying` hace.
   *
   * Además se registra el `yieldHandler`: es lo que `playerAudioLock` **espera**
   * antes de avisar que esta pestaña soltó el audio. El orden es lo que evita que
   * la otra arranque mientras ésta todavía suena — las dos audibles a la vez, el
   * reporte del dueño ("a veces suenan ambas").
   */
  useEffect(() => {
    const callar = (): void => {
      // No se toca `positionRef`: al retomar, sigue donde estaba.
      bridgeRef.current?.pause();
      setIsPlaying(false);
      store.setPaused(true);
    };

    setAudioYieldHandler(callar);

    const unsubscribe = subscribeAudioLock(({ heldElsewhere: held }) => {
      setHeldElsewhere(held);
      if (!held) return;
      if (!isPlayingRef.current) return;
      callar();
    });

    return () => {
      setAudioYieldHandler(null);
      unsubscribe();
    };
  }, []);

  /**
   * Single writer for "is it playing?". `isPlaying` drives the bar and the
   * media session, while the store's `paused` is the queue's own record of it;
   * writing `isPlaying` alone left `paused` stuck at its initial `true`, which
   * is what made the bar's play button unable to ever pause.
   */
  const setTransportPlaying = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    store.setPaused(!playing);
  }, []);

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

  /**
   * Consigue el audio para esta pestaña. `false` si aun así no se pudo.
   *
   * ── POR QUÉ ACÁ Y NO SÓLO EN `play()` ─────────────────────────────────────
   *
   * El primer intento puso la coordinación en `play()` y no funcionaba: en el
   * reproductor, tocar una tarjeta llama a `playTrack()`, que arranca por
   * `loadEntry(..., playNow = true)` y **nunca pasa por `play()`**. Las pestañas
   * reclamaban el audio por un camino y el motor arrancaba por otro.
   *
   * `loadEntry` con `playNow` es el ÚNICO punto por el que se empieza a sonar, así
   * que la coordinación tiene que estar acá.
   *
   * ── POR QUÉ PIDE EL TRASPASO Y NO SE QUEDA CALLADA ────────────────────────
   *
   * Esto corre sólo cuando alguien pidió sonar ACÁ: tocar una canción, el botón
   * de play, o el avance de una cola que ya estaba sonando. Quedarse en silencio
   * mientras la otra pestaña sigue sonando es el reporte del dueño, textual:
   *
   *   *"estoy escuchando una canción y toco otra para escucharla y no suena, y
   *   tampoco deja de sonar la anterior"*
   *
   * El aviso *"La música está sonando en otra pestaña"* seguía apareciendo, pero
   * pedirle al usuario que toque OTRA vez ("Reproducir acá") para oír la canción
   * que acaba de elegir es hacerle pagar dos veces por lo mismo.
   *
   * **Reabrir una pestaña NO roba el audio**: la restauración de la sesión entra
   * con `playNow` en false y ni siquiera pasa por acá, así que el audio no salta
   * solo (el invariante que eligió el dueño). Y el traspaso pausa a la otra
   * pestaña —no suenan dos nunca—, que es lo que el test
   * `scripts/qa-audio-multipestana.mjs` protege.
   */
  const ensureAudioForPlayback = useCallback(async (): Promise<boolean> => {
    const granted = (await claimAudio()) || (await claimAudioForcefully());
    if (!granted) {
      setHeldElsewhere(true);
      setTransportPlaying(false);
      setIsLoading(false);
    }
    return granted;
  }, [setTransportPlaying]);

  /** Loads a queue entry into the engine and optionally starts playback. */
  const loadEntry = useCallback(
    async (targetIndex: number, playNow: boolean, offset = 0, depth = 0) => {
      const state = store.getSnapshot();
      const entry = state.queue[targetIndex];
      if (!entry) return;

      /*
       * El token se toma ANTES de cualquier `await`, y eso es lo que hace que
       * "la última pulsación gane".
       *
       * Antes se tomaba después de `ensureAudioForPlayback()`. En una ráfaga de
       * siguiente/anterior, el orden en que TERMINAN esas esperas no es el orden
       * en que el usuario pulsó: una pulsación vieja podía despertar última,
       * quedarse con el token nuevo y pisar a la canción que el usuario sí quería
       * — el índice de la cola decía una canción y el motor cargaba otra, y la
       * app quedaba trabada. Tomándolo primero, cualquier llamada anterior
       * abandona en cuanto reanuda (los chequeos `token !== loadTokenRef.current`
       * de abajo ya estaban) y sólo la última sigue viva.
       */
      const token = ++loadTokenRef.current;

      /*
       * Antes de cargar nada: si se va a REPRODUCIR, hay que tener el audio.
       *
       * Va primero y no después de resolver la canción a propósito: resolver baja
       * y parsea el MIDI, que es trabajo pesado, y no tiene sentido hacerlo para
       * una canción que no va a sonar.
       */
      if (playNow && !(await ensureAudioForPlayback())) return;

      if (token !== loadTokenRef.current) {
        // Nos canceló una carga más nueva. Si el spinner era nuestro, se apaga:
        // si no, la canción se quedaba "cargando y no cargaba" para siempre.
        if (loadingOwnerRef.current === token) {
          loadingOwnerRef.current = 0;
          setIsLoading(false);
        }
        return;
      }
      loadingOwnerRef.current = token;
      setIsLoading(true);
      setError(null);

      let song: SongData;
      try {
        song = await resolveTrack(entry.trackId);
      } catch (err) {
        if (token !== loadTokenRef.current) {
        // Nos canceló una carga más nueva. Si el spinner era nuestro, se apaga:
        // si no, la canción se quedaba "cargando y no cargaba" para siempre.
        if (loadingOwnerRef.current === token) {
          loadingOwnerRef.current = 0;
          setIsLoading(false);
        }
        return;
      }
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

      if (token !== loadTokenRef.current) {
        // Nos canceló una carga más nueva. Si el spinner era nuestro, se apaga:
        // si no, la canción se quedaba "cargando y no cargaba" para siempre.
        if (loadingOwnerRef.current === token) {
          loadingOwnerRef.current = 0;
          setIsLoading(false);
        }
        return;
      }

      putSessionSong(song);
      setResolvedIds((prev) => {
        if (prev.has(entry.trackId)) return prev;
        const next = new Set(prev);
        next.add(entry.trackId);
        return next;
      });

      positionRef.current = offset;
      const host = bridgeRef.current;
      if (!playNow) {
        // "Show it, don't start it" (a Studio import, "Tocar" in the library):
        // whatever was sounding has to go quiet now. `load` alone cannot
        // promise that — it is skipped when the song is already the engine's.
        host?.stop();
        // Deja de sonar, así que suelta el audio: otra pestaña puede tomarlo.
        releaseAudio();
      }
      host?.load(song);
      loadingOwnerRef.current = 0;
      setIsLoading(false);
      setTransportPlaying(playNow);

      if (playNow) {
        store.recordPlay(entry.trackId);
        // The engine may still be building its audio graph on a cold start;
        // `play` resolves once the transport is genuinely running.
        void Promise.resolve(host?.play(offset)).catch(() => {
          setTransportPlaying(false);
        });
      }
    },
    [setTransportPlaying, ensureAudioForPlayback],
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
    // `autoStart: false` is a slot picked to be shown, not played.
    void loadEntryRef.current?.(index, currentEntry.autoStart !== false);
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

    /**
     * Antes de arrancar, se pide el audio.
     *
     * Si otra pestaña lo tiene, se le pide el TRASPASO: pulsar play es una orden
     * explícita del usuario, y dejar el botón sin efecto mientras la otra pestaña
     * sigue sonando es el reporte del dueño (ver `ensureAudioForPlayback`). El
     * `await` es necesario porque la consulta al lock es asíncrona, pero el lock se
     * pide con `ifAvailable` —no espera— así que en el caso normal resuelve en el
     * mismo tick.
     *
     * Se pide SÓLO acá y no en `load()`: cargar una canción en la barra sin
     * reproducirla no usa el dispositivo de audio, así que no hay nada que
     * coordinar.
     */
    void (async () => {
      const granted = (await claimAudio()) || (await claimAudioForcefully());
      if (!granted) {
        setHeldElsewhere(true);
        setTransportPlaying(false);
        return;
      }

      const entry = store.getSnapshot().queue[store.getSnapshot().index];
      if (!entry) return;
      store.recordPlay(entry.trackId);
      setTransportPlaying(true);
      // `play` may need to build the audio engine first, so it can reject.
      void Promise.resolve(bridgeRef.current?.play(positionRef.current)).catch(() => {
        setTransportPlaying(false);
        // Si el motor no pudo arrancar, no tiene sentido seguir bloqueando el
        // audio para las otras pestañas.
        releaseAudio();
      });
    })();
  }, [setTransportPlaying]);

  const pause = useCallback(() => {
    bridgeRef.current?.pause();
    setTransportPlaying(false);
    // Soltar el audio permite que otra pestaña reproduzca sin pelear por el lock.
    // El navegador lo liberaría solo al cerrar la pestaña, pero mientras sigue
    // abierta y en pausa no tiene por qué bloquear a nadie.
    releaseAudio();
  }, [setTransportPlaying]);

  /**
   * Tomar el audio a la fuerza, pausando la otra pestaña.
   *
   * Es lo que dispara el botón "Reproducir acá" del aviso: el usuario decide
   * explícitamente que quiere el audio en ésta.
   */
  const takeOver = useCallback(() => {
    void (async () => {
      const granted = await claimAudioForcefully();
      if (!granted) return;
      setHeldElsewhere(false);
      const state = store.getSnapshot();
      const entry = state.queue[state.index];
      if (!entry) return;
      store.recordPlay(entry.trackId);
      setTransportPlaying(true);
      void Promise.resolve(bridgeRef.current?.play(positionRef.current)).catch(() => {
        setTransportPlaying(false);
        releaseAudio();
      });
    })();
  }, [setTransportPlaying]);

  const toggle = useCallback(() => {
    // The button draws `isPlaying` inverted, so it must decide from that same
    // value: reading the store's `paused` made it call `play()` forever (a
    // paused flag that is never cleared cannot hand the button back).
    if (isPlayingRef.current) pause();
    else play();
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
      setTransportPlaying(true);
      return;
    }
    // No hay siguiente: "siguiente" es un botón que aprieta el usuario, así que
    // no puede tener un efecto destructivo (antes pausaba la música, y el
    // usuario leía "apreté siguiente y se cortó"). La barra además lo muestra
    // deshabilitado cuando no queda nada por delante y repeat está en off.
  }, [setTransportPlaying]);

  const previous = useCallback(() => {
    // Spotify's rule: past a few seconds, "previous" restarts the track.
    // La posición se pide al motor (fuente de verdad, ver `getPosition`), nunca
    // al estado de React: un frame de atraso decidía "reiniciar" cuando el
    // usuario todavía estaba en los primeros segundos de la canción.
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
    // No hay ranura anterior: la canción actual es la PRIMERA de la cola (pasa
    // al elegir la primera fila de la biblioteca, que arma la cola con esa
    // canción al frente). Antes se reiniciaba la misma desde 1-2 s, que se ve
    // como si el botón no hiciera nada. Ahora se vuelve a la última que sonó
    // antes de esta, que el historial del reproductor ya tiene.
    const played = state.library.history.find(
      (entry) => entry.trackId !== q[i]?.trackId,
    );
    if (played && store.insertBeforeCurrent(played.trackId)) return;

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

  /**
   * Reproduce una pista con el resto de la biblioteca detrás.
   *
   * Es el camino de "esta canción y que siga sonando algo": el usuario la pidió
   * y espera que la reproducción continúe.
   */
  const playTrack = useCallback((trackId: string) => {
    if (!store.getTrack(trackId)) return;
    const rest = store.getTrackIds().filter((id) => id !== trackId);
    store.setQueue([trackId, ...rest], trackId, {
      kind: "track",
      label: "Reproducción",
    });
  }, []);

  /**
   * Deja `trackId` como pista actual SIN reproducirla y SIN cola detrás.
   *
   * La cola es "lo que el usuario encoló o el contexto que estaba navegando";
   * cargar un archivo para practicarlo no es ninguna de las dos cosas. Antes
   * esto armaba `[pista, ...catálogo]` y dejaba 157 canciones navegables que
   * nadie pidió: medido por el QA en el escenario de los 3 archivos,
   * "siguiente" pasaba de la canción cargada a una demo de la biblioteca
   * (índice 0 → 1, −22,1 dB), y la cola crecía en cada import (158 → 159 → 160).
   * Para navegar una colección está la fila de Música, que arma el contexto
   * real con `playCollection`.
   */
  const loadTrack = useCallback((trackId: string) => {
    if (!store.getTrack(trackId)) return;
    store.setQueue(
      [trackId],
      trackId,
      { kind: "track", label: "Reproducción" },
      { autoplay: false },
    );
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
      setTransportPlaying(true);
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
    setTransportPlaying(false);
  }, [startRadio, setTransportPlaying]);

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
      heldElsewhere,
      takeAudioOver: takeOver,
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
      loadTrack,
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
      heldElsewhere,
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
      loadTrack,
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
      takeOver,
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
