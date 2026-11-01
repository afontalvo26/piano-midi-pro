# Beatmaker Studio — secuencia de implementación

Estado: plan; ninguna casilla implica implementación actual. Avanzar por cortes verticales que terminan en audio audible y proyecto reabrible.

Cada tarea se desglosa y acepta en el [módulo correspondiente](README.md); la matriz transversal de pruebas queda en [validation.md](validation.md).

## 0. Línea base y diseño detallado

- [ ] Medir build de producción: latencia MIDI→audio, CPU/frames, memoria, 37+37 con sustain, y tamaño/cuota de un proyecto con audio.
- [ ] Definir fixtures de beat de referencia y maqueta de Studio/Pistas a 1440 px y pantalla pequeña; probar el flujo con teclado, mouse y SMK-37.
- [ ] Fijar esquema versionado, reloj musical, propiedad de voces, presupuesto de muestras y contrato de exportación. Revisar que no reaparezcan módulos retirados.

## 1. Núcleo reproducible y primer beat completo

- [ ] Proyecto local versionado con guardar/reabrir/autoguardar, undo/redo y copia portable; preservar todas las tomas anteriores.
- [ ] Convertir una toma nueva desde el snapshot y una toma histórica mediante lector SMF validado; ambas producen patrones editables sin alterar el `.mid` original.
- [ ] Transporte de proyecto con metrónomo, count-in, loop, seek y un solo dueño de audio; separar voz live de voz secuenciada.
- [ ] Piano roll con edición exacta de notas, velocidad, selección múltiple, zoom, snap libre/configurable y cuantización reversible.
- [ ] Drum rack y step sequencer con kit básico local, pads, hi-hat choke y patrones de duración variable.
- [ ] Pistas de piano, drums y 808; sampler 808 monofónico afinable con glide.
- [ ] Arreglo de clips con duplicar, dividir, mover, hacer único y secciones; reproducir y editar una canción propia completa.
- [ ] Mezcla básica por pista y master; exportar WAV real, stems y MIDI. Reabrir el proyecto exportado y comparar su audio.

## 2. Producción completa

- [ ] Importar muestras personales con preview, hash, cuota y edición no destructiva; one-shot, loop, reverse, fades y slicing a pads.
- [ ] Grabar audio de entrada/micrófono con permiso, compensación de latencia, tomas separadas y comping básico.
- [ ] Overdub, replace, punch, escenas lanzables y grabar escenas al arreglo.
- [ ] Mixer con EQ, filtro, compresión, saturación, reverb/delay, buses, sends, sidechain y medidores reales.
- [ ] Automatización grabada/dibujada por clip, pista y master; conservar CC y presión MIDI.
- [ ] Groove/swing, ratchets, probabilidad, notas fantasma, escala, humanización reproducible y editor de eventos detallado.
- [ ] Browser de instrumentos/muestras por fuente, categoría, licencia y estado local/remoto; no cargar bibliotecas completas al inicio.

## 3. Endurecimiento y extensiones

- [ ] Pruebas de estrés con reproducción y 37+37 notas, loops continuos, dos pestañas, seek/stop, micrófono, permisos, muestras faltantes, cuota llena y actualización de service worker.
- [ ] Comparar señal/afinación/latencia exportada y en vivo; matriz física Elite, y Pro cuando haya dispositivo o captura verificable.
- [ ] Accesibilidad, atajos, rendimiento del piano roll/arreglo extensos, recuperación de sesiones y documentación de usuario.
- [ ] Evaluar por separado funciones opcionales: warping avanzado, MPE, nube/colaboración, plugins de escritorio y generación asistida.

## Puerta de aceptación del primer corte

Un proyecto nuevo crea un loop de cuatro compases con kick, snare, hi-hat, 808 y piano; edita al menos cinco notas individualmente; duplica y varía el loop; organiza intro/verso/hook; graba un overdub; guarda y recarga; reproduce sin notas pegadas; exporta WAV audible, stems y MIDI; restaura el paquete portable. Una toma MIDI anterior sigue visible y exportable. El test automático de 37+37 y la escucha con el SMK-37 físico se reportan por separado.
