/**
 * WebAudioFont — segunda fuente de instrumentos reales.
 *
 * Por qué además de los soundfonts de gleitz:
 *
 *  1. **Peso.** El acordeón de acá pesa ~790 KB contra 2.6 MB del de gleitz, y
 *     la armónica 194 KB contra 3.3 MB — con la misma calidad de grabación.
 *  2. **Variantes.** Hay hasta 25 versiones del mismo instrumento, cada una
 *     sampleada de un banco distinto (GeneralUser GS, FluidR3, JCLive, Chaos,
 *     Aspirin, y algunos reales como `Stratocaster`, `Gibson_Les_Paul`,
 *     `Acoustic_Guitar`, `Soul_Ahhs`). Eso permite elegir por oído — que es lo
 *     único que sirve para acordeón vallenato o armónica.
 *  3. **Loop points.** Cada zona trae `loopStart`/`loopEnd`: una nota se puede
 *     sostener sin que el sample se corte a los 3.15 s como los de gleitz.
 *
 * Formato del archivo (JavaScript con claves sin comillas, NO JSON):
 *
 *     console.log('load _tone_0210_GeneralUserGS_sf2_file');
 *     var _tone_0210_GeneralUserGS_sf2_file={
 *       zones:[
 *         {midi:2,originalPitch:2600,keyRangeLow:0,keyRangeHigh:28,
 *          loopStart:35640,loopEnd:70786,coarseTune:0,fineTune:1,
 *          sampleRate:31000,ahdsr:true,file:'SUQzB…'}
 *       ]}
 *
 * `file` es un MP3 en base64 (empieza con el header ID3 → "SUQzB").
 */

import * as Tone from "tone";
import {
  TARGET_MELODIC_RMS_DB,
  applyTrim,
  bufferRmsDb,
  median,
  trimDb,
} from "./sampleLevels";
import { prepareSampleBuffer, releaseForInstrument } from "./sampleProcessing";
import type { DecodedPianoSample } from "../audio/toneSampleVoiceFactory";

const WAF_BASES = [
  "https://surikov.github.io/webaudiofontdata/sound",
  "https://cdn.jsdelivr.net/gh/surikov/webaudiofontdata@master/sound",
];

export interface WafZone {
  /** Altura original de la grabación en cents (2600 = MIDI 26). */
  originalPitch: number;
  keyRangeLow: number;
  keyRangeHigh: number;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
  coarseTune: number;
  fineTune: number;
  ahdsr: boolean;
  /** MP3 en base64. */
  file: string;
}

/**
 * Parser del formato de zonas. A propósito NO usa `eval`/`new Function`: el
 * archivo viene de un CDN y ejecutarlo sería darle control del hilo principal.
 * Las zonas son objetos planos sin anidamiento, así que un par de regex
 * alcanzan y son más seguras.
 */
export function parseWafZones(text: string): WafZone[] {
  const zones: WafZone[] = [];

  for (const block of text.matchAll(/\{([^{}]*)\}/g)) {
    const body = block[1];
    if (!body.includes("originalPitch") || !body.includes("file:")) continue;

    const fields: Record<string, string | number> = {};
    for (const pair of body.matchAll(
      /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g,
    )) {
      const [, key, single, double, numeric] = pair;
      fields[key] = single ?? double ?? Number(numeric);
    }

    if (typeof fields.file !== "string" || fields.file.length < 100) continue;

    zones.push({
      originalPitch: Number(fields.originalPitch ?? 0),
      keyRangeLow: Number(fields.keyRangeLow ?? 0),
      keyRangeHigh: Number(fields.keyRangeHigh ?? 127),
      sampleRate: Number(fields.sampleRate ?? 44100),
      loopStart: Number(fields.loopStart ?? -1),
      loopEnd: Number(fields.loopEnd ?? -1),
      coarseTune: Number(fields.coarseTune ?? 0),
      fineTune: Number(fields.fineTune ?? 0),
      ahdsr: /\bahdsr\s*:\s*true\b/.test(body),
      file: fields.file,
    });
  }

  return zones;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Nombre de archivo real para un id.
 *
 * Hay DOS convenciones conviviendo: el manifiesto (`wafManifest.ts`) guarda el
 * nombre completo —`0210_GeneralUserGS_sf2_file`— y los ids escritos a mano en
 * `WAF_SUGGESTIONS` no llevan sufijo —`0210_GeneralUserGS`—. Doblarlo daba 404
 * (`..._sf2_file_sf2_file.js`) y hacía que TODO instrumento cayera al soundfont
 * pesado de gleitz. Ojo también con las fuentes que ya terminan en `_SF2_file`
 * en mayúsculas (`LK_Godin_Nylon_SF2_file`).
 */
function wafFileName(code: string): string {
  return /_sf2(_file)?$/i.test(code) ? `${code}.js` : `${code}_sf2_file.js`;
}

async function fetchWaf(code: string, signal?: AbortSignal): Promise<string> {
  const file = wafFileName(code);
  let lastError: unknown;
  for (const base of WAF_BASES) {
    const url = `${base}/${file}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`WebAudioFont: ${res.status} en ${url}`);
      const text = await res.text();
      if (text.length > 20_000_000) throw new Error(`WebAudioFont: ${code} excede el límite de descarga`);
      return text;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      console.warn(`[WebAudioFont] ${code}: falló ${base}`, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface WafDecodedBank {
  samples: DecodedPianoSample[];
  /** Conservative per-bank level trim, applied before the Studio master. */
  gain: number;
}

/**
 * Decode a curated WAF bank without unlocking live audio. The Studio keeps
 * these zones in its per-attack voice factory, including source loop points.
 * A failed or aborted load never changes the currently playing instrument.
 */
export async function loadWafDecodedBank(code: string, signal?: AbortSignal): Promise<WafDecodedBank> {
  const zones = parseWafZones(await fetchWaf(code, signal));
  if (zones.length === 0 || zones.length > 128) {
    throw new Error(`WebAudioFont: ${code} no tiene un número válido de zonas`);
  }
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("El navegador no permite preparar instrumentos sin activar audio");
  }
  const decoder = new OfflineAudioContext(2, 1, 48000);
  const samples: DecodedPianoSample[] = [];
  const levels: number[] = [];
  const seen = new Set<string>();
  let pcmBytes = 0;
  for (const zone of zones) {
    if (signal?.aborted) throw new DOMException("Carga cancelada", "AbortError");
    // WebAudioFont's own player uses originalPitch - 100*coarseTune - fineTune
    // as the recorded root in cents. Rounding only picks the nearest anchor;
    // playback keeps the fractional root for accurate fine tuning.
    const pitchMidi = (zone.originalPitch - 100 * zone.coarseTune - zone.fineTune) / 100;
    const midi = Math.round(pitchMidi);
    if (midi < 0 || midi > 127 || zone.keyRangeLow < 0 || zone.keyRangeHigh > 127
      || zone.keyRangeLow > zone.keyRangeHigh || !Number.isFinite(zone.sampleRate)
      || zone.sampleRate <= 0 || zone.file.length > 8_000_000) continue;
    // Some WAF files contain separate L/R mono zones at the same pitch/range.
    // A single deterministic zone avoids doubling the 37-key voice budget.
    const key = `${midi}:${zone.keyRangeLow}:${zone.keyRangeHigh}`;
    if (seen.has(key)) continue;
    let buffer: AudioBuffer;
    try {
      buffer = await decoder.decodeAudioData(base64ToArrayBuffer(zone.file));
    } catch {
      continue;
    }
    if (signal?.aborted) throw new DOMException("Carga cancelada", "AbortError");
    pcmBytes += buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
    if (pcmBytes > 128_000_000) throw new Error(`WebAudioFont: ${code} excede la memoria de audio permitida`);
    const loopStartSec = zone.loopStart / zone.sampleRate;
    const loopEndSec = zone.loopEnd / zone.sampleRate;
    const hasLoop = Number.isFinite(loopStartSec) && Number.isFinite(loopEndSec)
      && loopStartSec >= 0 && loopEndSec > loopStartSec + 0.005
      && loopEndSec <= buffer.duration;
    samples.push({
      midi, pitchMidi, buffer, keyRangeLow: zone.keyRangeLow, keyRangeHigh: zone.keyRangeHigh,
      ...(hasLoop ? { loopStartSec, loopEndSec } : {}),
      // WAF's built-in `ahdsr:true` envelope reaches zero around 5 s.
      // Sustained instruments in this curated bank declare `ahdsr:false`.
      ...(zone.ahdsr ? { naturalStopSeconds: 5 } : {}),
    });
    seen.add(key);
    levels.push(bufferRmsDb(buffer));
  }
  if (samples.length === 0) throw new Error(`WebAudioFont: ${code} no decodificó muestras`);
  // Positive trim is tightly bounded for 37-key chords; the output limiter
  // remains the final safety net and the user retains the master control.
  const db = trimDb(median(levels), TARGET_MELODIC_RMS_DB, [-12, 6]);
  return { samples, gain: 10 ** (db / 20) };
}

/**
 * Una voz de WebAudioFont con las notas que REALMENTE quedaron cargadas.
 *
 * `recorded` es la altura original de cada zona que se decodificó (no el rango
 * de teclas que la zona dice cubrir): es contra eso que `Tone.Sampler` repitchea,
 * así que es lo que la capa de fuentes necesita para saber si una nota pedida
 * está a tiro o a 19 semitonos (ver `instrumentSources.ts`).
 */
export interface WafVoice {
  sampler: Tone.Sampler;
  recorded: number[];
}

/**
 * Carga un instrumento WebAudioFont como `Tone.Sampler`.
 *
 * `code` es el identificador del archivo sin extensión, p. ej.
 * `0210_GeneralUserGS` (acordeón, fuente GeneralUser GS).
 */
export async function loadWebAudioFontVoice(
  code: string,
  dest: Tone.ToneAudioNode,
  neededNotes?: number[],
): Promise<WafVoice> {
  console.log(`[WebAudioFont] Fetching ${code}...`);
  const text = await fetchWaf(code);
  const zones = parseWafZones(text);
  if (zones.length === 0)
    throw new Error(`WebAudioFont: ${code} sin zonas legibles`);

  const raw = Tone.getContext().rawContext as BaseAudioContext;
  const urls: Record<string, AudioBuffer> = {};
  const levels: number[] = [];
  /** Altura original de cada zona decodificada: el registro real del banco. */
  const recorded: number[] = [];
  let decoded = 0;

  for (const zone of zones) {
    // La clave es la nota real de la grabación: Tone.Sampler repitchea la más
    // cercana para las demás, igual que con los soundfonts de gleitz.
    const midi = Math.round(zone.originalPitch / 100);
    if (midi < 0 || midi > 127) continue;
    // Si el llamador conoce las notas del pad, se decodifican sólo las
    // zonas que las cubren (o que están a ≤ 2 semitonos, donde el repitcheo es
    // inaudible). Un archivo trae 6–34 zonas por instrumento.
    if (neededNotes?.length) {
      const useful = neededNotes.some(
        (n) =>
          (n >= zone.keyRangeLow && n <= zone.keyRangeHigh) ||
          Math.abs(n - midi) <= 2,
      );
      if (!useful) continue;
    }
    const note = Tone.Frequency(midi, "midi").toNote();
    if (urls[note]) continue;
    try {
      const rawBuffer = await raw.decodeAudioData(base64ToArrayBuffer(zone.file));
      const buffer = prepareSampleBuffer(rawBuffer, code);
      urls[note] = buffer;
      recorded.push(midi);
      levels.push(bufferRmsDb(buffer));
      decoded++;
    } catch (err) {
      console.warn(`[WebAudioFont] ${code}: zona ${note} ilegible`, err);
    }
  }

  if (decoded === 0)
    throw new Error(`WebAudioFont: ${code} no decodificó ningún sample`);

  const measured = median(levels);
  const gain = trimDb(measured, TARGET_MELODIC_RMS_DB);
  console.log(
    `[WebAudioFont] ${code}: ${decoded} samples, nivel ${measured.toFixed(1)} dB → ${gain.toFixed(1)} dB`,
  );

  return new Promise<Tone.Sampler>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`WebAudioFont: timeout ${code}`)),
      30_000,
    );
    const sampler = new Tone.Sampler({
      urls,
      release: releaseForInstrument(code),
      onload: () => {
        clearTimeout(timeout);
        applyTrim(sampler, gain);
        console.log(`[WebAudioFont] ✅ ${code} listo`);
        resolve(sampler);
      },
      onerror: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    }).connect(dest);
  }).then((sampler) => ({ sampler, recorded: recorded.sort((a, b) => a - b) }));
}

/** Compatibilidad: la voz pelada, sin las notas grabadas. */
export async function loadWebAudioFontSampler(
  code: string,
  dest: Tone.ToneAudioNode,
  neededNotes?: number[],
): Promise<Tone.Sampler> {
  return (await loadWebAudioFontVoice(code, dest, neededNotes)).sampler;
}

/**
 * Notas grabadas que declara un archivo de WebAudioFont, sin decodificar nada.
 *
 * Es SÓLO para el diagnóstico (`explainSourcesFor`): en producción la decisión
 * se toma con las zonas que ya se decodificaron, porque bajar el archivo dos
 * veces (una para saber el registro y otra para tocar) sería tirar ancho de
 * banda. Se cachean las alturas, no el archivo: son un puñado de enteros.
 */
const recordedNoteCache = new Map<string, number[]>();

export async function wafRecordedNotes(code: string): Promise<number[]> {
  const hit = recordedNoteCache.get(code);
  if (hit) return hit;
  const zones = parseWafZones(await fetchWaf(code));
  const notes = [
    ...new Set(
      zones
        .map((zone) => Math.round(zone.originalPitch / 100))
        .filter((midi) => midi >= 0 && midi <= 127),
    ),
  ].sort((a, b) => a - b);
  recordedNoteCache.set(code, notes);
  return notes;
}

/**
 * Baja un archivo WebAudioFont y devuelve la primera zona ya decodificada.
 *
 * Es el camino del kit de batería GM: sus archivos traen UNA sola nota cada uno
 * (`128<nota>_<kit>_<fuente>_sf2_file.js`, notas 35–81 → 47 archivos), así que
 * no hace falta armar un Sampler completo por pieza.
 */
export async function loadWafZoneBuffer(
  code: string,
): Promise<AudioBuffer | null> {
  const text = await fetchWaf(code);
  const zones = parseWafZones(text);
  if (zones.length === 0) return null;
  const raw = Tone.getContext().rawContext as BaseAudioContext;
  return raw.decodeAudioData(base64ToArrayBuffer(zones[0].file));
}

/**
 * Variantes recomendadas por instrumento (el usuario elige por oído en
 * `/audition.html`). Los bancos con nombre propio son grabaciones dedicadas;
 * `GeneralUserGS` y `FluidR3_GM` son los GM de referencia.
 */
export const WAF_SUGGESTIONS: Record<string, string[]> = {
  Accordion: [
    "0210_GeneralUserGS",
    "0211_GeneralUserGS",
    "0210_FluidR3_GM",
    "0210_Aspirin",
    "0210_JCLive",
  ],
  "Tango Accordion": [
    "0230_GeneralUserGS",
    "0230_FluidR3_GM",
    "0231_GeneralUserGS",
    "0231_JCLive",
  ],
  Harmonica: [
    "0220_GeneralUserGS",
    "0220_FluidR3_GM",
    "0220_Aspirin",
    "0221_FluidR3_GM",
  ],
  "Acoustic Bass": ["0320_GeneralUserGS", "0320_FluidR3_GM", "0321_GeneralUserGS"],
  "Electric Bass (finger)": [
    "0330_GeneralUserGS",
    "0330_FluidR3_GM",
    "0331_GeneralUserGS",
  ],
  "Electric Bass (pick)": ["0340_GeneralUserGS", "0340_FluidR3_GM"],
  "Acoustic Guitar (nylon)": [
    "0240_GeneralUserGS",
    "0241_GeneralUserGS",
    "0240_FluidR3_GM",
    "0242_JCLive",
  ],
  "Acoustic Guitar (steel)": [
    "0250_Acoustic_Guitar",
    "0251_Acoustic_Guitar",
    "0252_Acoustic_Guitar",
    "0250_GeneralUserGS",
    "0250_FluidR3_GM",
  ],
  "Electric Guitar (clean)": [
    "0270_Stratocaster",
    "0271_Stratocaster",
    "0270_Gibson_Les_Paul",
    "0270_GeneralUserGS",
  ],
  Trumpet: ["0560_GeneralUserGS", "0560_FluidR3_GM", "0560_JCLive"],
  Trombone: ["0570_GeneralUserGS", "0570_FluidR3_GM", "0571_GeneralUserGS"],
  "Alto Sax": ["0650_GeneralUserGS", "0650_FluidR3_GM", "0651_FluidR3_GM"],
  "Tenor Sax": ["0660_GeneralUserGS", "0660_FluidR3_GM", "0661_GeneralUserGS"],
  "Baritone Sax": ["0670_GeneralUserGS", "0670_FluidR3_GM"],
  Flute: ["0730_GeneralUserGS", "0730_FluidR3_GM", "0731_FluidR3_GM"],
  "Pan Flute": ["0750_GeneralUserGS", "0750_FluidR3_GM"],
  Clarinet: ["0710_GeneralUserGS", "0710_FluidR3_GM"],
  "String Ensemble 1": [
    "0480_GeneralUserGS",
    "0481_GeneralUserGS",
    "0480_FluidR3_GM",
    "0480_JCLive",
  ],
  Violin: ["0400_GeneralUserGS", "0401_GeneralUserGS", "0400_FluidR3_GM"],
  "Orchestral Harp": ["0460_GeneralUserGS", "0460_FluidR3_GM"],
  "Choir Aahs": ["0520_Soul_Ahhs", "0520_GeneralUserGS", "0521_Soul_Ahhs"],
  "Brass Section": ["0610_GeneralUserGS", "0611_GeneralUserGS", "0610_FluidR3_GM"],
  "French Horn": ["0600_GeneralUserGS", "0601_GeneralUserGS", "0600_FluidR3_GM"],
  "Electric Piano 2": ["0050_GeneralUserGS", "0051_GeneralUserGS"],
  "Drawbar Organ": ["0160_GeneralUserGS", "0160_FluidR3_GM"],
  "Acoustic Grand Piano": ["0000_GeneralUserGS", "0001_GeneralUserGS"],
};
