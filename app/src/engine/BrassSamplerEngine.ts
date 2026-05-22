import * as Tone from "tone";

// ============================================================
// BrassSamplerEngine — Samples reales para trumpet / trombone
// ============================================================
// Requiere samples en public/samples/trumpet/ y public/samples/trombone/
// Fuente recomendada: Philharmonia Orchestra (CC BY-SA)
// https://philharmonia.co.uk/resources/sound-samples/
//
// Instrucciones:
// 1. Ve a la URL arriba, descarga trumpet y trombone
// 2. Convierte a .ogg (menor tamaño) o deja .wav
// 3. Renombra archivos al formato: A3.ogg, Bb3.ogg, C4.ogg, etc.
// 4. Colócalos en app/public/samples/trumpet/ y app/public/samples/trombone/
// 5. Recarga la app — el Sampler detecta automáticamente
// ============================================================

const TRUMPET_SAMPLE_MAP: Record<string, string> = {
  // Rango típico trompeta profesional: E3(52) - C6(84)
  // Incluye sostenidos. Tone.Sampler interpola si falta alguna nota.
  E3: "/samples/trumpet/E3.ogg",
  F3: "/samples/trumpet/F3.ogg",
  "F#3": "/samples/trumpet/Fs3.ogg",
  G3: "/samples/trumpet/G3.ogg",
  "G#3": "/samples/trumpet/Gs3.ogg",
  A3: "/samples/trumpet/A3.ogg",
  "A#3": "/samples/trumpet/As3.ogg",
  B3: "/samples/trumpet/B3.ogg",
  C4: "/samples/trumpet/C4.ogg",
  "C#4": "/samples/trumpet/Cs4.ogg",
  D4: "/samples/trumpet/D4.ogg",
  "D#4": "/samples/trumpet/Ds4.ogg",
  E4: "/samples/trumpet/E4.ogg",
  F4: "/samples/trumpet/F4.ogg",
  "F#4": "/samples/trumpet/Fs4.ogg",
  G4: "/samples/trumpet/G4.ogg",
  "G#4": "/samples/trumpet/Gs4.ogg",
  A4: "/samples/trumpet/A4.ogg",
  "A#4": "/samples/trumpet/As4.ogg",
  B4: "/samples/trumpet/B4.ogg",
  C5: "/samples/trumpet/C5.ogg",
  "C#5": "/samples/trumpet/Cs5.ogg",
  D5: "/samples/trumpet/D5.ogg",
  "D#5": "/samples/trumpet/Ds5.ogg",
  E5: "/samples/trumpet/E5.ogg",
  F5: "/samples/trumpet/F5.ogg",
  "F#5": "/samples/trumpet/Fs5.ogg",
  G5: "/samples/trumpet/G5.ogg",
  "G#5": "/samples/trumpet/Gs5.ogg",
  A5: "/samples/trumpet/A5.ogg",
  "A#5": "/samples/trumpet/As5.ogg",
  B5: "/samples/trumpet/B5.ogg",
  C6: "/samples/trumpet/C6.ogg",
};

const TROMBONE_SAMPLE_MAP: Record<string, string> = {
  // Rango típico trombón tenor: E2(40) - F5(77)
  E2: "/samples/trombone/E2.ogg",
  F2: "/samples/trombone/F2.ogg",
  "F#2": "/samples/trombone/Fs2.ogg",
  G2: "/samples/trombone/G2.ogg",
  "G#2": "/samples/trombone/Gs2.ogg",
  A2: "/samples/trombone/A2.ogg",
  "A#2": "/samples/trombone/As2.ogg",
  B2: "/samples/trombone/B2.ogg",
  C3: "/samples/trombone/C3.ogg",
  "C#3": "/samples/trombone/Cs3.ogg",
  D3: "/samples/trombone/D3.ogg",
  "D#3": "/samples/trombone/Ds3.ogg",
  E3: "/samples/trombone/E3.ogg",
  F3: "/samples/trombone/F3.ogg",
  "F#3": "/samples/trombone/Fs3.ogg",
  G3: "/samples/trombone/G3.ogg",
  "G#3": "/samples/trombone/Gs3.ogg",
  A3: "/samples/trombone/A3.ogg",
  "A#3": "/samples/trombone/As3.ogg",
  B3: "/samples/trombone/B3.ogg",
  C4: "/samples/trombone/C4.ogg",
  "C#4": "/samples/trombone/Cs4.ogg",
  D4: "/samples/trombone/D4.ogg",
  "D#4": "/samples/trombone/Ds4.ogg",
  E4: "/samples/trombone/E4.ogg",
  F4: "/samples/trombone/F4.ogg",
  "F#4": "/samples/trombone/Fs4.ogg",
  G4: "/samples/trombone/G4.ogg",
  "G#4": "/samples/trombone/Gs4.ogg",
  A4: "/samples/trombone/A4.ogg",
  "A#4": "/samples/trombone/As4.ogg",
  B4: "/samples/trombone/B4.ogg",
  C5: "/samples/trombone/C5.ogg",
  "C#5": "/samples/trombone/Cs5.ogg",
  D5: "/samples/trombone/D5.ogg",
  "D#5": "/samples/trombone/Ds5.ogg",
  E5: "/samples/trombone/E5.ogg",
  F5: "/samples/trombone/F5.ogg",
};

/** Crea un Sampler de brass con los samples reales */
export function createBrassSampler(
  instrument: "trumpet" | "trombone",
  destination: Tone.ToneAudioNode,
): Tone.Sampler {
  const sampleMap =
    instrument === "trumpet" ? TRUMPET_SAMPLE_MAP : TROMBONE_SAMPLE_MAP;

  const reverb = new Tone.Reverb({
    decay: instrument === "trumpet" ? 1.2 : 1.8,
    wet: 0.15,
  }).connect(destination);

  const filter = new Tone.Filter({
    frequency: instrument === "trumpet" ? 7500 : 5500,
    type: "lowpass",
    Q: 1,
  }).connect(reverb);

  const sampler = new Tone.Sampler({
    urls: sampleMap,
    onload: () => {
      console.log(`[BrassSampler] ${instrument} samples cargados`);
    },
    onerror: (e) => {
      console.warn(`[BrassSampler] ${instrument} sample error:`, e);
    },
    volume: instrument === "trumpet" ? -2 : -1,
    attack: 0.02,
    release: 0.6,
    curve: "exponential",
  }).connect(filter);

  // Si sampler no carga (404), el objeto sigue funcionando con silencio.
  // Para fallback automático, el caller debe checar sampler.loaded
  return sampler;
}

/** Estado global de carga (para no duplicar requests) */
let trumpetSampler: Tone.Sampler | null = null;
let tromboneSampler: Tone.Sampler | null = null;

/** Obtiene o crea sampler de trompeta */
export function getTrumpetSampler(
  destination: Tone.ToneAudioNode,
): Tone.Sampler {
  if (!trumpetSampler) {
    trumpetSampler = createBrassSampler("trumpet", destination);
  } else {
    // Reconectar si fue desconectado
    try {
      trumpetSampler.connect(destination);
    } catch {
      // Already connected, ignore
    }
  }
  return trumpetSampler;
}

/** Obtiene o crea sampler de trombón */
export function getTromboneSampler(
  destination: Tone.ToneAudioNode,
): Tone.Sampler {
  if (!tromboneSampler) {
    tromboneSampler = createBrassSampler("trombone", destination);
  }
  return tromboneSampler;
}

/** Descarta ambos samplers (útil al cambiar de canción / cleanup) */
export function disposeBrassSamplers() {
  trumpetSampler?.dispose();
  tromboneSampler?.dispose();
  trumpetSampler = null;
  tromboneSampler = null;
}

/** Indica si los samples de trompeta están cargados */
export function isTrumpetSamplerLoaded(): boolean {
  return trumpetSampler?.loaded ?? false;
}

/** Indica si los samples de trombón están cargados */
export function isTromboneSamplerLoaded(): boolean {
  return tromboneSampler?.loaded ?? false;
}
