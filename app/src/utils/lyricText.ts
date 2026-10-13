// ============================================================
// utils/lyricText — normalización de mayúsculas/minúsculas de la letra.
//
// POR QUÉ EXISTE: los `.kar` viejos se escriben a mano en el editor de karaoke y
// la mayoría del corpus viene TODO EN MAYÚSCULAS ("UN GRANDE NUBARRÓN
// SE'ALZA'EN EL CIELO"). Leer 40 líneas gritadas cansa la vista y no es lo que
// hace ningún reproductor serio. La regla del dueño es explícita: **primera
// letra de cada frase en mayúscula, el resto en minúscula, nunca todo en
// mayúsculas ni todo en minúsculas**.
//
// LO QUE NO HACE (y es a propósito): no intenta adivinar nombres propios dentro
// de una línea que viene toda en mayúsculas. Esa información no está en el
// archivo — "JUAN" y "PAN" son indistinguibles de "juan" y "pan" — así que
// inventarla produciría textos peores que los originales. Cuando la línea SÍ
// trae mayúsculas y minúsculas mezcladas (el autor ya marcó el nombre propio),
// se respeta tal cual: ahí el dato existe y se conserva.
// ============================================================

/** Letras con acento incluidas: `[A-Z]` a secas rompería "MÚSICA" y "ÑANDÚ". */
const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/gu;
const LOWER = /\p{Ll}/gu;

/** La app es en español: la conversión de caja tiene que ser la del español. */
const LOCALE = "es-ES";

/**
 * A partir de qué proporción de mayúsculas una línea se considera "gritada".
 *
 * No alcanza con "todas mayúsculas": hay líneas mixtas por accidente. Medido
 * sobre las 6.279 líneas que salen de los 158 MIDI de `app/public/demo`, la
 * proporción de mayúsculas tiene un hueco limpio entre 0,3 y 0,4:
 *
 *   · 0,0–0,2 → 6.208 líneas, caja elegida por el autor ("VOZ:1* * * * * Amigo
 *     estoy dolido,", "Efraín José"): no se tocan.
 *   · 0,3     →    26 líneas, la cola de las mixtas.
 *   · 0,4–0,7 →    45 líneas, y mirando una por una son letra de verdad gritada
 *     ("QUIÉN TÚ SERÁS AL VOLVER? Hoy quieres re…", "Tiene tumbaoTIENE TUMBAO…",
 *     "NO CAMINA DE LAO(La negra tiene tumbao¡AY"): ésas SÍ hay que bajarlas, y
 *     con el umbral en 0,7 quedaban sin tocar.
 *
 * Por eso el corte va en 0,4: cae en el hueco, así que no hay ninguna línea real
 * cerca de él y la decisión no depende de un decimal.
 */
const SHOUTING_RATIO = 0.4;

/** Corta en fin de frase. El `+` se lleva los "..." y los "!!!" juntos. */
const SENTENCE_BREAK = /([.!?…]+["'”’)\]]*\s+)/;

/** Cuenta letras por caja, ignorando dígitos, espacios y puntuación. */
function countCased(text: string): { upper: number; lower: number } {
  return {
    upper: (text.match(UPPER) ?? []).length,
    lower: (text.match(LOWER) ?? []).length,
  };
}

/** ¿La línea viene gritada (todo o casi todo en mayúsculas)? */
export function isShouting(text: string): boolean {
  const { upper, lower } = countCased(text);
  const cased = upper + lower;
  if (cased === 0) return false; // sólo dígitos o signos: no hay nada que decidir
  if (lower === 0) return true;
  return upper / cased > SHOUTING_RATIO;
}

/**
 * Pone en mayúscula la primera LETRA de `text`.
 *
 * "Primera letra" y no "primer carácter": en `"el binomio` la comilla va antes
 * que la `e`, y `!en "El Galicia"!` arranca con un signo. Buscar la primera letra
 * de verdad es lo que evita dejar `"el binomio` sin arreglar.
 */
function capitaliseFirstLetter(text: string): string {
  const match = LETTER.exec(text);
  if (!match) return text;
  const at = match.index;
  return (
    text.slice(0, at) +
    text[at].toLocaleUpperCase(LOCALE) +
    text.slice(at + 1)
  );
}

/**
 * Aplica a cada frase la primera letra en mayúscula.
 *
 * `forceLowerRest` distingue los dos casos: cuando la línea viene gritada hay que
 * bajar TODO el resto a minúscula (si no, seguiría gritada); cuando el autor ya
 * eligió la caja, sólo se garantiza el arranque de frase y se respeta el resto.
 */
function applySentenceCase(text: string, forceLowerRest: boolean): string {
  return text
    .split(SENTENCE_BREAK)
    // El `split` con captura intercala los separadores en índices impares: ésos
    // se devuelven intactos para no perder espacios ni signos.
    .map((part, index) =>
      index % 2 === 1
        ? part
        : capitaliseFirstLetter(forceLowerRest ? part.toLocaleLowerCase(LOCALE) : part),
    )
    .join("");
}

/**
 * Normaliza la caja de una frase de letra.
 *
 * - Línea gritada → "Primera letra mayúscula, resto en minúscula", frase por
 *   frase (una línea puede traer dos frases: "…la cabeza. Ya llega…").
 * - Línea ya escrita en caja mixta → se respeta, salvo el arranque de cada frase,
 *   que se garantiza en mayúscula.
 *
 * Es idempotente: aplicarla dos veces da el mismo resultado. Eso importa porque
 * se aplica al extraer del archivo Y otra vez al dibujar (una canción guardada
 * por una versión anterior de la app no pasó por la primera).
 */
export function normaliseLyricCase(text: string): string {
  if (!text) return text;
  return applySentenceCase(text, isShouting(text));
}

/**
 * Igual que `normaliseLyricCase` pero sobre las palabras sueltas de una línea.
 *
 * Hace falta porque en los `.kar` la caja y el reparto en sílabas son
 * independientes: la normalización tiene que decidirse con la FRASE completa
 * ("UN GRANDE NUBARRÓN" es gritada) y después repartirse entre las palabras, o
 * cada trozo se evaluaría por su cuenta y "UN" (1 letra, todo mayúsculas) se
 * bajaría a "un" perdiendo el arranque de frase.
 *
 * @param parts   los textos de las palabras, en orden, tal como vienen del `.kar`
 * @param joiner  cómo se unen para reconstruir la frase (normalmente un espacio)
 */
export function normaliseWordCases(
  parts: readonly string[],
  joiner = " ",
): string[] {
  if (parts.length === 0) return [];
  const normalised = normaliseLyricCase(parts.join(joiner));
  // Reparto por longitudes: `normaliseLyricCase` sólo cambia la CAJA, nunca
  // agrega ni quita caracteres, así que las longitudes se conservan y el reparto
  // es exacto incluso con acentos o eñes (que ocupan 1 carácter para
  // `String.prototype.length`; un par subrogado no puede venir de un `.kar`, que
  // es CP1252 de un byte por carácter).
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const length = parts[i].length;
    out.push(normalised.slice(cursor, cursor + length));
    // El separador que meta el `join` también avanza el cursor; sin esto el
    // reparto se corre una posición por palabra y parte las palabras mal.
    cursor += length + (i < parts.length - 1 ? joiner.length : 0);
  }
  // El último trozo se lleva lo que sobre, para que un desajuste inesperado
  // nunca pierda texto.
  if (cursor < normalised.length && out.length > 0) {
    out[out.length - 1] += normalised.slice(cursor);
  }
  return out;
}

/** Aplica la normalización a la letra completa. Devuelve el mismo array si no cambia. */
export function normaliseLyricLines<T extends { text: string }>(lines: T[]): T[] {
  let changed = false;
  const out = lines.map((line) => {
    const text = normaliseLyricCase(line.text);
    if (text === line.text) return line;
    changed = true;
    return { ...line, text };
  });
  return changed ? out : lines;
}
