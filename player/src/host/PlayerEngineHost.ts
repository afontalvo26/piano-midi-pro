/**
 * PlayerEngineHost — el puente de audio del reproductor, sin el piano.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * En el piano, la lógica que conecta la UI del reproductor con el audio NO vive
 * en un componente del reproductor: vive dentro de `app/src/App.tsx` (~6.000
 * líneas), que además es el Studio, el teclado, el modo Juego y las partituras.
 * `music/PlayerContext.tsx` sólo declara la INTENCIÓN (la cola, qué suena
 * después, aleatorio, repetir) y le pide el audio a un `PlaybackHost` que
 * App.tsx registra en un `useEffect`.
 *
 * Este archivo es ese host, replicado sin nada del piano. La interfaz es
 * EXACTAMENTE la que espera `PlayerContext.PlaybackHost`, así que el contexto
 * real del piano (`@app/music/PlayerContext.tsx`) funciona acá sin cambios.
 *
 * LO QUE NO SE PUDO REUTILIZAR TAL CUAL
 * -------------------------------------
 * `App.tsx` no expone el host: lo construye adentro del componente con `useMemo`
 * sobre ~40 refs y estado de React (canción, sampler, registro de motores,
 * notas de partitura, pedales, juego). Importarlo significaría importar el
 * piano. Lo que sí se reutiliza tal cual son las piezas del motor:
 * `AudioEngine`, `scheduleSongOnTransport` y `audioTiming` — o sea, el sonido es
 * literalmente el mismo camino. Lo que se replicó es el CABLEADO:
 *
 *   1. `load()` para y carga, y dispara la PRECARGA de los samples de la canción
 *      (nunca al pulsar play).
 *   2. `play()` espera —con tope— sólo los instrumentos que suenan en los
 *      primeros segundos; el resto baja en segundo plano.
 *   3. `pause()`, `stop()`, `seek()` y el cambio de canción liberan TODAS las
 *      voces (piano + capa de fuentes + batería) con un fade corto, para que no
 *      quede audio de la canción anterior ni un click.
 *   4. La posición NO se publica por nota a React: el valor por frame vive en
 *      `positionRef` y lo lee quien lo necesita (la barra tiene su propio
 *      `requestAnimationFrame`). React no se entera de nada por frame.
 *
 * CERO SINTETIZADORES: si el sample real no está listo, la nota se saltea
 * (`scheduler.ts`). No hay respaldo de osciladores en ningún camino.
 */

import * as Tone from "tone";
import {
  AudioEngine,
  SAMPLES_WAIT_MS,
  heardSeconds,
  ticksFor,
} from "../audio/audioEngine";
import { scheduleSongOnTransport } from "../audio/scheduler";
import type { LiveMix, PianoVoice, SchedulerHost } from "../audio/scheduler";
import { sourceKindFor } from "../audio/gmLibrary";
import { salamanderSamples } from "../audio/salamanderSamples";
import { SAMPLES_BASE_URL } from "../config";
import {
  fadeOutNodesVolume,
  startTransportMusic,
  stopVoicesDeferred,
} from "@app/audio/audioTiming";
import { usesSalamanderPiano } from "@app/utils/playbackRouting";
import type { SongData, SongTrack } from "@app/types/song";

/** Release del sampler de piano, en segundos (el mismo valor que usa el piano). */
const PIANO_RELEASE_SEC = 1.2;

/** Volumen por defecto de una pista nueva (el mismo 0.8 del piano). */
const DEFAULT_TRACK_VOLUME = 0.8;

/** Progreso de precarga de samples (para la píldora honesta de estado). */
export type SamplesProgress = { done: number; total: number };

/**
 * Lo que React ve del motor.
 *
 * NUNCA lleva notas: `tracks` son los metadatos de la canción cargada (8 filas
 * como mucho) y la posición ni siquiera está acá — se lee del `ref`.
 */
export type EngineSnapshot = {
  /** Canción que está en el transporte (su id estable del catálogo). */
  songId: string | null;
  /** Sube en cada carga de canción: el shell reinicia el mezclador con esto. */
  songVersion: number;
  /** Pistas de la canción cargada (metadatos; nunca las notas). */
  tracks: readonly SongTrack[];
  /** Duración en segundos (0 sin canción). */
  duration: number;
  /** El grafo de audio está construido y el AudioContext corriendo. */
  audioReady: boolean;
  /** Los instrumentos de los primeros segundos ya tienen sample real. */
  samplesReady: boolean;
  samplesProgress: SamplesProgress;
  /** Notas salteadas por falta de sample listo (silencio, nunca sintetizador). */
  skippedNotes: number;
  /** Mensaje honesto de qué está pasando (carga, silencios, avisos). */
  status: string;
  /** Instrumentos que quedaron sin fuente real: su pista queda en silencio. */
  silentInstruments: string[];
  error: string | null;
};

const EMPTY_SNAPSHOT: EngineSnapshot = {
  songId: null,
  songVersion: 0,
  tracks: [],
  duration: 0,
  audioReady: false,
  samplesReady: false,
  samplesProgress: { done: 0, total: 0 },
  skippedNotes: 0,
  status: "Elegí una canción para empezar",
  silentInstruments: [],
  error: null,
};

export class PlayerEngineHost {
  /** El motor: el MISMO `AudioEngine` que ya usaba el reproductor. */
  readonly engine = new AudioEngine();

  /**
   * Posición por frame, en segundos.
   *
   * Es la fuente de verdad para lo imperativo (`PlayerBar` la lee en su propio
   * `requestAnimationFrame`). React NO la ve: publicarla por frame es lo que en
   * el piano causó 265 long tasks en 30 s y notas agendadas 162 ms tarde.
   */
  readonly positionRef = { current: 0 };

  private listeners = new Set<(snapshot: EngineSnapshot) => void>();
  private snapshot: EngineSnapshot = { ...EMPTY_SNAPSHOT };

  private pianoSampler: Tone.Sampler | null = null;
  private pianoVoice: PianoVoice | null = null;
  private song: SongData | null = null;
  private songId: string | null = null;
  private host: SchedulerHost | null = null;

  /** Estado del mezclador, leído POR NOTA por el scheduler (sin re-render). */
  private mix: LiveMix = { muted: {}, solo: {}, volumes: {}, instruments: {} };
  /** Notas sonando ahora, por pista: `pista → Set<nota MIDI>`. */
  private voices = new Map<number, Set<number>>();
  /**
   * Instrumento con el que se ATACÓ cada voz viva, por `"pista-nota"`.
   *
   * Es la lección del piano (`activeNoteInstrumentsRef`): si el usuario cambia el
   * instrumento de una pista a mitad de la canción, resolver el release con el
   * mapa ACTUAL busca otro sampler y la nota vieja queda sonando para siempre.
   */
  private voiceInstruments = new Map<string, string>();

  private rafId: number | null = null;
  private cancelVoiceCleanup: (() => void) | null = null;
  private progressTimer: number | null = null;

  /**
   * Generación del arranque en curso.
   *
   * QUÉ BUG ARREGLA (medido, y era el reportado como "isPlaying se cae a false"):
   * `play()` es asíncrono y en frío tarda segundos (construir el motor + bajar los
   * samples). Si en esa ventana llega un `pause()`, el `PlayerContext` pone
   * `isPlaying = false`, pero el `play()` en vuelo seguía y **arrancaba el
   * transporte igual**: la canción sonaba con `isPlaying` en false, el botón decía
   * "Reproducir" y la barra quedaba congelada en 0 (su rAF sólo corre si
   * `isPlaying` es true, así que el reloj y el scrubber no se repintaban nunca).
   *
   * El caso real que lo dispara es pulsar DOS VECES la misma tarjeta de Música: la
   * segunda vez la tarjeta ya es la activa y `TrackCard` hace `player.toggle()`
   * (`app/src/components/library/TrackCard.tsx:38-41`), que con `isPlaying` en true
   * llama a `pause()`.
   *
   * Cada `play()` se lleva un número; `pause()`, `stop()` y `load()` lo incrementan
   * para CANCELAR el arranque en vuelo. Después de cada `await`, `play()` compara y
   * abandona si lo cancelaron.
   */
  private playToken = 0;

  /**
   * Intención de reproducción del host: `true` entre `play()` y el siguiente
   * `pause()`/`stop()`/fin de canción.
   *
   * Es la red de seguridad de lo de arriba: si por cualquier camino un arranque
   * obsoleto llegara a arrancar el transporte, el reloj lo detecta
   * (`!wantPlaying` con el transporte corriendo) y lo deja en pausa. Así el estado
   * de React y el del motor no pueden quedar diciendo cosas distintas.
   */
  private wantPlaying = false;

  /**
   * Marcas de tiempo del arranque en frío, para poder desglosar dónde se va el
   * tiempo (lo pidió el QA). Sólo se llenan en desarrollo y no tocan el audio.
   */
  private timings: Record<string, number> = {};

  /** `performance.now()` del último `play()`, para medir hasta la primera nota. */
  private playStartedAt = 0;

  /**
   * Perilla **Groove** (0..1), ver `@app/engine/groove`.
   *
   * 0 = fiel al archivo MIDI. Se lee al AGENDAR (play y seek), igual que el piano:
   * moverla mientras suena no reagenda, así que el arrastre del slider no mete un
   * corte por cada píxel. Vale desde el próximo play/seek.
   */
  private grooveAmount = 0;

  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private warmedUp = false;
  private warmDone = false;

  /** Canción cuya precarga quedó esperando a que el motor exista. */
  private pendingPreload: SongData | null = null;
  private preloadGeneration = 0;
  private skippedNotes = 0;

  /**
   * Se llama cuando la canción llega a su final NATURAL.
   *
   * App.tsx no necesitaba este aviso (su `bridge.onEnded` nunca llegó a
   * dispararse: el `PlayerContext` del piano lo registra y no lo invoca), así
   * que allá la cola no avanza sola al terminar un tema. Acá sí se avisa, con
   * el mismo `notifyEnded()` que el contexto expone para exactamente esto:
   * repetir-una, siguiente, radio automática o parar.
   */
  onSongEnd: (() => void) | null = null;

  // ─── Suscripción (lo que consume `useSyncExternalStore`) ───────────────────

  subscribe = (listener: (snapshot: EngineSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  private patch(partial: Partial<EngineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /** Canción que está en el transporte (con sus notas). */
  get currentSong(): SongData | null {
    return this.song;
  }

  /** ¿El transporte está corriendo? */
  get isPlaying(): boolean {
    return Tone.Transport.state === "started";
  }

  /** ¿El host cree que debería estar sonando? (intención, no estado del motor) */
  get intendsToPlay(): boolean {
    return this.wantPlaying;
  }

  /** Guarda una marca de tiempo relativa a `t0`, para el desglose del arranque. */
  private mark(name: string, t0: number): void {
    if (!import.meta.env.DEV) return;
    this.timings[name] = Math.round(performance.now() - t0);
  }

  get duration(): number {
    return this.song?.duration ?? 0;
  }

  // ─── Motor ────────────────────────────────────────────────────────────────

  /**
   * Construye el grafo y arranca el AudioContext.
   *
   * Tiene que salir de un gesto del usuario (Web Audio no deja arrancar el
   * contexto si no) y es idempotente: dos clicks comparten la misma promesa.
   */
  init(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    const task = (async () => {
      const t0 = performance.now();
      await this.engine.init();
      this.mark("grafoListo", t0);
      await this.loadPianoSampler();
      this.mark("pianoNucleoListo", t0);
      this.initialized = true;
      this.patch({ audioReady: true, status: "Motor de audio listo" });
      // El motor recién ahora puede bajar samples: si la canción se cargó antes
      // (página recién abierta, sin gestos), la precarga arranca acá.
      this.flushPendingPreload();
    })();

    this.initPromise = task;
    void task.catch(() => {
      // Se libera la promesa para que el próximo gesto reintente: un fallo de
      // arranque no puede dejar el reproductor muerto para siempre.
      this.initPromise = null;
    });
    return task;
  }

  /**
   * Calienta el motor con el PRIMER gesto del usuario (click, tecla, toque).
   *
   * La regla del proyecto es precargar al CARGAR la canción, no al pulsar play.
   * Pero el AudioContext no arranca sin un gesto, así que si el motor sólo se
   * construyera en el play, en una página recién abierta la precarga no podría
   * empezar y el primer click pagaría el arranque entero.
   *
   * Se cuelga en fase de CAPTURA para que el motor arranque en el mismo gesto en
   * que el usuario toca cualquier cosa (incluido el botón de play).
   */
  warmUpOnFirstGesture(): void {
    if (this.warmedUp) return;
    this.warmedUp = true;

    const start = () => {
      if (this.warmDone) return;
      this.warmDone = true;
      for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
        window.removeEventListener(type, start, true);
      }
      void this.init().catch((error: unknown) => {
        this.patch({
          error:
            error instanceof Error
              ? `No se pudo preparar el audio: ${error.message}`
              : "No se pudo preparar el audio",
        });
      });
    };

    for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
      window.addEventListener(type, start, true);
    }
  }

  /**
   * Sampler de piano acústico (Salamander), en DOS fases.
   *
   * Fase 1: un núcleo de 3 samples reales repartidos por el registro — el piano
   * ya suena repitcheando los que faltan. Fase 2: el registro completo, en
   * segundo plano. Esperar los 30 samples (~6,6 MB) era parte del arranque en
   * frío de 7,7 s del piano.
   */
  private async loadPianoSampler(): Promise<void> {
    const dest = this.engine.pianoInput;
    if (!dest) return;

    const samples = salamanderSamples();
    const coreNotes = ["C2", "C4", "D#5"];
    const coreUrls: Record<string, string> = {};
    for (const note of coreNotes) {
      const file = samples[note];
      if (file) coreUrls[note] = `${SAMPLES_BASE_URL}/${file}`;
    }
    if (Object.keys(coreUrls).length === 0) return;

    await new Promise<void>((resolve) => {
      const sampler = new Tone.Sampler({
        urls: coreUrls,
        release: PIANO_RELEASE_SEC,
        onload: () => {
          this.pianoSampler = sampler;
          this.pianoVoice = sampler;
          this.engine.hasPianoSampler = true;
          resolve();
          // Fase 2: el registro completo, sin bloquear nada.
          void this.extendPianoSampler(sampler, samples, coreNotes);
        },
        onerror: () => {
          // Sin piano real, las notas de piano se SALTEAN (nunca se sintetizan).
          console.warn(
            "[reproductor] el sampler de piano no cargó: las notas de piano quedan en silencio",
          );
          resolve();
        },
      }).connect(dest);
    });
  }

  private async extendPianoSampler(
    sampler: Tone.Sampler,
    samples: Record<string, string>,
    alreadyLoaded: string[],
  ): Promise<void> {
    const raw = Tone.getContext().rawContext as BaseAudioContext;
    await Promise.all(
      Object.entries(samples)
        .filter(([note]) => !alreadyLoaded.includes(note))
        .map(async ([note, file]) => {
          try {
            const response = await fetch(`${SAMPLES_BASE_URL}/${file}`);
            if (!response.ok) return;
            const buffer = await raw.decodeAudioData(await response.arrayBuffer());
            sampler.add(note as Tone.Unit.Note, buffer);
          } catch {
            /* el núcleo ya suena: los que falten son una mejora */
          }
        }),
    );
  }

  // ─── El contrato de `PlayerContext.PlaybackHost` ──────────────────────────

  /**
   * Carga una canción en el motor SIN arrancarla, y lanza la precarga.
   *
   * Mismo cortocircuito que App.tsx: si la canción ya es la del motor no se
   * recarga. Importa porque `PlayerContext` llama `load()` + `play()` en el
   * mismo tick y para "repetir una" vuelve a pedir la misma.
   */
  load(song: SongData): void {
    if (song.trackId && song.trackId === this.songId) return;

    // Cambio de canción: se corta lo que estaba sonando ANTES de tocar el estado.
    this.stop();

    this.song = song;
    this.songId = song.trackId ?? null;
    this.skippedNotes = 0;

    // El mezclador vuelve a los valores del archivo ANTES de precargar: si no, la
    // precarga pediría los instrumentos de la canción anterior (App.tsx tiene esa
    // carrera entre dos efectos, acá se resuelve en el mismo lugar donde se carga).
    this.mix = {
      muted: {},
      solo: {},
      volumes: Object.fromEntries(
        song.tracks.map((track) => [track.index, DEFAULT_TRACK_VOLUME]),
      ),
      instruments: Object.fromEntries(
        song.tracks.map((track) => [
          track.index,
          track.instrument || "Acoustic Grand Piano",
        ]),
      ),
    };

    this.patch({
      songId: this.songId,
      songVersion: this.snapshot.songVersion + 1,
      tracks: song.tracks,
      duration: song.duration,
      samplesReady: false,
      samplesProgress: { done: 0, total: countSongInstruments(song) },
      silentInstruments: [],
      error: null,
      status: "Cargando instrumentos…",
    });

    void this.precargar(song);
  }

  /**
   * Arranca (o reanuda) la reproducción desde `offsetSec`.
   *
   * El orden importa y es el del piano: motor listo → esperar los samples del
   * arranque (con tope) → agendar → ubicar el tick ESCUCHADO → arrancar.
   *
   * ES CANCELABLE: como tarda segundos en frío, entre el pedido y el arranque real
   * puede llegar un `pause()`/`stop()`/cambio de canción. En ese caso este método
   * abandona sin arrancar nada (ver `playToken`) — si no, el motor quedaba sonando
   * mientras React creía que estaba en pausa.
   */
  async play(offsetSec?: number): Promise<void> {
    const song = this.song;
    if (!song) return;
    if (song.notes.length + (song.percussion?.length ?? 0) === 0) return;

    const token = ++this.playToken;
    const t0 = performance.now();
    this.wantPlaying = true;
    this.playStartedAt = t0;
    // Un arranque nuevo invalida el desglose anterior.
    this.timings = { pedido: 0 };

    try {
      if (!this.initialized) {
        this.patch({ status: "Preparando el motor de audio…" });
        await this.init();
        this.mark("motorListo", t0);
      }
    } catch (error) {
      // Un motor que no arranca es lo ÚNICO que puede rechazar: la intención se
      // apaga acá para que el host y el `PlayerContext` digan lo mismo.
      this.wantPlaying = false;
      this.patch({
        error:
          error instanceof Error
            ? `No se pudo arrancar el audio: ${error.message}`
            : "No se pudo arrancar el audio",
      });
      throw error;
    }
    if (token !== this.playToken) return; // lo cancelaron mientras se construía el motor

    // Sin respaldo sintetizado, una nota que llega antes que su sample no suena.
    // Se espera a los instrumentos del arranque con tope corto: lo que falte se
    // suma solo (cada nota resuelve su fuente al dispararse).
    //
    // El `catch` NO es decorativo: si UN sample falla (404, red), el
    // `Promise.all` del motor rechaza. Sin atraparlo, el arranque entero se caía y
    // el `PlayerContext` marcaba "no está reproduciendo" aunque la canción pudiera
    // sonar perfectamente con los samples que sí bajaron.
    if (!this.snapshot.samplesReady) {
      await this.engine
        .waitForEarlySamples(SAMPLES_WAIT_MS)
        .catch(() => undefined);
      if (token !== this.playToken) return; // lo cancelaron mientras esperaba samples
      this.mark("samplesListos", t0);
      const progress = this.snapshot.samplesProgress;
      this.patch({ samplesReady: progress.done >= progress.total });
    }

    const atEnd = this.positionRef.current >= this.duration - 0.05;
    const from = offsetSec ?? (atEnd ? 0 : this.positionRef.current);

    Tone.Transport.bpm.value = song.bpm > 0 ? song.bpm : 120;
    this.schedule();
    // `ticksFor` (y no una cuenta directa) porque hay que ubicar la posición
    // ESCUCHADA: asignar el tick crudo deja el audio una ventana más adelante.
    Tone.Transport.ticks = ticksFor(from);
    this.positionRef.current = from;

    // `startTransportMusic` en vez de `start()`: un transporte arrancado en
    // "now" reporta sus primeros eventos contra un instante que ya pasó, y las
    // notas iniciales de cada canción se renderizaban todas juntas.
    startTransportMusic();
    this.mark("transporteArrancado", t0);
    this.startClock();
  }

  /**
   * Pausa: libera las voces sostenidas y deja el reloj donde estaba.
   *
   * SIEMPRE cancela el arranque en vuelo, incluso cuando el transporte todavía no
   * está corriendo: es exactamente el caso "el usuario pausó mientras el motor
   * bajaba samples". Antes esta función salía temprano sin cancelar nada y el
   * `play()` pendiente arrancaba igual (el bug de `isPlaying` en false con la
   * canción sonando).
   */
  pause(): void {
    this.wantPlaying = false;
    this.playToken += 1;

    if (Tone.Transport.state !== "started") {
      // No hay nada sonando: sólo hay que asegurarse de que el reloj no quede vivo.
      this.stopClock();
      return;
    }
    // Un sample truncado por el release hace click: se baja el bus primero y se
    // cortan las voces cuando ya están inaudibles.
    this.releaseVoicesSmoothly();
    Tone.Transport.pause();
    this.stopClock();
    // Las voces del PIANO se liberan ya (su `release` es el fade del sample) y
    // las de la capa de fuentes esperan al fade: mismo criterio que el piano.
    this.pianoSampler?.releaseAll();
    this.engine.releaseAllVoices();
  }

  /** Detiene y vuelve al principio. También cancela cualquier arranque en vuelo. */
  stop(): void {
    this.wantPlaying = false;
    this.playToken += 1;

    const wasRunning = Tone.Transport.state !== "stopped";
    if (wasRunning) this.releaseVoicesSmoothly();

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.ticks = 0;
    this.positionRef.current = 0;
    this.voices.clear();
    this.voiceInstruments.clear();

    this.pianoSampler?.releaseAll();
    this.engine.releaseAllVoices();
    this.stopClock();
  }

  /** Busca una posición; si estaba sonando, sigue sonando desde ahí. */
  seek(sec: number): void {
    if (!this.song) return;
    const target = Math.max(0, Math.min(this.duration, sec));
    const wasPlaying = Tone.Transport.state === "started";

    // Un seek es un cambio de material: lo que suena ya no pertenece a esta
    // posición. Se libera TODO (piano, capa de fuentes y batería) o los samples
    // largos — VSCO dura hasta 84 s — siguen sonando por encima.
    this.releaseVoicesSmoothly();
    this.positionRef.current = target;

    if (wasPlaying) {
      this.schedule();
      Tone.Transport.ticks = ticksFor(target);
      startTransportMusic();
      this.startClock();
    } else {
      Tone.Transport.ticks = ticksFor(target);
    }
  }

  /**
   * Volumen maestro. El reproductor habla 0..1 y el motor en dB, así que se
   * mapea con la MISMA fórmula que el piano: `dB = −40 + volumen × 40`.
   * Ojo: el mínimo no es silencio (−40 dB), es "muy bajo" — igual que allá.
   */
  setVolume(volume: number, muted: boolean): void {
    const db = muted ? -60 : -40 + volume * 40;
    this.engine.setMasterVolume(db);
  }

  /** Posición ESCUCHADA en segundos. Imperativa, nunca estado de React. */
  getPosition(): number {
    if (Tone.Transport.state !== "started") return this.positionRef.current;
    const heard = heardSeconds();
    return heard > 0 ? heard : this.positionRef.current;
  }

  // ─── Mezclador por pista ──────────────────────────────────────────────────

  /**
   * Publica el mezclador completo (mute/solo/volumen/instrumento por pista).
   *
   * El scheduler lo lee POR NOTA, así que un cambio vale desde la nota
   * siguiente sin reagendar nada — exactamente el criterio del piano, donde el
   * estado vive en React y el disparo lo lee de un `ref`.
   */
  setMix(mix: LiveMix): void {
    this.mix = mix;
  }

  /**
   * Posición de la perilla **Groove** (0..1).
   *
   * Se guarda y se aplica en el próximo agendado (play o seek), que es lo que hace
   * el piano. Devolver el valor vigente permite que la UI y las mediciones lo lean.
   */
  setGroove(amount: number): void {
    const next = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    this.grooveAmount = next;
  }

  get groove(): number {
    return this.grooveAmount;
  }

  /**
   * Cambió el instrumento de una pista: hay que soltar lo que está sonando con
   * el instrumento VIEJO (el release resuelve el sampler por la voz, ver
   * `voiceInstruments`) y bajar el sample que falte.
   */
  reloadTrackInstrument(trackIndex: number): void {
    this.releaseTrackVoices(trackIndex);
    const instrument = this.mix.instruments[trackIndex];
    if (!instrument || this.engine.samplerFor(instrument) !== null) return;

    const notes = new Set<number>();
    for (const note of this.song?.notes ?? []) {
      if (note.trackIndex === trackIndex) notes.add(note.midi);
    }
    if (notes.size === 0) for (let midi = 48; midi <= 72; midi++) notes.add(midi);

    const generation = this.preloadGeneration;
    void this.engine
      .loadInstrumentOnDemand(instrument, [...notes])
      .then((ok) => {
        if (generation !== this.preloadGeneration) return;
        this.patch({
          status: ok
            ? `✓ ${instrument} listo (${sourceKindFor(instrument)})`
            : `${instrument} no tiene sample real: su pista queda en silencio`,
        });
      })
      .catch(() => {
        this.patch({ status: `${instrument}: no se pudo cargar el sample real` });
      });
  }

  /** Suelta lo que está sonando en una pista (mute, solo, instrumento). */
  releaseTrackVoices(trackIndex: number): void {
    const sounding = this.voices.get(trackIndex);
    if (!sounding || sounding.size === 0) return;
    for (const midi of [...sounding]) {
      // El instrumento del ATAQUE, no el actual: si el usuario acaba de cambiar
      // el instrumento de la pista, la voz viva es la del instrumento viejo.
      const instrument =
        this.voiceInstruments.get(`${trackIndex}-${midi}`) ??
        this.mix.instruments[trackIndex] ??
        "Acoustic Grand Piano";
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      if (instrument.trim().toLowerCase().includes("piano")) {
        try {
          this.pianoVoice?.triggerRelease(freq);
        } catch {
          /* ya liberada */
        }
      } else {
        try {
          this.engine.samplerFor(instrument)?.triggerRelease(freq);
        } catch {
          /* ya liberada */
        }
      }
      this.voices.get(trackIndex)?.delete(midi);
      this.voiceInstruments.delete(`${trackIndex}-${midi}`);
    }
  }

  /** Suelta todas las voces de las pistas que ya no son audibles. */
  releaseInaudibleVoices(): void {
    const anySolo = Object.values(this.mix.solo).some(Boolean);
    for (const [trackIndex, sounding] of [...this.voices]) {
      const audible = anySolo
        ? this.mix.solo[trackIndex] === true
        : this.mix.muted[trackIndex] !== true;
      if (audible || sounding.size === 0) continue;
      this.releaseTrackVoices(trackIndex);
    }
  }

  /** Volumen por defecto del mezclador (lo usa el shell al cargar una canción). */
  static defaultTrackVolume(): number {
    return DEFAULT_TRACK_VOLUME;
  }

  // ─── Precarga ─────────────────────────────────────────────────────────────

  /**
   * Precarga instrumentos y percusión, y mantiene la píldora de estado honesta.
   *
   * El contador se muestra EN VIVO mientras falte cualquier instrumento (no sólo
   * mientras alguien espera): así nunca queda vacío en la espera larga.
   */
  private async precargar(song: SongData): Promise<void> {
    const generation = ++this.preloadGeneration;

    // El motor todavía no está construido (página recién abierta, sin gestos):
    // la precarga queda agendada y arranca sola en `init()`.
    if (!this.initialized) {
      this.pendingPreload = song;
      const total = countSongInstruments(song);
      this.patch({
        status:
          total > 0
            ? `${total} instrumento${total === 1 ? "" : "s"} por cargar · tocá play`
            : "Canción sin instrumentos",
      });
      return;
    }

    const instrumentsForTrack = (trackIndex: number) =>
      this.mix.instruments[trackIndex] ?? "Acoustic Grand Piano";

    this.engine.loadSong(song, instrumentsForTrack, (progress) => {
      if (generation !== this.preloadGeneration) return;
      this.patch({ samplesProgress: progress });
    });
    this.engine.loadPercussion(song);

    const total = this.snapshot.samplesProgress.total;
    this.stopProgressTimer();
    if (total > 0) {
      this.progressTimer = window.setInterval(() => {
        if (generation !== this.preloadGeneration) return;
        const progress = this.snapshot.samplesProgress;
        this.patch({
          status: `Cargando instrumentos ${progress.done}/${progress.total}…`,
        });
      }, 250);
    }

    // El arranque sólo bloquea por los instrumentos de los primeros segundos.
    await this.engine.waitForEarlySamples();
    if (generation !== this.preloadGeneration) return;
    this.patch({
      samplesReady:
        this.snapshot.samplesProgress.done >= this.snapshot.samplesProgress.total,
    });

    // El resto sigue bajando en segundo plano; cuando termina, el estado lo dice.
    await this.engine.waitForAllSamples();
    if (generation !== this.preloadGeneration) return;
    this.stopProgressTimer();

    const progress = this.snapshot.samplesProgress;
    const silent = [
      ...new Set(
        song.tracks
          .filter((track) => !track.isDrumKit)
          .map(
            (track) => this.mix.instruments[track.index] ?? track.instrument,
          )
          .filter((inst): inst is string => Boolean(inst))
          // El piano acústico no lo toca la capa de fuentes sino el sampler
          // Salamander, así que "sin fuente real" no aplica: sonaría con el
          // sampler o no sonaría nunca, pero no es un instrumento sin banco.
          .filter((inst) => !usesSalamanderPiano(inst))
          .filter((inst) => sourceKindFor(inst) === "sin fuente real"),
      ),
    ];
    this.patch({
      samplesReady: progress.done >= progress.total,
      silentInstruments: silent,
      status:
        silent.length === 0
          ? `✓ ${progress.done}/${progress.total} instrumentos con sample real`
          : `⚠ ${progress.done}/${progress.total} con sample real · sin fuente real (su pista queda en silencio): ${silent.join(", ")}`,
    });
  }

  /** Arranca la precarga que había quedado esperando al motor. */
  private flushPendingPreload(): void {
    const pending = this.pendingPreload;
    if (!pending) return;
    this.pendingPreload = null;
    if (this.song !== pending) return;
    void this.precargar(pending);
  }

  private stopProgressTimer(): void {
    if (this.progressTimer !== null) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  // ─── Interno ──────────────────────────────────────────────────────────────

  private schedulerHost(): SchedulerHost {
    if (this.host) return this.host;
    this.host = {
      engine: this.engine,
      getMix: () => this.mix,
      getPianoVoice: () => this.pianoVoice,
      getDrumKit: () => this.engine.drumKit,
      onVoiceStart: (trackIndex, midi) => {
        const set = this.voices.get(trackIndex) ?? new Set<number>();
        set.add(midi);
        this.voices.set(trackIndex, set);
        // Se guarda el instrumento del momento del ataque: el release tiene que
        // usar ESE, no el que el usuario elija después.
        this.voiceInstruments.set(
          `${trackIndex}-${midi}`,
          this.mix.instruments[trackIndex] ?? "Acoustic Grand Piano",
        );
        // Marca de la PRIMERA nota disparada: es el otro extremo del arranque en
        // frío (lo que tarda en oírse algo desde el click).
        if (!this.timings.primeraNota && this.playStartedAt > 0) {
          this.mark("primeraNota", this.playStartedAt);
        }
      },
      onVoiceEnd: (trackIndex, midi) => {
        this.voices.get(trackIndex)?.delete(midi);
        this.voiceInstruments.delete(`${trackIndex}-${midi}`);
      },
      onNoteSkipped: () => {
        this.skippedNotes += 1;
      },
    };
    return this.host;
  }

  /**
   * Rehace la agenda completa (al arrancar y al buscar).
   *
   * Los eventos con tick anterior al actual los descarta Tone solo, así que no
   * hace falta filtrar las notas pasadas.
   */
  private schedule(): void {
    if (!this.song) return;
    scheduleSongOnTransport(this.song, this.schedulerHost(), {
      amount: this.grooveAmount,
      instruments: this.mix.instruments,
    });
    this.voices.clear();
    this.voiceInstruments.clear();
  }

  /**
   * Silencia sin click: primero se baja el volumen de los buses (12 ms), después
   * se cortan las voces, cuando ya están inaudibles.
   *
   * `releaseAll` en un Tone.Sampler es un `source.stop()` sin fade: cortar la
   * mezcla en seco es el pop que se oía al pausar y al cambiar de canción.
   */
  private releaseVoicesSmoothly(): void {
    const fade = fadeOutNodesVolume([
      this.pianoSampler,
      this.engine.instrumentDest,
    ]);

    this.cancelVoiceCleanup?.();
    this.cancelVoiceCleanup = stopVoicesDeferred(() => {
      // TODAS las fuentes: la capa de instrumentos (VSCO/tonejs/WAF/acordeón),
      // el kit de percusión y el sampler de piano. Sin esto, los samples largos
      // siguen sonando ENCIMA de la canción siguiente.
      this.engine.releaseAllVoices();
      this.pianoSampler?.releaseAll();
      this.voices.clear();
      this.voiceInstruments.clear();
    }, fade.fadeSec + 0.05);
  }

  // ─── Reloj ────────────────────────────────────────────────────────────────

  /**
   * Bucle de reproducción: actualiza `positionRef` por frame y detecta el final.
   *
   * NO publica nada a React: la barra tiene su propio `requestAnimationFrame` y
   * lee `getPosition()`. Acá sólo se escribe el `ref` (lo leen las mediciones y
   * `PlayerContext.getPosition`).
   */
  private startClock(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);

    const tick = () => {
      if (Tone.Transport.state !== "started") {
        this.rafId = null;
        return;
      }

      // RED DE SEGURIDAD DE LA INTENCIÓN: si el usuario pidió pausar/detener y el
      // transporte igual quedó corriendo (un arranque obsoleto que se coló), se
      // deja en pausa acá. Sin esto, React podía decir "no está reproduciendo"
      // mientras el motor seguía sonando — el bug de `isPlaying`.
      if (!this.wantPlaying) {
        this.releaseVoicesSmoothly();
        Tone.Transport.pause();
        this.pianoSampler?.releaseAll();
        this.engine.releaseAllVoices();
        this.rafId = null;
        return;
      }

      // `heardSeconds()` resta la ventana del scheduler: sin eso el cursor va
      // por delante de lo que se oye.
      const time = heardSeconds();
      this.positionRef.current = time;

      if (this.duration > 0 && time >= this.duration) {
        // Fin NATURAL: se corta el transporte y se avisa al reproductor, que
        // decide qué sigue (repetir una, siguiente, radio o parar). La intención
        // se apaga antes de avisar: si el reproductor no arranca nada, el estado
        // de React y el del motor tienen que decir lo mismo.
        this.wantPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.ticks = 0;
        this.positionRef.current = 0;
        this.voices.clear();
        this.voiceInstruments.clear();
        this.pianoSampler?.releaseAll();
        this.engine.releaseAllVoices();
        this.rafId = null;
        this.onSongEnd?.();
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };

    const waitForTransport = (attempt = 0) => {
      if (Tone.Transport.state === "started") {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      // El transporte arranca unos milisegundos en el futuro: revisar el estado
      // UNA vez dejaba el bucle sin arrancar nunca.
      if (attempt >= 120) {
        this.rafId = null;
        return;
      }
      this.rafId = requestAnimationFrame(() => waitForTransport(attempt + 1));
    };

    waitForTransport();
  }

  private stopClock(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ─── Diagnóstico (lo usan las mediciones, no la UI) ───────────────────────

  /** Voces sonando ahora (pista → notas MIDI). Prueba de "no quedó nada colgado". */
  soundingVoices(): Record<number, number[]> {
    const out: Record<number, number[]> = {};
    for (const [track, notes] of this.voices) out[track] = [...notes];
    return out;
  }

  get skippedNoteCount(): number {
    return this.skippedNotes;
  }

  audioState(): { state: string; contextTime: number } {
    const context = this.engine.audioContext;
    return {
      state: context?.state ?? "sin contexto",
      contextTime: context?.currentTime ?? 0,
    };
  }

  /** Desglose del último arranque, en ms desde el `play()` (diagnóstico). */
  startTimings(): Record<string, number> {
    return { ...this.timings };
  }

  /** Libera todo y desmonta (cierre de la pestaña). */
  dispose(): void {
    this.stop();
    this.stopProgressTimer();
    this.cancelVoiceCleanup?.();
    this.engine.releaseAllVoices();
    this.pianoSampler?.dispose();
    this.pianoSampler = null;
    this.pianoVoice = null;
    this.engine.dispose();
    this.listeners.clear();
  }
}

/**
 * Cantidad de instrumentos que la canción va a pedir (para el contador).
 *
 * El piano acústico NO cuenta: lo toca el sampler Salamander, que no sale de la
 * capa de fuentes. Mismo criterio que `AudioEngine.loadSong`.
 */
export function countSongInstruments(song: SongData): number {
  const names = new Set<string>();
  for (const track of song.tracks) {
    if (track.isDrumKit) continue;
    if (!track.instrument) continue;
    if (usesSalamanderPiano(track.instrument)) continue;
    names.add(track.instrument);
  }
  return names.size;
}
