# Beatmaker Studio — requisitos de producto

Estado: propuesta de alcance, 2026-11-01. Esta spec define la siguiente evolución; no afirma que estas funciones ya existan.

El contrato detallado se divide en [15 módulos independientes](README.md), cada uno con requisitos, diseño y tareas. La evaluación de fuentes reales está en [instrumentos-oficiales.md](instrumentos-oficiales.md).

## Meta

Una persona con un SMK-37 Elite/Pro debe poder crear un beat de hip hop completo dentro de Studio: grabar o dibujar batería, bajo 808 y melodía; editar cada nota; repetir patrones; organizar intro, verso y estribillo; mezclar; guardar; reabrir; y exportar audio terminado y datos editables. El flujo debe funcionar también con otro controlador MIDI o con mouse/teclado.

“Canción” en esta spec significa **proyecto propio creado o editado en Studio**. No recupera la antigua biblioteca de canciones MIDI, karaoke, Juego, Partitura, ni la app `player/`. Las tres secciones principales siguen siendo Studio, Pistas y Configuración. Pistas reúne proyectos propios y tomas MIDI propias, sin borrar las tomas actuales.

## Punto de partida comprobado

- `midi/recorder.ts` captura eventos y exporta un archivo MIDI tipo 1. Conserva Note On/Off, velocidad, CC, bend, presión, programa y cambios de tempo.
- `midi/recordingLibrary.ts` guarda bytes `.mid` y metadatos en IndexedDB; `RecordedTracks.tsx` lista, renombra, exporta y borra tomas. No guarda un modelo de proyecto editable.
- `audio/liveStudioEngine.ts` toca en vivo, pads y metrónomo. No hay transporte de proyecto, clips ni reproducción/mezcla de pistas compuestas.
- `PianoApp.tsx` concentra Studio y su grabadora. El piano conserva el contrato de 37 teclas, expresión y un solo dueño de audio entre pestañas.

## Requisitos funcionales

### BM-01 — Proyecto y persistencia

1. Un proyecto tiene nombre, versión de esquema, BPM, compás, pistas, instrumentos, patrones, clips, arreglo, automatizaciones, mezcla y referencias a muestras. Los objetos editables usan identificadores estables.
2. Guardar y reabrir restituye notas, microdesplazamientos, velocidades, CC, clips, buses, parámetros y referencias de muestras sin convertir el proyecto en un `.mid` plano. Hay autoguardado, indicador de cambios pendientes, Deshacer/Rehacer y copia de seguridad portable.
3. Las tomas MIDI existentes permanecen intactas. Como sólo guardan bytes `.mid` y un resumen, una acción explícita **Usar toma en proyecto** analiza y valida el archivo MIDI, copia sus notas/controles a un patrón y conserva el original exportable. Una conversión fallida no modifica ni borra la toma. Las migraciones de base de datos son transaccionales y recuperables.
4. El proyecto detecta archivos de audio ausentes o cuota insuficiente y permite relocalizar/exportar; nunca guarda un proyecto que aparenta estar completo si perdió muestras.

### BM-02 — Tiempo, transporte y loops

1. Hay un único reloj musical para Play/Pause/Stop, posición, BPM, compás, metrónomo, count-in, loop de rango y salto de compás. El audio se programa contra el reloj del `AudioContext`, no contra los repintados de React.
2. Un patrón de 1, 2, 4, 8 o más compases puede repetirse sin huecos, dobles ataques, notas eternas ni acumulación de voces. El rango del loop puede moverse y cambiar de longitud.
3. Cambiar BPM, buscar, pausar, mutear o cambiar de clip libera sólo las voces del transporte afectadas. Las teclas físicas que el músico mantiene pulsadas siguen siendo independientes.
4. La app muestra y permite medir compensación de latencia de grabación; no promete latencia nula.

### BM-03 — Grabación MIDI y audio

1. Se puede armar una pista y grabar una toma nueva, overdub, reemplazo o punch-in/out, con preconteo. La grabación original queda disponible tras cuantizar o corregir errores.
2. Cada golpe conserva nota de origen, nota interpretada, inicio, fin, velocidad, canal, controlador y expresión soportada. Note Off, sustain y repeticiones se emparejan sin cortar otra voz.
3. Se puede grabar audio de micrófono/entrada disponible con permiso explícito, escuchar con monitor configurable y conservar tomas separadas para comping. La grabación de audio requiere medición de latencia y política contra realimentación.
4. La captura de audio interno/resampling crea un clip nuevo con referencia a su fuente y parámetros; el material original no se destruye.

### BM-04 — Piano roll completo

1. Crear, seleccionar, escuchar, mover, copiar, pegar, duplicar, silenciar, borrar, dividir y estirar una o varias notas; modificar tono, inicio, duración y velocidad con mouse, teclado y valores numéricos exactos.
2. Zoom horizontal/vertical, navegación por compases, snap configurable o libre, rejillas hasta 1/64 y tresillos, resaltado de escala, notas fantasma de otras pistas y carriles de velocidad/CC. El editor de batería muestra nombres de pads.
3. Cuantización destructiva o no destructiva con fuerza y swing, desplazamiento fino, humanización con semilla reproducible y restauración de la interpretación original. Una edición no cambia notas ajenas.
4. Editar release velocity, probabilidad, repeticiones/ratchets y expresión cuando el instrumento las soporte. El bend MIDI 1.0 se presenta por canal; expresión independiente de notas simultáneas requiere un modo compatible, no se simula falsamente.

### BM-05 — Batería y programación de beats

1. Drum rack con pads asignables (al menos 16 visibles y bancos), muestra por pad, afinación, volumen, panorámica, envolvente, one-shot/gate, choke groups para hi-hats y preescucha. Los pads SMK-37 usan MIDI Learn y el mapa físico sólo se declara verificado tras captura real.
2. Secuenciador de pasos por patrón con longitud variable, pasos por pista, acento/velocidad, swing, probabilidad y subdivisión/ratchet para hi-hats. Cada paso puede abrirse en piano roll sin perder detalle.
3. Presets iniciales de kick, snare, clap, closed/open hat y percusión con procedencia/licencias reales; no depender de descargas silenciosas para el kit mínimo.

### BM-06 — Sampler, 808 e instrumentos

1. Importar muestras personales de audio con validación de formato/tamaño, preescucha y análisis fuera del hilo visual. Editar inicio/fin, fades, reverse, pitch/root note y loop de modo no destructivo.
2. Cortar breaks por transientes o manualmente, mapear cortes a pads, sincronizar loops al tempo y ofrecer modos de repitch frente a time-stretch con indicación de calidad/costo.
3. Instrumento 808/bajo monofónico con afinación, glide/portamento, envolvente y choke/voice policy explícitos. La afinación se mide; los cambios de nota no generan clics.
4. Selector por familias y motores para pianos, bajos, baterías y otros instrumentos realmente instalados o descargables. Una pista recuerda su instrumento y preset; cambiar otra pista no cambia las voces de ésta.

### BM-07 — Arreglo de canción propia

1. Los patrones/loops se colocan como clips en una línea de tiempo con compases, pistas, secciones (intro, verso, hook, puente, outro), duplicación, división, recorte, desplazamiento, mute y edición de instancia o de fuente claramente diferenciadas.
2. Un lanzador de escenas permite probar combinaciones de loops y pasar una actuación al arreglo. En cada pista manda el lanzador o el arreglo, nunca ambos a la vez por accidente.
3. Pistas MIDI, drum, audio y buses tienen identidad estable; cada clip sabe qué pista, instrumento y versión de patrón reproduce. Cambios de tempo/compás no alteran irreversiblemente las posiciones originales.

### BM-08 — Mezcla y efectos

1. Mixer por pista con volumen, pan, mute, solo, arm, medidores pico/RMS y margen de cabeza; buses, sends y master. Las rutas no permiten realimentación accidental.
2. EQ, filtro, compresor, saturación/clipper, reverb, delay y limitador con parámetros editables, bypass y orden de cadena. Sidechain de kick a 808/bajo disponible cuando el motor pueda medirlo y reproducirlo de forma estable.
3. Cambios de ganancia no producen clics ni saturación oculta; la salida de dos acordes de 37 notas conserva el contrato de polifonía y recuperación.

### BM-09 — Automatización y expresión

1. Faders, perillas y controles aprendidos pueden grabar y editar automatización de volumen, pan, envíos, efectos y parámetros compatibles. Las curvas se dibujan, mueven, copian y reproducen de forma determinista.
2. CC1/7/11, pedales, bend y presión de la interpretación se conservan y se distinguen de la automatización de mezcla. El alcance de cada curva (nota, clip, pista o master) es visible.

### BM-10 — Entrega y portabilidad

1. Exportar WAV estéreo de la mezcla y stems por pista/bus con cola de reverb incluida según opción, margen de seguridad y ausencia de clipping. Exportar `.mid` de patrones/arreglo y paquete de proyecto con muestras/atribuciones.
2. El audio exportado se renderiza desde el mismo estado musical que suena en Studio; no se ofrece un “WAV” vacío o una grabación de micrófono del altavoz. Al reabrir un paquete portable no faltan fuentes incluidas.
3. Pistas conserva la exportación de las tomas originales y ofrece abrir los proyectos propios. No reaparece un reproductor de catálogo.

### BM-11 — Controlador, UX y accesibilidad

1. SMK-37 Elite/Pro: teclado, pads, perillas, faders, flechas, transporte y bancos asignables por MIDI Learn. El botón `SEQ REC` físico y `Grabar en Studio` muestran estados separados hasta que se haya observado un mensaje que los vincule.
2. Studio ofrece espacios de trabajo compactos: Pads/Pasos, Piano roll, Arreglo, Sampler y Mixer, con transporte y navegador de proyecto persistentes. Pistas lista proyectos/tomas propias; Configuración conserva MIDI/audio/diagnóstico.
3. Atajos visibles, foco de teclado correcto, zoom, contraste, etiquetas accesibles, operaciones reversibles y feedback claro de carga, error, guardado y clipping. En pantalla pequeña se edita por paneles, sin montar miles de notas en el DOM.

### BM-12 — Fiabilidad y límites

1. La prueba de aceptación construye un beat con kick/snare/hats, 808 y piano, edita cinco golpes, duplica loops, arregla tres secciones, guarda, recarga y obtiene el mismo audio y datos.
2. 37 teclas simultáneas, dos acordes con sustain, pads y reproducción de loops no bloquean el `AudioContext`, no pierden Note Off y vuelven a sonar después de Stop/Seek/Loop. Sólo una pestaña posee salida audible.
3. Ediciones largas se serializan sin congelar la UI; muestras grandes se cargan bajo demanda con límites explícitos de memoria, almacenamiento y voces. Se mide el build de producción y la salida física, además de pruebas simuladas.
4. Se prueban fallos de permisos MIDI/micrófono, muestra ausente, cuota llena, cierre durante autoguardado, reconexión de dispositivo y actualización del service worker sin pérdida de tomas/proyectos.

## Funciones de fase avanzada (después del circuito completo)

Comping detallado, warping avanzado con marcadores, polirritmias, MPE, macros/moduladores, exportación FLAC/MP3 si hay codificador legítimo, colaboración y nube, compatibilidad con plugins de escritorio y herramientas generativas. Ninguna es requisito para afirmar que la primera estación de beats está completa; se incorpora sólo con contrato, fuente, pruebas y presupuesto de CPU/almacenamiento propios.

## Referencias de diseño verificadas

- [FL Studio: Piano roll](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm), [Channel Rack](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/channelrack.htm), [Playlist](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/playlist.htm) y [grabación](https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/recording.htm).
- [Ableton Live: editor MIDI](https://www.ableton.com/en/manual/editing-midi/), [Drum Rack](https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/), [grooves](https://www.ableton.com/en/manual/using-grooves/) y [comping](https://www.ableton.com/en/live-manual/12/comping/).
- [Bitwig: arreglo y Clip Launcher](https://www.bitwig.com/userguide/latest/one_daw_two_sequencers/).
