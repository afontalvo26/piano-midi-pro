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
