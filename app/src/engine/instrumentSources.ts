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
  instrumentToSoundfont,
  loadSoundfontSampler,
} from "./GMSamplerEngine";
import {
  isButtonAccordionInstrument,
  loadButtonAccordion,
} from "./freePatsAccordion";
import { loadWebAudioFontSampler } from "./WebAudioFont";
import { prepareSampleBuffer, releaseForInstrument } from "./sampleProcessing";
import { loadVscoInstrument, vscoCovers } from "./vscoSampler";
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
 */
export function candidatesFor(instrument: string): Candidate[] {
  const out: Candidate[] = [];
  const program = PROGRAM_BY_NAME.get(instrument.toLowerCase());

  // 1. Acordeón vallenato: grabación dedicada de un Hohner de botones.
  if (isButtonAccordionInstrument(instrument)) {
    out.push({ kind: "accordion", id: "freepats", label: "botones FreePats" });
  }

  // 2. VSCO-2-CE: es el único banco con CAPAS DE VELOCIDAD y round-robin, así
  //    que va primero donde exista. Un forte cambia de timbre en vez de subir
  //    el volumen, que es la diferencia entre sonar a instrumento y a sample.
  if (program !== undefined && vscoCovers(program)) {
    out.push({ kind: "vsco", id: String(program), label: "vsco (capas)" });
  }

  // 3. Banco con carácter propio (tonejs-instruments): grabaciones reales
  //    hechas para sampler, una por nota.
  const tonejs = tonejsFor(instrument);
  if (tonejs && !/piano/i.test(tonejs.folder)) {
    // El piano de tonejs pesa 14.9 MB y ya hay uno mejor (Salamander).
    out.push({ kind: "tonejs", id: tonejs.folder, label: `tonejs ${tonejs.folder}` });
  }

  // 4. Variantes GM livianas de WebAudioFont (75 KB – 800 KB por instrumento).
  if (program !== undefined) {
    for (const code of (WAF_VARIANTS[program] ?? []).slice(0, 3)) {
      out.push({ kind: "waf", id: code, label: `waf ${code}` });
    }
  }

  // 5. Red de seguridad: soundfont GM de gleitz (cubre los 128 programas).
  const sf = instrumentToSoundfont(instrument);
  if (sf) out.push({ kind: "gleitz", id: sf, label: `gleitz ${sf}` });

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

// ─── Carga con failover ──────────────────────────────────────────────────────

interface Loaded {
  sampler: InstrumentVoice;
  /** Notas (MIDI) que este sampler puede tocar sin salir del rango grabado. */
  covered: Set<number>;
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
 * Variación humana de una velocidad (±0.5 dB, determinista).
 *
 * La usan tanto las voces de esta capa como el piano Salamander (que se dispara
 * aparte, en App.tsx): dos notas iguales nunca suenan EXACTAMENTE igual, y esa
 * repetición idéntica es lo que delata a un sampler.
 */
export function humanizeVelocity(
  instrument: string,
  note: number | string,
  time: number | undefined,
  velocity: number,
): number {
  const t = typeof time === "number" ? time : 0;
  const jitter =
    1 + (hash01(`${instrument}:${note}:${Math.floor(t * 20)}`) - 0.5) * 0.12;
  return Math.max(0.02, Math.min(1, velocity * jitter));
}

/**
 * Voz con variación humana.
 *
 * Dos notas iguales, tocadas igual, no suenan EXACTAMENTE igual en la vida real
 * — y esa repetición idéntica es lo que delata a un sampler. Se aplica una
 * variación de ganancia de ±0.5 dB determinista (misma nota + mismo instante ⇒
 * mismo valor, así el playback es reproducible y los tests no se vuelven
 * aleatorios).
 */
class HumanizedVoice implements InstrumentVoice {
  private inner: InstrumentVoice;
  private instrument: string;

  constructor(inner: InstrumentVoice, instrument: string) {
    this.inner = inner;
    this.instrument = instrument;
  }

  triggerAttack(note: Tone.Unit.Frequency, time?: Tone.Unit.Time, velocity = 1): void {
    const t = typeof time === "number" ? time : 0;
    this.inner.triggerAttack(
      note,
      time,
      humanizeVelocity(this.instrument, note, t, velocity),
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

async function buildFromCandidate(
  candidate: Candidate,
  instrument: string,
  dest: Tone.ToneAudioNode,
  notes: number[],
): Promise<Loaded | null> {
  const sourceKey = `${candidate.kind}:${candidate.id}`;
  if (failedSources.has(sourceKey)) return null;

  try {
    if (candidate.kind === "accordion") {
      const sampler = await loadButtonAccordion(dest);
      return { sampler, covered: new Set(notes), source: candidate.label };
    }

    if (candidate.kind === "vsco") {
      const voice = await loadVscoInstrument(Number(candidate.id), dest, notes);
      if (!voice) return null;
      return { sampler: voice, covered: new Set(notes), source: candidate.label };
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
        covered: new Set(notes),
        source: `${candidate.label} (${Object.keys(urls).length} notas)`,
      };
    }

    if (candidate.kind === "waf") {
      const sampler = await loadWebAudioFontSampler(candidate.id, dest, notes);
      return { sampler, covered: new Set(notes), source: candidate.label };
    }

    // gleitz: red de seguridad, cubre cualquier nota.
    const sf = candidate.id;
    const sampler = await loadSoundfontSampler(sf, dest, undefined, notes);
    return { sampler, covered: new Set(notes), source: candidate.label };
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
  if (existing) return existing.sampler;

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
    // con barro en los graves (ver instrumentChain.ts).
    const chain = createInstrumentChain(instrument, dest);
    const panner = chain.input;
    const famEq = eqForInstrument(instrument);
    console.log(
      `[fuentes] "${instrument}": paneo ${panForInstrument(instrument) >= 0 ? "+" : ""}${panForInstrument(instrument).toFixed(2)}, EQ hp ${famEq.highpass || "—"} Hz / ${famEq.low}/${famEq.mid}/${famEq.high} dB`,
    );

    for (const candidate of candidates) {
      const result = await buildFromCandidate(candidate, instrument, panner, notes);
      if (!result) continue;

      // La nivelación se hace dentro de cada cargador (cada uno ya tiene los
      // buffers decodificados en la mano y mide ahí).
      const voice = new HumanizedVoice(result.sampler, instrument);
      const withPan: Loaded = { ...result, sampler: voice };
      loaded.set(k, withPan);
      console.log(`[fuentes] "${instrument}" → ${result.source}`);
      return withPan;
    }

    chain.dispose();

    if (!warned.has(k)) {
      warned.add(k);
      console.warn(
        `[fuentes] ninguna fuente real respondió para "${instrument}": su pista queda en silencio`,
      );
    }
    return null;
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
