/**
 * config — los pocos parámetros del reproductor que no son del motor.
 */

/**
 * De dónde se bajan los samples del piano acústico (Salamander).
 *
 * Es el MISMO banco que usa el piano del proyecto: el dueño pidió "exactamente
 * el mismo motor o sonidos", así que la fuente no se cambia. Está declarado acá
 * y no dentro del sampler para poder apuntarlo a un espejo local sin tocar nada
 * más.
 */
export const SAMPLES_BASE_URL = "https://tonejs.github.io/audio/salamander";

/**
 * Ruta pública donde Vite sirve los MIDI de demostración de la app.
 *
 * El dev server la resuelve con un middleware propio (`vite.config.ts`) que lee
 * `app/public/demo`: son los mismos archivos del piano, sin una segunda copia.
 * `music/resolve.ts` del piano pide las demos por su ruta pública absoluta, así
 * que este prefijo es informativo (y el que documenta de dónde salen).
 */
export const DEMO_BASE_PATH = "/demo";
