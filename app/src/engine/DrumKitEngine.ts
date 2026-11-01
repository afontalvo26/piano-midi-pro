/**
 * DrumKitEngine — percusión muestreada para pads y canal MIDI 10.
 *
 * El modo legacy prueba dos fuentes de samples, en este orden:
 *
 *  1. **FreePats World Percussion (CC0)** para las piezas latinas que tiene
 *     grabadas, con VARIOS golpes por pieza en round-robin. Repetir un mismo
 *     sample en una figura de 16avos suena a ametralladora; alternar 6-8 golpes
 *     distintos suena a percusionista. Eso es la "expresión" que ningún
 *     soundfont GM da.
 *  2. **Kit GM de WebAudioFont** para el resto:
 *     bombo, redoblante, hi-hats, platillos, toms, güiro, agogo, woodblock.
 *
 * Los modos de proyecto Virtuosity y FreePats clap cargan sólo su paquete
 * verificado; nunca cambian al kit GM si falla un archivo.
 * Si no se puede cargar una muestra, la nota no se retrasa para sonar después.
 */

import * as Tone from "tone";
import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "../audio/ownedVoiceRegistry";
import { retainUntilOfflineRender } from "../audio/offlineGraphRetention";
import { decodeVirtuosityPiece, fetchVirtuosityManifest, virtuosityArticulation } from "../audio/virtuosityCore";
import { decodeFreePatsHandClap, fetchFreePatsHandClapManifest,
  FREEPATS_HANDCLAP_NOTE } from "../audio/freePatsHandClap";
import { recordedVelocityLayerTrims } from "../audio/recordedVelocityLayers";
import { PERCUSSION_SAMPLES } from "./percussionSamples";
import { loadWafZoneBuffer } from "./WebAudioFont";
import { WAF_DRUMS } from "./wafManifest";
import { drumPiece, pieceTrimDb } from "../utils/gmDrums";
import { panForDrumPiece } from "./instrumentPanning";
import { eqForInstrument } from "./instrumentChain";
import {
  PERCUSSION_BUS_DB,
  TARGET_PERCUSSION_RMS_DB,
  bufferRmsDb,
  median,
  trimDb,
} from "./sampleLevels";

/** Cuántos golpes distintos se bajan por pieza (round-robin). */
const MAX_VARIANTS = 6;

/**
 * Variantes de WebAudioFont que EXISTEN para cada nota, según el manifiesto.
 *
 * Sólo se prueban las variantes publicadas que constan en el manifiesto;
 * construir un identificador a ciegas puede provocar un 404 y dejar el pad mudo.
 */
const WAF_DRUM_VARIANTS: Map<number, string[]> = new Map(
  WAF_DRUMS.map((entry) => [entry.note, entry.variants]),
);

/**
 * Variantes a probar para una pieza.
 *
 * Si el manifiesto no tiene la nota, se devuelve una lista VACÍA: no se inventa un
 * id. Una nota fuera del manifiesto es una nota sin muestra publicada, y pedirla
 * genera un 404 y una espera al pedo.
 */
function wafDrumVariants(note: number): string[] {
  return WAF_DRUM_VARIANTS.get(note) ?? [];
}
/** Hard source ceiling, including the short tails of stolen hits. */
const MAX_VOICES = 48;
const ACTIVE_VOICE_LIMIT = 40;
const FORCED_FADE_SECONDS = 0.008;

/**
 * Curva de velocity: la percusión golpeada fuerte no sólo suena más fuerte,
 * cambia de timbre. Con samples de una sola capa, al menos que la dinámica sea
 * marcada en vez de lineal.
 */
function velocityToGain(velocity: number): number {
  const v = Math.max(1 / 127, Math.min(1, velocity));
  return Math.pow(v, 1.35);
}

export class DrumKitEngine {
  private out: Tone.Volume;
  readonly source: "legacy" | "virtuosity-core" | "freepats-clap";
  private readonly onVoiceEnd?: () => void;
  /** Piezas que ya avisaron que se saltean (aviso único por pieza). */
  private warnedSkip = new Set<number>();
  /** nota GM → golpes disponibles (round-robin). */
  private variants = new Map<number, AudioBuffer[]>();
  private layeredVariants = new Map<number, Map<number, AudioBuffer[]>>();
  private layerTrimDb = new Map<number, ReadonlyMap<number, number>>();
  private coreManifest: ReturnType<typeof fetchVirtuosityManifest> | null = null;
  private clapManifest: ReturnType<typeof fetchFreePatsHandClapManifest> | null = null;
  private loadErrors = new Map<number, string>();
  private nextVariant = new Map<number, number>();
  private pending = new Map<number, Promise<void>>();
  private readonly voices = new Map<OwnedVoiceHandle, Tone.ToneBufferSource>();
  private readonly ownedVoices = new OwnedVoiceRegistry();
  private discardedHitCount = 0;
  private disposed = false;
  /** Piezas fallidas no se reintentan en cada golpe. */
  private failed = new Set<number>();
  /** Ganancia medida por pieza (dB) para emparejar niveles entre golpes. */
  private pieceGain = new Map<number, number>();
  /**
   * Paneo por pieza: un kit real está repartido en el escenario (hi-hat a un
   * lado, ride al otro, toms abriéndose, congas enfrentadas). Sin esto la
   * batería entera sale de un punto y suena a caja de ritmos.
   */
  private panners = new Map<number, Tone.Panner>();
  /** Pasa-altos por pieza (maracas, güiro, hi-hats: sin lodo abajo). */
  private filters = new Map<number, Tone.Filter>();

  constructor(destination: Tone.ToneAudioNode, options: {
    source?: "legacy" | "virtuosity-core" | "freepats-clap"; onVoiceEnd?: () => void;
  } = {}) {
    this.source = options.source ?? "legacy";
    this.onVoiceEnd = options.onVoiceEnd;
    this.out = new Tone.Volume(0).connect(destination);
  }

  private pannerFor(note: number): Tone.Panner {
    let panner = this.panners.get(note);
    if (!panner) {
      const piece = drumPiece(note);
      const eq = eqForInstrument(piece?.name ?? "percussion");
      panner = new Tone.Panner(panForDrumPiece(note)).connect(this.out);
      // EQ por pieza: maracas, güiro, cabasa y hi-hats no aportan nada por
      // debajo de ~300 Hz, y ese lodo hacía que el ritmo sonara a "shhh"
      // constante en vez de golpes definidos.
      if (eq.highpass > 0) {
        const hp = new Tone.Filter({
          type: "highpass",
          frequency: eq.highpass,
          rolloff: -12,
          Q: 0.7,
        }).connect(panner);
        this.filters.set(note, hp);
      }
      this.panners.set(note, panner);
    }
    return panner;
  }

  /** Nodo donde debe entrar el golpe: el filtro de la pieza, o el paneo. */
  private inputFor(note: number): Tone.ToneAudioNode {
    const hp = this.filters.get(note);
    return hp ?? this.pannerFor(note);
  }

  /** ¿Esta pieza ya tiene sample real listo para sonar? */
  has(note: number): boolean {
    return (this.variants.get(note)?.length ?? 0) > 0;
  }

  /** Cantidad de piezas con sample cargado (diagnóstico). */
  loadedCount(): number {
    return this.variants.size;
  }

  loadError(note: number): string | null {
    return this.loadErrors.get(note) ?? null;
  }

  /** Carga el sample de una pieza (idempotente). */
  load(note: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const done = this.variants.get(note);
    if (done?.length) return Promise.resolve();
    const inFlight = this.pending.get(note);
    if (inFlight) return inFlight;
    if (this.failed.has(note)) {
      const prior = this.loadErrors.get(note);
      return prior && this.source !== "legacy" ? Promise.reject(new Error(prior)) : Promise.resolve();
    }

    if (this.source === "virtuosity-core") {
      const task = this.loadVirtuosity(note);
      this.pending.set(note, task);
      void task.finally(() => this.pending.delete(note)).catch(() => {});
      return task;
    }

    if (this.source === "freepats-clap") {
      const task = this.loadFreePatsClap(note);
      this.pending.set(note, task);
      void task.finally(() => this.pending.delete(note)).catch(() => {});
      return task;
    }

    const task = (async () => {
      const buffers: AudioBuffer[] = [];

      // 1. Percusión latina real de FreePats (con round-robin).
      // Los golpes alternativos de un pad se cargan en paralelo.
      const urls = PERCUSSION_SAMPLES[note];
      if (urls?.length) {
        const fetched = await Promise.all(
          urls.slice(0, MAX_VARIANTS).map(async (url) => {
            try {
              return await Tone.ToneAudioBuffer.load(url);
            } catch (err) {
              console.warn(`[DrumKit] golpe ilegible ${url}`, err);
              return null;
            }
          }),
        );
        buffers.push(...fetched.filter((b): b is AudioBuffer => b !== null));
      }

      // 2. Kit GM muestreado.
      if (this.disposed) return;
      if (buffers.length === 0) {
        // ── Kit GM: SÓLO las variantes que el manifiesto dice que existen ──
        //
        // Se prueban en orden de prioridad hasta que una cargue. Antes se pedía un
        // id construido a mano que, para 18 de las notas del rango GM, no existe:
        // 404, espera, y la pieza en silencio sin decir nada.
        const variants = wafDrumVariants(note);
        if (variants.length === 0) {
          // Sin variante publicada no se pide nada: se acepta el silencio con un
          // aviso, que es información útil, en vez de un 404 garantizado.
          this.warnedSkip.add(note);
          console.warn(
            `[DrumKit] la nota ${note} no tiene muestra publicada; se omite`,
          );
        }
        for (const variant of variants) {
          if (buffers.length > 0) break;
          try {
            const buf = await loadWafZoneBuffer(variant);
            if (buf) buffers.push(buf);
          } catch {
            // Se prueba la siguiente variante: son kits y fuentes distintos del
            // mismo golpe, y basta con que una esté publicada.
          }
        }
      }

      if (this.disposed) return;
      if (buffers.length === 0) {
        this.failed.add(note);
        return;
      }

      // Nivelación por RMS + ajuste por pieza.
      //
      // El RMS evita que un golpe de banda ancha tape el piano aunque tenga
      // el mismo pico que un bombo. Ver `sampleLevels.ts` y `gmDrums.ts`.
      const levels = buffers.map((b) => bufferRmsDb(b, 0.5));
      const measured = median(levels);
      const gain =
        trimDb(measured, TARGET_PERCUSSION_RMS_DB, [-20, 20]) +
        pieceTrimDb(note) +
        PERCUSSION_BUS_DB;
      this.pieceGain.set(note, gain);

      this.variants.set(note, buffers);
      console.log(
        `[DrumKit] nota ${note} (${drumPiece(note).name}): ${buffers.length} golpe(s) reales, ${measured.toFixed(1)} dB → ${gain.toFixed(1)} dB`,
      );
    })();

    this.pending.set(note, task);
    void task.finally(() => this.pending.delete(note));
    return task;
  }

  private async loadVirtuosity(note: number): Promise<void> {
    const articulation = virtuosityArticulation(note);
    if (!articulation) {
      const reason = `Virtuosity core no incluye la nota GM ${note}`;
      this.loadErrors.set(note, reason);
      this.failed.add(note);
      throw new Error(reason);
    }
    try {
      this.coreManifest ??= fetchVirtuosityManifest();
      const manifest = await this.coreManifest;
      const layers = await decodeVirtuosityPiece(manifest, articulation, Tone.getContext().rawContext);
      if (this.disposed) return;
      const buffers = [...layers.values()].flat();
      const measured = median(buffers.map((buffer) => bufferRmsDb(buffer, 0.5)));
      const gain = trimDb(measured, TARGET_PERCUSSION_RMS_DB, [-20, 20]) +
        pieceTrimDb(note) + PERCUSSION_BUS_DB;
      this.pieceGain.set(note, gain);
      this.layerTrimDb.set(note, recordedVelocityLayerTrims(layers, measured));
      this.layeredVariants.set(note, layers);
      this.variants.set(note, buffers);
      this.loadErrors.delete(note);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.loadErrors.set(note, reason);
      this.failed.add(note);
      throw new Error(`No cargó Virtuosity ${articulation}: ${reason}`, { cause: error });
    }
  }

  private async loadFreePatsClap(note: number): Promise<void> {
    if (note !== FREEPATS_HANDCLAP_NOTE) {
      const reason = `FreePats clap sólo incluye nota GM ${FREEPATS_HANDCLAP_NOTE}`;
      this.loadErrors.set(note, reason);
      this.failed.add(note);
      throw new Error(reason);
    }
    try {
      this.clapManifest ??= fetchFreePatsHandClapManifest();
      const manifest = await this.clapManifest;
      const buffers = await decodeFreePatsHandClap(manifest, Tone.getContext().rawContext);
      if (this.disposed) return;
      const measured = median(buffers.map((buffer) => bufferRmsDb(buffer, 0.5)));
      const gain = trimDb(measured, TARGET_PERCUSSION_RMS_DB, [-20, 20]) +
        pieceTrimDb(note) + PERCUSSION_BUS_DB;
      this.pieceGain.set(note, gain);
      this.variants.set(note, buffers);
      this.loadErrors.delete(note);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.loadErrors.set(note, reason);
      this.failed.add(note);
      throw new Error(`No cargó FreePats clap: ${reason}`, { cause: error });
    }
  }

  /**
   * Dispara una pieza. Devuelve `false` cuando todavía no hay muestra lista.
   *
   * `velocity` es la del archivo y elige la dinámica del golpe (curva γ = 1.35,
   * ver `velocityToGain` local); `outGain` es la ganancia externa de la nota
   * (fader de pista × CC7 × CC11, ver `playbackGain.ts`) y se aplica aparte
   * para que mover un fader no cambie el golpe elegido.
   */
  trigger(note: number, velocity: number, time?: number, outGain = 1): boolean {
    return this.triggerOwned(note, velocity, "pads/live", 0, time, outGain) !== null;
  }

  /** The scheduler supplies a prepared kit, absolute audioTime and voice owner. */
  triggerOwned(note: number, velocity: number, ownerId: string, epoch: number,
    time?: number, outGain = 1): OwnedVoiceHandle | null {
    if (this.disposed) return null;
    if (!ownerId || !Number.isSafeInteger(epoch) || epoch < 0) {
      throw new RangeError("drum hit needs ownerId and non-negative epoch");
    }
    const layers = this.layeredVariants.get(note);
    const layerIndex = layers ? Math.max(0, Math.ceil(Math.max(0.01, Math.min(1, velocity)) * layers.size) - 1) : null;
    const selectedLayer = layerIndex === null ? null : ([...layers!.keys()][layerIndex] ?? null);
    const list = selectedLayer === null ? this.variants.get(note) : layers!.get(selectedLayer);
    if (!list || list.length === 0) return null;
    if (time !== undefined && (!Number.isFinite(time) || time < 0)) {
      throw new RangeError("drum audioTime must be non-negative");
    }

    const index = (this.nextVariant.get(note) ?? 0) % list.length;
    this.nextVariant.set(note, index + 1);

    // La ganancia de la pieza ya incluye nivel medido + ajuste + bus.
    const pieceDb = (this.pieceGain.get(note) ?? -6) +
      (selectedLayer === null ? 0 : this.layerTrimDb.get(note)?.get(selectedLayer) ?? 0);
    const gain =
      velocityToGain(velocity) *
      Math.max(0, outGain) *
      Math.pow(10, pieceDb / 20);

    if (this.ownedVoices.activeCount >= ACTIVE_VOICE_LIMIT) {
      // Dense transport playback may steal transport hits, never a live pad.
      const oldestTransport = [...this.voices.keys()].find((handle) =>
        !this.ownedVoices.isReleasing(handle) &&
        this.ownedVoices.ownerIdOf(handle)?.startsWith("transport/"));
      const oldestLive = ownerId === "pads/live"
        ? [...this.voices.keys()].find((handle) => !this.ownedVoices.isReleasing(handle))
        : null;
      const victim = oldestTransport ?? oldestLive;
      if (!victim) { this.discardedHitCount++; return null; }
      this.ownedVoices.releaseHandle(victim, time ?? Tone.immediate(), FORCED_FADE_SECONDS);
    }
    if (this.voices.size >= MAX_VOICES) {
      this.discardedHitCount++;
      return null;
    }

    const scheduledAt = time ?? Tone.now();
    let handle: OwnedVoiceHandle | null = null;
    let finished = false;
    const source = new Tone.ToneBufferSource({
      url: list[index],
      fadeOut: FORCED_FADE_SECONDS,
      onended: () => {
        if (finished) return;
        finished = true;
        if (handle) {
          this.voices.delete(handle);
          this.ownedVoices.finish(handle);
        }
        this.onVoiceEnd?.();
        const dispose = (): void => { try { source.dispose(); } catch { /* already ended */ } };
        if (!retainUntilOfflineRender(source.context, dispose)) dispose();
      },
    }).connect(this.inputFor(note));

    handle = this.ownedVoices.register({
      ownerId, epoch,
      release: (audioTime, fadeSeconds) => {
        if (audioTime < scheduledAt - 0.001) {
          if (finished) return;
          finished = true;
          source.dispose();
          if (handle) {
            this.voices.delete(handle);
            this.ownedVoices.finish(handle);
          }
          this.onVoiceEnd?.();
          return;
        }
        source.fadeOut = Math.max(0.005, fadeSeconds);
        source.stop(Math.max(audioTime, scheduledAt));
      },
    });
    try {
      source.start(scheduledAt, 0, undefined, gain);
      this.voices.set(handle, source);
    } catch (err) {
      this.ownedVoices.finish(handle);
      source.dispose();
      console.warn("[DrumKit] no se pudo disparar la pieza", note, err);
      return null;
    }
    return handle;
  }

  releaseHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    return this.ownedVoices.releaseHandle(handle, audioTime, FORCED_FADE_SECONDS);
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.ownedVoices.releaseOwner(ownerId, audioTime, FORCED_FADE_SECONDS, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.ownedVoices.releaseEpoch(ownerId, epoch, audioTime, FORCED_FADE_SECONDS, includeDescendants);
  }

  voiceSnapshot(): OwnedVoiceSnapshot & { discardedHitCount: number } {
    return { ...this.ownedVoices.snapshot(), discardedHitCount: this.discardedHitCount };
  }

  /** Aviso único por pieza que se saltea por no tener sample todavía. */
  noteSkipped(note: number): void {
    if (this.warnedSkip.has(note)) return;
    this.warnedSkip.add(note);
    console.warn(
      `[DrumKit] nota ${note} (${drumPiece(note).name}) sin sample real todavía: se saltea el golpe (no se sintetiza)`,
    );
  }

  releaseAll(): void {
    this.ownedVoices.panic(Tone.immediate(), FORCED_FADE_SECONDS);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAll();
    for (const [handle, source] of [...this.voices]) {
      try { source.dispose(); } catch { /* already ended */ }
      this.ownedVoices.finish(handle);
    }
    this.voices.clear();
    this.variants.clear();
    this.layeredVariants.clear();
    this.layerTrimDb.clear();
    for (const filter of this.filters.values()) filter.dispose();
    this.filters.clear();
    for (const panner of this.panners.values()) panner.dispose();
    this.panners.clear();
    this.out.dispose();
  }
}
