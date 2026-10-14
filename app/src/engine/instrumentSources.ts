/**
 * instrumentSources — la única puerta por la que entra sonido al reproductor.
 *
 * Reglas (pedido explícito del dueño del proyecto):
 *   1. **Ningún sintetizador.** Si no hay sample real, la nota se saltea.
 *   2. **Cobertura garantizada**: todo instrumento que pidan los MIDI tiene que
 *      resolver a una grabación. Por eso cada instrumento tiene una cadena de
 *      fuentes y, si una falla, se pasa a la siguiente (la última es el
 *      soundfont GM de gleitz, que cubre los 128 programas).
 *   3. **Expresividad**: se prefieren los bancos con capas de velocidad y
 *      round-robin (VSCO-2-CE, FreePats) sobre los de una sola toma.
 *   4. **Liviano**: se bajan SÓLO las notas que la canción usa. Un piano de
 *      tonejs-instruments son 85 mp3 / 14.9 MB; una canción usa 20-30 notas.
 *
 * Las fuentes son todas grabaciones reales servidas con CORS:
 *   - FreePats (CC0)            → acordeón de botones, percusión del mundo
 *   - tonejs-instruments (CC-BY)→ guitarra, bajo, metales, maderas, cuerdas…
 *   - VSCO-2-CE (CC0)           → capas de velocidad + round-robin
 *   - WebAudioFont (MIT)        → variantes GM livianas (75 KB – 800 KB)
 *   - gleitz soundfonts         → red de seguridad: los 128 programas GM
 */

import * as Tone from "tone";
import {
  gleitzRecordedNotes,
  instrumentToSoundfont,
  loadSoundfontSampler,
} from "./GMSamplerEngine";
import {
  BUTTON_ACCORDION_MIDI_NOTES,
  isButtonAccordionInstrument,
  loadButtonAccordion,
} from "./freePatsAccordion";
import { loadWebAudioFontVoice, wafRecordedNotes } from "./WebAudioFont";
import { prepareSampleBuffer, releaseForInstrument } from "./sampleProcessing";
import { loadVscoInstrument, vscoCovers } from "./vscoSampler";
import { VSCO_INSTRUMENTS } from "./vscoManifest";
import { velocityToGain } from "./playbackGain";
import type { InstrumentVoice } from "./vscoSampler";
import { panForInstrument } from "./instrumentPanning";
import { createInstrumentChain, eqForInstrument } from "./instrumentChain";
import { TONEJS_INSTRUMENTS } from "./tonejsManifest";
import { WAF_VARIANTS, WAF_NEEDED_PROGRAMS } from "./wafManifest";
import {
  TARGET_MELODIC_RMS_DB,
  applyTrim,
  bufferRmsDb,
  median,
  trimDb,
} from "./sampleLevels";

/** Estado de un instrumento, para el ruteo. */
export type InstrumentStatus = "loaded" | "loading" | "failed" | "unmapped";

type Kind = "vsco" | "accordion" | "tonejs" | "waf" | "gleitz";

interface Candidate {
  kind: Kind;
  /** Identificador dentro de la fuente (código WAF, carpeta tonejs, soundfont). */
  id: string;
  /** Para los logs y la página de audición. */
  label: string;
  /**
   * Notas MIDI que el banco tiene GRABADAS — no las que se le piden.
   *
   * `null` = todavía no se sabe sin bajar el archivo (WebAudioFont): en ese caso
   * la cobertura se decide DESPUÉS de cargar, con las zonas que se decodificaron
   * (`WafVoice.recorded`), para no pedir el mismo archivo dos veces.
   */
  recorded: number[] | null;
}

// ─── Tope de repitcheo ───────────────────────────────────────────────────────

/**
 * Máximo desvío, en semitonos, entre una nota que la canción pide y la
 * grabación más cercana del banco.
 *
 * ── POR QUÉ 6 ───────────────────────────────────────────────────────────────
 *
 * Un semitono es un 5,9 % de frecuencia, así que 6 semitonos son un tritono:
 * 1,41× hacia arriba o 0,71× hacia abajo. El repitcheo no mueve sólo el
 * fundamental, mueve TODO el espectro — incluidos los formantes, que son lo que
 * hace que un acordeón suene a acordeón y no a un retumbe de banda ancha. A un
 * tritono de distancia los formantes caen fuera de la zona donde el oído
 * reconoce al instrumento; más allá, el timbre se pierde.
 *
 * El caso medido en este repo: el acordeón de botones (grabado B3–G6 = 59–91) en
 * la pista de MIDI 40–57 de `BinomioDeOro_-_Sombra_Perdida.kar` se repitcheaba
 * **19 semitonos abajo** (0,33×). El 76 % de la energía de esa pista terminaba en
 * 30–200 Hz — donde el oído no oye altura, sólo retumbe — contra el 0,2 % de la
 * misma pista en su registro (`.logs/retumbe-antes.json`).
 *
 * 6 está en el extremo alto de lo que estiran las zonas de un sampler (una
 * muestra cada 3–12 semitonos) y es 4× la tolerancia que ya usaba este archivo
 * para elegir muestras (`maxGap = 3` → ±1,5 semitonos). Con el tope acá, las
 * notas 53–57 del acordeón —las que están a ≤ 6 semitonos del B3 grabado—
 * siguen sonando con los botones, que es el timbre que el dueño quiere.
 */
export const MAX_PITCH_SHIFT_SEMITONES = 6;

/** Desvío en semitonos entre `note` y la grabación más cercana del banco. */
export function nearestRecordedShift(
  note: number,
  recorded: readonly number[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const grabada of recorded) {
    const d = Math.abs(grabada - note);
    if (d < best) best = d;
  }
  return best;
}

export interface ShiftSplit {
  /** Notas que el banco puede tocar dentro del tope. */
  within: number[];
  /** Notas que quedan más lejos que el tope (las tiene que tomar otra fuente). */
  beyond: number[];
  /** Peor desvío de `within` (0 si está vacío). */
  worstWithin: number;
  /** Peor desvío de `beyond` (`Infinity` si el banco no grabó nada de eso). */
  worstBeyond: number;
}

/**
 * Parte las notas pedidas según el registro GRABADO del banco.
 *
 * Es la regla que evita el retumbe: una fuente no se usa para una nota que su
 * grabación más cercana no alcanza dentro del tope. Las notas que quedan afuera
 * no se pierden — las toma la fuente siguiente de la cadena (ver `resolveParts`).
 */
export function splitByShift(
  notes: readonly number[],
  recorded: readonly number[],
  maxShift = MAX_PITCH_SHIFT_SEMITONES,
): ShiftSplit {
  const within: number[] = [];
  const beyond: number[] = [];
  let worstWithin = 0;
  let worstBeyond = 0;
  for (const note of notes) {
    const shift = nearestRecordedShift(note, recorded);
    if (shift <= maxShift) {
      within.push(note);
      if (shift > worstWithin) worstWithin = shift;
    } else {
      beyond.push(note);
      if (shift > worstBeyond) worstBeyond = shift;
    }
  }
  return { within, beyond, worstWithin, worstBeyond };
}

/** Rango compacto para los logs: `40–57` (o `40` si es una sola nota). */
function range(notes: readonly number[]): string {
  if (notes.length === 0) return "—";
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * Notas MIDI que VSCO tiene GRABADAS para un programa (las claves de `layers`),
 * no las que se le piden: es el registro real contra el que se mide el desvío.
 *
 * Los bancos de VSCO no están muestreados parejo — medido con
 * `qa-densidad-samples.mjs`, el salto entre notas grabadas llega a 14 semitonos
 * (French Horn: …60, 74…): una nota en el medio de ese hueco se estira 7 y deja
 * de sonar a instrumento.
 */
function vscoRecordedNotes(program: number): number[] {
  const instrument = VSCO_INSTRUMENTS.find((i) => i.program === program);
  return instrument
    ? Object.keys(instrument.layers)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
}

// ─── Selección de fuentes ────────────────────────────────────────────────────

/** Nombre GM → instrumento de tonejs-instruments. */
const TONEJS_BY_NAME = new Map(
  TONEJS_INSTRUMENTS.map((inst) => [inst.name.toLowerCase(), inst]),
);

/** Nombre GM → programa (se arma del manifiesto de WAF, que ya trae los dos). */
const PROGRAM_BY_NAME = new Map(
  Object.entries(WAF_NEEDED_PROGRAMS).map(([program, name]) => [
    name.toLowerCase(),
    Number(program),
  ]),
);

/** Reglas explícitas: instrumento de la app → carpeta de tonejs-instruments. */
const TONEJS_ALIASES: [RegExp, string][] = [
  [/acoustic grand piano|bright acoustic/i, "Acoustic Grand Piano"],
  [/electric grand|honky/i, "Acoustic Grand Piano"],
  [/acoustic guitar \(nylon\)|guitar.*nylon/i, "Acoustic Guitar (nylon)"],
  [/acoustic guitar \(steel\)|guitar.*steel/i, "Acoustic Guitar (steel)"],
  [/electric guitar \(clean\)|electric guitar \(jazz\)/i, "Electric Guitar (clean)"],
  [/electric bass \(finger\)|electric bass \(pick\)|fretless/i, "Electric Bass (finger)"],
  [/^violin$/i, "Violin"],
  [/^cello$/i, "Cello"],
  [/contrabass|double bass/i, "Contrabass"],
  [/orchestral harp/i, "Orchestral Harp"],
  [/^trumpet$|muted trumpet/i, "Trumpet"],
  [/^trombone$/i, "Trombone"],
  [/^tuba$/i, "Tuba"],
  [/french horn/i, "French Horn"],
  [/sax/i, "Alto Sax"],
  [/^bassoon$/i, "Bassoon"],
  [/^clarinet$/i, "Clarinet"],
  [/^flute$|recorder|pan flute|piccolo/i, "Flute"],
  [/xylophone|glockenspiel/i, "Xylophone"],
  [/church organ|pipe organ/i, "Church Organ"],
  [/reed organ|harmonium|accordion.*reed/i, "Reed Organ"],
];

function tonejsFor(instrument: string) {
  const direct = TONEJS_BY_NAME.get(instrument.toLowerCase());
  if (direct) return direct;
  for (const [rx, name] of TONEJS_ALIASES) {
    if (rx.test(instrument)) {
      return (
        TONEJS_BY_NAME.get(name.toLowerCase()) ??
        TONEJS_INSTRUMENTS.find((i) => i.name === name)
      );
    }
  }
  return undefined;
}

/**
 * Cadena de fuentes para un instrumento, en orden de preferencia.
 *
 * El orden importa: primero los bancos con carácter/expresividad, después las
 * variantes GM livianas y al final el soundfont completo como red de seguridad.
 *
 * Cada candidato declara su REGISTRO GRABADO (`recorded`): sin eso, elegir por
 * NOMBRE de instrumento es apostar a que el banco cubre lo que la canción pide, y
 * cuando no lo cubre `Tone.Sampler` repitchea desde la muestra más cercana y el
 * timbre se pierde (ver `MAX_PITCH_SHIFT_SEMITONES`).
 */
export function candidatesFor(instrument: string): Candidate[] {
  const out: Candidate[] = [];
  const program = PROGRAM_BY_NAME.get(instrument.toLowerCase());

  // 1. Acordeón vallenato: grabación dedicada de un Hohner de botones.
  if (isButtonAccordionInstrument(instrument)) {
    out.push({
      kind: "accordion",
      id: "freepats",
      label: "botones FreePats",
      recorded: BUTTON_ACCORDION_MIDI_NOTES,
    });
  }

  // 2. VSCO-2-CE: es el único banco con CAPAS DE VELOCIDAD y round-robin, así
  //    que va primero donde exista. Un forte cambia de timbre en vez de subir
  //    el volumen, que es la diferencia entre sonar a instrumento y a sample.
  if (program !== undefined && vscoCovers(program)) {
    out.push({
      kind: "vsco",
      id: String(program),
      label: "vsco (capas)",
      recorded: vscoRecordedNotes(program),
    });
  }

  // 3. Banco con carácter propio (tonejs-instruments): grabaciones reales
  //    hechas para sampler, una por nota.
  const tonejs = tonejsFor(instrument);
  if (tonejs && !/piano/i.test(tonejs.folder)) {
    // El piano de tonejs pesa 14.9 MB y ya hay uno mejor (Salamander).
    out.push({
      kind: "tonejs",
      id: tonejs.folder,
      label: `tonejs ${tonejs.folder}`,
      recorded: Object.keys(tonejs.notes).map(Number).sort((a, b) => a - b),
    });
  }

  // 4. Variantes GM livianas de WebAudioFont (75 KB – 800 KB por instrumento).
  if (program !== undefined) {
    for (const code of (WAF_VARIANTS[program] ?? []).slice(0, 3)) {
      // El registro real de un WAF vive en el archivo (zonas `originalPitch`):
      // se conoce recién al bajarlo, así que la cobertura se decide después.
      out.push({ kind: "waf", id: code, label: `waf ${code}`, recorded: null });
    }
  }

  // 5. Red de seguridad: soundfont GM de gleitz (cubre los 128 programas, con
  //    una muestra cada 3 semitonos de A0 a C8 → nunca excede el tope).
  const sf = instrumentToSoundfont(instrument);
  if (sf) {
    out.push({
      kind: "gleitz",
      id: sf,
      label: `gleitz ${sf}`,
      recorded: gleitzRecordedNotes(),
    });
  }

  return out;
}

/**
 * Diagnóstico: la cadena de un instrumento con su registro grabado y qué notas
 * caen dentro del tope. No baja ni decodifica nada salvo el registro de los WAF
 * (que vive en el archivo), y eso una sola vez por código.
 *
 * Lo usa `scripts/qa-desvio-fuentes.mjs` para la tabla de desvíos y el barrido de
 * la biblioteca: sin esto habría que replicar el orden de la cadena en el script
 * y el script podría decir una cosa y el motor hacer otra.
 */
export async function explainSourcesFor(
  instrument: string,
  notes: readonly number[],
): Promise<
  {
    label: string;
    kind: Kind;
    recorded: number[] | null;
    within: number[];
    beyond: number[];
    worstWithin: number;
    worstBeyond: number;
  }[]
> {
  const out = [];
  for (const candidate of candidatesFor(instrument)) {
    const recorded =
      candidate.recorded ??
      (await wafRecordedNotes(candidate.id).catch(() => null));
    const split = recorded
      ? splitByShift(notes, recorded)
      : { within: [...notes], beyond: [], worstWithin: 0, worstBeyond: 0 };
    out.push({ label: candidate.label, kind: candidate.kind, recorded, ...split });
  }
  return out;
}

// ─── Selección de samples por nota ───────────────────────────────────────────

/**
 * Elige, de las notas que la fuente tiene grabadas, las mínimas que cubren las
 * notas que la canción pide (a lo sumo `maxGap` semitonos de distancia).
 *
 * Es lo que permite bajar 20 samples en vez de 85: `Tone.Sampler` repitchea la
 * muestra más cercana, así que con un salto de 3 semitonos el error máximo es
 * ±1.5 semitonos — indistinguible — y la descarga baja a un tercio.
 */
export function pickSamplesFor(
  needed: number[],
  available: number[],
  maxGap = 3,
): number[] {
  const sorted = [...available].sort((a, b) => a - b);
  if (sorted.length === 0 || needed.length === 0) return [];

  const min = Math.min(...needed) - 1;
  const max = Math.max(...needed) + 1;
  const chosen: number[] = [];

  for (let note = min; note <= max; note += maxGap) {
    // Muestra disponible más cercana a esta nota.
    let best = sorted[0];
    for (const cand of sorted) {
      if (Math.abs(cand - note) < Math.abs(best - note)) best = cand;
    }
    if (!chosen.includes(best)) chosen.push(best);
  }
  return chosen;
}

/**
 * Tolerancia, en semitonos, para ubicar una nota cuya altura viene con pitch
 * bend: el llamador pasa una FRECUENCIA ya doblada (`midiToFrequency(midi + bend)`),
 * así que el redondeo puede caer un par de semitonos al lado de la nota original.
 */
const BEND_TOLERANCE_SEMITONES = 2;

/**
 * Una sub-voz ya construida: un banco que se hace cargo de un subconjunto de las
 * notas pedidas.
 */
interface Part {
  voice: InstrumentVoice;
  /** Notas que toca esta sub-voz (todas dentro del tope de su banco). */
  notes: Set<number>;
  /** Registro grabado del banco, para el log y para el diagnóstico. */
  recorded: number[];
  source: string;
  /** Peor desvío (semitonos) de las notas de esta parte. */
  worstShift: number;
}

/**
 * Voz compuesta: reparte cada nota a la sub-voz que la tiene grabada.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * Rechazar un banco entero cuando una parte de la canción se sale de su registro
 * resuelve el retumbe pero PIERDE el timbre donde el banco sí sirve. En
 * `BinomioDeOro_-_Sombra_Perdida.kar` el acordeón toca 40–86: las pistas agudas
 * (61–86) están dentro del registro del acordeón de botones (59–91) y son el
 * sonido que el dueño quiere, pero una tercera pista toca 40–57. Si se descarta
 * el banco, TODA la canción cae al soundfont GM y se pierde el timbre de botones.
 *
 * Con la voz compuesta cada nota va al banco que la tiene grabada: los botones
 * para 53–86 y la fuente siguiente de la cadena (WebAudioFont GM o el soundfont
 * de gleitz) para 40–52.
 *
 * `getInstrumentSync()` sigue devolviendo UNA voz, así que el piano y el
 * reproductor no cambian una línea.
 */
class SplitVoice implements InstrumentVoice {
  /**
   * La amplitud viaja por el 4º argumento en todas las sub-voces (cada una ya
   * sabe si elige capa por velocity). Declararlo evita que un envoltorio la
   * pliegue sobre la velocity y cambie la toma elegida.
   */
  readonly layered = true;

  private readonly parts: readonly Part[];

  constructor(parts: readonly Part[]) {
    this.parts = parts;
  }

  /**
   * Elige la sub-voz de una nota.
   *
   * 1. La sub-voz que la tiene en su juego (el orden de `parts` es el de
   *    preferencia de la cadena).
   * 2. Si el pitch bend corrió el redondeo, la más cercana dentro de ±2
   *    semitonos — prefiriendo la primera de la cadena en caso de empate.
   * 3. Si no, la ÚLTIMA: es la red de seguridad de la cadena y, sobre todo, una
   *    nota repitcheada nunca es peor que una nota muda.
   */
  private pick(note: Tone.Unit.Frequency): InstrumentVoice | null {
    if (this.parts.length === 0) return null;
    let midi: number;
    try {
      midi = Math.round(Tone.Frequency(note).toMidi());
    } catch {
      return this.parts[this.parts.length - 1].voice;
    }

    for (const part of this.parts) {
      if (part.notes.has(midi)) return part.voice;
    }

    let best: { d: number; voice: InstrumentVoice } | null = null;
    for (const part of this.parts) {
      for (const n of part.notes) {
        const d = Math.abs(n - midi);
        if (d <= BEND_TOLERANCE_SEMITONES && (!best || d < best.d)) {
          best = { d, voice: part.voice };
        }
      }
    }
    return best ? best.voice : this.parts[this.parts.length - 1].voice;
  }

  triggerAttack(
    note: Tone.Unit.Frequency,
    time?: Tone.Unit.Time,
    velocity = 1,
    amplitude?: number,
  ): void {
    this.pick(note)?.triggerAttack(note, time, velocity, amplitude);
  }

  /**
   * Libera en TODAS las sub-voces: no se sabe con certeza en cuál entró la nota
   * (el redondeo del pitch bend puede mandarla a la otra) y liberar una voz que
   * no estaba sonando no es un error.
   */
  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void {
    for (const part of this.parts) {
      try {
        part.voice.triggerRelease(note, time);
      } catch {
        /* la nota no estaba sonando en esa sub-voz */
      }
    }
  }

  releaseAll(): void {
    for (const part of this.parts) {
      try {
        part.voice.releaseAll();
      } catch {
        /* una voz ya liberada no es un error */
      }
    }
  }

  dispose(): void {
    for (const part of this.parts) part.voice.dispose();
  }
}

/** Envuelve las partes en la voz que ve el resto del motor. */
function voiceOf(parts: readonly Part[]): InstrumentVoice {
  return parts.length === 1 ? parts[0].voice : new SplitVoice(parts);
}

// ─── Carga con failover ──────────────────────────────────────────────────────

interface Loaded {
  sampler: InstrumentVoice;
  /** Las sub-voces que lo componen (una sola si el banco cubrió todo). */
  parts: Part[];
  /**
   * Notas que el llamador pidió cuando se resolvió (sirve para detectar pedidos
   * nuevos). La COBERTURA real de cada banco vive en `parts[].notes`, que es lo
   * que usa el reparto por nota: el campo `covered` que había antes guardaba las
   * notas PEDIDAS y nadie lo leía.
   */
  requested: Set<number>;
  source: string;
}
const loaded = new Map<string, Loaded>();
const inFlight = new Map<string, Promise<Loaded | null>>();
const failedSources = new Set<string>();
/** Instrumentos que ya avisaron que no tienen ninguna fuente real. */
const warned = new Set<string>();

/**
 * Memo de `key(instrument)`: el callback del scheduler y el release lo llaman
 * por nota y cada llamada hacía `trim().toLowerCase()` (dos strings nuevos).
 * Los nombres posibles son un puñado, así que el memo no crece sin Control.
 */
const keyCache = new Map<string, string>();

function key(instrument: string): string {
  const hit = keyCache.get(instrument);
  if (hit !== undefined) return hit;
  const value = instrument.trim().toLowerCase();
  keyCache.set(instrument, value);
  return value;
}

/** Hash determinista y barato: misma nota + mismo instante ⇒ misma variación. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Variación humana de la GANANCIA de una nota (±0.5 dB, determinista).
 *
 * La usan tanto las voces de esta capa como el piano Salamander (que se dispara
 * aparte, en App.tsx): dos notas iguales nunca suenan EXACTAMENTE igual, y esa
 * repetición idéntica es lo que delata a un sampler.
 *
 * Antes esta variación se aplicaba a la VELOCITY, y eso tenía un efecto
 * colateral: ±6 % sobre la velocity puede cruzar el umbral de capa de
 * `LayeredSampler` y cambiar la toma grabada. Aplicada a la ganancia, el timbre
 * queda estable y la variación sigue siendo inaudible en nivel (que es el
 * punto).
 */
export function humanizeGain(
  instrument: string,
  note: number | string,
  time: number | undefined,
  gain: number,
): number {
  const t = typeof time === "number" ? time : 0;
  const jitter =
    1 + (hash01(`${instrument}:${note}:${Math.floor(t * 20)}`) - 0.5) * 0.12;
  return Math.max(0.02, Math.min(1, gain * jitter));
}

/**
 * Compatibilidad: la misma variación aplicada a una velocity (se sigue usando
 * donde la velocity ES la amplitud — piano Salamander, audición).
 */
export function humanizeVelocity(
  instrument: string,
  note: number | string,
  time: number | undefined,
  velocity: number,
): number {
  return humanizeGain(instrument, note, time, velocity);
}

/**
 * Voz con variación humana.
 *
 * Envuelve a toda fuente real. Traduce el contrato de ganancia de
 * `InstrumentVoice` a la implementación de abajo:
 *
 *   • voz CON capas (`layered`): la velocity viaja intacta (la capa se decide
 *     con ella) y la variación humana se aplica a la amplitud.
 *   • voz SIN capas (soundfont GM, WAF, acordeón): la velocity *es* la
 *     amplitud, así que se aplica la curva γ y la ganancia externa juntas, como
 *     siempre.
 */
class HumanizedVoice implements InstrumentVoice {
  private inner: InstrumentVoice;
  private instrument: string;

  constructor(inner: InstrumentVoice, instrument: string) {
    this.inner = inner;
    this.instrument = instrument;
  }

  triggerAttack(
    note: Tone.Unit.Frequency,
    time?: Tone.Unit.Time,
    velocity = 1,
    amplitude?: number,
  ): void {
    const t = typeof time === "number" ? time : 0;
    if (this.inner.layered) {
      this.inner.triggerAttack(
        note,
        time,
        velocity,
        amplitude === undefined
          ? undefined
          : humanizeGain(this.instrument, note, t, amplitude),
      );
      return;
    }
    const level =
      amplitude === undefined
        ? velocity
        : velocityToGain(velocity) * amplitude;
    this.inner.triggerAttack(
      note,
      time,
      humanizeGain(this.instrument, note, t, level),
    );
  }

  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void {
    this.inner.triggerRelease(note, time);
  }

  releaseAll(): void {
    this.inner.releaseAll();
  }

  dispose(): void {
    this.inner.dispose();
  }
}

/** Lo que devuelve un banco cuando logró construirse. */
interface Built {
  sampler: InstrumentVoice;
  /** Notas grabadas que quedaron cargadas de verdad. */
  recorded: number[];
  source: string;
}

async function buildFromCandidate(
  candidate: Candidate,
  instrument: string,
  dest: Tone.ToneAudioNode,
  notes: number[],
): Promise<Built | null> {
  const sourceKey = `${candidate.kind}:${candidate.id}`;
  if (failedSources.has(sourceKey)) return null;

  try {
    if (candidate.kind === "accordion") {
      const sampler = await loadButtonAccordion(dest);
      // El banco de botones baja sus 17 FLACs siempre: el registro grabado es
      // el que declara el manifiesto, no lo que se le pidió.
      return { sampler, recorded: candidate.recorded ?? [], source: candidate.label };
    }

    if (candidate.kind === "vsco") {
      const voice = await loadVscoInstrument(Number(candidate.id), dest, notes);
      if (!voice) return null;
      return { sampler: voice, recorded: candidate.recorded ?? [], source: candidate.label };
    }

    if (candidate.kind === "tonejs") {
      const inst = TONEJS_INSTRUMENTS.find((i) => i.folder === candidate.id);
      if (!inst) return null;
      const available = Object.keys(inst.notes).map(Number);
      const picked = pickSamplesFor(notes, available);
      if (picked.length === 0) return null;

      // Se decodifican acá (en vez de dejar que el Sampler lo haga desde las
      // URLs) para poder MEDIR el nivel de la grabación y compensarlo, igual
      // que en las otras fuentes: los bancos no comparten nivel.
      const urls: Record<string, AudioBuffer> = {};
      const levels: number[] = [];
      await Promise.all(
        picked.map(async (midi) => {
          const url = inst.notes[midi];
          if (!url) return;
          try {
            const raw = await Tone.ToneAudioBuffer.load(url);
            // Micro-fades + extensión por loop en instrumentos sostenidos: sin
            // esto una cuerda se corta a los pocos segundos y el final del
            // archivo hace clic. Ver sampleProcessing.ts.
            const buffer = prepareSampleBuffer(raw, instrument);
            urls[String(midi)] = buffer;
            levels.push(bufferRmsDb(buffer));
          } catch (err) {
            console.warn(`[fuentes] tonejs ${inst.folder}: nota ${midi} falló`, err);
          }
        }),
      );
      if (Object.keys(urls).length === 0) return null;

      const gain = trimDb(median(levels), TARGET_MELODIC_RMS_DB);
      const sampler = await new Promise<Tone.Sampler>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), 30_000);
        const s = new Tone.Sampler({
          urls,
          release: releaseForInstrument(instrument),
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
      console.log(
        `[fuentes] tonejs ${inst.folder}: ${Object.keys(urls).length} notas, nivel ${median(levels).toFixed(1)} dB → ${gain.toFixed(1)} dB`,
      );
      return {
        sampler,
        // Las notas que se decodificaron SON las anclas que quedan en el sampler.
        recorded: picked.filter((midi) => urls[String(midi)]).sort((a, b) => a - b),
        source: `${candidate.label} (${Object.keys(urls).length} notas)`,
      };
    }

    if (candidate.kind === "waf") {
      const { sampler, recorded } = await loadWebAudioFontVoice(
        candidate.id,
        dest,
        notes,
      );
      return { sampler, recorded, source: candidate.label };
    }

    // gleitz: red de seguridad, cubre cualquier nota.
    const sf = candidate.id;
    const sampler = await loadSoundfontSampler(sf, dest, undefined, notes);
    return { sampler, recorded: candidate.recorded ?? [], source: candidate.label };
  } catch (err) {
    console.warn(
      `[fuentes] ${candidate.label} falló para "${instrument}":`,
      err instanceof Error ? err.message : err,
    );
    failedSources.add(sourceKey);
    return null;
  }
}

/**
 * Resuelve, para `notes`, las partes que van a sonar — bajando de la cadena lo
 * mínimo indispensable y **partiendo por registro** lo que haga falta.
 *
 * Recorre los candidatos desde `startIndex`:
 *   1. Descarta (sin bajarlo) al banco cuya grabación más cercana quede más lejos
 *      que `MAX_PITCH_SHIFT_SEMITONES` para TODAS las notas pedidas.
 *   2. Le pide sólo las notas que su registro cubre.
 *   3. Lo que quedó afuera se resuelve con el RESTO de la cadena (recursión), y
 *      si ninguna fuente lo cubre, esas notas vuelven a esta parte: un repitcheo
 *      grande suena mal, pero el silencio suena peor (era el comportamiento
 *      anterior a este cambio).
 */
async function resolveParts(
  candidates: readonly Candidate[],
  startIndex: number,
  instrument: string,
  dest: Tone.ToneAudioNode,
  notes: readonly number[],
): Promise<Part[] | null> {
  for (let i = startIndex; i < candidates.length; i++) {
    const candidate = candidates[i];
    const known = candidate.recorded;

    // ── Parte 1: el tope de repitcheo decide ANTES de bajar el banco. ──
    const pre = known ? splitByShift(notes, known) : null;
    if (pre && pre.within.length === 0) {
      console.log(
        `[fuentes] "${instrument}": se descarta ${candidate.label} — las notas ${range(notes)} ` +
        `quedan a ${pre.worstBeyond} semitono(s) de su grabación más cercana (${range(known ?? [])}), ` +
        `más que el tope de ${MAX_PITCH_SHIFT_SEMITONES}`,
      );
      continue;
    }
    const ask = pre ? pre.within : [...notes];

    const built = await buildFromCandidate(candidate, instrument, dest, ask);
    if (!built) continue;

    // ── Parte 2: manda la cobertura REAL (en WAF, la de las zonas decodificadas). ──
    //
    // OJO: lo que el pre-filtro dejó afuera hay que arrastrarlo — `ask` ya no las
    // tiene, así que el reparto posterior por sí solo las perdería en silencio.
    const post = splitByShift(ask, built.recorded);
    const beyond = [...(pre?.beyond ?? []), ...post.beyond];
    const worstBeyond = Math.max(pre?.worstBeyond ?? 0, post.worstBeyond);

    // Un banco que no puede tocar NINGUNA de estas notas no se queda ni como
    // parte vacía: sus samples ya están decodificados y una sub-voz muda sólo
    // ocupa memoria y ensucia el log. Se libera y sigue la cadena.
    if (post.within.length === 0) {
      console.log(
        `[fuentes] "${instrument}": se descarta ${built.source} — ninguna de las notas ` +
        `${range(ask)} entra en su registro (${range(built.recorded)}), hasta ${post.worstBeyond} semitono(s) de repitcheo`,
      );
      built.sampler.dispose();
      continue;
    }

    const part: Part = {
      voice: new HumanizedVoice(built.sampler, instrument),
      notes: new Set(post.within),
      recorded: built.recorded,
      source: built.source,
      worstShift: post.worstWithin,
    };

    if (beyond.length === 0) return [part];

    const rest = await resolveParts(
      candidates,
      i + 1,
      instrument,
      dest,
      beyond,
    );
    if (rest) return [part, ...rest];

    console.warn(
      `[fuentes] "${instrument}": las notas ${range(beyond)} no tienen otra fuente real; ` +
      `quedan en ${built.source} con hasta ${worstBeyond} semitono(s) de repitcheo`,
    );
    part.notes = new Set(notes);
    part.worstShift = Math.max(post.worstWithin, worstBeyond);
    return [part];
  }

  return null;
}

/** Una línea de log por parte: qué banco, qué registro y qué notas cubre. */
function describePart(part: Part): string {
  return (
    `${part.source} [grabado ${range(part.recorded)}] cubre ${range([...part.notes])}` +
    ` (desvío ≤ ${part.worstShift})`
  );
}

/**
 * Amplía una voz ya cargada con las notas que le faltaban.
 *
 * Se resuelven sólo las notas nuevas y sus partes se SUMAN a las que ya sonaban:
 * así el cambio de instrumento de una pista (o una segunda canción que usa el
 * mismo instrumento en otro registro) no re-baja lo que ya estaba ni deja notas
 * mudas. La sub-voz vieja no se descarta — sus partes se reusan en la nueva
 * compuesta, que es lo que hace que no haya que volver a decodificar nada.
 */
async function extendLoaded(
  k: string,
  existing: Loaded,
  instrument: string,
  dest: Tone.ToneAudioNode,
  missing: number[],
): Promise<InstrumentVoice | null> {
  const chain = createInstrumentChain(instrument, dest);
  const extra = await resolveParts(
    candidatesFor(instrument),
    0,
    instrument,
    chain.input,
    missing,
  );

  if (!extra) {
    // Nada real para esas notas: se deja la voz como estaba (mejor eso que
    // dejarla muda, y el reparto previo sigue sonando).
    chain.dispose();
    console.warn(
      `[fuentes] "${instrument}": sin fuente real para las notas nuevas ${range(missing)}; se sigue con lo que ya estaba cargado`,
    );
    return existing.sampler;
  }

  const parts = [...existing.parts, ...extra];
  const merged: Loaded = {
    sampler: voiceOf(parts),
    parts,
    requested: new Set([...existing.requested, ...missing]),
    source: [...new Set(parts.map((part) => part.source))].join(" + "),
  };
  // Ojo: NO se descarta `existing.sampler` — sus sub-voces son las `parts` que
  // se acaban de reusar. Sólo se lo reemplaza como envoltorio.
  loaded.set(k, merged);
  console.log(
    `[fuentes] "${instrument}" (ampliado) → ${parts.map(describePart).join("  |  ")}`,
  );
  return merged.sampler;
}

/**
 * Devuelve un sampler con samples REALES para el instrumento.
 *
 * `notes` son las notas MIDI que la canción usa en esa pista: con eso se baja
 * sólo lo necesario. Si ninguna fuente responde, devuelve `null` y el ruteo
 * deja la pista en silencio (nunca sintetiza).
 */
export async function loadInstrument(
  instrument: string,
  dest: Tone.ToneAudioNode,
  notes: number[],
): Promise<InstrumentVoice | null> {
  const k = key(instrument);
  const existing = loaded.get(k);
  if (existing) {
    // Si el pedido trae notas que no estaban cuando se resolvió (cambio de
    // instrumento en la mezcladora, segunda canción sin descargar), se resuelven
    // SÓLO las nuevas y se suman como otra parte: la voz ya cargada no sabe
    // tocar lo que nunca le pidieron.
    const missing = notes.filter((note) => !existing.requested.has(note));
    if (missing.length === 0) return existing.sampler;
    return extendLoaded(k, existing, instrument, dest, missing);
  }

  const pending = inFlight.get(k);
  if (pending) {
    const result = await pending;
    return result?.sampler ?? null;
  }

  const task = (async (): Promise<Loaded | null> => {
    const candidates = candidatesFor(instrument);
    if (candidates.length === 0) {
      if (!warned.has(k)) {
        warned.add(k);
        console.warn(
          `[fuentes] "${instrument}" no tiene ninguna fuente real asignada: su pista queda en silencio`,
        );
      }
      return null;
    }

    // Cadena de mezcla: EQ por familia + paneo. Sin esto todo sale al centro y
    // con barro en los graves (ver instrumentChain.ts). Las sub-voces de un
    // reparto por registro comparten esta misma cadena: el timbre cambia, el
    // lugar en la mezcla no.
    const chain = createInstrumentChain(instrument, dest);
    const panner = chain.input;
    const famEq = eqForInstrument(instrument);
    console.log(
      `[fuentes] "${instrument}": paneo ${panForInstrument(instrument) >= 0 ? "+" : ""}${panForInstrument(instrument).toFixed(2)}, EQ hp ${famEq.highpass || "—"} Hz / ${famEq.low}/${famEq.mid}/${famEq.high} dB`,
    );

    const parts = await resolveParts(candidates, 0, instrument, panner, notes);
    if (!parts) {
      chain.dispose();
      if (!warned.has(k)) {
        warned.add(k);
        console.warn(
          `[fuentes] ninguna fuente real respondió para "${instrument}": su pista queda en silencio`,
        );
      }
      return null;
    }

    // La nivelación la hace cada cargador (ya tiene los buffers decodificados en
    // la mano y mide ahí).
    const entry: Loaded = {
      sampler: voiceOf(parts),
      parts,
      requested: new Set(notes),
      source: parts.map((part) => part.source).join(" + "),
    };
    loaded.set(k, entry);
    console.log(
      `[fuentes] "${instrument}" → ${parts.map(describePart).join("  |  ")}`,
    );
    return entry;
  })();

  inFlight.set(k, task);
  void task.finally(() => inFlight.delete(k));
  const result = await task;
  return result?.sampler ?? null;
}

/** Sync: sampler listo para tocar, o null (lo usa el scheduler del Transport). */
export function getInstrumentSync(instrument: string): InstrumentVoice | null {
  return loaded.get(key(instrument))?.sampler ?? null;
}

/** Estado para el ruteo: `loaded`, `loading`, `failed` o `unmapped`. */
export function getInstrumentStatus(instrument: string): InstrumentStatus {
  const k = key(instrument);
  if (loaded.has(k)) return "loaded";
  if (inFlight.has(k)) return "loading";
  if (candidatesFor(instrument).length === 0) return "unmapped";
  return failedSources.size > 0 ? "failed" : "loading";
}

/** Instrumentos que todavía no tienen sampler listo (para la barra de estado). */
export function pendingInstruments(instruments: string[]): string[] {
  return instruments.filter((inst) => !loaded.has(key(inst)));
}

/**
 * Suelta todas las voces de todas las fuentes cargadas (sin descargarlas).
 *
 * CRÍTICO al detener, pausar, buscar y **cambiar de canción**: los samples de
 * VSCO duran 7–84 s (medido) y los sostenidos se extienden hasta 14 s por el
 * loop. Si una nota queda sin liberar sigue sonando ENCIMA de la canción
 * siguiente — que es exactamente el síntoma de "las canciones se mezclan".
 */
export function releaseAllInstruments(): void {
  for (const entry of loaded.values()) {
    try {
      entry.sampler.releaseAll();
    } catch {
      /* una voz ya liberada no es un error */
    }
  }
}

/** Libera todo (cambio de canción, desmontaje). */
export function disposeAllInstruments(): void {
  loaded.forEach((entry) => entry.sampler.dispose());
  loaded.clear();
  inFlight.clear();
  failedSources.clear();
  warned.clear();
}
