# MIX — diseño

## Grafo

TrackBus → inserts ordenados → fader/pan → send taps → bus/master. Un compilador del grafo valida rutas y construye nodos de audio; cambios se aplican por rampa/crossfade corto. Un bus no puede enviarse a sí mismo ni a un descendiente. El reloj y la propiedad de audio proceden de CLK/studioAudioLock; no se crea un AudioContext por pista.

Cada efecto tiene typeId/version, parámetros tipados, rango, unidad, default, smoothing, latencia reportada y modo offline. AUT se conecta al registro de parámetros; EXP reutiliza DSP o declara una incompatibilidad antes de exportar. Reverb y delay poseen cola finita estimable. Sidechain es una señal de control de un bus fuente explícito, con compensación de latencia cuando corresponda.

## Niveles y medidores

La ruta se calibra con referencias a -dBFS y headroom acordado; los límites se fijan a partir de mediciones del motor. Los medidores calculan pico/RMS de señal, no sólo el valor del fader. Registrar eventos de clipping, dropouts, voces robadas y PCM residente en diagnóstico; evitar actualizar React por muestra.

## Integración

INS y SMP entregan voces al bus de pista; AUD inserta monitor/resample en puntos explícitos; ARR gobierna mute/solo musical; EXP renderiza mezcla y stems con la misma topología.


## Corte MIX-01 — rutas post-fader y política segura (propuesta sin aceptación)

La implementación propuesta en `app/src/audio/projectAudioSink.ts` añade a cada
`TrackSlot` una colección de `Tone.Gain` de envíos. El recorrido de señal
por pista es `volume → inserts → muteGate → panner → meter`. Tras el
`meter`, la salida principal va al bus de salida/master y cada envío
dispone de su propio nivel lineal `10 ** (gainDb / 20)` hacia su bus
auxiliar. Cada conexión usa el mismo `AudioContext`; el renderer aislado
crea un grafo con las mismas rutas. Los nodos de envío se destruyen con el slot.

`assertSafeAudioRouting` recorre aristas de salida principal y envíos:
valida existencia/tipo del bus, ganancia finita y grafo acíclico **antes** de
crear los nodos. El mezclador excluye destinos que regresarían a la fuente,
pero la comprobación del motor permanece obligatoria para snapshots externos
o cambiados por otra pestaña. No se añade un controlador MIDI universal.

Las modificaciones del nivel y de la topología se guardan por
`onTrackMix` como comandos de proyecto reversibles. Un nuevo render
recrea el grafo correspondiente a su revisión; no se promete reconfigurar el
grafo en caliente sin interrupción.

**Aceptación pendiente:** comprobar audio de envío, ausencia de feedback,
guardar/deshacer/rehacer/reabrir, 320 px y paridad del master/stems en
Playwright y una revisión de headroom de la mezcla real. El nuevo
`tests/e2e/project-mixer-sends.spec.ts` es evidencia diseñada, no resultado
ejecutado. El sidechain MIX-04 y A/B MIX-06 siguen pendientes.

### Limitaciones deliberadas

- Los taps de buses y el stem directo al master ahora están separados
  de la conexión global al master: sólo se conecta al destino offline el
  medidor post-insert/fader del bus elegido o las salidas directas. Así los
  envíos auxiliares no duplican audio en un stem de bus. Esta implementación
  sigue **sin prueba E2E ejecutada** y no constituye aceptación MIX-01.
- La semántica de mute/solo cuando una pista utiliza salidas paralelas
  requiere prueba y cierre explícitos, incluido silencio de colas.
- No se declara compensación de latencia de plugins ni sidechain implementado.


### Corrección de escucha con ruta principal silenciada

Si una fuente tiene `outputBusTrackId` hacia un bus silenciado y un
`send` paralelo hacia otro bus activo, **no** se apaga su
`muteGate` de origen: el bus principal aplica su propio silencio y el
envío sigue audible. `ProjectAudioSink.hasUnmutedPath` recorre todas las
rutas de salida/sends con los overrides de mute; al mutear un bus no se
liberan handles de una pista que aún tiene salida válida por otro
bus. `EXP.audioPlan` selecciona sólo fuentes que alcanzan una salida
no silenciada, incluyendo su ruta de envío. Una pista propiamente
silenciada sí calla en ambas rutas.

`tests/e2e/project-mixer-sends.spec.ts` contiene una comparación de
energía del mismo clip con y sin ese envío, además de comprobar el
preflight de bus y cero ataques omitidos. Esta prueba debe ejecutarse
en Chromium real; los cambios actuales siguen pendientes de aceptación.

**Solo explícito en buses auxiliares** requiere una comprobación más
fina de puertas por ruta primaria frente a rutas de envío, junto con
pruebas físicas de colas y motores activos. No se aprueba MIX-05 aún.
