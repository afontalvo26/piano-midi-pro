# Beatmaker Studio — contratos comunes v1

Estado: fijados para la primera implementación, 2026-11-01. Este documento
prevalece sobre propuestas de diseño de los módulos cuando difieren. Cambiar
un contrato exige actualizar a la vez sus consumidores y sus pruebas.

## 1. Tiempo musical

- `PROJECT_PPQ = 960` ticks enteros por negra en el documento v1. Posiciones y
  duraciones se guardan como enteros seguros; una nota dura al menos un tick.
  Píxeles, milisegundos y segundos nunca son el dato editable canónico.
- `tempoMap` y `meterMap` están ordenados por tick, sin ticks repetidos y con
  primer punto en tick 0. Tempo se representa como microsegundos enteros por
  negra; el compás usa numerador positivo y denominador potencia de dos.
  La conversión tick↔segundo integra segmentos de tempo. El redondeo a tick
  sólo se hace en la frontera de captura/edición, con política explícita.
- El SMF existente usa 480 PPQ. Sus ticks se duplican exactamente al crear
  patrón de proyecto; los bytes originales nunca se reescriben. Un SMF con
  otra resolución conserva `sourcePpq` y `sourceTick`; cualquier redondeo a
  960 queda en el informe de conversión, nunca se presenta como exacto.
- Los rangos musicales son semiabiertos `[startTick, endTick)`. Cada loop tiene
  `iteration` y `epoch`; un ataque en `endTick` pertenece sólo a la vuelta
  siguiente. Un clip declara si corta o deja continuar las colas al repetir.

## 2. Eventos y expresión

- `midi/message.ts` conserva el evento crudo con bytes, puerto, canal y marca
  de tiempo del navegador. Una envoltura derivada agrega `eventId`,
  `sourceKind`, `ownerId`, `trackId` opcional, `tick`, `epoch` y `audioTime` sólo
  al programar. El mapeo de nota conserva `sourcePitch` si se observó y
  `playedPitch`; una toma histórica sin nota física conocida deja
  `sourcePitch` desconocido.
- Una nota editable tiene ID estable, `startTick`, `durationTick`, `pitch`,
  `velocity` 1–127, `releaseVelocity` 0–127, canal 0–15 y origen. Sus CC,
  presión y bend son eventos con ID/tick/canal propios. Bend MIDI 1.0 es por
  canal; no se atribuye expresión independiente a notas simultáneas sin modo
  compatible. La automatización de mezcla usa parámetros tipados separados.
- Campos de edición musical opcionales y versionados: `microOffsetTick`
  entero con inicio efectivo no negativo, `probability` en `[0,1]`,
  `ratchetCount` entero positivo y `stepId` estable cuando proviene de una
  cuadrícula. Batería proyecta estos campos desde la misma nota, sin guardar
  una lista paralela de pasos.
- Para un mismo tick se aplica orden estable: configuración y controladores,
  Note Off, Note On, y por último secuencia original dentro de cada grupo.
  Note Off del secuenciador referencia la pulsación concreta, no sólo pitch.
  Capture timestamp y velocity originales permanecen accesibles tras editar.

## 3. Audio y propiedad de voces

- Una sola pestaña posee un único grafo audible bajo `studioAudioLock`.
  `live`, `transport`, `preview`, `pads` y `metronome` tienen propietarios
  independientes. Transporte subdivide por proyecto/pista/clip/iteración/epoch;
  live subdivide por puerto/canal/pulsación. `noteOn` devuelve un handle de
  voz; `noteOff` y liberación actúan por handle/owner, nunca por pitch global.
- Stop, Seek, mute y cambio de escena invalidan planes futuros y liberan sólo
  los owners afectados con rampa corta. No llaman `releaseAllSounds()` sobre
  teclas físicas. `panic` y pérdida del lock sí silencian toda la pestaña.
  Tras suspensión/reanudación se crea otro epoch y se reancla el transporte.
- Cada pista conserva `instrumentId`, versión de paquete y preset, con slot y
  bus propios. Un slot anterior se retiene mientras existan handles. Fuente
  ausente o fallo de decode se muestra; no se sustituye silenciosamente por
  un sonido distinto. React observa diagnóstico/playhead por frame, no
  programa notas ni recibe una actualización de estado por voz.

## 4. Proyecto y persistencia

- `ProjectDocumentV1` es una fuente de verdad versionada con ID, nombre,
  `schemaVersion=1`, `ppq=960`, tempo/compás, pistas, patrones, clips, escenas,
  referencias de activos, mezcla y automatización. Los IDs de proyecto,
  pista, patrón, nota, clip, activo y parámetro son estables entre guardados.
- Un patrón es fuente; un clip es instancia con posición y longitud. Copiar
  clip conserva la fuente hasta el comando explícito **Hacer único**. La
  batería muestra los mismos eventos de nota que el piano roll, sin una
  segunda lista de pasos que pueda divergir. `sourceVersion` del clip apunta
  a la única versión vigente del patrón en el documento v1: editar esa fuente
  incrementa su versión y actualiza atómicamente todas las instancias que la
  comparten. **Hacer único** clona la fuente con ID nuevo y reasigna sólo el
  clip elegido.
- `applyCommand(snapshot, command)` valida referencias/rangos y devuelve
  snapshot nuevo e inverso, sin efectos. Un gesto continuo confirma un solo
  comando. Undo/Redo no destruye la toma MIDI cruda. La revisión confirmada es
  monótona y lleva hash canónico; el guardado compara la revisión esperada en
  una transacción y expone conflicto si otra pestaña escribió primero.
- La base nueva de proyectos está separada de
  `piano-midi-pro-recordings` v1. Ningún flujo recrea/vacía esa base.
  `convertRecordedTake` sólo lee sus bytes mediante `getBytes`, valida un SMF
  acotado y crea patrón nuevo o falla sin modificar la toma. Assets se
  referencian por ID/hash/licencia/versión; audio grande se prepara antes de
  confirmar la referencia. No se presume atomicidad entre IndexedDB y OPFS.
- El hash cubre el documento canónico; `revision` y `hash` viven en un sobre
  separado para evitar autorreferencia. Un archivo SMF con división SMPTE se
  rechaza explícitamente hasta contar con conversión implementada y probada.
- Autosave distingue `clean`, `pending`, `saving`, `error` y `conflict`.
  Exportación fija una revisión/hash. Importación portable valida esquema,
  rutas, límites y hashes antes de escribir y restaura como nueva copia.
  Versiones futuras se abren sin escritura destructiva.

## 5. Interfaces entre módulos

| Dueño | Provee | Consumidores |
|---|---|---|
| PRJ | snapshots inmutables, comandos, revisión y repositorio | CLK, ROL, DRM, ARR, UXP, EXP |
| CLK | posición musical, comandos de transporte y resolvedor de eventos `[inicio, fin)` | ENG, MID, UXP, EXP |
| ENG | programación por `audioTime` y owner, cancelación por owner, diagnóstico | CLK, UXP, EXP |
| ROL/DRM/ARR | comandos PRJ; selección, zoom y scroll efímeros en UI | PRJ, CLK |
| INS/MIX/AUT | slots por pista, buses y registro de parámetros tipados | ENG, PRJ, EXP |

El resolvedor puro de `composition/` recibe snapshot/revisión, rango y modo
arreglo/lanzador; devuelve eventos con IDs de fuente, clip, ciclo y owner para
deduplicar. CLK es dueño del scheduling y expone el endpoint público del
resolvedor. Live y exportación interpretan la misma semántica musical. Un
efecto sin render offline reproducible bloquea su exportación con explicación.

## 6. Sonidos, móvil y puertas de QA

- Todo instrumento **incluido en el pack Beatmaker aprobado** parte de una
  grabación real realizada y publicada para biblioteca musical por
  profesionales, con permiso verificado para redistribuir las muestras en
  software, versión, hash, mapa y atribución. No se incluyen sonidos
  generados genéricamente. El 808 del pack se basa en una grabación real
  autorizada; la síntesis 808 descrita como opción en módulos previos no
  satisface esta exigencia. Candidato, instalado y aprobado son estados
  distintos. El respaldo GM actual no recibe etiqueta profesional por defecto.
- La interfaz se diseña primero para 390×844 y zoom 200 %, y se verifica
  también a 1024×768 y 1440×900. Piano y timeline desplazan dentro de su
  panel. El piano roll ofrece edición numérica exacta y acceso por teclado;
  10.000 notas no montan 10.000 nodos DOM ni bloquean el audio.
- Cada criterio de los 15 módulos y cada control visible necesita prueba de
  función y estado de error. El beat transversal incluye piano, kick, snare,
  hats, 808, cinco ediciones, arreglo, overdub, recarga, WAV, stems, MIDI y
  paquete restaurado. La prueba de 37+37 y la inspección de `dist` son puertas
  separadas. Latencia, dropouts y calidad se miden con el SMK-37 físico; las
  pruebas simuladas no conceden aprobación sonora. Elite y Pro se reportan
  individualmente. La meta no se cierra hasta pasar todas las puertas.

## Propiedad de archivos durante la primera implementación

- Audio: `app/src/audio/**`, `app/src/engine/DrumKitEngine.ts`, nuevos
  `app/src/sequencer/**` y sus pruebas focales.
- Proyecto: nuevos `app/src/project/**` y sus pruebas focales.
- Editores: nuevos `app/src/components/beatmaker/**`,
  `app/src/composition/**`, `app/src/state/beatmakerUiStore.ts` y sus pruebas.
- Integración: `PianoApp.tsx`, `PianoApp.css`, Pistas, spec y pruebas
  transversales. Nadie reescribe archivos de otro dueño sin coordinación.
