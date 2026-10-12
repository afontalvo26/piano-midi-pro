/**
 * sampleProcessing — arregla los dos defectos propios de un sample crudo:
 * el clic del final y la nota que se corta cuando el archivo se termina.
 *
 * 1. CLICS. Un sample que arranca o termina en media onda produce un escalón:
 *    eso se oye como un clic o un "pop", sobre todo en instrumentos sostenidos.
 *    Se aplican micro-fades (3 ms de entrada, 40 ms de salida) a cada buffer.
 *
 * 2. NOTAS CORTADAS. Los soundfonts GM traen exactamente 3.15 s por nota y sin
 *    loop: una cuerda o un acordeón que la partitura sostiene 8 s se muere a los
 *    3.15. Medido sobre la biblioteca: 1.872 notas (0.5 %) pasan ese límite y
 *    casi todas son de instrumentos sostenidos (cuerdas, pads, órgano,
 *    acordeón, coro). Acá se **extiende** el buffer cosiendo su región de
 *    sustain consigo misma con un crossfade, así el sample dura lo que dura la
 *    nota sin sonar repetido.
 */

/**
 * Contexto mínimo para fabricar buffers.
 *
 * AudioBuffer no expone su contexto en los tipos del DOM, y los buffers
 * decodificados pertenecen al contexto de Tone; un OfflineAudioContext propio
 * (nunca renderizado) alcanza para crear los buffers procesados.
 */
let scratch: BaseAudioContext | null = null;
function scratchContext(sampleRate: number): BaseAudioContext {
  if (!scratch || scratch.sampleRate !== sampleRate) {
    scratch = new OfflineAudioContext(2, 1024, sampleRate);
  }
  return scratch;
}
/** ¿Este instrumento sostiene el sonido (y por lo tanto conviene extenderlo)? */
const SUSTAINED = new RegExp(
  [
    "violin", "viola", "cello", "contrabass", "string", "pizzicato", "tremolo",
    "choir", "voice", "oohs", "aahs", "pad", "synth",
    "organ", "accordion", "harmonica", "reed",
    "flute", "oboe", "clarinet", "bassoon", "sax", "recorder", "piccolo",
    "whistle", "shakuhachi", "pipe",
    "trumpet", "trombone", "tuba", "horn", "brass",
    "bowed", "harp", "sitar", "bagpipe", "fiddle",
  ].join("|"),
  "i",
);

export function isSustainedInstrument(instrument: string): boolean {
  // El piano, la guitarra y la marimba decaen solos: extenderlos sonaría mal.
  if (/piano|guitar|guitarra|marimba|xylophone|glocken|celesta|vibraphone|bell|dulcimer|banjo|koto|kalimba|music box/i.test(instrument)) {
    return false;
  }
  return SUSTAINED.test(instrument);
}

/**
 * Copia el buffer aplicando micro-fades de entrada y salida.
 *
 * Se devuelve un buffer NUEVO: los originales pueden estar compartidos entre
 * instrumentos y no conviene mutarlos.
 */
export function withAntiClickFades(
  buffer: AudioBuffer,
  fadeInMs = 3,
  fadeOutMs = 40,
): AudioBuffer {
  const ctx = scratchContext(buffer.sampleRate);
  const out = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  const inSamples = Math.max(1, Math.floor((fadeInMs / 1000) * buffer.sampleRate));
  const outSamples = Math.max(1, Math.floor((fadeOutMs / 1000) * buffer.sampleRate));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src);
    // Entrada: rampa 0 → 1.
    for (let i = 0; i < inSamples && i < dst.length; i++) {
      dst[i] *= i / inSamples;
    }
    // Salida: rampa 1 → 0.
    for (let i = 0; i < outSamples && i < dst.length; i++) {
      const idx = dst.length - 1 - i;
      dst[idx] *= i / outSamples;
    }
  }
  return out;
}

/** RMS de una ventana del canal 0 (para decidir si una región sirve de loop). */
function windowRms(data: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(data.length, start + length);
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / n);
}

/**
 * Extiende un sample sostenido cosiendo su región de sustain.
 *
 * Cómo elige el loop: prueba varias ventanas en la segunda mitad del sample y
 * se queda con la de RMS más parecido al promedio de la cola — una zona estable
 * es la que no hace "bombeo" al repetirse. Si el sample ya es largo o decae
 * (no hay meseta), devuelve el original sin tocar.
 *
 * El cosido es un crossfade lineal de `crossfadeMs`: el final de la región se
 * mezcla con su comienzo, así el salto es inaudible.
 */
export function extendSustainedBuffer(
  buffer: AudioBuffer,
  options: { minSeconds?: number; targetSeconds?: number; crossfadeMs?: number } = {},
): AudioBuffer {
  const { minSeconds = 3.6, targetSeconds = 14, crossfadeMs = 45 } = options;
  if (buffer.duration >= minSeconds) return buffer;

  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const total = data.length;

  // Candidatos de loop en la segunda mitad, evitando el ataque y el final.
  const windowLength = Math.min(Math.floor(sr * 0.9), Math.floor(total * 0.3));
  if (windowLength < sr * 0.08) return buffer; // demasiado corto para loopear

  const candidates: number[] = [];
  for (let start = Math.floor(total * 0.45); start + windowLength < total; start += Math.floor(sr * 0.05)) {
    candidates.push(start);
  }
  if (candidates.length === 0) return buffer;

  // Zona estable = RMS más cercano a la mediana de los candidatos.
  const rmsList = candidates.map((start) => windowRms(data, start, windowLength));
  const sorted = [...rmsList].sort((a, b) => a - b);
  const medianRms = sorted[Math.floor(sorted.length / 2)];
  // Un sample que ya está decayendo (cola mucho más baja que el medio) no se
  // puede loopear sin que se note el empalme.
  if (medianRms < 0.004) return buffer;

  let bestStart = candidates[0];
  let bestDelta = Infinity;
  candidates.forEach((start, i) => {
    const delta = Math.abs(rmsList[i] - medianRms);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestStart = start;
    }
  });

  const fadeLength = Math.min(
    Math.floor((crossfadeMs / 1000) * sr),
    Math.floor(windowLength / 2),
  );
  const targetSamples = Math.min(
    Math.floor(targetSeconds * sr),
    // Techo de memoria: 60 s por muestra.
    Math.floor(60 * sr),
  );
  if (targetSamples <= total) return buffer;

  const ctx = scratchContext(sr);
  const out = ctx.createBuffer(buffer.numberOfChannels, targetSamples, sr);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.numberOfChannels === 1 ? data : buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, total));

    let write = total;
    while (write < targetSamples) {
      const block = Math.min(windowLength, targetSamples - write);
      const srcStart = bestStart;
      for (let i = 0; i < block; i++) {
        const value = src[srcStart + i] ?? 0;
        // Crossfade con la cola ya escrita, para que el empalme no tenga escalón.
        if (i < fadeLength) {
          const t = i / fadeLength;
          const prevIndex = write + i - fadeLength;
          const prev = prevIndex >= 0 ? dst[prevIndex] : 0;
          dst[write + i] = prev * (1 - t) + value * t;
        } else {
          dst[write + i] = value;
        }
      }
      write += block;
    }
  }

  return out;
}

/**
 * Tiempo de release (segundos) según el instrumento.
 *
 * `Tone.Sampler` trae `release: 0.1` por defecto: al soltar la tecla, TODAS las
 * notas morían en 100 ms — un corte seco que es de las cosas que más delatan a
 * un sampler. En la vida real una cuerda sigue sonando, un metal apaga despacio
 * y una guitarra se apaga rápido pero no al instante.
 */
export function releaseForInstrument(instrument: string): number {
  const l = instrument.toLowerCase();
  // Sostenidos: cola larga y natural.
  if (
    /pad|choir|voice|oohs|aahs|organ|accordion|harmonica|reed|string|violin|viola|cello|contrabass/i.test(
      l,
    )
  ) {
    return 0.65;
  }
  if (
    /brass|trumpet|trombone|tuba|horn|sax|flute|oboe|clarinet|bassoon|recorder|pipe/i.test(
      l,
    )
  ) {
    return 0.45;
  }
  // Pulsados y percutidos: apagado corto pero audible.
  if (/piano|guitar|guitarra|harp|banjo|koto|sitar|kalimba|dulcimer/i.test(l)) {
    return 0.35;
  }
  if (/marimba|xylophone|glocken|celesta|vibraphone|bell|timpani|drum/i.test(l)) {
    return 0.25;
  }
  return 0.4;
}

/**
 * Prepara un buffer crudo para el reproductor: micro-fades siempre, y extensión
 * por loop sólo si el instrumento sostiene el sonido.
 */
export function prepareSampleBuffer(
  buffer: AudioBuffer,
  instrument: string,
): AudioBuffer {
  const extended = isSustainedInstrument(instrument)
    ? extendSustainedBuffer(buffer)
    : buffer;
  return withAntiClickFades(extended);
}
