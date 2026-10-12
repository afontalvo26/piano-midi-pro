/**
 * sampleLevels — nivelación de loudness entre fuentes de samples.
 *
 * POR QUÉ EXISTE
 * --------------
 * Las fuentes de samples no comparten nivel. Medido sobre los archivos reales:
 *
 *     piano Salamander (referencia)      RMS  -24.7 dB
 *     soundfont GM  bajo                 RMS  -35.6 dB
 *     soundfont GM  armónica             RMS  -35.8 dB
 *     soundfont GM  acordeón             RMS  -38.1 dB
 *     acordeón de botones (FreePats)     RMS  -13.7 dB
 *     percusión FreePats (conga)         RMS  -15.1 dB
 *     kit GM (bombo)                     RMS  -15.1 dB
 *
 * Son ~24 dB de spread. El resultado era exactamente lo que reportó el usuario:
 * la percusión y el acordeón tapan todo, los soundfonts quedan enterrados, y la
 * mezcla "empeora" a medida que la canción suma golpes — medido con un
 * analizador en la salida, el centroide espectral saltaba de 1.7 kHz a 9 kHz
 * (una lavadora de agudos) a los 10 segundos de empezar.
 *
 * La solución es medir cada sample al cargarlo y compensar: nada de tablas
 * mágicas, el número sale del propio audio.
 */

/** Nivel objetivo para instrumentos melódicos (RMS sobre el primer 1.5 s). */
export const TARGET_MELODIC_RMS_DB = -27;
/** Nivel objetivo para el acordeón, que es la voz cantante del vallenato. */
export const TARGET_LEAD_RMS_DB = -24;
/**
 * Nivel objetivo de la percusión, por RMS y no por pico.
 *
 * Normalizar por pico fue el primer intento y no alcanzó: un golpe de maracas
 * peak-normalizado queda con muchísima más energía percibida que un bombo al
 * mismo pico, porque es ruido de banda ancha. Medido con un analizador en la
 * salida, el bolero quedaba en 8 kHz de centroide espectral y −17 dB RMS contra
 * 1.25 kHz y −29 dB de una pieza de piano: la percusión tapaba la banda entera
 * y la mezcla "empeoraba" a medida que entraban más golpes.
 *
 * Va 3 dB por debajo de los melódicos: acá el ritmo acompaña, no protagoniza.
 */
export const TARGET_PERCUSSION_RMS_DB = -30;
/**
 * Cuánto se deja abajo el bus de percusión respecto del resto.
 *
 * El dueño del proyecto reportó que la percusión "molesta": en un bolero o un
 * vallenato el ritmo acompaña, no protagoniza. Medido, con -2 dB la mezcla
 * quedaba con el 90 % de su energía arriba de 4 kHz (maracas y hi-hats mandando
 * en el espectro). El volumen de cada pista se puede subir desde el mezclador,
 * así que el default va conservador.
 */
export const PERCUSSION_BUS_DB = -5;

/** RMS en dB del buffer (primeros `seconds`, todos los canales). */
export function bufferRmsDb(buffer: AudioBuffer, seconds = 1.5): number {
  const channels = Math.min(2, buffer.numberOfChannels);
  const limit = Math.min(buffer.length, Math.floor(buffer.sampleRate * seconds));
  let sum = 0;
  let n = 0;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < limit; i++) {
      sum += data[i] * data[i];
      n++;
    }
  }
  if (n === 0) return -120;
  return 20 * Math.log10(Math.sqrt(sum / n) + 1e-9);
}

/** Pico absoluto en dB del buffer. */
export function bufferPeakDb(buffer: AudioBuffer): number {
  let peak = 0;
  const channels = Math.min(2, buffer.numberOfChannels);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return 20 * Math.log10(peak + 1e-9);
}

export function median(values: number[]): number {
  if (values.length === 0) return -120;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Ganancia (en dB) para llevar `currentDb` al objetivo, con topes.
 *
 * Los topes importan: un instrumento grabado muy bajito no debe recibir +30 dB
 * (amplificaría el ruido de fondo) ni uno muy fuerte −25 dB (lo haría
 * inaudible). Fuera de rango, es preferible un desbalance chico a un artefacto.
 */
export function trimDb(
  currentDb: number,
  targetDb: number,
  range: [number, number] = [-18, 18],
): number {
  const raw = targetDb - currentDb;
  return Math.max(range[0], Math.min(range[1], raw));
}

/** Aplica el trim a un nodo Tone con parámetro `volume` (en dB). */
export function applyTrim(
  node: { volume: { value: number } },
  db: number,
): void {
  try {
    node.volume.value = db;
  } catch {
    /* nodo ya dispuesto */
  }
}
