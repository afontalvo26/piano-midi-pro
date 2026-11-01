# Beatmaker Studio — diseño propuesto

Las interfaces y dependencias por módulo están en el [índice de especificaciones](README.md). Este documento es el plano transversal.

## Decisión de producto

Conservar las tres secciones principales. **Studio** añade espacios de trabajo de composición; **Pistas** contiene proyectos propios y tomas propias; **Configuración** conserva MIDI/audio/diagnóstico. Se permite reproducir y editar proyectos propios dentro de Studio porque el nuevo pedido lo requiere. No se restaura la biblioteca o reproductor de canciones retirado.

## Entidades y propiedad de datos

```text
Proyecto (id, schemaVersion, nombre, tempoMap, compás, assets, historial)
 ├─ Pistas: instrumento | batería | audio | bus
 │   ├─ Instrumento/kit, cadena FX, volumen/pan/sends, arm/mute/solo
 │   └─ Clips de arreglo: inicio, duración, fuente de patrón o audio, offsets
 ├─ Patrones MIDI: notas con id, inicio/duración musical, velocity, origen
 │   └─ Eventos de expresión y automatización de clip
 ├─ Escenas: referencias a clips/loops lanzables
 ├─ Automatización de pista/master: parámetro, puntos y curvas
 └─ Tomas fuente: referencias a grabación MIDI o audio original inmutable
```

El proyecto editable es la fuente de verdad. `.mid` es formato de intercambio; no debe ser la base de datos del editor. Cada nota conserva `id`, `pitch`, `startTick`, `durationTick`, `velocity`, `releaseVelocity`, canal/origen y, donde proceda, eventos asociados. Tiempo musical con resolución documentada (propuesta: 960 PPQ) y captura de marcas originales en la toma cruda; cuantizar/humanizar nunca destruye el original. La resolución final se fija después de medir error de ida y vuelta y cambios de BPM.

Los patrones son fuentes; los clips son instancias. Duplicar un clip comparte la fuente hasta que el usuario elige **Hacer único**. Copiar una toma al proyecto crea un patrón nuevo y deja su registro IndexedDB original intacto. El usuario ve siempre si edita la fuente o sólo una instancia. Los archivos de audio se referencian por id/hash, no por rutas temporales `blob:`.

## Módulos y fronteras

1. `midi/recorder.ts` sigue siendo capturador y exportador de tomas. Las tomas nuevas se convierten desde `MidiRecorderSnapshot`; las tomas históricas, que sólo conservan `.mid` y resumen, requieren un lector SMF acotado y validado (cabecera, pistas, delta times, running status, tempo, límites de tamaño/eventos). Ambos caminos producen notas, CC y tempo editables sin reescribir la toma original.
2. Nuevo núcleo `project/`: esquema versionado, validación, comandos de edición, undo/redo, serialización, migraciones y repositorio IndexedDB. Los archivos de audio pueden vivir en blobs IndexedDB u OPFS; se elige con prueba real de cuota, transacción y recuperación. La base de tomas existente permanece separada.
3. Nuevo `sequencer/`: transporte único, reloj tempo/compás, schedule ahead de clips, escenas y automatización, propiedad de voces por proyecto/pista/clip/iteración. Reproduce sobre el grafo de audio existente y usa tiempos explícitos del `AudioContext`. No usa `setInterval` de React para programar notas.
4. `audio/liveStudioEngine.ts` sigue siendo la ruta de interpretación humana. El secuenciador recibe una interfaz de programación con tiempos explícitos; sus Note Off, CC y panic afectan sólo a sus voces. El motor actual selecciona un instrumento principal para tocar en vivo; el proyecto necesitará instancias de instrumento independientes por pista, con carga y límites de memoria propios. Mixer por pista y master comparten salida con el piano en vivo bajo `studioAudioLock.ts`.
5. `components/studio/` se divide en transporte, browser de sonidos, pad/step sequencer, piano roll, arreglo, sampler, mixer y automatización. `PianoApp.tsx` coordina navegación y sesión, no guarda miles de notas en estado React. Vistas grandes usan canvas/virtualización y suscripciones por región.

## Tiempo y audio

- El transporte convierte ticks musicales a `AudioContext.currentTime` por tramos de tempo. Lookahead acotado; en cada callback se pasa el `audioTime` hasta el nodo. No se programa con `Date.now()` ni se redondean notas al compás por defecto.
- Intervalos de loop semiabiertos `[inicio, fin)`, con id de iteración. Esto evita un ataque doble en el borde. Al buscar/parar, invalidar la generación pendiente y liberar sólo voces del transporte con fade corto.
- Arreglo y lanzador tienen una autoridad por pista: cuando una escena toma una pista, el arreglo de esa pista cede y viceversa. La transición se cuantiza opcionalmente al siguiente beat/compás y se ve en UI.
- El render offline reutiliza modelo, instrumentos, automatización y rutas de mezcla. Si un nodo/efecto no tiene modo de render reproducible, la exportación avisa antes de iniciar. WAV y stems se comparan contra la reproducción en un fixture determinista.
- La importación de muestras y análisis de transientes/time-stretch se hacen fuera del hilo visual. Se fijan presupuestos de memoria/voz y carga por demanda; no se precarga una biblioteca entera.

## Grabación, latencia y recuperación

El mismo transporte gobierna count-in, captura, overdub y punch. El MIDI entrante conserva tiempo de llegada y se convierte a ticks usando el mapa de tempo vigente más una compensación calibrable. La monitorización del instrumento en vivo no depende de que la escritura IndexedDB termine. Audio de micrófono solicita permiso cuando se arma una pista de audio, y guarda bloques con marcas de tiempo y un indicador de salud del dispositivo; la app no graba el micrófono en segundo plano por defecto.

Cada comando de edición tiene inverso para Deshacer/Rehacer. El autoguardado agrupa cambios pequeños; los archivos de audio se escriben primero en una zona temporal, luego una transacción confirma metadatos y referencias, y la recuperación limpia o retoma archivos pendientes. Esto evita prometer atomicidad entre IndexedDB y OPFS, que son almacenes distintos. Antes de migrar la base de tomas, se prueba abrir una copia y se conserva una ruta de exportación de los `.mid` anteriores. El service worker nunca borra IndexedDB/OPFS.

El almacenamiento del navegador tiene cuota y puede ser eliminado por el usuario; por ello el producto muestra uso estimado, fallos de espacio y exportación de paquete portable. La opción de almacenamiento persistente se ofrece cuando el navegador la permita. El paquete se valida con hashes y esquema antes de restaurar. Los archivos del usuario se decodifican con límites y sin ejecutar código remoto.

## Diseño de interacción

Barra superior común: proyecto, guardado, BPM/compás, Play/Stop/Record, loop, metrónomo, indicador de audio/MIDI. Columna lateral: pistas e instrumentos/muestras. Centro: alterna **Pads/Pasos**, **Piano roll** y **Arreglo**; abajo: edición de velocidad/CC, sampler o mixer según selección. Un panel muestra lo que está armado y lo que se está grabando. El teclado de 37 notas queda accesible en la vista de interpretación sin competir con la línea de tiempo.

Flujo de primera sesión: Crear proyecto → kit básico → patrón de 4 compases → grabar/dibujar batería → 808 → melodía → duplicar/variar → arreglo → mezcla → exportar. Sin plantillas que dependan de muestras falsas o faltantes. Los controles del SMK-37 se mapean a acciones cuando sus bytes reales se hayan visto o mediante MIDI Learn.

## Criterios de arquitectura antes de avanzar a funciones avanzadas

- Una nota grabada puede editarse, sonar y exportarse con la misma posición y velocidad tras guardar/recargar.
- Loop, overdub, seek, mute y cambio de escena no dejan voces colgadas ni cortan una tecla física sostenida.
- Reproducir el beat mientras se tocan 37 notas no crea otra sesión de audio ni satura la salida.
- Un proyecto sin muestras o con almacenamiento lleno muestra estado recuperable, no un silencio inexplicable.
- Build de producción, prueba del SMK-37 físico, export WAV y retorno de proyecto portable tienen evidencia separada.
