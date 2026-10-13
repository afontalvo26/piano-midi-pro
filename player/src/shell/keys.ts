/**
 * keys — un detalle chico del teclado que hay que resolver en cada slider.
 *
 * EL CHOQUE: la barra registra atajos globales en `window`
 * (`@app/music/useMediaSession`): `←`/`→` buscan ±5 s y `↑`/`↓` mueven el volumen
 * maestro. Ese hook ignora los inputs de TEXTO (`TEXT_INPUT_TYPES`) pero **no** los
 * `range`, así que con el foco en un slider cualquiera la flecha hacía las dos
 * cosas: mover el slider *y* saltar en la canción.
 *
 * Medido en el mezclador: 25 pulsaciones de `←` movían el volumen de la pista a 0
 * **y** mandaban la reproducción 125 s atrás. El mismo choque aparece en cualquier
 * slider del reproductor (el de Groove incluido), así que la solución vive acá y la
 * usan todos: cortar la propagación de las cuatro flechas para que el evento no
 * llegue al listener global.
 *
 * NO se arregla en el hook compartido a propósito: el seeker de la BARRA sí espera
 * que las flechas hagan un seek de ±5 s (`docs/qa-reproductor.md` §1.1 lo mide), y
 * un "ignorar todos los `range`" ahí lo degradaría a un paso de 0,1 s. La regla
 * correcta es por componente: el slider de un panel se queda con sus flechas, el
 * seeker de la barra las comparte con el transporte.
 */

import type { KeyboardEvent } from "react";

/** ¿La tecla es una de las cuatro flechas? */
export function isArrowKey(key: string): boolean {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  );
}

/**
 * Corta las flechas para que no lleguen al atajo global del reproductor.
 *
 * Se usa en el `onKeyDown` del `<input type="range">`.
 */
export function stopArrowKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (isArrowKey(event.key)) event.stopPropagation();
}
