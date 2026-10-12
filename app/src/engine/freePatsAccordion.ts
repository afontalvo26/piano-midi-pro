/**
 * Acordeón de botones REAL — FreePats "Button Accordion HN" (CC0 1.0).
 *
 * Es el único acordeón de botones grabado que se pudo verificar con licencia
 * libre y CORS abierto. Los soundfonts GM traen acordeón de teclas (o, en el
 * caso del "Tango Accordion", un bandoneón): para vallenato el timbre que
 * importa es este, un Hohner de botones con su batido característico.
 *
 * 17 notas grabadas (B3…G6) más samples de release. `Tone.Sampler` repitchea
 * las que faltan: la distancia máxima entre notas grabadas es 2 semitonos.
 */

import * as Tone from "tone";
import {
  TARGET_LEAD_RMS_DB,
  applyTrim,
  bufferRmsDb,
  median,
  trimDb,
} from "./sampleLevels";

const BASE =
  "https://raw.githubusercontent.com/freepats/button-accordion-HN/main";

/** Notas grabadas, tal como vienen en el repo. */
export const BUTTON_ACCORDION_NOTES = [
  "B3",
  "D4",
  "F#4",
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "F#5",
  "G5",
  "A5",
  "B5",
  "C6",
  "D6",
  "E6",
  "G6",
] as const;

/** Mapa nota → URL del FLAC (raw.githubusercontent manda CORS `*`). */
export const BUTTON_ACCORDION_URLS: Record<string, string> =
  Object.fromEntries(
    BUTTON_ACCORDION_NOTES.map((note) => [
      note,
      `${BASE}/${encodeURIComponent(`Button Accordion HN ${note}.flac`)}`,
    ]),
  );

/** ¿Este nombre de instrumento debería sonar con el acordeón de botones? */
export function isButtonAccordionInstrument(instrument: string): boolean {
  const l = instrument.toLowerCase();
  if (l.includes("tango") || l.includes("bandone")) return false; // bandoneón
  return l.includes("accordion") || l.includes("acorde");
}

export function loadButtonAccordion(
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler> {
  return new Promise<Tone.Sampler>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("ButtonAccordion: timeout")),
      30_000,
    );
    const sampler = new Tone.Sampler({
      urls: BUTTON_ACCORDION_URLS,
      onload: () => {
        clearTimeout(timeout);
        void normalizeButtonAccordion(sampler);
        console.log("[ButtonAccordion] ✅ acordeón de botones listo");
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
 * Nivela el acordeón contra el resto.
 *
 * Las grabaciones de FreePats vienen **peak-normalizadas**: medido, el acordeón
 * de botones está en −13.7 dB RMS contra −24.7 dB del piano y −38 dB de un
 * soundfont GM. Sin esta compensación el acordeón tapaba toda la banda — y es
 * justo el instrumento que más suena en un vallenato, así que el problema
 * crecía a medida que entraba en la canción.
 *
 * Se mide el propio audio en vez de hardcodear el número, así sigue siendo
 * correcto si cambia el pack de samples.
 */
async function normalizeButtonAccordion(sampler: Tone.Sampler): Promise<void> {
  try {
    const raw = Tone.getContext().rawContext as BaseAudioContext;
    const notes = Object.keys(BUTTON_ACCORDION_URLS).slice(0, 5);
    const levels: number[] = [];
    for (const note of notes) {
      const res = await fetch(BUTTON_ACCORDION_URLS[note]);
      if (!res.ok) continue;
      const buffer = await raw.decodeAudioData(await res.arrayBuffer());
      levels.push(bufferRmsDb(buffer));
    }
    if (levels.length === 0) return;
    const measured = median(levels);
    const gain = trimDb(measured, TARGET_LEAD_RMS_DB);
    applyTrim(sampler, gain);
    console.log(
      `[ButtonAccordion] nivel ${measured.toFixed(1)} dB → compensación ${gain.toFixed(1)} dB`,
    );
  } catch (err) {
    console.warn("[ButtonAccordion] no se pudo nivelar:", err);
  }
}
