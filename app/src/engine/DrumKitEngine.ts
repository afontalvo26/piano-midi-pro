/**
 * DrumKitEngine — percusión de verdad para el canal 10.
 *
 * Por qué existe: el reproductor **descartaba la pista de percusión entera**.
 * Medido sobre la biblioteca de demos: 264.003 notas de canal 10 tiradas a la
 * basura — más que cualquier instrumento melódico (la guitarra de nylon, la más
 * usada, tiene 73.514) — y lo que más suena ahí es maracas, congas, bongos,
 * güiro, cabasa, claves y timbales. Un vallenato o un bolero sin eso no es la
 * música: es un piano con acompañamiento.
 *
 * Dos fuentes de samples reales, en este orden:
 *
 *  1. **FreePats World Percussion (CC0)** para las piezas latinas que tiene
 *     grabadas, con VARIOS golpes por pieza en round-robin. Repetir un mismo
 *     sample en una figura de 16avos suena a ametralladora; alternar 6-8 golpes
 *     distintos suena a percusionista. Eso es la "expresión" que ningún
 *     soundfont GM da.
 *  2. **Kit GM de WebAudioFont** (`128<nota>_0_FluidR3_GM`) para el resto:
 *     bombo, redoblante, hi-hats, platillos, toms, güiro, agogo, woodblock.
 *
 * Si ninguna de las dos cargó (sin red), cae al PercussionEngine sintetizado
 * que ya existía — mejor un ritmo sintético que silencio.
 */

import * as Tone from "tone";
import { PERCUSSION_SAMPLES } from "./percussionSamples";
import { loadWafZoneBuffer } from "./WebAudioFont";
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
/** Kit GM de WebAudioFont: 0 = Standard, 16 = Power, 22 = Jazz. */
const GM_KIT_INDEX = 0;
const GM_KIT_SOURCE = "FluidR3_GM";
/** Techo de voces simultáneas: una batería no necesita más y evita picos. */
const MAX_VOICES = 48;

function wafDrumCode(note: number): string {
  return `128${note}_${GM_KIT_INDEX}_${GM_KIT_SOURCE}`;
}

/**
 * Curva de velocity: la percusión golpeada fuerte no sólo suena más fuerte,
 * cambia de timbre. Con samples de una sola capa, al menos que la dinámica sea
 * marcada en vez de lineal.
 */
function velocityToGain(velocity: number): number {
  const v = Math.max(0.02, Math.min(1, velocity));
  return Math.pow(v, 1.35);
}

export class DrumKitEngine {
  private out: Tone.Volume;
  /** Piezas que ya avisaron que se saltean (aviso único por pieza). */
  private warnedSkip = new Set<number>();
  /** nota GM → golpes disponibles (round-robin). */
  private variants = new Map<number, AudioBuffer[]>();
  private nextVariant = new Map<number, number>();
  private pending = new Map<number, Promise<void>>();
  private voices: Tone.ToneBufferSource[] = [];
  /** Piezas que ya fallaron en las dos fuentes: no se reintentan por nota. */
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

  constructor(destination: Tone.ToneAudioNode) {
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

  /** Carga el sample de una pieza (idempotente). */
  load(note: number): Promise<void> {
    const done = this.variants.get(note);
    if (done?.length) return Promise.resolve();
    const inFlight = this.pending.get(note);
    if (inFlight) return inFlight;
    if (this.failed.has(note)) return Promise.resolve();

    const task = (async () => {
      const buffers: AudioBuffer[] = [];

      // 1. Percusión latina real de FreePats (con round-robin).
      // En paralelo, no en serie: son hasta 6 archivos por pieza y una canción
      // usa 8-12 piezas; en serie eso son ~50 pedidos encadenados y el ritmo
      // arrancaba con la mitad de las piezas todavía bajando.
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
      if (buffers.length === 0) {
        try {
          const buf = await loadWafZoneBuffer(wafDrumCode(note));
          if (buf) buffers.push(buf);
        } catch (err) {
          console.warn(`[DrumKit] kit GM sin nota ${note}`, err);
        }
      }

      if (buffers.length === 0) {
        this.failed.add(note);
        return;
      }

      // Nivelación por RMS + ajuste por pieza.
      //
      // Normalizar por pico no alcanzaba: un golpe de maracas al mismo pico que
      // un bombo tiene muchísima más energía percibida (es ruido de banda
      // ancha) y el bolero terminaba con 8 kHz de centroide espectral contra
      // 1.25 kHz de una pieza de piano. Ver `sampleLevels.ts` y `gmDrums.ts`.
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

  /** Precarga las piezas que usa la canción (y sólo esas). */
  async prefetch(notes: number[]): Promise<void> {
    const unique = [...new Set(notes)].filter((n) => n >= 27 && n <= 87);
    // Las piezas también en paralelo: son pedidos independientes.
    await Promise.all(unique.map((n) => this.load(n)));
    console.log(
      `[DrumKit] ${this.loadedCount()}/${unique.length} piezas con sample real`,
    );
  }

  /**
   * Dispara una pieza. Devuelve `false` cuando todavía no hay sample (el
   * llamador usa el motor sintetizado para no perder el golpe).
   */
  trigger(note: number, velocity: number, time?: number): boolean {
    const list = this.variants.get(note);
    if (!list || list.length === 0) return false;

    const index = (this.nextVariant.get(note) ?? 0) % list.length;
    this.nextVariant.set(note, index + 1);

    // La ganancia de la pieza ya incluye nivel medido + ajuste + bus.
    const pieceDb = this.pieceGain.get(note) ?? -6;
    const gain = velocityToGain(velocity) * Math.pow(10, pieceDb / 20);

    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      try {
        oldest?.stop();
        oldest?.dispose();
      } catch {
        /* ya terminó */
      }
    }

    const source = new Tone.ToneBufferSource({
      url: list[index],
      fadeOut: 0.008,
      onended: () => {
        this.voices = this.voices.filter((v) => v !== source);
        try {
          source.dispose();
        } catch {
          /* ignore */
        }
      },
    }).connect(this.inputFor(note));

    try {
      source.start(time ?? Tone.now(), 0, undefined, gain);
      this.voices.push(source);
    } catch (err) {
      console.warn("[DrumKit] no se pudo disparar la pieza", note, err);
      return false;
    }
    return true;
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
    this.voices.forEach((v) => {
      try {
        v.stop();
        v.dispose();
      } catch {
        /* ignore */
      }
    });
    this.voices = [];
  }

  dispose(): void {
    this.releaseAll();
    this.variants.clear();
    this.out.dispose();
  }
}
