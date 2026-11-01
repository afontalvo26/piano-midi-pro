# Tasks — ejecución de la spec SMK-37/Studio

Estado: en curso. Cada casilla se marca sólo con evidencia en `evidence.md`. La meta activa de Codex cubre la implementación y validación; un resultado pendiente de pulsación física queda explícito y no se cuenta como completado.

## Acuerdo de coordinación

1. Cada subagente leyó `AGENTS.md` y `.kiro/steering/agent-execution-rules.md` y entregó análisis de su área **antes de editar**. Sus informes de audio, MIDI y rendimiento están incorporados en `requirements.md`/`design.md`.
2. `App.tsx` y los cuatro archivos de esta spec tienen **un solo escritor: `/root`**. Contienen cambios del usuario; se integran por hunks pequeños y se revisa el diff antes de cada tanda.
3. `/root/audio` posee exclusivamente `app/src/engine/InstrumentEngine.ts`, `app/src/audio/audioTiming.ts`, `app/src/engine/playbackGain.ts`, `app/src/engine/VelocityPiano.ts` y nuevas pruebas `tests/e2e/audio-*.spec.ts` previamente acordadas.
4. `/root/midi` posee exclusivamente nuevos módulos `app/src/midi/*` y sus pruebas puras/`tests/e2e/smk37-*.spec.ts`. No editará `App.tsx`, `useMidiInput.ts`, UI existente ni archivo del área audio.
5. `/root/perf_tests` posee exclusivamente `app/src/state/pianoKeyboardStore.ts`, `app/src/hooks/useStorePoll.ts`, `app/src/components/studio/PianoKeyboard.tsx`, `LiveMidiReadouts.tsx`, nuevo `app/src/visual/visibleNoteIndex.ts`, `app/src/components/gamification/NeonRunnerAvatar.tsx`, `tests/e2e/verify-audio-glitches.spec.ts` y sus nuevas sondas visuales. Analizó y midió el avatar antes de editarlo (E58–E60). No editará `App.tsx` ni `audioTiming.ts`.
6. Si una tarea cruza otro dueño, el agente entrega contrato, patch propuesto o mensaje; el dueño integra. Nadie reescribe, revierte, borra, comitea, despliega ni toca firmware/catálogos. Cambios del usuario se preservan.
7. Comandos potencialmente >20 s usan `scripts/run-bounded.ps1`; tests se corren por archivo. Puertos se comprueban antes de servidores y los servidores son jobs. Se guardan exit codes/logs, no sólo texto de consola. `build-catalog-artifacts.mjs --check` escribe `catalog.json` pese a su nombre y no se usa como check seguro; `npm run build` también lo escribe. Usar `check-catalog-sync.mjs`, `npx tsc -b` y `npx vite build` directos hasta corregir el pipeline con dueño propio.

## Tanda 0 — línea base y contratos

- [x] T0.1 Leer reglas, rama/worktree y localizar cambios ajenos. `App.tsx` tiene un diff de carga perezosa de biblioteca; catálogos y muestras tienen cambios no relacionados.
- [x] T0.2 Análisis independiente de audio, MIDI y visual antes de edición; registrar omisiones en `design.md`.
- [x] T0.3 Confirmar hardware presente por enumeración Windows: Elite USB, tres MIDI in/out y USB Audio. Esto no verifica firmware ni mapeos.
- [x] T0.4 Crear requirements, design, tasks y evidence con IDs y límites de evidencia.
- [x] T0.5 Medir build de producción con `check-catalog-sync.mjs` (sólo lectura) y `npx vite build` directo; registrar escenario, `sampleRate`, red, métricas de audio/UI y límites de la medición. Baseline E19/E40 y regresión E54/E58–E61; salida física inferida en E56.
- [x] T0.6 Congelar interfaces entre módulo MIDI, controlador de voz, store visual y `App.tsx` antes de integrar: contratos de `message/profile/diagnostics/recorder`, `visibleNoteIndex` y funciones puras de tiempo musical acordados en `design.md` y mensajes del equipo.

## Tanda 1 — eliminar fallas de confiabilidad comprobadas

- [x] T1.1 `/root/perf_tests`: reparar sonda de glitches y exigir instalación, callbacks >20, reloj de audio y errores útiles. No aceptar `probe=null` como medición. Véase E15 y pruebas del agente.
- [x] T1.2 `/root/audio`: ofrecer API de tiempo musical que no confunda BPM de canción con `playbackRate`; testear 0,5×/1×/2× y seek. El integrador usa esa API en App. E23.
- [x] T1.3 `/root` + `/root/audio`: pasar `audioTime` en cada Note Off de transporte hasta el sampler/voz real; evitar doble liberación de partitura. Ensayar canción densa + scroll. E25–E26; la verificación es de scheduler/UI, no escucha física.
- [ ] T1.4 `/root/audio`: la voz live y la de canción comparten buffers, cada una tiene dueño; PianoEngine dejó de construir una ruta synth/reverb paralela. `audio-live-voice.spec.ts` prueba RMS estable tras recrear tres veces y limpieza de nodos en falla. Falta prueba de varias pistas/cambios de modo y nivel acústico físico. E20, E36.
- [x] T1.5 `/root`: actualizar refs de CC64, bend, rango y notas físicas sincrónicamente; soltar por origen/instancia. Ráfagas sin render y desconexión no dejan voces ni cortan otras. E20–E21; falta la matriz física.
- [x] T1.6 `/root/perf_tests`: índice correcto de intervalos visibles y prueba de nota larga entre notas cortas. `/root` integra el índice en canvas. E23.
- [x] T1.7 `/root`: unificar tiempo de partitura para falling notes, juego, reloj, seek y fin con API de T1.2. E23.
- [ ] T1.8 `/root`: corregir etiqueta/acción del selector de latencia y mensaje de fallback inexistente; probar que cambio de modo no silencia ni fuga nodos.
- [ ] T1.9 `/root/perf_tests` + `/root/audio` + `/root`: reporte de 37 teclas reproducido (E40), grafo compartido 169,3→26,5 ms (E41), regresión App y build de producción 37/37+37/37 sin descartes con CC64, señal post-limiter y recuperación confirmadas (E43/E46/E54). El dueño comunicó «Suena bien» tras la prueba física indicada (E56). Precarga local redujo la espera fría observada (E51), pero una nota muy corta inmediata al abrir aún puede perderse. Pendiente: traza física de puertos/velocities y salida, ráfaga extrema antes de que terminen los fades y clics sub-frame.

## Tanda 2 — integración MIDI y expresión

- [x] T2.1 `/root/midi`: parser puro de longitudes 1/2/3, canales, Note On velocity 0, presión, reloj, SysEx/unknown; pruebas negativas. E29.
- [x] T2.2 `/root/midi`: perfiles versionados Elite/Pro/Genérico, bindings aprendibles, monitor acotado y resolución de conflictos. Mapa numérico predefinido sólo para mensajes capturados. E29.
- [ ] T2.3 `/root`: parser/puertos/monitor integrados con un dueño de conexión y entrada genérica. Autoelige sólo el puerto principal SMK-37 sugerido por nombre; Todos exige selección manual, y la traza local de 30 s observa otros puertos sin enviarlos al audio. E59. Falta captura física Elite para confirmar nombres, espejos y función de cada puerto; no se deduplican mensajes sin esa evidencia.
- [ ] T2.4 `/root` + `/root/audio`: CC7/11, aftertouch con headroom, pitch bend y MOD funcionan en voces live sostenidas; calibración de velocity por dispositivo implementada. Falta automatización continua de CC en voces de archivo MIDI y comparación musical A/B. E20, E36.
- [ ] T2.5 `/root` + `/root/audio`: CC64/UI/espacio, sostenuto, half-pedal y una corda usan contrato de voz live; pérdida de foco del teclado queda probada. `PianoEngine` evita corte por pitch, pero los pedales de MusicXML siguen duración fijada al ataque; necesita voces por instancia. E36–E37.
- [ ] T2.6 `/root`: pads/canal 10 separados y bindings para bancos, knobs, faders, flechas y transporte integrados; notas consumidas repetidas ahora tienen cola FIFO. MIDI Learn probado con Web MIDI simulado; la nueva captura física permite registrar todos los puertos y rutas sin duplicar audio (E59). Falta matriz física de cada banco/botón y distinguir cuáles modos del firmware emiten bytes.
- [ ] T2.7 `/root`: MIDI Out/SysEx optativos sólo si un flujo probado los necesita y el usuario habilita permisos; cero eco por defecto.

## Tanda 3 — grabación y calidad del piano

- [x] T3.1 `/root/midi`: núcleo de captura/serialización MIDI con tiempo monotónico y cierre de notas; pruebas de exportar/reimportar. `/root` integra controles UI y acciones aprendidas. E29.
- [x] T3.2 `/root`: `Grabar en la app` y estado separado del SEQ REC físico; reproducir y exportar `.mid` con notas, velocity, CC, pedal y pitch. E29; SEQ REC físico sigue pendiente en T4.3.
- [ ] T3.3 `/root/audio` + `/root`: auditados 30 OGG Tone Salamander, 6.941.896 bytes comprimidos, 7 muestras núcleo locales 1.591.493 bytes, una toma por pitch y licencia CC BY 3.0; `decodedPcmBytes` mide PCM único. Precarga pre-gesture local y reutilización de buffers bajaron primer MIDI→fuente 610,6→80,8 ms en dev (E51); carga restante con tres trabajos/reintento sigue. Falta ensayo de red lenta/fallback, memoria total de la app y cola durante canción densa.
- [ ] T3.4 `/root`: integrar motor de piano elegido tras T3.3 y diagnóstico visible de carga/error/reintento. Comparar timbre, afinación, dinámica y nivel con referencia.
- [x] T3.5 `/root`: extender coordinación de una sola pestaña al Studio en vivo y su interacción con el reproductor. Pruebas de pestañas hermanas y de ataque manual durante pausa/seek. E28; la salida acústica queda en T4.3.

## Tanda 4 — validación y cierre

- [ ] T4.1 Pruebas por archivo para cada cambio, `tsc -b`, eslint de tocados, `npx vite build` y `check-catalog-sync.mjs` directos. Puertas de esta tanda pasaron en E53–E55/E61; repetir al cerrar cambios restantes. `npm run build/lint` sólo cuando su wrapper de catálogo sea realmente de solo lectura en modo check o se autorice expresamente regenerar artefactos; registrar límites.
- [ ] T4.2 Medición antes/después del mismo build/escenario: lead, Note Off, voces, picos, React, canvas, frames y desfase visual/audio; canción densa + scroll y 0,5×/2×. E38/E40/E54 y A-B-A visual E58–E60 cubren parte; falta desfase acústico real y escena densa sostenida en hardware.
- [ ] T4.3 Matriz física del Elite USB para todas las teclas/controles/bancos/puertos y A/B FM interno/USB Audio; registrar firmware y plantilla MidiSuite. Validar BLE cuando esté disponible.
- [ ] T4.4 Validar Pro físico en otra sesión o marcar explícitamente pendiente; no declarar paridad física por manual o pruebas simuladas.
- [ ] T4.5 Revisar diff final, preservar trabajo ajeno, actualizar `evidence.md`, cerrar sólo criterios realmente demostrados. No commit/push/deploy sin orden explícita.

## Dependencias y puerta de integración

`T0.5/0.6 → T1 → T2 → T3 → T4`. Se pueden desarrollar en paralelo módulos de archivos exclusivos dentro de una tanda; la integración en `App.tsx` es serial. Cada módulo entrega API, pruebas y lista de decisiones/limitaciones. Si un criterio exige botón físico que no emite MIDI, se cierra como limitación documentada con alternativa MIDI Learn o control en pantalla, no como función verificada.
