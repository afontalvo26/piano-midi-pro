/**
 * PlayerShell — el armazón del reproductor independiente.
 *
 * QUÉ HACE: reproduce el armazón del piano (`app/src/App.tsx`, líneas ~4375-4470
 * y ~5487-5512) con los componentes REALES del reproductor:
 *
 *   .app-container
 *     .sidebar-rail          → Música · Canciones · Pistas
 *     <PlayerSection>        → la barra inferior real (PlayerBar) + cola +
 *                              vista de reproducción + menús + diálogos
 *       .app-shell
 *         .main-workspace
 *           .topbar-header   → qué canción está cargada + estado del motor
 *           .panel-screen    → SongLibrary (Canciones) | MusicPanel (Música)
 *
 * NO HAY NI UNA LÍNEA DE UI DE REPRODUCTOR ESCRITA ACÁ: la barra, la cola, la
 * pantalla Música y el buscador de Canciones son los componentes del piano,
 * importados por el alias `@app/*` (ver `vite.config.ts`), con su CSS.
 *
 * LO QUE SÍ ES PROPIO DE ESTE ARCHIVO: el cableado. Qué pasa cuando el usuario
 * elige una canción, importa un archivo o toca el mezclador. Está comentado
 * decisión por decisión.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerSection } from "@app/components/player/PlayerSection";
import { SongLibrary } from "@app/components/songs";
import { MusicPanel } from "@app/components/library";
import { Icons } from "@app/components/common/Icons";
import { usePlayer } from "@app/music/PlayerContext";
import { useLibrary } from "@app/music/useLibrary";
import { useLocalStorageState } from "@app/utils/settings";
import { idForSong, sourceInfoFor } from "@app/music/ids";
import { libraryStore } from "@app/music/libraryStore";
import type { LiveMix } from "../audio/scheduler";
import type { SongData } from "@app/types/song";
import type { PlayerEngineHost } from "../host/PlayerEngineHost";
import { loadDemoCatalog, loadSingleDemo } from "../host/catalog";
import { importMidiFile, isMidiFileName } from "../host/midiImport";
import { usePlayerEngineHost } from "../host/usePlayerEngineHost";
import { attachTestHandle } from "../testHooks";
import { TracksScreen } from "./TracksScreen";
import type { TrackMixerState } from "./TracksScreen";
import { SettingsScreen } from "./SettingsScreen";

/** Las pantallas del reproductor. */
type ShellScreen = "music" | "songs" | "tracks" | "settings";

/**
 * Volumen por defecto de una pista nueva: el mismo 0.8 del piano
 * (`App.tsx` → `nextVolumes[track.index] = 0.8`).
 */
const DEFAULT_TRACK_VOLUME = 0.8;

/** Nombres que el botón "Solo Piano" considera piano (el mismo criterio del piano). */
const PIANO_NAME_HINTS = ["piano", "harpsichord", "clavinet"] as const;

/**
 * Lo que el usuario cambió del mezclador. Todo lo demás se lee del archivo: así
 * el mezclador "se reinicia" al cambiar de canción sin ningún efecto de por medio.
 */
type MixerEdits = {
  muted: Record<number, boolean>;
  solo: Record<number, boolean>;
  volumes: Record<number, number>;
  instruments: Record<number, string>;
  colors: Record<number, string>;
};

const NO_MIXER_EDITS: MixerEdits = {
  muted: {},
  solo: {},
  volumes: {},
  instruments: {},
  colors: {},
};

/**
 * Espera a que el motor tenga cargada la canción `songId`.
 *
 * Hace falta en la importación: `loadTrack()` encola y el `PlayerContext`
 * resuelve la canción en un efecto asincrónico, así que un `play()` inmediato
 * arrancaría la canción ANTERIOR (el motor todavía no cambió de tema).
 *
 * @returns `true` si el motor llegó a cargarla dentro del tope (~4 s).
 */
function waitForLoadedSong(
  host: PlayerEngineHost,
  songId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = performance.now() + 4000;
    const step = () => {
      if (host.getSnapshot().songId === songId) {
        resolve(true);
        return;
      }
      if (performance.now() > deadline) {
        resolve(false);
        return;
      }
      requestAnimationFrame(step);
    };
    step();
  });
}

export function PlayerShell() {
  const player = usePlayer();
  const library = useLibrary();

  // ── fin de canción ────────────────────────────────────────────
  // El motor avisa cuando el transporte llegó al final; el reproductor decide
  // (repetir una, siguiente, radio automática o parar).
  const handleEnded = useCallback(() => player.notifyEnded(), [player]);
  const { host, bridge, getPosition, snapshot } = usePlayerEngineHost(handleEnded);

  // ── navegación ────────────────────────────────────────────────
  // Se persiste igual que en el piano (`piano_screen`), para volver donde estabas.
  const [screen, setScreen] = useLocalStorageState<ShellScreen>(
    "player_screen",
    "music",
  );
  const [searchQuery, setSearchQuery] = useLocalStorageState(
    "player_search_query",
    "",
  );

  // ── perilla Groove ────────────────────────────────────────────
  // MISMA clave de localStorage que el piano (`App.tsx`), para que el valor sea el
  // mismo en los dos: el dueño pidió que la función esté en el reproductor y no
  // sólo en la pantalla de Ajustes del piano.
  const [grooveAmount, setGrooveAmount] = useLocalStorageState<number>(
    "piano_groove_amount",
    0,
  );

  // Se empuja al motor en cada cambio. El motor lo lee al AGENDAR (play/seek), así
  // que arrastrar el slider no reagenda ni corta lo que está sonando.
  useEffect(() => {
    host.setGroove(grooveAmount);
  }, [host, grooveAmount]);

  // Asa de medición (sólo en desarrollo): deja leer voces vivas, notas salteadas
  // y el estado del AudioContext. No maneja el reproductor: eso se mide por la UI.
  useEffect(() => {
    attachTestHandle(host);
  }, [host]);

  // ── catálogo ──────────────────────────────────────────────────
  // `songsList` es lo que la biblioteca de Canciones muestra (con sus notas, para
  // poder contar pistas y notas); `libraryStore` es lo que el reproductor usa
  // para resolver y encolar. Es la misma división que hace App.tsx.
  const [songsList, setSongsList] = useState<SongData[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLastFile, setImportLastFile] = useLocalStorageState<
    string | null
  >("player_last_import", null);

  useEffect(() => {
    let cancelled = false;
    void loadDemoCatalog((songs) => {
      if (cancelled) return;
      setSongsList(songs);
    }).then((songs) => {
      if (cancelled) return;
      setSongsList(songs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * `?demo=<archivo>` carga y reproduce UNA demo concreta.
   *
   * Sirve para escuchar cualquiera de los ~200 MIDI del proyecto (el catálogo
   * curado son ~130) y para que las mediciones automáticas tengan material
   * determinista sin depender del layout de una tarjeta.
   */
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current) return;
    deepLinkDone.current = true;
    const fileName = new URLSearchParams(window.location.search).get("demo");
    if (!fileName) return;
    void loadSingleDemo(fileName).then((song) => {
      if (!song) {
        setImportError(`No se pudo cargar la demo "${fileName}"`);
        return;
      }
      setSongsList((prev) => [
        song,
        ...prev.filter((item) => item.title !== song.title),
      ]);
      player.playTrack(idForSong(song));
    });
  }, [player]);

  // ── mezclador por pista ───────────────────────────────────────
  //
  // En el piano este estado vive en App.tsx; acá vive en el shell y se empuja al
  // motor, que lo lee POR NOTA en el scheduler (un cambio vale al instante).
  //
  // SÓLO SE GUARDA LO QUE EL USUARIO TOCÓ, y atado al id de la canción cargada.
  // El resto se DERIVA del archivo en cada render. Así, cuando cambia de canción,
  // el mezclador vuelve solo a los valores del archivo —que es lo que el piano
  // hace con un efecto que reescribe los cuatro mapas— sin `setState` dentro de un
  // efecto (render en cascada) ni estado duplicado que se pueda desincronizar.
  const songId = snapshot.songId;
  const [editState, setEditState] = useState<{
    songId: string | null;
    edits: MixerEdits;
  }>(() => ({ songId: null, edits: NO_MIXER_EDITS }));
  const edits = editState.songId === songId ? editState.edits : NO_MIXER_EDITS;

  /** Aplica un cambio del usuario sobre la canción que está cargada ahora. */
  const editMixer = useCallback(
    <K extends keyof MixerEdits>(
      field: K,
      update: (previous: MixerEdits[K]) => MixerEdits[K],
    ) => {
      setEditState((previous) => {
        const base =
          previous.songId === songId ? previous.edits : NO_MIXER_EDITS;
        return {
          songId,
          edits: { ...base, [field]: update(base[field]) },
        };
      });
    },
    [songId],
  );

  /** Mezclador efectivo: lo tocado por el usuario, con los valores del archivo detrás. */
  const mixState = useMemo<TrackMixerState>(() => {
    const tracks = snapshot.tracks;
    return {
      muted: edits.muted,
      solo: edits.solo,
      volumes: Object.fromEntries(
        tracks.map((track) => [
          track.index,
          edits.volumes[track.index] ?? DEFAULT_TRACK_VOLUME,
        ]),
      ),
      instruments: Object.fromEntries(
        tracks.map((track) => [
          track.index,
          edits.instruments[track.index] ||
            track.instrument ||
            "Acoustic Grand Piano",
        ]),
      ),
      colors: Object.fromEntries(
        tracks.map((track) => [
          track.index,
          edits.colors[track.index] || track.color || "#8b5cf6",
        ]),
      ),
    };
  }, [edits, snapshot.tracks]);

  // Único escritor de la mezcla del motor. El scheduler la lee por nota, así que
  // un commit de atraso es inaudible (el mismo criterio que el `stateRef` del piano).
  useEffect(() => {
    const live: LiveMix = {
      muted: mixState.muted,
      solo: mixState.solo,
      volumes: mixState.volumes,
      instruments: mixState.instruments,
    };
    host.setMix(live);
  }, [host, mixState]);

  /**
   * Silenciar o aislar una pista DURANTE la reproducción tiene que cortar YA lo
   * que está sonando de esa pista, o el audio va un compás atrás de lo que se ve.
   * Las notas futuras ya leen la mezcla nueva al dispararse.
   *
   * Mismo criterio que el efecto `[trackMuted, trackSolo, isPlaying]` de App.tsx.
   * Corre DESPUÉS del efecto que publica la mezcla (orden de declaración), así
   * que evalúa la audibilidad con el estado nuevo.
   */
  useEffect(() => {
    if (!player.isPlaying) return;
    host.releaseInaudibleVoices();
  }, [mixState.muted, mixState.solo, player.isPlaying, host]);

  // ── acciones de la biblioteca ─────────────────────────────────

  /**
   * Una tarjeta de Canciones o de Música: su propia etiqueta accesible es
   * "Tocar", así que reproduce. `playTrack` deja la canción al frente y el resto
   * de la biblioteca detrás — el mismo camino que la pantalla Música usa para
   * sus tarjetas, así que las dos pestañas se comportan igual.
   */
  const handleSelectSong = useCallback(
    (selected: SongData) => {
      // Una fila restaurada de localStorage puede no estar en el catálogo del
      // reproductor: registrarla es lo que le permite resolverla y sonar.
      const id = idForSong(selected);
      libraryStore.registerTracks([
        { song: selected, source: sourceInfoFor(selected, id) },
      ]);
      player.playTrack(id);
    },
    [player],
  );

  /**
   * Importar un MIDI propio.
   *
   * Se carga como pista ACTUAL SIN cola detrás (`loadTrack`) y se arranca: es el
   * mismo criterio que el piano —un archivo importado no arma contexto de
   * reproducción, así que "siguiente" no se va a recorrer la biblioteca— pero
   * acá se le da play, porque en el piano el archivo aterriza en el Studio (que
   * en este reproductor no existe) y quedarse en silencio parecería roto.
   */
  const handleImportFile = useCallback(
    async (file: File) => {
      if (!isMidiFileName(file.name)) {
        setImportError(
          `"${file.name}" no es un MIDI. Se aceptan .mid, .midi, .kar y .rmi.`,
        );
        return;
      }
      setImportLoading(true);
      setImportError(null);
      try {
        const song = await importMidiFile(file);
        setSongsList((prev) => [
          song,
          ...prev.filter((item) => item.title !== song.title),
        ]);
        setImportLastFile(file.name);
        const id = idForSong(song);
        player.loadTrack(id);
        // `loadTrack` sólo deja la canción en la barra; se espera a que el motor
        // la tenga de verdad antes de dar play (si no, arrancaría la anterior).
        if (await waitForLoadedSong(host, id)) player.play();
      } catch (error) {
        setImportError(
          `No se pudo leer "${file.name}": ${
            error instanceof Error ? error.message : "archivo ilegible"
          }`,
        );
      } finally {
        setImportLoading(false);
      }
    },
    [host, player, setImportLastFile],
  );

  // ── mezclador: acciones ───────────────────────────────────────
  //
  // Ningún handler llama a `host.setMix` por su cuenta: el efecto de arriba es el
  // único escritor, y el scheduler lee la mezcla por nota. Un solo camino, sin
  // dos versiones del estado que se puedan contradecir.

  const handleVolume = useCallback(
    (trackIndex: number, volume: number) => {
      editMixer("volumes", (previous) => ({ ...previous, [trackIndex]: volume }));
    },
    [editMixer],
  );

  const handleToggleMute = useCallback(
    (trackIndex: number) => {
      editMixer("muted", (previous) => ({
        ...previous,
        [trackIndex]: !previous[trackIndex],
      }));
    },
    [editMixer],
  );

  const handleToggleSolo = useCallback(
    (trackIndex: number) => {
      editMixer("solo", (previous) => ({
        ...previous,
        [trackIndex]: !previous[trackIndex],
      }));
    },
    [editMixer],
  );

  const handleInstrument = useCallback(
    (trackIndex: number, instrument: string) => {
      editMixer("instruments", (previous) => ({
        ...previous,
        [trackIndex]: instrument,
      }));
      // La nota que está sonando es del instrumento VIEJO: si no se libera con
      // el viejo, queda sonando para siempre (el release busca otro sampler).
      // El motor guarda con qué instrumento atacó cada voz, así que libera bien
      // aunque la mezcla ya tenga el nuevo.
      host.reloadTrackInstrument(trackIndex);
    },
    [editMixer, host],
  );

  const handleColor = useCallback(
    (trackIndex: number, color: string) => {
      editMixer("colors", (previous) => ({ ...previous, [trackIndex]: color }));
    },
    [editMixer],
  );

  /** "🎹 Solo Piano": deja audibles sólo las pistas de piano (conmutador). */
  const handleSoloPiano = useCallback(() => {
    const tracks = host.currentSong?.tracks ?? [];
    const pianoIndices = tracks
      .filter((track) =>
        (mixState.instruments[track.index] ?? track.instrument ?? "")
          .toLowerCase()
          .match(PIANO_NAME_HINTS.join("|")),
      )
      .map((track) => track.index);
    if (pianoIndices.length === 0) return;

    const allSoloed = pianoIndices.every((index) => mixState.solo[index]);
    editMixer("solo", () => {
      const next: Record<number, boolean> = {};
      if (!allSoloed) for (const index of pianoIndices) next[index] = true;
      return next;
    });
  }, [editMixer, host, mixState.instruments, mixState.solo]);

  return (
    <div className="app-container">
      {/* ── Rail: sólo las pantallas que este reproductor trae ── */}
      <aside className="sidebar-rail" aria-label="Navegación Principal">
        <div className="logo-container">🎹</div>
        <button
          className={`rail-item ${screen === "music" ? "active" : ""}`}
          onClick={() => setScreen("music")}
          title="Música — tu reproductor"
        >
          <Icons.Songs />
          Música
        </button>
        <button
          className={`rail-item ${screen === "songs" ? "active" : ""}`}
          onClick={() => setScreen("songs")}
          title="Canciones"
        >
          <Icons.Songs />
          Canciones
        </button>
        <button
          className={`rail-item ${screen === "tracks" ? "active" : ""}`}
          onClick={() => setScreen("tracks")}
          title="Pistas"
        >
          <Icons.Tracks />
          Pistas
        </button>
        <button
          className={`rail-item ${screen === "settings" ? "active" : ""}`}
          onClick={() => setScreen("settings")}
          title="Ajustes — interpretación (Groove)"
        >
          <Icons.Settings />
          Ajustes
        </button>
      </aside>

      {/* La barra del reproductor es la del piano, sin una línea propia. */}
      <PlayerSection
        bridge={bridge}
        getPosition={getPosition}
        onTrackFinished={handleEnded}
      >
        <div className="app-shell">
          <main className="main-workspace">
            <header className="topbar-header">
              <div className="title-container">
                <h1>Piano MIDI Pro</h1>
                <p>
                  {player.current?.title ?? "Sin canción cargada"} ·{" "}
                  {player.current
                    ? `${Math.round(player.current.bpm)} BPM · ${formatMinutes(
                        player.duration,
                      )}`
                    : "Elegí una canción"}
                </p>
              </div>
              <div className="status-pills">
                <div className="status-pill">
                  <span
                    className={`status-pill-dot ${
                      snapshot.error ? "danger" : "success"
                    }`}
                  ></span>
                  {snapshot.error ??
                    (player.isLoading ? "Cargando…" : snapshot.status)}
                </div>
                <div className="status-pill">
                  <span className="status-pill-dot success"></span>
                  {library.tracks.length} canciones
                </div>
              </div>
            </header>

            {screen === "songs" && (
              <section className="panel-screen">
                <SongLibrary
                  songs={songsList}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onSelectSong={handleSelectSong}
                  onImportFile={(file) => void handleImportFile(file)}
                  importLoading={importLoading}
                  importError={importError}
                  importLastFile={importLastFile}
                />
              </section>
            )}

            {screen === "music" && (
              <section className="panel-screen panel-screen--music">
                <MusicPanel
                  onImportFile={(file) => void handleImportFile(file)}
                  importLoading={importLoading}
                  importError={importError}
                  importLastFile={importLastFile}
                />
              </section>
            )}

            {screen === "tracks" && (
              <TracksScreen
                tracks={snapshot.tracks}
                mix={mixState}
                onToggleMute={handleToggleMute}
                onToggleSolo={handleToggleSolo}
                onVolume={handleVolume}
                onInstrument={handleInstrument}
                onColor={handleColor}
                onSoloPiano={handleSoloPiano}
              />
            )}

            {screen === "settings" && (
              <SettingsScreen
                grooveAmount={grooveAmount}
                onGrooveChange={setGrooveAmount}
                songTitle={player.current?.title ?? null}
              />
            )}
          </main>
        </div>
      </PlayerSection>
    </div>
  );
}

/** `m:ss`, igual que el subtítulo del topbar del piano. */
function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
