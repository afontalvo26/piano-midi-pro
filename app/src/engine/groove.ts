/**
 * groove — la perilla de interpretación de una canción.
 *
 * QUÉ HACE
 * ────────
 * Un archivo MIDI es mecánico: cada nota cae exactamente en su tick y con la
 * velocity escrita. Una banda real no toca así — cada músico cae en un punto
 * ligeramente distinto del pulso, y esa diferencia es lo que se escucha como
 * "groove", "pocket" o "swing". Esta perilla (0 % = fiel al archivo, 100 % =
 * expresión máxima) ajusta **sólo** tres cosas, y sólo en la reproducción de una
 * canción:
 *
 *   1. **Microtiming**: el inicio de la nota se corre unos milisegundos.
 *   2. **Dinámica**: variación leve de la velocity (fraseo, acentos).
 *   3. **Articulación**: variación leve de la duración (±8 %) más un
 *      solapamiento tipo legato en instrumentos sostenidos.
 *
 * NUNCA agrega, quita ni reordena notas: mismas notas, mismas alturas, misma
 * instrumentación. Sólo se mueven el tiempo, el nivel y el final.
 *
 * REGLAS MUSICALES DURAS (cada una tiene su test en `tests/e2e/12-groove.spec.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 *  R1. **El orden nunca se invierte.** El desvío se limita al 8 % del intervalo
 *      local entre notas de la misma pista (y a la mitad de ese intervalo, que
 *      es lo que garantiza que dos notas vecinas no se crucen jamás).
 *  R2. **Los acordes se mueven juntos.** Todas las notas con el mismo onset en
 *      la misma pista comparten un único resultado: el acorde no se arpegia.
 *  R3. **Jerarquía métrica.** El desvío se pondera por la posición en el
 *      compás: tiempo 1 ≤ 1.5 ms, tiempos fuertes ≤ 2.7 ms, débiles ≤ 8.3 ms,
 *      contratiempos hasta el tope. El pulso queda siempre claro.
 *  R4. **Doble tope.** `min(15 ms, 8 % del intervalo local)`, escalado por la
 *      perilla. El absoluto protege los pasajes lentos; el relativo, los
 *      rápidos (en corcheas o más rápido el desvío se achica solo).
 *  R5. **Sin deriva acumulativa.** El ruido 1/f se **re-ancla por compás** (se
 *      le resta su media dentro de cada compás), así que la posición media del
 *      pulso al final de la canción es la misma que al principio.
 *  R6. **La melodía se protege más que el acompañamiento.** El rol melódico
 *      lleva la mitad del jitter de la armonía.
 *  R7. **Nada de swing acá.** El swing es otro control (y en vallenato y bolero
 *      se toca recto): esta perilla no lo agrega ni lo insinúa.
 *  R8. **Nada se agrega ni se quita.** Sólo tiempos, velocities y duraciones.
 *
 * POR QUÉ 1/f Y NO ALEATORIO
 * ──────────────────────────
 * Los desvíos de un músico real están **correlacionados en el tiempo**: hay una
 * deriva lenta (el tempo "respira" a lo largo de los compases) más un
 * micro-desvío de nota a nota. Un jitter blanco (independiente nota a nota)
 * suena a error de máquina, no a persona. Por eso el microtiming se arma con
 * **ruido rosa (1/f)** — suma de octavas de ruido de valor de igual amplitud —
 * más un micro-desvío blanco chico encima.
 *
 * DETERMINISMO
 * ────────────
 * Nada usa `Math.random()`: todo sale de un hash de (canción + pista + nota +
 * tiempo). La misma canción suena igual siempre — que es lo que la hace
 * memorizable, testeable y comparable.
 *
 * Módulo PURO: no toca audio, ni React, ni el DOM.
 */

// ─── Rol instrumental ────────────────────────────────────────────────────────

/** Rol de un instrumento dentro de la banda. */
export type GrooveRole = "percussion" | "bass" | "harmony" | "melody";

/**
 * Desvío fijo por rol, en milisegundos, **a 100 % y antes del peso métrico**.
 *
 * JUSTIFICACIÓN MUSICAL:
 *
 *   • **percusión = 0**: la batería *es* la rejilla. Todo se ubica respecto de
 *     ella; correrla no suena a groove, suena a tempo inestable.
 *   • **bajo = +5 ms (detrás)**: el bajo "laid back" que cae apenas después del
 *     bombo es el fundamento del pocket en la música popular (soul, cumbia,
 *     vallenato). Los transitorios graves se localizan peor, así que 5 ms se
 *     oyen como peso y no como atraso.
 *   • **armonía = +2 ms (apenas detrás)**: piano, guitarra y acordeón acompañan
 *     *con* el bajo; un poco detrás del pulso el acompañamiento empuja en vez de
 *     adelantarse.
 *   • **melodía = −1 ms (apenas adelante)**: es una fracción muy conservadora
 *     del *melody lead* que la investigación de interpretación expresiva mide en
 *     pianistas y cantantes (la voz principal se adelanta a su acompañamiento).
 *     Es deliberadamente chico: la regla R6 manda que la melodía se mueva MENOS
 *     que la armonía, y ante la duda gana la música — un lead de 3–4 ms ya
 *     hacía que el desvío medio de la melodía superara al del acompañamiento.
 *
 * El peso métrico (R3) multiplica a estos valores: en los tiempos fuertes el
 * desvío baja a ~1–2 ms, así que el "pocket" se escucha en las subdivisiones y
 * no descoloca el pulso.
 */
export const GROOVE_ROLE_OFFSET_MS: Record<GrooveRole, number> = {
  percussion: 0,
  bass: 5,
  harmony: 2,
  melody: -1,
};

/**
 * Escala del jitter por rol (R6).
 *
 * La melodía es la que más se protege (0.4): es la línea que el oyente canta y
 * la que delata cualquier desprolijidad. La armonía lleva el jitter completo
 * (1.0) — es donde el colchón puede "respirar" sin que se note —, y el bajo
 * (0.85) y la percusión (0.85) van algo más firmes porque sostienen el tiempo
 * con el bombo.
 */
export const GROOVE_ROLE_JITTER_SCALE: Record<GrooveRole, number> = {
  percussion: 0.85,
  bass: 0.85,
  harmony: 1,
  melody: 0.4,
};

/**
 * Profundidad de la variación dinámica por rol (fracción de la velocity).
 * El lead es el más expresivo (±7 %), la percusión varía bastante (±6 %), la
 * armonía ±5 % y el bajo es el más estable (±4 %).
 */
export const GROOVE_ROLE_DYNAMIC_DEPTH: Record<GrooveRole, number> = {
  percussion: 0.06,
  bass: 0.04,
  harmony: 0.05,
  melody: 0.07,
};

// ─── Topes (R1, R4) ──────────────────────────────────────────────────────────

/**
 * Tope absoluto del desvío total, en ms, a 100 % (R4a).
 *
 * 15 ms es el techo a partir del cual un conjunto empieza a sonar descuidado en
 * vez de humano (el umbral perceptual de asincronía entre dos ataques ronda los
 * 10–20 ms). Ningún rol ni posición métrica lo alcanza: el peor caso real es el
 * bajo en un contratiempo, 5 + 11·0.85 = 14.4 ms.
 */
export const GROOVE_MAX_ABS_MS = 15;

/**
 * Tope relativo: fracción máxima del intervalo local entre notas de la misma
 * pista (R4b). Protege los pasajes rápidos: en 16avos a 200 BPM (75 ms entre
 * notas) el desvío máximo cae a 6 ms, y en 32avos a 3 ms.
 *
 * También es lo que garantiza R1: como 8 % < 50 %, dos notas vecinas nunca
 * pueden cruzarse (la suma de sus desvíos es ≤ 16 % del intervalo, muy por
 * debajo del 100 % que haría falta para invertirlas).
 */
export const GROOVE_MAX_RELATIVE = 0.08;

/**
 * Jitter máximo (ms) a 100 %, antes del peso métrico y de la escala por rol.
 *
 * 11 ms es el valor que hace audible la perilla sin acercarse al tope absoluto:
 * combinado con los roles y los pesos métricos da un techo real de 14.4 ms (bajo
 * en un contratiempo), 7.9 ms en un tiempo débil y 1.4–2.6 ms en los fuertes.
 * Con 8 ms el efecto quedaba por debajo del umbral perceptual en casi todo el
 * material medido (máx. real 5.2 ms en el fixture de QA).
 */
export const GROOVE_JITTER_MAX_MS = 11;

/** Deriva lenta (1/f) y micro-desvío blanco: reparto del rango total. */
const DRIFT_SHARE = 0.72;
const MICRO_SHARE = 0.28;

/**
 * Ganancia de normalización de la señal humana (dx).
 *
 * La suma de las octavas + el micro-desvío tiene desvío estándar ≈ 0.25 (cada
 * octava es uniforme y al promediar cinco se concentra). Usarla cruda dejaba el
 * rango útil casi sin usar: medido en el fixture de QA, el peor desvío a 100 %
 * era 5.2 ms cuando el techo de diseño es 14.4 ms, o sea que la perilla no se
 * escuchaba. Con 2× la señal queda con sd ≈ 0.5 y se acercan los dos números,
 * sin tocar ningún tope: el ruido sigue acotado (se recorta a ±1) y los topes
 * métrico, absoluto y relativo se aplican después.
 */
const HUMANNESS_GAIN = 2;

/** Octavas de ruido correlacionado. La más lenta abarca 0.35 s × 2⁴ ≈ 5.6 s. */
const DRIFT_OCTAVES = 5;
/** Escala de la octava más rápida (s): cada ~0.35 s cambia la deriva. */
const DRIFT_BASE_SECONDS = 0.35;
/** Puntos por compás para calcular la media del ruido (R5). */
const BAR_MEAN_SAMPLES = 32;

/** Variación máxima de duración (±8 %) a 100 %. */
export const GROOVE_DURATION_MAX = 0.08;

/** Solapamiento legato máximo (ms) a 100 %, sólo instrumentos sostenidos. */
export const GROOVE_LEGATO_MAX_MS = 12;

/** Dos notas a menos de esto se consideran el mismo acorde (R2). */
export const GROOVE_CHORD_EPSILON_SECONDS = 0.0005;

// ─── Jerarquía métrica (R3) ──────────────────────────────────────────────────

/** Posición de una nota dentro del compás. */
export type MetricSlot = "downbeat" | "strong" | "weak" | "offbeat" | "subdivision";

/**
 * Peso del desvío según la posición métrica (R3).
 *
 * | Posición                                          | Peso | Desvío máx a 100 % |
 * |---------------------------------------------------|------|--------------------|
 * | Tiempo 1 del compás (downbeat)                     | 0.10 | 1.4 ms            |
 * | Tiempo fuerte (el del medio: 3 en 4/4, 4 en 6/8)   | 0.18 | 2.6 ms            |
 * | Tiempo débil (2 y 4 en 4/4)                        | 0.55 | 7.9 ms            |
 * | Contratiempo de corchea (la "y")                   | 1.00 | 14.4 ms           |
 * | Otras subdivisiones (16avos, síncopas, tresillos)  | 0.80 | 11.5 ms           |
 *
 * (Peor caso por rol: bajo = 5 ms de offset + 9.35 ms de jitter.)
 *
 * El pulso no se mueve: los tiempos fuertes quedan dentro de 1–3 ms (por debajo
 * del umbral en el que un oyente percibe que "el tiempo se corrió") y el groove
 * vive donde tiene que vivir, en las subdivisiones.
 */
export const GROOVE_METRIC_WEIGHT: Record<MetricSlot, number> = {
  downbeat: 0.1,
  strong: 0.18,
  weak: 0.55,
  offbeat: 1,
  subdivision: 0.8,
};

/** Tolerancia (ms) para considerar que una nota está sobre la rejilla. */
export const GROOVE_GRID_TOLERANCE_MS = 8;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Recorta a -1..1 (la señal humana nunca puede pasarse del techo del rol). */
function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Métrica normalizada: numerador ≥ 1, denominador potencia de 2. */
function normalizeMeter(
  timeSignature?: [number, number],
): [number, number] {
  const num = Math.max(1, Math.round(timeSignature?.[0] ?? 4));
  const rawDen = Math.round(timeSignature?.[1] ?? 4);
  const den = rawDen > 0 && rawDen <= 32 ? rawDen : 4;
  return [num, den];
}

/** Duración de un tiempo notado, en segundos. */
export function beatSeconds(bpm: number, timeSignature?: [number, number]): number {
  const [, den] = normalizeMeter(timeSignature);
  const safeBpm = bpm > 0 ? bpm : 120;
  return (60 / safeBpm) * (4 / den);
}

/** Duración de un compás, en segundos. */
export function barSeconds(bpm: number, timeSignature?: [number, number]): number {
  const [num] = normalizeMeter(timeSignature);
  return beatSeconds(bpm, timeSignature) * num;
}

/**
 * Posición métrica de un instante.
 *
 * Se mide contra la rejilla notada (negra en 4/4, corchea en 6/8) porque
 * `SongData` guarda un solo `bpm`: con cambios de tempo la detección se degrada
 * con elegancia (una nota mal clasificada recibe el peso de "subdivisión", que
 * sigue estando topado).
 */
export function metricSlotAt(
  time: number,
  bpm: number,
  timeSignature?: [number, number],
  toleranceMs: number = GROOVE_GRID_TOLERANCE_MS,
): MetricSlot {
  if (!Number.isFinite(time)) return "subdivision";
  const [num] = normalizeMeter(timeSignature);
  const beat = beatSeconds(bpm, timeSignature);
  const bar = beat * num;
  const tInBar = ((time % bar) + bar) % bar;
  const beatFloat = tInBar / beat;
  const beatIndex = Math.floor(beatFloat);
  const frac = beatFloat - beatIndex;
  const tol = toleranceMs / 1000 / beat;

  // Sobre el pulso (con tolerancia), redondeando al tiempo más cercano.
  if (frac <= tol || frac >= 1 - tol) {
    const index = frac >= 1 - tol ? (beatIndex + 1) % num : beatIndex;
    if (index === 0) return "downbeat";
    const half = num / 2;
    // El "tiempo del medio" del compás (3 en 4/4, 4 en 6/8) es el otro fuerte.
    if (Number.isInteger(half) && index % half === 0) return "strong";
    return "weak";
  }
  // Contratiempo de corchea: justo en la mitad del tiempo.
  if (Math.abs(frac - 0.5) <= tol) return "offbeat";
  return "subdivision";
}

// ─── Clasificación por familia ───────────────────────────────────────────────

/** Familias que sostienen el sonido (el legato tiene sentido en ellas). */
const SUSTAINED =
  /violin|viola|cello|contrabass|string|pizzicato|tremolo|fiddle|trumpet|trombone|tuba|horn|brass|sax|flute|oboe|clarinet|bassoon|recorder|pipe|whistle|accordion|harmonica|reed|organ|pad|choir|voice|oohs|synth|fx|bowed/i;

const BASS = /bass|contrabass|double bass|tuba|bajo/i;

/**
 * Familia melódica: los instrumentos que en estos géneros llevan la línea
 * (acordeón del vallenato, requinto del bolero, trompeta del porro, violín del
 * pasillo, saxo de la salsa, flauta…). El piano, la guitarra, las cuerdas de
 * acompañamiento y los pads quedan en armonía: sin analizar la partitura no se
 * puede saber si un piano hace melodía o acompañamiento, y el acompañamiento es
 * el caso más frecuente en una banda.
 */
const MELODY =
  /accordion|harmonica|trumpet|muted trumpet|trombone|sax|flute|piccolo|recorder|pan flute|whistle|ocarina|violin|fiddle|lead|solo|voice|choir/i;

/** ¿El instrumento sostiene el sonido? (habilita el solapamiento legato). */
export function isSustainedInstrument(instrument: string): boolean {
  return SUSTAINED.test(instrument);
}

/** Rol de un instrumento (o de un golpe de percusión) dentro de la banda. */
export function grooveRoleFor(
  instrument: string,
  percussive = false,
): GrooveRole {
  if (percussive) return "percussion";
  if (BASS.test(instrument)) return "bass";
  if (MELODY.test(instrument)) return "melody";
  return "harmony";
}

// ─── Ruido determinista con correlación 1/f ──────────────────────────────────

/** Hash entero determinista (FNV-1a + avalanche). Nada de `Math.random()`. */
function hash32(a: number, b: number, c: number): number {
  let h = 2166136261 ^ (a | 0);
  h = Math.imul(h ^ (b | 0), 16777619);
  h = Math.imul(h ^ (c | 0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

function rand01(a: number, b: number, c: number): number {
  return hash32(a, b, c) / 4294967296;
}

/** Valor -1..1, independiente por (a, b, c). */
function randSigned(a: number, b: number, c: number): number {
  return rand01(a, b, c) * 2 - 1;
}

/** Hash de una cadena a entero de 32 bits (mismo FNV que el resto del motor). */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ruido de valor con interpolación lineal: función suave y determinista de `t`
 * que cambia de valor cada `scale` segundos.
 */
function valueNoise(seed: number, octave: number, t: number): number {
  const scale = DRIFT_BASE_SECONDS * Math.pow(2, octave);
  const x = t / scale;
  const i = Math.floor(x);
  const frac = x - i;
  const a = rand01(seed, octave * 31 + 1, i);
  const b = rand01(seed, octave * 31 + 1, i + 1);
  return (a + (b - a) * frac) * 2 - 1;
}

/**
 * Ruido rosa (1/f) en -1..1.
 *
 * La receta es la clásica de Voss-McCartney: **sumar octavas de igual
 * amplitud**. La cuenta, para no equivocarse: en un banco de octavas de ancho
 * relativo constante la potencia de la banda k es `S(f_k) · f_k`; con
 * `S(f) ∝ 1/f` (rosa) eso da potencia constante por octava, o sea **amplitud
 * constante**. (Subir la amplitud con la frecuencia daría blanco, y bajarla
 * como 2^(−k/2) daría marrón 1/f²: demasiada deriva lenta, el tempo "se va" en
 * vez de "respirar".)
 */
function pinkNoise(seed: number, t: number): number {
  let sum = 0;
  for (let k = 0; k < DRIFT_OCTAVES; k++) {
    sum += valueNoise(seed, k, t);
  }
  return sum / DRIFT_OCTAVES;
}

// ─── Plan por pista ──────────────────────────────────────────────────────────

export interface GrooveNoteInput {
  /** Identidad estable de la nota (su `id`): es la clave del resultado. */
  key: string;
  /** Tiempo escrito, en segundos (mismo dominio que `SongNote.time`). */
  time: number;
}

export interface GrooveTrackInput {
  trackIndex: number;
  role: GrooveRole;
  /** Golpes del canal 10: sin legato y con el tiempo 1 congelado. */
  percussive?: boolean;
  /** Instrumento sostenido (habilita el legato). */
  sustained?: boolean;
  /** Notas de la pista (cualquier orden: se ordenan acá adentro). */
  notes: GrooveNoteInput[];
}

export interface GroovePlanInput {
  /** Hash del id de la canción (ver `hashString`). */
  songSeed: number;
  bpm: number;
  /** Posición de la perilla, 0..1. */
  amount: number;
  timeSignature?: [number, number];
  tracks: GrooveTrackInput[];
}

export interface GrooveResult {
  /** Desvío del inicio, en milisegundos (positivo = atrás del pulso). */
  offsetMs: number;
  /** Factor de duración (1 = duración escrita). */
  durationFactor: number;
  /** Milisegundos extra de solapamiento legato (0 si no aplica). */
  legatoMs: number;
  /** Factor de velocity (1 = velocity escrita). */
  velocityFactor: number;
}

/**
 * Identidad exacta: a 0 % el groove no toca nada. Congelado para que nadie lo
 * mute por accidente y para que la comparación sea por referencia.
 */
export const NO_GROOVE: GrooveResult = Object.freeze({
  offsetMs: 0,
  durationFactor: 1,
  legatoMs: 0,
  velocityFactor: 1,
});

interface Group {
  time: number;
  keys: string[];
  /** Media del ruido en el compás al que pertenece (R5). */
  bar: number;
}

/**
 * Calcula el groove de TODA una canción.
 *
 * Es un plan por pista y no nota por nota porque tres de las reglas necesitan
 * contexto: el orden (R1) depende de las vecinas, los acordes (R2) dependen de
 * quién comparte el onset y la jerarquía métrica (R3) depende de la posición en
 * el compás.
 *
 * Devuelve un mapa `id de nota → resultado`. A 0 % devuelve un mapa vacío: el
 * llamador cae a `NO_GROOVE`, así que los ticks y las velocities quedan **bit a
 * bit** como sin perilla.
 */
export function planGroove(input: GroovePlanInput): Map<string, GrooveResult> {
  const out = new Map<string, GrooveResult>();
  const amount = clamp01(input.amount);
  if (amount <= 0) return out;

  const [num] = normalizeMeter(input.timeSignature);
  const barLength = beatSeconds(input.bpm, input.timeSignature) * num;

  for (const track of input.tracks) {
    planTrack(track, input, amount, barLength, out);
  }
  return out;
}

function planTrack(
  track: GrooveTrackInput,
  input: GroovePlanInput,
  amount: number,
  barLength: number,
  out: Map<string, GrooveResult>,
): void {
  if (track.notes.length === 0) return;

  const percussive = track.percussive === true;
  const roleOffset = percussive ? 0 : GROOVE_ROLE_OFFSET_MS[track.role];
  const jitterScale = GROOVE_ROLE_JITTER_SCALE[track.role];
  const depth = GROOVE_ROLE_DYNAMIC_DEPTH[track.role];

  // ── 1. Ordenar y agrupar acordes (R2) ──
  const sorted = [...track.notes].sort((a, b) => a.time - b.time);
  const groups: Group[] = [];
  for (const note of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(note.time - last.time) <= GROOVE_CHORD_EPSILON_SECONDS) {
      last.keys.push(note.key);
    } else {
      groups.push({ time: note.time, keys: [note.key], bar: 0 });
    }
  }

  // ── 2. Ruido re-anclado por compás (R5) ──
  //
  // A la deriva 1/f se le resta su media DENTRO de cada compás. Así el ruido
  // conserva su variación dentro del compás (que es lo que suena a persona)
  // pero no puede dejar el pulso corrido al final de la canción: cada compás
  // arranca con desvío medio cero.
  const musicianSeed = hash32(input.songSeed, track.trackIndex, 0x9e3779b9);
  const dynamicSeed = hash32(musicianSeed, 0x2f1b3c5d, track.trackIndex);
  const durationSeed = hash32(musicianSeed, 0x11aa22bb, 0);
  /**
   * Media del ruido por compás, cacheada POR SEMILLA.
   *
   * Son tres señales distintas (timing, dinámica y duración) y cada una tiene su
   * propia media por compás: una caché sola por compás devolvería la media de la
   * primera señal para las otras dos y el re-anclado quedaría mal (la dinámica y
   * la duración volverían a tener una deriva lenta).
   */
  const barMeanCaches = new Map<number, Map<number, number>>();
  const anchoredMean = (seed: number, barIndex: number): number => {
    let cache = barMeanCaches.get(seed);
    if (!cache) {
      cache = new Map<number, number>();
      barMeanCaches.set(seed, cache);
    }
    const cached = cache.get(barIndex);
    if (cached !== undefined) return cached;
    let sum = 0;
    for (let i = 0; i < BAR_MEAN_SAMPLES; i++) {
      sum += pinkNoise(seed, barIndex * barLength + (i / BAR_MEAN_SAMPLES) * barLength);
    }
    const mean = sum / BAR_MEAN_SAMPLES;
    cache.set(barIndex, mean);
    return mean;
  };

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    const time = group.time;
    const barIndex = Math.floor(time / barLength);
    const mainKey = group.keys[0] ?? `${track.trackIndex}:${i}`;
    const keySeed = hashString(mainKey);

    // ── Peso métrico (R3) ──
    const slot = metricSlotAt(time, input.bpm, input.timeSignature);
    const weight = GROOVE_METRIC_WEIGHT[slot];
    // La percusión en el tiempo 1 NO se mueve: es la referencia del compás
    // (y también de la rejilla visual y de la ventana de acierto del juego).
    const frozen = percussive && slot === "downbeat";
    const timingScale = frozen ? 0 : weight;

    // ── Microtiming ──
    const drift = pinkNoise(musicianSeed, time) - anchoredMean(musicianSeed, barIndex);
    const micro = randSigned(musicianSeed, keySeed, 0x51ed270b);
    const humanness = clampSigned(
      (DRIFT_SHARE * drift + MICRO_SHARE * micro) * HUMANNESS_GAIN,
    );
    const rawOffset =
      timingScale * (roleOffset + GROOVE_JITTER_MAX_MS * jitterScale * humanness);

    // ── Doble tope (R1 + R4) ──
    //
    // El intervalo local es el menor de los huecos con la nota anterior y la
    // siguiente (en ms). Con `∞` cuando no hay vecina.
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const gapPrev = prev ? (time - prev.time) * 1000 : Infinity;
    const gapNext = next ? (next.time - time) * 1000 : Infinity;
    const gap = Math.min(gapPrev, gapNext);
    const cap = Math.min(GROOVE_MAX_ABS_MS, GROOVE_MAX_RELATIVE * gap);
    const capped = Math.max(-cap, Math.min(cap, rawOffset));
    const offsetMs = capped * amount;

    // ── Dinámica ──
    //
    // Ruido propio (otra sal): la dinámica se correlaciona con el timing, pero
    // no es la misma señal. También re-anclada por compás, así el nivel medio de
    // la pista no se va corriendo.
    const dynamicNoise = clampSigned(
      (DRIFT_SHARE *
        (pinkNoise(dynamicSeed, time) - anchoredMean(dynamicSeed, barIndex)) +
        MICRO_SHARE * randSigned(dynamicSeed, keySeed, 0x7a1c9e37)) *
        HUMANNESS_GAIN,
    );
    const velocityFactor = 1 + amount * depth * dynamicNoise;

    // ── Articulación ──
    const durationNoise = clampSigned(
      (DRIFT_SHARE *
        (pinkNoise(durationSeed, time) - anchoredMean(durationSeed, barIndex)) +
        MICRO_SHARE * randSigned(durationSeed, keySeed, 0x3c6ef372)) *
        HUMANNESS_GAIN,
    );
    const durationFactor = 1 + amount * GROOVE_DURATION_MAX * durationNoise;

    // Legato: sólo instrumentos que sostienen. Se aplica al FINAL de la nota
    // (la siguiente entra encima unos milisegundos), como un arco o un fuelle.
    const legatoMs =
      track.sustained && !percussive
        ? amount *
          GROOVE_LEGATO_MAX_MS *
          (1 + 0.2 * randSigned(musicianSeed, keySeed, 0x5bf03635))
        : 0;

    const result: GrooveResult = {
      offsetMs,
      durationFactor,
      legatoMs,
      velocityFactor,
    };
    // R2: todo el acorde comparte el MISMO objeto de resultado.
    for (const key of group.keys) out.set(key, result);
  }
}
