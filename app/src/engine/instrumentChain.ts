/**
 * instrumentChain — la cadena de mezcla por instrumento: filtro + EQ + paneo.
 *
 * POR QUÉ
 * -------
 * Hasta ahora cada sampler iba derecho al bus maestro: sin filtro, sin EQ. En una
 * mezcla real cada familia ocupa su banda y se limpia lo que no aporta. Sin eso
 * pasan tres cosas que se oyen como "maqueta":
 *
 *  1. **Barro.** Cuerdas, pads, guitarras y acordeón traen energía por debajo de
 *     100–150 Hz que no aporta nada y choca con el bajo y el bombo. Se corta con
 *     un pasa-altos (lo que en un estudio se hace en TODAS las pistas menos el
 *     bajo y la batería).
 *  2. **Nariz.** Entre 300 y 900 Hz varios instrumentos se acumulan y el conjunto
 *     suena nasal y embotado.
 *  3. **Falta de presencia.** Sin un poco de 2–4 kHz, los instrumentos quedan
 *     detrás de la percusión y no se distinguen.
 *
 * Los valores son deliberadamente suaves (±2 dB, cortes de 12 dB/oct): el
 * objetivo es que se entienda todo, no colorear el timbre de cada grabación.
 */

import * as Tone from "tone";
import type { InstrumentVoice } from "./vscoSampler";
import { prepareSampleBuffer, releaseForInstrument } from "./sampleProcessing";
import { panForInstrument } from "./instrumentPanning";

export interface FamilyEq {
  /** Frecuencia del pasa-altos (Hz). 0 = sin filtro. */
  highpass: number;
  /** Ganancias del EQ de 3 bandas (dB). */
  low: number;
  mid: number;
  high: number;
  /** Frecuencias de cada banda (Hz). */
  lowFreq: number;
  midFreq: number;
  highFreq: number;
}

const FLAT: FamilyEq = {
  highpass: 0,
  low: 0,
  mid: 0,
  high: 0,
  lowFreq: 200,
  midFreq: 800,
  highFreq: 3000,
};

/**
 * EQ por familia de instrumento.
 *
 * El orden importa: los graves (bajo, bombo) NO llevan pasa-altos — son la
 * fundación de la mezcla — y el resto sí.
 */
export function eqForInstrument(instrument: string): FamilyEq {
  const l = instrument.toLowerCase();

  // Bajo: sin pasa-altos (perdería la fundamental), un toque de cuerpo y los
  // medios apagados para que no compita con el piano ni el acordeón.
  if (/bass|contrabass|tuba/i.test(l)) {
    return { ...FLAT, low: 1.5, mid: -2, lowFreq: 120, midFreq: 500 };
  }
  // Bombo y percusión grave: cuerpo, sin cortar.
  if (/kick|bombo/i.test(l)) {
    return { ...FLAT, low: 1.5, mid: -1.5, lowFreq: 90, midFreq: 400 };
  }
  // Piano: corta el retumbe, saca barro y da presencia.
  if (/piano|honky|harpsichord|clavinet/i.test(l)) {
    return { highpass: 45, low: 0.5, mid: -1.5, high: 1.5, lowFreq: 180, midFreq: 320, highFreq: 3200 };
  }
  // Guitarras y pulsados: el pasa-altos clásico y presencia.
  if (/guitar|guitarra|banjo|koto|sitar|harp|dulcimer|kalimba|ukelele|ukulele|tres/i.test(l)) {
    return { highpass: 90, low: -0.5, mid: -1, high: 2, lowFreq: 150, midFreq: 400, highFreq: 3000 };
  }
  // Cuerdas: apenas grave (el bajo ya está ahí), medios limpios y brillo suave.
  if (/violin|viola|cello|string|pizzicato|tremolo|fiddle/i.test(l)) {
    return { highpass: 120, low: -1, mid: -1.5, high: 1.5, lowFreq: 200, midFreq: 500, highFreq: 4000 };
  }
  // Pads, coros: al fondo y sin graves (si no, tapan todo).
  if (/pad|choir|voice|oohs|aahs|synth|fx/i.test(l)) {
    return { highpass: 160, low: -2, mid: -1, high: 1, lowFreq: 250, midFreq: 700, highFreq: 3500 };
  }
  // Metales: cortar el barro de 400 y dar filo.
  if (/trumpet|trombone|horn|brass|tuba/i.test(l)) {
    return { highpass: 130, low: -1, mid: -1.5, high: 2, lowFreq: 300, midFreq: 900, highFreq: 3500 };
  }
  // Maderas y acordeón: quitar la nariz de 800 Hz y abrir el aire.
  if (/flute|oboe|clarinet|bassoon|sax|recorder|pipe|whistle|accordion|harmonica|reed|organ/i.test(l)) {
    return { highpass: 110, low: -1, mid: -1.5, high: 1.5, lowFreq: 200, midFreq: 800, highFreq: 4000 };
  }
  // Percusión aguda (maracas, hi-hats, güiro): sólo lo que suena, sin lodo.
  // Caja y redoblante: un poco de cuerpo pero sin el lodo del pie del pie.
  if (/snare|redoblante|caja|side stick|rim/i.test(l)) {
    return { highpass: 110, low: -0.5, mid: -1, high: 2, lowFreq: 200, midFreq: 700, highFreq: 4000 };
  }
  // Toms: cuerpo y ataque, sin cortar tanto como la caja.
  if (/tom|timbale|timbal|conga|bongo|djembe|cajon|cajón|drum|tambor/i.test(l)) {
    return { highpass: 70, low: 0.5, mid: -1, high: 1.5, lowFreq: 120, midFreq: 500, highFreq: 3500 };
  }
  if (/maraca|shaker|hi-hat|hihat|guiro|güiro|cabasa|guacharaca|clave|cowbell|triangle|tambourine|agogo/i.test(l)) {
    return { highpass: 300, low: -3, mid: -1, high: 1, lowFreq: 400, midFreq: 1200, highFreq: 5000 };
  }
  return { ...FLAT, highpass: 60 };
}

/** Cadena lista para conectar samplers: entrada → EQ → paneo → destino. */
export interface InstrumentChain {
  input: Tone.ToneAudioNode;
  dispose(): void;
}

/**
 * Arma la cadena de un instrumento y devuelve su nodo de entrada.
 *
 * Se mantiene la referencia a los nodos para poder liberarlos: un `Tone.Filter`
 * o un `EQ3` por instrumento son nodos vivos (y el navegador no los recicla
 * solo).
 */
export function createInstrumentChain(
  instrument: string,
  dest: Tone.ToneAudioNode,
): InstrumentChain {
  const eq = eqForInstrument(instrument);
  const panner = new Tone.Panner(panForInstrument(instrument)).connect(dest);

  const nodes: { dispose(): void }[] = [panner];
  let input: Tone.ToneAudioNode = panner;

  // EQ de 3 bandas (sólo si aporta algo).
  if (eq.low !== 0 || eq.mid !== 0 || eq.high !== 0) {
    const eq3 = new Tone.EQ3({
      low: eq.low,
      mid: eq.mid,
      high: eq.high,
      lowFrequency: eq.lowFreq,
      highFrequency: eq.highFreq,
    }).connect(input);
    nodes.push(eq3);
    input = eq3;
  }

  // Pasa-altos al final de la cadena (lo último antes del paneo).
  if (eq.highpass > 0) {
    const hp = new Tone.Filter({
      type: "highpass",
      frequency: eq.highpass,
      rolloff: -12,
      Q: 0.7,
    }).connect(input);
    nodes.push(hp);
    input = hp;
  }

  return {
    input,
    dispose() {
      nodes.forEach((n) => n.dispose());
    },
  };
}

// Reexportado para que quien arme una voz no tenga que importar de dos lados.
export { prepareSampleBuffer, releaseForInstrument };
export type { InstrumentVoice };
