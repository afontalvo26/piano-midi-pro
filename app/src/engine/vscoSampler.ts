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
import { prepareSampleBuffer, releaseForInstrument } from "./sampleProcessing";
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

/**
 * Sampler con capas de velocidad Y round-robin.
 *
 * `groups[capa]` son las variantes grabadas de esa intensidad (rr1, rr2, …). La
 * capa se elige por velocidad y, dentro de la capa, se **rota** la variante en
 * cada nota: repetir siempre la misma toma es lo que hace que una escala rápida
 * suene a ametralladora, y es el truco de realismo más barato que existe.
 */
class LayeredSampler implements InstrumentVoice {
  /** Capa de velocidad → variantes round-robin. */
  private groups: Tone.Sampler[][] = [];
  private nextVariant: number[] = [];

  constructor(groups: Tone.Sampler[][]) {
    this.groups = groups.filter((g) => g.length > 0);
    this.nextVariant = this.groups.map(() => 0);
  }

  /**
   * Índice de la capa elegida para una velocidad 0..1.
   *
   * Umbrales musicales, no `floor(v × n)`: con 2 capas, cortar en 0.5 hacía que
   * un *mezzo-forte* (MIDI 64) disparara ya la toma *forte* y el instrumento
   * sonara siempre fuerte. Un `mf` tiene que caer en la toma media/suave.
   */
  private layerFor(velocity: number): number {
    const n = this.groups.length;
    if (n <= 1) return 0;
    const v = Math.max(0, Math.min(1, velocity));
    const thresholds: Record<number, number[]> = {
      2: [0.62],
      3: [0.42, 0.74],
      4: [0.34, 0.58, 0.8],
    };
    const cuts =
      thresholds[n] ?? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
    let index = 0;
    for (const cut of cuts) {
      if (v >= cut) index++;
    }
    return Math.max(0, Math.min(n - 1, index));
  }

  /** Suma una variante que llegó después (carga en segundo plano). */
  addVariant(layerIndex: number, sampler: Tone.Sampler): void {
    const group = this.groups[layerIndex] ?? (this.groups[layerIndex] = []);
    group.push(sampler);
    this.nextVariant[layerIndex] = this.nextVariant[layerIndex] ?? 0;
  }

  variantCount(): number {
    return this.groups.reduce((n, g) => n + g.length, 0);
  }

  triggerAttack(note: Tone.Unit.Frequency, time?: Tone.Unit.Time, velocity = 1): void {
    const layer = this.layerFor(velocity);
    const group = this.groups[layer];
    if (!group || group.length === 0) return;
    const index = (this.nextVariant[layer] ?? 0) % group.length;
    this.nextVariant[layer] = index + 1;
    // La dinámica dentro de la capa la da el propio sampler (volumen por nota).
    group[index]?.triggerAttack(note, time, velocity);
  }

  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void {
    // Se libera en TODAS las variantes: no se sabe con certeza en cuál entró.
    for (const group of this.groups) {
      for (const sampler of group) {
        try {
          sampler.triggerRelease(note, time);
        } catch {
          /* la nota no estaba sonando en esa variante */
        }
      }
    }
  }

  releaseAll(): void {
    this.groups.forEach((g) => g.forEach((s) => s.releaseAll()));
  }

  dispose(): void {
    this.groups.forEach((g) => g.forEach((s) => s.dispose()));
    this.groups = [];
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

  // Capa de velocidad × variante round-robin: `buffers[layer][variant][nota]`.
  const layerCount = Math.max(
    ...picked.map((n) => instrument.layers[n]?.length ?? 0),
  );
  const variantCount = Math.max(
    1,
    ...picked.map((n) =>
      Math.max(...(instrument.layers[n] ?? []).map((v) => v.length)),
    ),
  );
  const buffers: Record<string, AudioBuffer>[][] = Array.from(
    { length: layerCount },
    () => Array.from({ length: variantCount }, () => ({})),
  );
  const allLevels: number[] = [];

  /**
   * Baja las notas de UNA combinación capa+variante.
   *
   * Si una nota no tiene esa variante grabada, se cae a la última disponible:
   * así ninguna nota queda muda sólo porque ese banco no grabó la rr2.
   */
  const loadCombo = async (
    layerIndex: number,
    variantIndex: number,
  ): Promise<void> => {
    await Promise.all(
      picked.map(async (note) => {
        const variants = instrument.layers[note]?.[layerIndex];
        if (!variants || variants.length === 0) return;
        const sample =
          variants[Math.min(variantIndex, variants.length - 1)];
        if (!sample) return;
        try {
          const raw = await Tone.ToneAudioBuffer.load(sample.url);
          // Micro-fades + extensión por loop para los sostenidos: las cuerdas y
          // los metales de VSCO duran pocos segundos y terminan en media onda.
          const buffer = prepareSampleBuffer(raw, instrument.name);
          buffers[layerIndex][variantIndex][String(note)] = buffer;
          // Sólo la primera variante cuenta para el nivel: las otras son la
          // misma intensidad y promediarlas dos veces sesgaría la compensación.
          if (variantIndex === 0) allLevels.push(bufferRmsDb(buffer));
        } catch (err) {
          console.warn(
            `[vsco] ${instrument.name}: nota ${note} capa ${layerIndex + 1} variante ${variantIndex + 1} falló`,
            err,
          );
        }
      }),
    );
  };

  // FASE 1 — capa más suave, primera variante: sonido ya.
  // Los WAV de VSCO son grandes (~1.9 MB): esperar todo antes de arrancar la
  // canción costaba ~16 s de silencio.
  await loadCombo(0, 0);
  if (Object.keys(buffers[0][0]).length === 0) return null;

  const gain = trimDb(median(allLevels), TARGET_MELODIC_RMS_DB);
  const first = await createSampler(buffers[0][0], gain, dest, instrument.name);
  const voice = new LayeredSampler([[first]]);

  // FASE 2 — el resto de variantes y capas, en segundo plano: las variantes
  // quitan el efecto ametralladora y las capas hacen que la dinámica cambie de
  // timbre (que es el punto de la expresividad).
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
      if (layerIndex === 0 && variantIndex === 0) continue;
      void loadCombo(layerIndex, variantIndex)
        .then(async () => {
          const urls = buffers[layerIndex][variantIndex];
          if (Object.keys(urls).length === 0) return;
          const sampler = await createSampler(urls, gain, dest, instrument.name);
          voice.addVariant(layerIndex, sampler);
          console.log(
            `[vsco] ${instrument.name}: capa ${layerIndex + 1} variante ${variantIndex + 1} sumada (${voice.variantCount()} tomas)`,
          );
        })
        .catch(() => {
          /* una toma de más es una mejora, nunca un bloqueante */
        });
    }
  }

  console.log(
    `[vsco] ${instrument.name}: ${picked.length} notas, ${layerCount} capa(s) × ${variantCount} variante(s), nivel ${median(allLevels).toFixed(1)} dB → ${gain.toFixed(1)} dB`,
  );

  return voice;
}

function createSampler(
  urls: Record<string, AudioBuffer>,
  gain: number,
  dest: Tone.ToneAudioNode,
  instrumentName: string,
): Promise<Tone.Sampler> {
  return new Promise<Tone.Sampler>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 45_000);
    const s = new Tone.Sampler({
      urls,
      release: releaseForInstrument(instrumentName),
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
