# Requirements — SMK-37 y confiabilidad del Studio

Estado: especificación de trabajo, 2026-10-31. Modelo físico presente: M-VAVE SMK-37 Elite por USB. El perfil Pro debe funcionar con la misma arquitectura, pero su mapa concreto necesita captura física. Esta spec no reemplaza `.kiro/specs/refactor-and-improve/` ni autoriza alterar catálogos.

## Objetivo y definición de terminado

El Studio debe responder a cada mensaje MIDI recibido sin perder ni dejar pegadas notas, producir audio estable y expresivo, y mantener teclado, notas que caen, juego y transporte en el mismo tiempo musical. Los controles del SMK-37 deben operar una función de la app cuando emitan un mensaje identificable o se les asigne una mediante MIDI Learn. Una función autónoma del firmware se presenta como tal: la app no mostrará un estado físico que no puede observar.

Cada criterio se cierra con evidencia: prueba automatizada, medición reproducible y, donde aplique, captura/escucha en el Elite real. `tsc` limpio o un botón iluminado por sí solos no demuestran audio correcto.

## R-01 — Identidad, puertos y entrada genérica

1. WHEN Web MIDI enumere varios puertos de un mismo SMK-37 THEN la UI mostrará nombre de entrada y función comprobada; no elegirá un puerto por orden de enumeración como prueba de que es el teclado.
2. WHEN se seleccione una entrada THEN notas y controles conservarán `input.id`, canal MIDI, nota/control, valor y `timeStamp` hasta el enrutador. `Todas` no duplicará ataques si dos puertos reflejan el mismo evento; el usuario podrá escoger puerto explícitamente.
3. WHEN cambie, se desconecte o se pierda una entrada THEN se liberarán únicamente sus voces y pedales, sin dejar notas colgadas ni cortar otra entrada.
4. WHEN se reciba Note On con velocidad cero THEN se interpretará como Note Off. Mensajes de 1, 2 y 3 bytes se clasificarán según MIDI; los no soportados se registrarán en diagnóstico sin alterar notas.
5. WHEN se conecte un controlador no SMK-37 THEN funcionarán notas, velocidad, bend, CC64 y MIDI Learn sin depender del nombre del fabricante.
6. El rango de 37 teclas y su transposición serán explícitos. `Anclaje` debe modificar el cálculo si se ofrece; el preset genérico no transpondrá silenciosamente según la posición visual.

## R-02 — Perfil Elite/Pro y controles físicos

1. El perfil distinguirá `SMK-37 Elite`, `SMK-37 Pro` y `Genérico`; la selección manual prevalecerá cuando la identificación Web MIDI sea ambigua.
2. El monitor local mostrará bytes hexadecimales, tipo, puerto, canal, valor y tiempo de los eventos al pulsar: teclas, Pitch, MOD, pedal, K1–K8 y K9–K16, faders 1–4 y 5–8, pads 1–16 y 17–32, bancos, flechas, transporte, ARP, Repeat, Scale, Chord, SEQ PLAY y SEQ REC.
3. Las asignaciones de encoders, faders, pads y transporte se aprenderán desde el mensaje real y se guardarán por perfil/puerto. Se podrán ver, cambiar, desactivar, restablecer y resolver colisiones de asignaciones. Nunca se fijarán números CC por intuición.
4. La app distinguirá teclas de pads por puerto/canal/asignación capturada. Un pad de batería no disparará el piano salvo asignación explícita. Poly/Channel Aftertouch podrá modular la voz o una acción aprendida sin convertirse en Note On.
5. Pitch wheel modificará también voces sostenidas y regresará al centro sin deriva. MOD CC1 hará modulación audible por defecto en el perfil musical; mover la ventana del teclado será una acción distinta y configurable.
6. ARP, Note Repeat, Scale, Chord y el secuenciador físico podrán transformar/generar notas autónomamente. La app reproducirá las notas que recibe; sólo declarará el estado de un modo o responderá a sus botones cuando una captura demuestre un mensaje observable. `SEQ REC` del hardware y `Grabar en la app` tendrán nombres y estados separados.
7. MIDI Out, MMC y SysEx serán optativos, con permisos separados y sin eco de notas por defecto. No se enviarán comandos propietarios no documentados.

## R-03 — Expresión y pedales

1. Velocidad 1–127 tendrá respuesta monótona y configurable por dispositivo; la calibración guardará origen/fecha y se podrá restablecer. La autocalibración no reinterpretará bruscamente las primeras notas de una interpretación.
2. CC7 y CC11 entrantes cambiarán de forma suave la ganancia de una nota ya sostenida; el valor se mantendrá por canal/origen. La reproducción de MIDI respetará controles en el tiempo cuando se habilite fidelidad MIDI, preservando un modo compatible de balance para material antiguo.
3. CC64 del hardware, botón en pantalla y barra espaciadora usarán un solo estado de pedal por origen y un solo contrato de voz. `Sustain (Tiempo de Liberación)` se etiquetará como release y no como pedal.
4. Una ráfaga Note On → pedal abajo → Note Off → pedal arriba, sin render React entre mensajes, terminará con cero voces pegadas. Bend → Note On y pedal abajo → Note Off usarán inmediatamente el nuevo valor.
5. Sostenuto retendrá sólo las teclas que estaban presionadas al activarse; half-pedal tendrá una respuesta audible documentada en el sampler real; una corda tendrá un efecto audible y descripción honesta de su aproximación. Repetición de una misma nota y solapes no cortarán la voz equivocada.
6. All Notes Off/All Sound Off, cambio de dispositivo, pérdida de foco/sesión y dispose tendrán política explícita de liberación sin clics.

## R-04 — Audio, afinación y calidad

1. Cada ataque y liberación programados por `Tone.Transport.schedule` pasarán `audioTime` hasta el nodo que suena. Bajo canción densa más carga del hilo no habrá releases tardíos por usar `now`, ni avisos de Tone sobre eventos dentro de callbacks sin tiempo.
2. Una voz de piano tendrá una ruta seca y un envío de efectos controlado. Agregar pistas o abrir partitura no incrementará el nivel de la misma nota en vivo ni creará conexiones huérfanas.
3. Voz en vivo y voz de canción tendrán propiedad independiente: pausar, buscar o parar la canción no cortará teclas físicas sostenidas; cerrar/silenciar todo sí apagará ambas.
4. Partitura MusicXML, MIDI importado y piano en vivo tendrán contratos coherentes de ganancia, duración, pedal y Note Off. Cada ataque tendrá un único dueño de su liberación.
5. La afinación se verificará por frecuencia de notas de referencia y por centro/rango del pitch bend. Se documentará la transposición intencional. El diagnóstico distinguirá desafinación real de doble sonido del FM interno o de dos puertos.
6. El piano estará tocable durante la carga con cobertura de muestras definida y carga priorizada/acotada; fallas de red se mostrarán como fallas reales con reintento. No se anunciará un sintetizador de respaldo inexistente. Las capas de velocidad sólo se activarán tras verificar URL, licencia, tamaño, memoria, número de peticiones, dinámica y timbre; no descargar 480 archivos por adelantado.
7. El selector de latencia configurará de verdad la ventana del motor y mostrará la ventana efectiva y `baseLatency`/`outputLatency` disponibles, o se retirarán sus promesas numéricas. Cambiar modo/salida no dejará nodos viejos ni sonido mudo.
8. Entre pestañas del mismo origen sonará una sola sesión activa, incluyendo Studio en vivo y reproductor; la pestaña que cede apagará audio antes de confirmar cesión.
9. WHEN se ataquen simultáneamente las 37 teclas del SMK-37, con y sin CC64 y un segundo acorde antes de levantar el pedal, THEN habrá 37 fuentes musicales por acorde y cero ataques descartados, el AudioContext seguirá activo y el sonido se recuperará después de soltar y volver a tocar. El motor impondrá un techo explícito de fuentes activas y en fade, sin bloqueo sostenido del hilo ni crecimiento tras ciclos repetidos. La prueba distinguirá construcción del grafo, límite de polifonía, muestras ausentes, salida saturada y Note Off perdido; un contador de `start` no demuestra por sí solo audio continuo.

## R-05 — Notas que caen, tiempo y rendimiento

1. Una nota se dibujará si `[inicio, fin]` intersecta la ventana visible, aunque otras notas con inicio posterior hayan terminado. El índice de ventana será correcto con notas largas/cortas solapadas.
2. A 0,5×, 1× y 2×, audio, línea de impacto, reloj, juego, seek y fin usarán el mismo tiempo de partitura. La ventana `lookAhead` se convertirá a ese tiempo con la tasa de reproducción efectiva.
3. Un mensaje MIDI de alta frecuencia no provocará un render de todo `App`. Sólo teclado/readouts necesarios se actualizarán; el audio se disparará antes del trabajo visual. La suscripción visual no mantendrá un rAF permanente por componente en reposo u oculto.
4. El canvas mantendrá un techo fijo de trabajo por frame y se medirá por separado de React; índice de onsets/juego, gradientes, partículas y asignaciones se optimizarán según perfil medido, no por suposición.
5. En pestaña oculta no habrá trabajo visual periódico; al regresar se mostrará el tiempo actual sin reproducir cuadros atrasados.

## R-06 — Grabación y transporte

1. `Grabar en la app` capturará Note On/Off, velocidad, pedal, CC7/CC11, pitch y aftertouch con tiempo monotónico, puerto/canal y tempo; Stop cerrará notas activas. El resultado se reproducirá y exportará como `.mid` válido.
2. Play/Pause/Stop/Record podrán asignarse mediante MIDI Learn a mensajes capturados, con protección frente a disparos dobles y conflicto con teclas/pads. El modo de grabación interno del Elite seguirá independiente.
3. Clock/Start/Continue/Stop se clasificarán correctamente; la sincronización externa sólo se habilitará si se prueba estabilidad de tempo, inicio, pausa, desconexión y ausencia de loops MIDI.

## R-07 — Evidencia y puertas de salida

1. Antes de optimizar se medirá una línea base de build de producción en el mismo equipo y escenario: evento MIDI → programación del audio, lead del scheduler, duraciones de React/canvas, frames, tareas largas, voces, picos/RMS y diferencias visual-audio. Dev y headless se etiquetarán como evidencias parciales.
2. Se reparará la sonda `verify-audio-glitches.spec.ts`; cero callbacks invalidará el ensayo. Pruebas de sustain medirán liberación/duración audible, no sólo número de ataques o clase CSS.
3. Las pruebas negativas incluirán ráfagas sin render, misma nota en dos canales/puertos, desconexión, 10 y 37 notas simultáneas con y sin pedal, repetición y recuperación después de Note Off, canción densa + scroll, cambio de canción, red de muestras fallida, 0,5×/2×, dos pestañas hermanas y salida FM interno/USB Audio.
4. La matriz física del Elite conectado registrará versión de firmware, USB/BLE, puerto por control, plantilla MidiSuite, salida de audio, `sampleRate`, latencias reportadas y resultado audible. Pro quedará marcado pendiente de hardware real donde no exista evidencia.
5. El cierre requerirá `tsc`, lint de archivos tocados, build de producción sin alterar catálogos ajenos, pruebas por archivo y la matriz física. Ningún check automático sustituye la escucha y pulsación del dispositivo.

## Fuentes de hardware

- Producto: https://www.m-vave.com/product?id=smk-37-pro
- Descargas: https://www.m-vave.com/download
- Manual de panel/bancos/SEQ: https://www.manualslib.com/manual/4132288/M-Vave-Smk-37-Pro.html?page=5
- Imagen del panel Elite con controles numerados: https://manuals.plus/ae/1005010347321509/images/Sb67e89af37414038bc96c17445ad9309I.jpg
- Manual ilustrado Elite (panel, página EN 02): https://manuals.plus/m/429b1ccce6a49ce721b72f2e4273ba886739413b86a651686edd4e25228c791b.pdf
- Firmware Elite: https://yms-file-store.oss-cn-hongkong.aliyuncs.com/software/firmware/SMK-37Elite/SMK-37%20Elite.txt
- Firmware Pro: https://yms-file-store.oss-cn-hongkong.aliyuncs.com/software/firmware/SMK-37Pro/SMK37Pro.txt
