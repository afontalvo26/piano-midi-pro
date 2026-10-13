/**
 * usePlayerEngineHost — el `PlaybackHost` que `PlayerContext` del piano espera.
 *
 * Es la contraparte exacta del `engineBridge` que App.tsx registra en el
 * reproductor: `PlayerContext` manda (`load`, `play`, `pause`, `stop`, `seek`,
 * `setVolume`) y pregunta la posición (`getPosition`); el motor obedece y avisa
 * cuando la canción termina.
 *
 * DOS DIFERENCIAS DELIBERADAS CON App.tsx
 * ---------------------------------------
 *  1. **Sin `nextFrame()`.** El piano espera dos `requestAnimationFrame` en
 *     `play()` porque su `startPlayback` cierra sobre la canción del render
 *     anterior y necesita que React confirme la nueva. Acá el motor guarda la
 *     canción en un campo propio, así que `load()` y `play()` en el mismo tick
 *     son correctos sin demora artificial.
 *  2. **El fin de canción SÍ se avisa.** En el piano, `notifyEnded()` nunca se
 *     llama al terminar un tema (el `onEnded` del puente queda registrado y sin
 *     invocar), así que la cola no avanza sola. Acá el reloj del motor lo llama,
 *     que es justo para lo que `PlayerContext` expone `notifyEnded`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { PlaybackHost } from "@app/music/PlayerContext";
import { PlayerEngineHost } from "./PlayerEngineHost";
import type { EngineSnapshot } from "./PlayerEngineHost";

/**
 * El motor es un SINGLETON DE MÓDULO, no un `useState`/`useRef` del hook.
 *
 * Por qué: el reproductor tiene UN motor (un `AudioContext`, un
 * `Tone.Transport`, un sampler de piano) y su ciclo de vida es la pestaña, no el
 * del componente. Con un singleton de módulo el valor es estable, se puede leer
 * durante el render —que es lo que `useSyncExternalStore` necesita— y no hay que
 * mutar nada que venga de `useState` ni leer un `ref` en render. Es la misma
 * decisión que ya toma `libraryStore` (singleton de módulo) y la que tomaba el
 * controlador anterior ("el controlador es un singleton y su liberación real es
 * el cierre de la pestaña").
 *
 * Crearlo acá es barato: el constructor no toca el `AudioContext` (eso pasa en
 * `init()`, desde un gesto del usuario).
 */
export const playerEngineHost = new PlayerEngineHost();

export type PlayerEngineApi = {
  host: PlayerEngineHost;
  /** Lo que `PlayerSection` registra en el contexto del reproductor. */
  bridge: Omit<PlaybackHost, "onEnded" | "getPosition">;
  /** Posición imperativa (la barra la lee en su propio rAF). */
  getPosition: () => number;
  /** Estado publicable del motor (nunca las notas). */
  snapshot: EngineSnapshot;
  /** Se llama al terminar una canción: el reproductor decide qué sigue. */
  onSongEnd: () => void;
};

export function usePlayerEngineHost(handleEnded: () => void): PlayerEngineApi {
  const host = playerEngineHost;

  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);

  // El motor corre fuera de React y avisa por un campo propio. Se reasigna
  // cuando cambia el callback; es una escritura de un campo, no un efecto caro.
  useEffect(() => {
    host.onSongEnd = () => handleEnded();
    return () => {
      host.onSongEnd = null;
    };
  }, [handleEnded, host]);

  // El motor se construye en el PRIMER gesto del usuario (Web Audio lo exige),
  // que es lo que permite que la precarga de la canción arranque antes del play.
  useEffect(() => {
    host.warmUpOnFirstGesture();
  }, [host]);

  const bridge = useMemo<Omit<PlaybackHost, "onEnded" | "getPosition">>(
    () => ({
      load: (song) => host.load(song),
      play: (offset) => host.play(offset),
      pause: () => host.pause(),
      stop: () => host.stop(),
      seek: (sec) => host.seek(sec),
      setVolume: (volume, muted) => host.setVolume(volume, muted),
    }),
    [host],
  );

  const getPosition = useCallback(() => host.getPosition(), [host]);

  return { host, bridge, getPosition, snapshot, onSongEnd: handleEnded };
}
