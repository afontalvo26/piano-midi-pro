# Design — SMK-37 y confiabilidad del Studio

Estado: diseño para implementación incremental. Fuente de verdad: `requirements.md`. La rama actual `feat/reproductor-instrumentos-reales` contiene cambios ajenos, especialmente en `App.tsx` y catálogos. Se preservan y se edita por hunks pequeños con un solo escritor por archivo.

## Introspección del diagnóstico inicial

El primer diagnóstico acertó en la falta de mapeo, el release tardío y el render por nota, pero faltaban estas fronteras importantes:

1. **Firmware y audio físico.** El Elite USB está conectado y expone tres puertos MIDI y USB Audio. Las notas oficiales V016 mencionan latencia de teclas, tempo y pitch. El FM interno, la salida USB, FxSound/VB-Cable y dos puertos que reflejen la misma nota pueden crear doble sonido o latencia sin que el sampler web sea la única causa. Son hipótesis hasta captura A/B.
2. **Mensajes demasiado próximos para React.** CC64/bend/rango se escriben en state React y la nota siguiente lee `stateRef` del render anterior. Eso puede soltar, sostener o afinar mal una nota incluso con audio rápido.
3. **Notas visuales largas.** La búsqueda binaria actual usa tiempos de fin sobre una lista ordenada por tiempos de inicio. Puede omitir intervalos válidos.
4. **Velocidad de reproducción.** `song.bpm` agenda la partitura, pero el transporte usa `song.bpm * playbackRate`; convertir ticks con BPM efectivo confunde segundos musicales con segundos reales.
5. **Tres rutas de piano.** MIDI en vivo, archivo MIDI y MusicXML no comparten dueño de voz/ganancia/pedal. La partitura usa `triggerAttackRelease` y otro Note Off.
6. **Promesas de UI.** Ultra/Balanceado no llegan a `configureAudioTiming`; un mensaje de error anuncia un FM fallback eliminado; el botón SEQ REC pertenece al secuenciador físico salvo que se observe mensaje hacia host.
7. **Pruebas ciegas.** La sonda de glitches inyecta sintaxis TypeScript inválida en navegador y obtiene cero callbacks; la prueba verde de 40 notas sólo cuenta ataques.
8. **Propiedad entre pestañas.** El reproductor tenía coordinación por `BroadcastChannel`, pero el Studio en vivo no adquiría ni cedía el audio. Ambos motores necesitan propietarios locales separados; un `releaseAudio()` del reproductor no puede soltar el bloqueo mientras una tecla del Studio sigue sonando.
9. **Distribución de muestras.** El mapa de 2.112 archivos locales quedó apuntando a sufijos `.part`; 85 rutas contienen `#` literal en notas sostenidas. El navegador corta esa URL como fragmento y Vite responde HTML en lugar del WAV. El inventario de muestras y el código de descargas también requieren pruebas de URL/bytes, no sólo comprobar que el archivo exista.
10. **GM1 frente a GM2.** Un catálogo puede usar percusión extendida: 80/81 tienen triángulos diferenciados y 87 es surdo abierto. El manifiesto GM1 no cubre esas notas; atribuir el silencio al motor de piano sería un diagnóstico equivocado.
11. **Sondas que cuentan ruido como música.** Tres `AudioBufferSource.start(0)` de Tone crean constantes o comprueban compatibilidad al iniciar Reverb/Chorus. Sus 690–781 ms «tardíos» no son ataques de canción. La sonda ahora separa contexto/stack/callback y exige avance de partitura antes de comparar.
12. **Propiedad de la voz de canción.** Una nota sin muestra se contabilizaba como voz y podía robar una audible al llegar al tope de 32. El robo liberaba el sampler de piano aun cuando la nota robada era de otro instrumento. La fuente elegida se guarda en el ataque y se usa en Note Off y robo; una nota sin fuente no cuenta como tocada.
13. **Eventos repetidos y pérdida de foco.** Un binding de pad podía producir dos Note On iguales antes del primer Note Off; una sola casilla de consumo perdía el emparejamiento. El navegador puede omitir `keyup` al perder foco y dejar Space/Shift/Control y una tecla de computadora sostenidos. Se requieren colas por nota y liberación específica del teclado al desenfocar, sin cortar MIDI físico.
14. **Espejos MIDI ambiguos.** Bytes iguales en dos puertos dentro de 3 ms pueden ser un espejo o dos golpes legítimos. El monitor sólo ofrece una pista; descartar automáticamente una nota por esa coincidencia viola la integridad musical. `Todos los puertos` queda como diagnóstico hasta capturar roles físicos; la interpretación normal debe elegir entrada concreta.
15. **Límites internos de la captura.** Un registro MIDI acotado también debe acotar los Note Off sintéticos al detener y fallar explícitamente al exportar si se desbordó. Asignaciones antiguas conflictivas cargadas de almacenamiento no pueden disparar dos acciones. El pitch absoluto tiene centro en 64, no un rango negativo que rompa faders.
16. **Valor inicial de half pedal en partitura.** `pianoHalfPedal` arrancaba en 1,0. Antes no actuaba sobre el sampler real, pero al conectar una aproximación de duración ese valor alargaría todas las notas 2,5× aun con el pedal arriba. El estado inicial debe ser cero y la prueba debe comprobarlo junto al pedal activado.
17. **Polifonía máxima del controlador real.** La prueba previa de diez notas no cubre las 37 teclas físicas. El límite de 56 voces activas no descarta por sí mismo un acorde de 37, pero cada ataque crea fuente, filtro, ganancia y Vibrato con delay/LFO incluso con MOD=0; además, la autocalibración actualiza estado global cada ocho golpes. Ambas cargas pueden acumularse antes de que suene la última tecla. Se requiere un ensayo de ráfaga de 37, liberación y recuperación, más A/B con una ruta de voz menos costosa antes de atribuir la falla.

## Fronteras y flujo

```text
SMK-37 Elite/Pro u otro MIDI
  └─ Web MIDI: input.id + canal + bytes + timeStamp
       └─ MidiConnectionOwner (una instancia; detecta desconexión)
            └─ parseMidiMessage (puro, todas las longitudes)
                 ├─ Monitor local / MIDI Learn / perfil persistido
                 ├─ Acciones de Studio y transporte (sólo binding observado)
                 ├─ Grabador de la app (eventos crudos + tiempo monotónico)
                 └─ LiveVoiceController (origen, canal, instancia)
                      ├─ Pedales y expresión síncronos
                      ├─ Motor piano / pads
                      └─ Estado visual pequeño (store por evento)

Archivo MIDI / MusicXML
  └─ scheduler en ticks musicales
       ├─ voz de canción, audioTime en attack y release
       └─ mismo reloj musical para canvas/juego/seek/fin

Ambas rutas de audio → buses independientes → master/efectos con ganancia medida
```

## Contratos de módulos

### MIDI

`app/src/midi/message.ts` expone un discriminated union de NoteOn, NoteOff, CC, PitchBend, PolyPressure, ChannelPressure, ProgramChange, Clock, Start, Continue, Stop, SysEx y Unknown. El parser recibe `Uint8Array`, `inputId` y `timeStamp`, valida longitudes y no toca React/Tone. El status alto separa tipo y canal, sin descartar mensajes de uno o dos bytes. Note On velocity 0 normaliza a NoteOff.

`app/src/midi/profile.ts` describe identidad por nombres Web MIDI observables, elección manual, bindings por puerto/canal/status/data1/banco y acciones semánticas. Un binding no consume Note On musical salvo que se indique. Configuración por dispositivo se versiona en localStorage y valida al cargar. Presets Pro/Elite contienen únicamente controles documentados y mapeos **capturados**; nunca CC numéricos inferidos del manual. `Genérico` habilita notas, bend, pedal y MIDI Learn.

`app/src/midi/diagnostics.ts` conserva un ring buffer acotado de eventos recientes (sin fondo periódico ni exportación automática). La UI muestra nombre/puerto/canal/raw hex/valor/tiempo. Cada puerto del Elite se prueba individualmente y se marca función observada, no supuesta. Un marcador de duplicados compara eventos cercanos entre puertos para diagnóstico; no elimina automáticamente golpes humanos legítimos.

`MidiConnectionOwner` mantiene una sola suscripción por entrada y libere voces por `inputId` al desconectar. La identidad de voz es `{inputId, channel, originalNote, attackId}`; la nota mapeada se almacena en el ataque para que cambiar rango no cambie el Note Off. Hay conteos o instancias para Note On repetidos del mismo pitch. `__all__` exige ruta de deduplicación probada o queda como modo diagnóstico explícito.

### Estado caliente, audio y pedales

Un controlador imperativo actualiza refs de bend, pedal, CC7/11 y teclas físicas **antes** de publicar React. La UI sólo refleja el último snapshot. Por ejemplo, `CC64=127` y `NoteOff` dentro de la misma tarea deben consultar el pedal actualizado. Al soltar el pedal, se comparan notas físicas actuales, no `stateRef.midiNotes` retrasado.

El `LiveVoiceController` posee voz por instancia y una ganancia por voz o por canal que puede cambiar con CC7/11/aftertouch. El pitch de voces activas requiere reproducción a tasa variable o un motor con `detune` por voz; una frecuencia cambiada sólo en `triggerAttack` no cumple R-02. Si Tone.Sampler no expone retune sin reiniciar, se documenta y se cambia la abstracción antes de afirmar que bend sostenido funciona.

Sustain es un estado funcional (pedal abajo o valor continuo); `release` es duración de cola del sampler. Half-pedal no se simula únicamente tocando un `PolySynth` inactivo. Sostenuto captura el conjunto de teclas físicas en el instante de activación. Una corda se describe como atenuación/filtro/capa según la fuente real que exista. La UI, barra espaciadora y CC64 invocan la misma API, con origen explícito para evitar que soltar un pedal anule otro aún presionado.

El piano en vivo y de canción poseen buses/voz independientes; ambos pueden compartir buffers decodificados, pero no un `releaseAll()` que corte el otro. `PianoEngine` no conectará repetidamente un sampler global a cada reverb. Cada nodo se conecta una vez, tiene dueño y se dispone al cambiar modo/canción. Se mide nivel antes/después del limitador para detectar rutas duplicadas y bombeo.

La partitura MusicXML usa un solo contrato para duración: o ataque y release programados, o `triggerAttackRelease` autónomo, nunca ambos. Debe respetar `noteGainValue`, CC7/11 y groove en la misma política que MIDI importado. Los CC continuos se automatizan en bus/canal, no se muestrean sólo al inicio de cada nota.

### Tiempo y canvas

Se distinguen tres relojes: `event.timeStamp` (DOM), `AudioContext.currentTime` (audio) y `Transport.ticks` (musical). `song.bpm` convierte ticks a segundos de partitura; `song.bpm * playbackRate` determina el ritmo de avance real. El `lookAhead` expresado en segundos reales se convierte a ticks usando el BPM efectivo, antes de restarse del playhead musical. Seek realiza la conversión inversa. Juego, falling notes, reloj y fin leen el mismo `heardScoreSeconds`, sin fórmulas duplicadas.

Para el viewport de notas, se indexa una lista ordenada por `start` con `prefixMaxEnd` monótono. La primera nota potencialmente visible se busca sobre ese prefijo; la última, por `start <= viewportEnd`. Sólo se dibujan intervalos cuyo `end >= viewportStart`. Así una nota larga anterior no desaparece por notas cortas posteriores. El índice se crea al cargar canción y se reconstruye al cambiarla, no por frame.

La ruta MIDI caliente publica snapshots pequeños de teclado/readouts sin `setState` del `App` entero por nota. Un store de suscripción agrupada por rAF se activa con cambios y cancela trabajo en reposo u oculto; el audio se programa sin esperar pintura. Canvas precomputa teclas/gradientes cuando dependen de geometría o estilo, y mantiene un presupuesto por frame según medición. Las búsquedas de onsets y juicio de juego se indexan por tiempo si los perfiles muestran costo relevante.

### Calidad y latencia

El piano actual usa siete muestras centrales de Salamander para cubrir C3–C6 con repitch máximo de ±6 semitonos y carga el resto con tres trabajadores como máximo. La UI muestra cobertura visible, fallo y reintento. El arranque en frío de una nota se mide por separado; una prueba headless rápida no demuestra la latencia con red lenta o dispositivo USB real. No se descargará el piano de 16 capas completo al iniciar. `VelocityPiano` sólo puede integrarse después de verificar que los archivos existen, son reproducibles y la capa fallida no aparece como cargada; el velocity crudo elige timbre y la curva de ganancia elige nivel, sin mezclar ambos conceptos.

El mapa local de instrumentos sólo se usa si su URL es servible; para las rutas existentes con `#` se usa provisionalmente la fuente remota, comprobada con el diagnóstico de canción densa. El descargador nuevo finaliza `.part` y reemplaza `#` por un nombre seguro, pero el conjunto local anterior no se renombra sin auditoría de bytes. Las notas GM 80/81 usan muestras de triángulo VSCO-2 CE ya inventariadas. La 87 se registra como pendiente de una muestra de surdo abierto con fuente/licencia comprobadas, sin sustituirla por otro instrumento bajo el mismo nombre.

El selector de modo tendrá parámetros efectivos explícitos (ventana y ticker), indicará lo que el motor reporta y no llamará `dispose` parcial. `baseLatency`/`outputLatency` y endpoint son diagnóstico; latencia acústica se mide físicamente. La ruta en vivo usa el reloj de audio para programar, pero retroceder un timestamp no convierte en puntual un mensaje que llegó tarde por USB/BLE/firmware/Windows.

### Grabación

La grabación de la app mantiene un log monotónico y acotado de eventos normalizados, conserva mensajes originales relevantes y tiempo relativo al inicio. Al detener, cierra notas activas y genera MIDI tipo 1 con tempo y canales. Exportación y reimportación deben conservar notas, velocity, pedal, bend y duración dentro de la resolución de ticks. El secuenciador interno del Elite puede seguir sonando y enviar notas, pero su botón `SEQ REC` sólo acciona esta grabación si existe un binding verificado.

## Medición y diagnóstico

El escenario base usa un build actual de `app/`, navegador Chromium con el Elite USB, misma salida y misma canción densa. Se registra: modelo/firmware, puerto, endpoint, sampleRate, `baseLatency`, `outputLatency`, evento→ataque, `Transport` lead, Note Off programado→release, conteo de voces, RMS/peak pre/post limiter, tareas largas, React commit, canvas frame y diferencia nota visible/audio. Se repite con scroll/carga y 0,5×/1×/2×. Se documentan condiciones para comparación antes/después; no se mezclan dev, headless, USB y BLE como si fueran equivalentes.

La validación física A/B escucha (a) FM interno solo, (b) web solo, (c) ambos, además de PC speakers vs Elite USB Audio. Se verifica A4 por frecuencia, bend centro/extremos y si dos puertos emiten la misma nota. Esto separa causa de firmware, ruta física y app. No se actualiza firmware automáticamente.

La sonda `verify-audio-glitches.spec.ts` usa `window.__PMP_TRANSPORT__` publicado sólo en desarrollo. Tras repararla sirve para el scheduler en dev. La medición de producción requiere instrumentar fuentes nativas antes del arranque y observar tareas largas/React/canvas por separado. Las cifras dev y producción no se mezclan.

## Decisiones y límites

- El Elite conectado es la primera matriz física. El Pro tendrá perfil preparado y pruebas de contrato, pero no recibirá etiqueta `validado físicamente` sin un Pro.
- Las funciones autónomas del dispositivo no tienen estado observable garantizado en Web MIDI. La UI no inventará eventos de banco/SEQ/ARP.
- SysEx y MIDI Out requieren permiso y elección explícitos; no hay envío por defecto que pudiera crear feedback o alterar presets.
- La meta incluye grabar en la app. La exportación de audio WAV/MP3 del `REQUIREMENTS.md` anterior es otra capacidad; se registra fuera de esta spec porque no fue parte del reporte de SMK-37 ni de la secuencia MIDI pedida.
- La suite completa de e2e se ejecuta sólo al cerrar una tanda transversal y con runner acotado. El catálogo y archivos de canciones pertenecen al usuario; no se limpian ni regeneran inadvertidamente. El wrapper `build-catalog-artifacts.mjs --check` actualmente ejecuta un generador que escribe el JSON; se usa `check-catalog-sync.mjs` para verificación de sólo lectura y `npx vite build` directo.
- Los controles de expresión MIDI en vivo tienen voz por instancia, pero los CC continuos del archivo importado y el pedal de MusicXML siguen siendo una frontera separada; las pruebas actuales no autorizan declararlos equivalentes.
- La cesión entre pestañas se comprueba con fuentes Web Audio y pestañas hermanas; las pruebas sin captura física no demuestran exclusión acústica de la salida FM/USB del controlador.
