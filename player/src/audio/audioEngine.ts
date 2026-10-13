/**
 * audioEngine — el motor del reproductor: grafo de audio + carga de instrumentos.
 *
 * QUÉ ES Y QUÉ NO ES
 * ------------------
 * No inventa sonido: es el MISMO camino que usa el piano.
 *
 *   cadena maestra:  vol → chorus ─┬──────────────────→ compressor → makeup → limiter → salida
 *                                  └→ pasa-altos → reverb (envío 100% wet) → compressor
 *
 *   instrumentos:    loadInstrument() de `@engine/instrumentSources` (VSCO / FreePats /
 *                    tonejs-instruments / WebAudioFont / gleitz con failover) → EQ de
 *                    familia + paneo (`createInstrumentChain`)
 *   percusión:       DrumKitEngine (samples reales por pieza)
 *
 * Dos decisiones heredadas del piano que se respetan a propósito:
 *
 *   1. **Cero sintetizadores.** Si un instrumento no tiene sample real listo, la
 *      nota se saltea. No hay respaldo de osciladores en ningún lado.
 *   2. **Precarga al cargar la canción, no al pulsar play**, y el arranque no
 *      espera más de `SAMPLES_WAIT_MS`: espera sólo los instrumentos que suenan
 *      en los primeros segundos y el resto se suma en segundo plano.
 */

import * as Tone from "tone";
import { createInstrumentChain } from "@engine/instrumentChain";
import type { InstrumentChain } from "@engine/instrumentChain";
import { DrumKitEngine } from "@engine/DrumKitEngine";
import {
  disposeAllInstruments,
  getInstrumentStatus,
  getInstrumentSync,
  loadInstrument,
  releaseAllInstruments,
} from "@engine/instrumentSources";
import type { InstrumentStatus } from "@engine/instrumentSources";
import { usesSalamanderPiano } from "@app/utils/playbackRouting";
import { configureAudioTiming, heardTransportSeconds, ticksForHeardSeconds } from "@app/audio/audioTiming";
import type { SongData } from "@app/types/song";

/** Destino de los samples de instrumentos: el bus maestro del reproductor. */
export type InstrumentDest = Tone.ToneAudioNode;

/**
 * Tope de espera por los samples antes de arrancar el transporte.
 *
 * Medido en el piano: con un tope de 7 s el transporte arrancaba a los 7,8 s del
 * click. Los samples que falten se suman solos (cada nota resuelve su fuente al
 * dispararse), así que esperar más sólo retrasa el arranque.
 */
export const SAMPLES_WAIT_MS = 2_500;

/**
 * Ventana que decide POR QUÉ instrumentos espera el arranque: los que suenan en
 * los primeros segundos de la canción. El resto baja en segundo plano.
 */
export const EARLY_AUDIO_WINDOW_SEC = 6;

/** Progreso de precarga, para la píldora de estado honesta. */
export interface LoadProgress {
  done: number;
  total: number;
}

export class AudioEngine {
  private limiter: Tone.Limiter | null = null;
  private compressor: Tone.Compressor | null = null;
  private reverb: Tone.Reverb | null = null;
  private chorus: Tone.Chorus | null = null;
  private vol: Tone.Volume | null = null;
  private pianoChain: InstrumentChain | null = null;
  private drum: DrumKitEngine | null = null;
  private ready = false;
  private starting: Promise<void> | null = null;

  /** Volumen maestro en dB (el piano arranca en -10 dB). */
  private masterVolumeDb = -10;

  /**
   * Instrumentos de la canción cargada (para los contadores de estado).
   * Se llena en `loadSong` y se lee sin recalcular nada.
   */
  private loadedInstruments: string[] = [];
  /** Promesas de precarga de la canción actual (para esperar antes de arrancar). */
  private earlyReady: Promise<unknown> = Promise.resolve();
  private allReady: Promise<unknown> = Promise.resolve();
  private generation = 0;

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * El `AudioContext` vivo, o `null` si el motor todavía no se construyó.
   *
   * Lo usan las mediciones para distinguir "el contexto está suspendido" (no hay
   * audio en absoluto) de "el contexto corre pero no suena nada" (silencio real).
   */
  get audioContext(): AudioContext | null {
    if (!this.ready) return null;
    return Tone.getContext().rawContext as AudioContext;
  }

  /** Punto de entrada de los samples de instrumentos (el bus maestro). */
  get instrumentDest(): InstrumentDest | null {
    return this.vol;
  }

  get drumKit(): DrumKitEngine | null {
    return this.drum;
  }

  /**
   * Construye el grafo y arranca el AudioContext.
   *
   * Tiene que llamarse desde un gesto del usuario (`Tone.start()` lo exige) y es
   * idempotente: dos clicks seguidos comparten la misma promesa.
   */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      // La ventana de scheduling se configura ANTES de `Tone.start()`: sin ella
      // el primer tick no tiene margen y las primeras notas nacen atrasadas.
      configureAudioTiming();

      await Tone.start();

      const limiter = new Tone.Limiter(-2).toDestination();
      // Ganancia de compensación: el EQ por familia recorta graves y barro que
      // aportaban ~4 dB de energía (ver instrumentChain.ts).
      const makeup = new Tone.Gain(1.12).connect(limiter);
      const compressor = new Tone.Compressor({
        threshold: -18,
        ratio: 5,
        attack: 0.003,
        release: 0.1,
        knee: 6,
      }).connect(makeup);

      // Reverb como ENVÍO, nunca en serie: en serie el bajo entra al reverb y la
      // mezcla queda embarrada.
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 1 }).connect(compressor);
      // La generación del impulso NO se espera: mientras no esté, la señal seca
      // suena igual y la cola aparece un instante después.
      void reverb.generate().catch(() => {
        /* sin impulso el envío queda seco; la señal directa no cambia */
      });
      const reverbHighpass = new Tone.Filter({
        type: "highpass",
        frequency: 200,
        Q: 0.7,
      }).connect(reverb);
      const reverbSend = new Tone.Gain(0.18).connect(reverbHighpass);

      const chorus = new Tone.Chorus(4, 2.5, 0.5);
      chorus.wet.value = 0;
      chorus.start();
      chorus.connect(compressor);
      chorus.connect(reverbSend);

      const vol = new Tone.Volume(this.masterVolumeDb).connect(chorus);

      this.limiter = limiter;
      this.compressor = compressor;
      this.reverb = reverb;
      this.chorus = chorus;
      this.vol = vol;

      // Percusión real (canal 10): sólo samples grabados, sin respaldo sintetizado.
      this.drum = new DrumKitEngine(vol);

      // Cadena del piano acústico (Salamander): el piano del piano-midi-pro no
      // pasa por `instrumentSources` — va por su propio sampler con el mismo EQ
      // y paneo que los demás instrumentos.
      this.pianoChain = createInstrumentChain("Acoustic Grand Piano", vol);

      this.ready = true;
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  /** Aplica el volumen maestro (dB) con una rampa corta, sin clicks. */
  setMasterVolume(db: number): void {
    this.masterVolumeDb = db;
    this.vol?.volume.rampTo(db, 0.05);
  }

  getMasterVolume(): number {
    return this.masterVolumeDb;
  }

  /** Nodo de entrada del sampler de piano (lo conecta el controlador). */
  get pianoInput(): Tone.ToneAudioNode | null {
    return this.pianoChain?.input ?? null;
  }

  /**
   * Precarga los instrumentos que la canción necesita.
   *
   * Sólo se bajan las notas que la canción usa (20-30 por pista en vez de los 85
   * de un banco completo) y los instrumentos que suenan en los primeros segundos
   * son los únicos que bloquean el arranque.
   *
   * @param instrumentsForTrack resuelve el instrumento EFECTIVO de una pista
   *   (incluye los cambios del mezclador), no el del archivo.
   */
  loadSong(
    song: SongData,
    instrumentsForTrack: (trackIndex: number) => string,
    onProgress: (progress: LoadProgress) => void,
  ): void {
    const dest = this.vol;
    if (!this.ready || !dest) return;

    // Cada canción cancela la precarga de la anterior: si no, los instrumentos
    // viejos siguen bajando y compiten por ancho de banda con los nuevos.
    const generation = ++this.generation;

    const notesByInstrument = new Map<string, Set<number>>();
    for (const track of song.tracks) {
      if (track.isDrumKit) continue; // la percusión tiene su propio motor
      const instrument = instrumentsForTrack(track.index);
      if (!instrument) continue;
      // El piano acústico lo toca el sampler Salamander: pedir además su versión
      // de VSCO eran decenas de MB que nunca se oían.
      if (usesSalamanderPiano(instrument)) continue;

      const notes = notesByInstrument.get(instrument) ?? new Set<number>();
      for (const note of song.notes) {
        if (note.trackIndex === track.index) notes.add(note.midi);
      }
      // Pista sin notas: se pide el rango central del piano para que el sampler
      // exista si el usuario la desmutea.
      if (notes.size === 0) for (let midi = 48; midi <= 72; midi++) notes.add(midi);
      notesByInstrument.set(instrument, notes);
    }

    this.loadedInstruments = [...notesByInstrument.keys()];

    if (notesByInstrument.size === 0) {
      onProgress({ done: 0, total: 0 });
      this.earlyReady = Promise.resolve();
      this.allReady = Promise.resolve();
      return;
    }

    onProgress({ done: 0, total: notesByInstrument.size });

    // Instrumentos que suenan en los primeros segundos: los únicos que bloquean
    // el arranque.
    const earlyInstruments = new Set<string>();
    for (const note of song.notes) {
      if (note.time > EARLY_AUDIO_WINDOW_SEC) continue;
      const instrument = instrumentsForTrack(note.trackIndex);
      if (instrument) earlyInstruments.add(instrument);
    }

    let done = 0;
    const earlyPending: Promise<unknown>[] = [];
    const latePending: Promise<unknown>[] = [];
    for (const [instrument, notes] of notesByInstrument) {
      const task = loadInstrument(instrument, dest, [...notes]).then((result) => {
        done += 1;
        if (generation === this.generation) onProgress({ done, total: notesByInstrument.size });
        return result;
      });
      (earlyInstruments.has(instrument) ? earlyPending : latePending).push(task);
    }

    this.earlyReady =
      earlyPending.length > 0 ? Promise.all(earlyPending) : Promise.resolve();
    // El resto baja RECIÉN cuando terminó lo de los primeros segundos: si
    // compiten por el ancho de banda, el primer golpe de la canción llega tarde
    // y se saltea.
    this.allReady = this.earlyReady.then(() => Promise.all(latePending));
  }

  /**
   * Percusión: baja SÓLO las piezas que usa la canción.
   *
   * Un kit GM completo son 47 archivos y una canción usa entre 4 y 12 piezas.
   * Igual que con los instrumentos, las piezas de los primeros segundos son las
   * que bloquean el arranque.
   */
  loadPercussion(song: SongData): void {
    const drum = this.drum;
    const percussion = song.percussion ?? [];
    if (!this.ready || !drum || percussion.length === 0) return;

    const pieces = [...new Set(percussion.map((note) => note.midi))];
    const earlyPieces = [
      ...new Set(
        percussion
          .filter((note) => note.time <= EARLY_AUDIO_WINDOW_SEC)
          .map((note) => note.midi),
      ),
    ];
    const latePieces = pieces.filter((piece) => !earlyPieces.includes(piece));

    const early =
      earlyPieces.length > 0 ? drum.prefetch(earlyPieces) : Promise.resolve();
    if (latePieces.length > 0) void early.then(() => drum.prefetch(latePieces));
  }

  /**
   * Espera a los instrumentos del arranque, con tope.
   *
   * Devuelve `true` si ya están todos (no hizo falta esperar ni se agotó el
   * tope). El llamador no debe bloquear más que esto: lo que falte entra solo.
   */
  async waitForEarlySamples(timeoutMs = SAMPLES_WAIT_MS): Promise<void> {
    await Promise.race([
      this.earlyReady,
      new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
  }

  /** TODOS los instrumentos de la canción, para el indicador de estado. */
  async waitForAllSamples(): Promise<void> {
    await this.allReady;
  }

  /** Estado del sample real de un instrumento (lo usa el indicador por pista). */
  /** Instrumentos de la canción actual (para contadores y diagnóstico). */
  get songInstruments(): readonly string[] {
    return this.loadedInstruments;
  }

  /** Sampler listo para tocar YA, o `null` (entonces la nota se saltea). */
  samplerFor(instrument: string) {
    return getInstrumentSync(instrument);
  }

  /**
   * Estado del sample real de un instrumento.
   *
   * Lo usa el disparo de cada nota para distinguir "todavía está bajando"
   * (`loading`) de "no tiene ninguna fuente real" (`unmapped`): las dos terminan
   * en silencio, pero significan cosas distintas para el usuario.
   */
  instrumentStatus(instrument: string): InstrumentStatus {
    return getInstrumentStatus(instrument);
  }

  /**
   * Baja el sample de un instrumento que NO estaba en la canción.
   *
   * Es el camino del cambio de instrumento en el mezclador: se piden SÓLO las
   * notas que la pista usa y, si todavía no está listo, la pista se queda en
   * silencio (nunca cae a un sintetizador).
   */
  async loadInstrumentOnDemand(
    instrument: string,
    notes: number[],
  ): Promise<boolean> {
    const dest = this.vol;
    if (!this.ready || !dest) return false;
    const voice = await loadInstrument(instrument, dest, notes);
    return voice !== null;
  }

  /** ¿El piano acústico tiene sampler Salamander listo? */
  hasPianoSampler = false;

  /**
   * Suelta TODAS las voces de TODAS las fuentes (sin descargarlas).
   *
   * CRÍTICO al detener, pausar, buscar y cambiar de canción: los samples de VSCO
   * duran 7-84 s y los sostenidos se extienden hasta 14 s por el loop. Sin esto,
   * una nota sin liberar sigue sonando ENCIMA de la canción siguiente — el bug
   * de "las canciones se mezclan".
   */
  releaseAllVoices(): void {
    releaseAllInstruments();
    this.drum?.releaseAll();
  }

  /** Descarga todo (cambio de canción o desmontaje). */
  dispose(): void {
    this.releaseAllVoices();
    disposeAllInstruments();
    this.drum?.dispose();
    this.pianoChain?.dispose();
    this.pianoChain = null;
    this.drum = null;
    this.reverb?.dispose();
    this.chorus?.dispose();
    this.compressor?.dispose();
    this.limiter?.dispose();
    this.vol?.dispose();
    this.vol = null;
    this.ready = false;
  }
}

// ─── Tiempo: una sola implementación, la del piano ───────────────────────────

/**
 * Reloj "escuchado" en segundos de transporte.
 *
 * `Tone.Transport.ticks` cuenta desde el futuro del scheduler: sin restar la
 * ventana, el seeker y el reloj van por delante de lo que suena.
 */
export function heardSeconds(): number {
  return heardTransportSeconds();
}

/** Ticks que corresponden a un segundo ESCUCHADO (para un seek exacto). */
export function ticksFor(sec: number): number {
  return ticksForHeardSeconds(sec);
}

export { Tone };
