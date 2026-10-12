/**
 * vscoSampler — instrumentos con CAPAS DE VELOCIDAD (expresividad real).
 *
 * El resto de las fuentes trae una sola toma por nota: tocar fuerte sólo sube el
 * volumen. VSCO-2 Community Edition (CC0) trae hasta 3-4 capas grabadas por
 * nota (`_v1/_v2/_v3`) más variantes round-robin (`_rr1/_rr2`), así que un
 * *forte* cambia de timbre — que es lo que hace que un metálico suene a
 * instrumento y no a sample repetido.
 *
 * Diseño: un `Tone.Sampler` por capa y el disparo elige la capa según la
 * velocidad. Mantener las capas separadas (en vez de mezclar todo en un sampler)
 * es lo que preserva la diferencia tímbrica; el nivel se nivela por mediana
 * entre capas para no aplanar la dinámica.
 *
 * ⚠️ PESO: los WAV de VSCO pesan ~1.9 MB en promedio (medido). Por eso se bajan
 * SÓLO las notas que la canción usa y sólo las capas que existen para esas
 * notas, igual que en el resto de las fuentes.
 */

import * as Tone from "tone";
import { VSCO_INSTRUMENTS } from "./vscoManifest";
import { prepareSampleBuffer } from "./sampleProcessing";
import type { VscoSample } from "./vscoManifest";
import {
  TARGET_MELODIC_RMS_DB,
  applyTrim,
  bufferRmsDb,
  median,
  trimDb,
} from "./sampleLevels";

/** Lo mínimo que el reproductor necesita de una fuente de sonido. */
export interface InstrumentVoice {
  triggerAttack(note: Tone.Unit.Frequency, time?: Tone.Unit.Time, velocity?: number): void;
  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void;
  releaseAll(): void;
  dispose(): void;
}

/** Notas MIDI que la fuente tiene grabadas, ordenadas. */
function availableNotes(layers: Record<number, VscoSample[][]>): number[] {
  return Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Elige, para cada nota pedida, la nota grabada más cercana.
 *
 * Se usa una grilla gruesa (cada `step` semitonos) a propósito: los WAV de VSCO
 * pesan ~1.9 MB cada uno, así que bajar las 20 notas de una pista serían ~38 MB
 * por instrumento. Con un salto de 3 semitonos el repitcheo es de ±1.5 (el mismo
 * criterio que usa el resto de la app) y la descarga baja a un tercio.
 */
function pickRecorded(
  needed: number[],
  available: number[],
  maxDistance = 2,
  step = 3,
): number[] {
  if (available.length === 0 || needed.length === 0) return [];
  const chosen = new Set<number>();
  const min = Math.min(...needed);
  const max = Math.max(...needed);

  for (let note = min; note <= max; note += step) {
    let best: number | null = null;
    for (const cand of available) {
      if (best === null || Math.abs(cand - note) < Math.abs(best - note)) {
        best = cand;
      }
    }
    if (best !== null && Math.abs(best - note) <= maxDistance) chosen.add(best);
  }

  // La última nota del rango también, para no quedarse corto en el agudo.
  let last: number | null = null;
  for (const cand of available) {
    if (last === null || Math.abs(cand - max) < Math.abs(last - max)) last = cand;
  }
  if (last !== null && Math.abs(last - max) <= maxDistance) chosen.add(last);

  return [...chosen].sort((a, b) => a - b);
}

/** Sampler con capas: elige la toma según la velocidad de la nota. */
class LayeredSampler implements InstrumentVoice {
  private layers: Tone.Sampler[] = [];
  /** Índice de la capa elegida para una velocidad 0..1. */
  private layerFor(velocity: number): number {
    if (this.layers.length === 1) return 0;
    const v = Math.max(0, Math.min(1, velocity));
    const index = Math.floor(v * this.layers.length);
    return Math.max(0, Math.min(this.layers.length - 1, index));
  }

  constructor(layers: Tone.Sampler[]) {
    this.layers = layers;
  }

  /** Suma una capa que llegó después (carga en segundo plano). */
  addLayer(sampler: Tone.Sampler): void {
    this.layers.push(sampler);
  }

  layerCount(): number {
    return this.layers.length;
  }

  triggerAttack(note: Tone.Unit.Frequency, time?: Tone.Unit.Time, velocity = 1): void {
    const layer = this.layers[this.layerFor(velocity)];
    // La dinámica dentro de la capa la da el propio sampler (volumen por nota).
    layer?.triggerAttack(note, time, velocity);
  }

  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void {
    // Se libera en TODAS las capas: no se sabe con certeza en cuál entró.
    for (const layer of this.layers) {
      try {
        layer.triggerRelease(note, time);
      } catch {
        /* la nota no estaba sonando en esa capa */
      }
    }
  }

  releaseAll(): void {
    this.layers.forEach((l) => l.releaseAll());
  }

  dispose(): void {
    this.layers.forEach((l) => l.dispose());
    this.layers = [];
  }
}

/**
 * Carga un instrumento de VSCO con sus capas de velocidad.
 *
 * Devuelve `null` si el banco no tiene ese programa o ninguna de las notas
 * pedidas (el llamador pasa a la siguiente fuente).
 */
export async function loadVscoInstrument(
  program: number,
  dest: Tone.ToneAudioNode,
  neededNotes: number[],
): Promise<InstrumentVoice | null> {
  const instrument = VSCO_INSTRUMENTS.find((i) => i.program === program);
  if (!instrument) return null;

  const available = availableNotes(instrument.layers);
  if (available.length === 0) return null;
  const picked = pickRecorded(neededNotes, available);
  if (picked.length === 0) return null;

  // Por cada capa (v1, v2, …) se arma su mapa de notas. La variante
  // round-robin se rota por nota, que es como lo haría un sampler real.
  const layerCount = Math.max(
    ...picked.map((n) => instrument.layers[n]?.length ?? 0),
  );
  const layerMaps: Record<string, AudioBuffer>[] = Array.from(
    { length: layerCount },
    () => ({}),
  );
  const allLevels: number[] = [];

  /** Baja las notas de UNA capa (v1, v2, …). */
  const loadLayer = async (layerIndex: number): Promise<void> => {
    await Promise.all(
      picked.map(async (note) => {
        const sample = instrument.layers[note]?.[layerIndex]?.[0];
        if (!sample) return;
        try {
          const raw = await Tone.ToneAudioBuffer.load(sample.url);
          // Micro-fades + extensión por loop para los sostenidos: las cuerdas y
          // los metales de VSCO duran pocos segundos y terminan en media onda.
          const buffer = prepareSampleBuffer(raw, instrument.name);
          layerMaps[layerIndex][String(note)] = buffer;
          allLevels.push(bufferRmsDb(buffer));
        } catch (err) {
          console.warn(
            `[vsco] ${instrument.name}: nota ${note} capa ${layerIndex + 1} falló`,
            err,
          );
        }
      }),
    );
  };

  // FASE 1 — la capa más suave, sólo para tener sonido ya.
  // Los WAV de VSCO son grandes (~1.9 MB): esperar las 3 capas de todos los
  // instrumentos antes de arrancar la canción costaba ~16 s de silencio.
  await loadLayer(0);
  if (Object.keys(layerMaps[0]).length === 0) return null;

  const gain = trimDb(median(allLevels), TARGET_MELODIC_RMS_DB);
  const first = await createSampler(layerMaps[0], gain, dest);
  const voice = new LayeredSampler([first]);

  // FASE 2 — el resto de las capas, en segundo plano: llegan unos segundos
  // después y ahí la dinámica pasa a cambiar timbre (que es el punto).
  for (let layerIndex = 1; layerIndex < layerCount; layerIndex++) {
    void loadLayer(layerIndex)
      .then(async () => {
        const urls = layerMaps[layerIndex];
        if (Object.keys(urls).length === 0) return;
        const sampler = await createSampler(urls, gain, dest);
        voice.addLayer(sampler);
        console.log(
          `[vsco] ${instrument.name}: capa ${layerIndex + 1} sumada (${voice.layerCount()} capas)`,
        );
      })
      .catch(() => {
        /* una capa de más es una mejora, nunca un bloqueante */
      });
  }

  console.log(
    `[vsco] ${instrument.name}: ${picked.length} notas, capa base ${median(allLevels).toFixed(1)} dB → ${gain.toFixed(1)} dB (${layerCount} capas en total)`,
  );

  return voice;
}

function createSampler(
  urls: Record<string, AudioBuffer>,
  gain: number,
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler> {
  return new Promise<Tone.Sampler>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 45_000);
    const s = new Tone.Sampler({
      urls,
      onload: () => {
        clearTimeout(timeout);
        applyTrim(s, gain);
        resolve(s);
      },
      onerror: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    }).connect(dest);
  });
}

/** ¿VSCO cubre este programa GM? (para decidir el orden de las fuentes) */
export function vscoCovers(program: number): boolean {
  return VSCO_INSTRUMENTS.some((i) => i.program === program);
}
