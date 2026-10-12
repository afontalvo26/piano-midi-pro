/**
 * Acordeón de botones REAL — FreePats "Button Accordion HN" (CC0 1.0).
 *
 * Es el único acordeón de botones grabado con licencia libre y CORS abierto que
 * se pudo verificar. Para vallenato el timbre que importa es este: un Hohner de
 * botones, no un acordeón de teclas de soundfont.
 *
 * TRES DETALLES QUE HACEN QUE SUENE A INSTRUMENTO (y no a sample):
 *
 *  1. **Samples de release.** El repo publica 17 tomas `rel/*.flac` — el ruido
 *     de fuelle y válvula que hace el acordeón al soltar la tecla. Sin ellas la
 *     nota se corta en seco y el instrumento suena a órgano de juguete. Se
 *     disparan al soltar, sobre la nota que corresponda.
 *  2. **Duración.** Los samples de sustain duran 1,35–2,47 s (medido), así que
 *     una blanca se moría antes de tiempo. Pasan por `prepareSampleBuffer`, que
 *     los extiende cosiendo su región de sustain (el acordeón es sostenido).
 *  3. **Micro-fades.** También de `prepareSampleBuffer`: el final de un FLAC
 *     crudo termina en media onda y hace clic.
 *
 * 17 notas grabadas (B3…G6): `Tone.Sampler` repitchea las que faltan, con una
 * distancia máxima de 2 semitonos.
 */

import * as Tone from "tone";
import type { InstrumentVoice } from "./vscoSampler";
import { prepareSampleBuffer } from "./sampleProcessing";
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

const fileFor = (note: string) =>
  `${BASE}/${encodeURIComponent(`Button Accordion HN ${note}.flac`)}`;
const releaseFileFor = (note: string) =>
  `${BASE}/${encodeURIComponent(`rel/Button Accordion HN ${note}_rel.flac`)}`;

/** Mapa nota → URL del sustain (compatibilidad con la página de audición). */
export const BUTTON_ACCORDION_URLS: Record<string, string> =
  Object.fromEntries(BUTTON_ACCORDION_NOTES.map((n) => [n, fileFor(n)]));

/** ¿Este nombre de instrumento debería sonar con el acordeón de botones? */
export function isButtonAccordionInstrument(instrument: string): boolean {
  const l = instrument.toLowerCase();
  if (l.includes("tango") || l.includes("bandone")) return false; // bandoneón
  return l.includes("accordion") || l.includes("acorde");
}

/**
 * Voz del acordeón: sustain + ruido de válvula al soltar.
 *
 * Se separa del `Tone.Sampler` genérico porque el release no es un simple
 * fade-out: es OTRA grabación que suena encima de la nota que se apaga.
 */
class AccordionVoice implements InstrumentVoice {
  private sustain: Tone.Sampler;
  private release: Tone.Sampler | null;

  constructor(sustain: Tone.Sampler, release: Tone.Sampler | null = null) {
    this.sustain = sustain;
    this.release = release;
  }

  /** El ruido de válvula puede llegar después (carga en segundo plano). */
  setRelease(sampler: Tone.Sampler): void {
    this.release = sampler;
  }

  triggerAttack(note: Tone.Unit.Frequency, time?: Tone.Unit.Time, velocity = 1): void {
    this.sustain.triggerAttack(note, time, velocity);
  }

  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): void {
    // Primero el ruido de válvula (es lo que se oye al soltar) y después el
    // apagado del sustain, con un release corto para que no quede cola.
    if (this.release) {
      try {
        this.release.triggerAttackRelease(note, 0.6, time, 0.55);
      } catch {
        /* la nota quedó fuera del rango grabado del release */
      }
    }
    try {
      this.sustain.triggerRelease(note, time);
    } catch {
      /* no estaba sonando */
    }
  }

  releaseAll(): void {
    this.sustain.releaseAll();
    this.release?.releaseAll();
  }

  dispose(): void {
    this.sustain.dispose();
    this.release?.dispose();
  }
}

export async function loadButtonAccordion(
  dest: Tone.ToneAudioNode,
): Promise<InstrumentVoice> {
  const raw = Tone.getContext().rawContext as BaseAudioContext;

  const loadFlac = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await raw.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  };

  // Sustain: se procesa (fades + extensión por loop) y se mide el nivel.
  const sustainEntries = await Promise.all(
    BUTTON_ACCORDION_NOTES.map(async (note) => {
      const buffer = await loadFlac(fileFor(note));
      if (!buffer) return null;
      return { note, buffer: prepareSampleBuffer(buffer, "Accordion") };
    }),
  );
  const sustainUrls: Record<string, AudioBuffer> = {};
  const levels: number[] = [];
  for (const entry of sustainEntries) {
    if (!entry) continue;
    sustainUrls[entry.note] = entry.buffer;
    levels.push(bufferRmsDb(entry.buffer));
  }
  if (Object.keys(sustainUrls).length === 0) {
    throw new Error("ButtonAccordion: no se pudo decodificar ningún sustain");
  }

  const gain = trimDb(median(levels), TARGET_LEAD_RMS_DB);

  const sustain = await new Promise<Tone.Sampler>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("ButtonAccordion: timeout sustain")),
      45_000,
    );
    const s = new Tone.Sampler({
      urls: sustainUrls,
      // Release corto: el apagado "real" lo pone el ruido de válvula.
      release: 0.25,
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

  const voice = new AccordionVoice(sustain);
  console.log(
    `[ButtonAccordion] ✅ acordeón de botones listo (${Object.keys(sustainUrls).length} notas, nivel ${median(levels).toFixed(1)} dB → ${gain.toFixed(1)} dB)`,
  );

  // Los 17 ruidos de válvula van EN SEGUNDO PLANO: son 17 FLAC más y esperarlos
  // retrasaba el arranque de la canción sin aportar nada mientras tanto (el
  // sustain ya suena).
  void (async () => {
    try {
      const releaseEntries = await Promise.all(
        BUTTON_ACCORDION_NOTES.map(async (note) => {
          const buffer = await loadFlac(releaseFileFor(note));
          if (!buffer) return null;
          return { note, buffer: prepareSampleBuffer(buffer, "Accordion") };
        }),
      );
      const releaseUrls: Record<string, AudioBuffer> = {};
      for (const entry of releaseEntries) {
        if (entry) releaseUrls[entry.note] = entry.buffer;
      }
      if (Object.keys(releaseUrls).length === 0) return;
      const release = await new Promise<Tone.Sampler>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("timeout release")),
          30_000,
        );
        const s = new Tone.Sampler({
          urls: releaseUrls,
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
      voice.setRelease(release);
      console.log(
        `[ButtonAccordion] ✅ release de válvula sumado (${Object.keys(releaseUrls).length} tomas)`,
      );
    } catch (err) {
      console.warn("[ButtonAccordion] sin samples de release:", err);
    }
  })();

  return voice;
}
