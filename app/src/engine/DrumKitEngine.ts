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
import type { PercussionEngine, PercussionVoice } from "./InstrumentEngine";
import { PERCUSSION_SAMPLES } from "./percussionSamples";
import { loadWafZoneBuffer } from "./WebAudioFont";
import { drumPiece } from "../utils/gmDrums";

/** Cuántos golpes distintos se bajan por pieza (round-robin). */
const MAX_VARIANTS = 6;
/** Kit GM de WebAudioFont: 0 = Standard, 16 = Power, 22 = Jazz. */
const GM_KIT_INDEX = 0;
const GM_KIT_SOURCE = "FluidR3_GM";
/** Techo de voces simultáneas: una batería no necesita más y evita picos. */
const MAX_VOICES = 48;

/** Volumen relativo por pieza, para que el kit suene parejo. */
const PIECE_TRIM: Record<string, number> = {
  kick: 1.0,
  snare: 1.0,
  hat: 0.75,
  cymbal: 0.8,
  tom: 0.9,
  latin: 0.9,
  fx: 0.8,
};

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
  private fallback: PercussionEngine;
  /** nota GM → golpes disponibles (round-robin). */
  private variants = new Map<number, AudioBuffer[]>();
  private nextVariant = new Map<number, number>();
  private pending = new Map<number, Promise<void>>();
  private voices: Tone.ToneBufferSource[] = [];
  /** Piezas que ya fallaron en las dos fuentes: no se reintentan por nota. */
  private failed = new Set<number>();
  /**
   * Último instante en que se disparó CUALQUIER voz sintetizada: el
   * PercussionEngine comparte nodos entre voces y Web Audio exige tiempos
   * estrictamente crecientes por nodo.
   */
  private lastSynthHit = -Infinity;

  constructor(destination: Tone.ToneAudioNode, fallback: PercussionEngine) {
    this.out = new Tone.Volume(0).connect(destination);
    this.fallback = fallback;
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
      this.variants.set(note, buffers);
      console.log(
        `[DrumKit] nota ${note} (${drumPiece(note).name}): ${buffers.length} golpe(s) reales`,
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

    const piece = drumPiece(note);
    const gain = velocityToGain(velocity) * (PIECE_TRIM[piece.family] ?? 0.9);

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
    }).connect(this.out);

    try {
      source.start(time ?? Tone.now(), 0, undefined, gain);
      this.voices.push(source);
    } catch (err) {
      console.warn("[DrumKit] no se pudo disparar la pieza", note, err);
      return false;
    }
    return true;
  }

  /**
   * Respaldo sintetizado, para las piezas que todavía no tienen sample.
   *
   * El PercussionEngine comparte un synth por familia (noise / membrane /
   * metal) y Web Audio rechaza dos `start()` en el MISMO instante sobre el
   * mismo nodo: "Start time must be strictly greater than previous start
   * time". En un patrón real eso pasa todo el tiempo — shaker y redoblante
   * caen juntos en el mismo 16avo y los dos van al noiseSynth. Se corre cada
   * golpe 1 ms para que ninguno se pierda; es inaudible.
   */
  triggerSynth(note: number, velocity: number, time?: number): void {
    const voice = drumPiece(note).voice as PercussionVoice;
    const requested = time ?? Tone.now();
    const at = requested > this.lastSynthHit ? requested : this.lastSynthHit + 0.001;
    this.lastSynthHit = at;
    this.fallback.triggerNote({ voice, velocity }, at);
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
    this.fallback.dispose();
  }
}
