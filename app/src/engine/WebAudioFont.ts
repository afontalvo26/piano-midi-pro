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

async function fetchWaf(code: string): Promise<string> {
  const file = wafFileName(code);
  let lastError: unknown;
  for (const base of WAF_BASES) {
    const url = `${base}/${file}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`WebAudioFont: ${res.status} en ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      console.warn(`[WebAudioFont] ${code}: falló ${base}`, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Carga un instrumento WebAudioFont como `Tone.Sampler`.
 *
 * `code` es el identificador del archivo sin extensión, p. ej.
 * `0210_GeneralUserGS` (acordeón, fuente GeneralUser GS).
 */
export async function loadWebAudioFontSampler(
  code: string,
  dest: Tone.ToneAudioNode,
  neededNotes?: number[],
): Promise<Tone.Sampler> {
  console.log(`[WebAudioFont] Fetching ${code}...`);
  const text = await fetchWaf(code);
  const zones = parseWafZones(text);
  if (zones.length === 0)
    throw new Error(`WebAudioFont: ${code} sin zonas legibles`);

  const raw = Tone.getContext().rawContext as BaseAudioContext;
  const urls: Record<string, AudioBuffer> = {};
  const levels: number[] = [];
  let decoded = 0;

  for (const zone of zones) {
    // La clave es la nota real de la grabación: Tone.Sampler repitchea la más
    // cercana para las demás, igual que con los soundfonts de gleitz.
    const midi = Math.round(zone.originalPitch / 100);
    if (midi < 0 || midi > 127) continue;
    // Si el llamador sabe qué notas usa la canción, se decodifican sólo las
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
      const buffer = await raw.decodeAudioData(base64ToArrayBuffer(zone.file));
      urls[note] = buffer;
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
  });
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
