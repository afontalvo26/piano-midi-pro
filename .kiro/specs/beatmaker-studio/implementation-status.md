# Beatmaker Studio — estado verificable del corte

Fecha: 2026-11-01. Este registro no aprueba el producto; identifica lo que ya se probó y lo que aún exige implementación o QA. El árbol de trabajo compartido conserva cambios ajenos y no tiene una entrega publicada.

| Módulo | Evidencia disponible | Pendiente para aceptación |
|---|---|---|
| PRJ | Documento 960 PPQ, comandos reversibles/CAS, IndexedDB separado de Pistas, hashes, journal recuperable, activos, paquete y cuota/GC. Overdub MIDI y slicing de WAV propio conservan bytes originales. Clips audio absolute/beat, crossfade y comp sobreviven save/undo/bundle. Importación muestra previsualización con hashes/licencias verificados sin escribir; crea copia sólo tras acción explícita. CAS fallido devuelve sólo sus marcas nuevas a staging bajo Web Lock. | Medir importación de paquetes grandes en móvil, migraciones futuras y cuota real. Un crash entre marca de activo y CAS puede conservar bytes huérfanos; el GC los retiene por seguridad. |
| ENG | Motor live con dueño de voces; Salamander, Virtuosity, sampler propio mono/legato/glide y metrónomo grabado. 37 on/off durante beat con efectos, medidores y PCM automatizados sin notas omitidas ni NaN. OGG con AAC derivado bajo demanda para siete pianos, 38 golpes Virtuosity y nueve claps FreePats. | Medición física 37+37, latencia, dropouts, memoria y Safari iOS. Un evento tardío y 62,7 ms para 37 Note On en Chromium headless requieren perfilado. |
| CLK | Reloj 960 PPQ y scheduler µs, Stop/Seek, dueño por transporte y coincidencia de eventos con índices floor/ceil conservadores. Count-in/punch usan AudioContext; cancelación, Stop y loop con tempo variable pasan prueba focal. | Automatización y render offline siguen en integración; navegadores físicos pendientes. |
| MID | Tomas propias preservadas; 90 s de bytes WinMM del SMK-37 Elite conectado: 520 eventos, 260 on/off, 23 pitches, hasta 7 simultáneas, cero notas colgadas al terminar. | Captura de 37 teclas simultáneas, pedales/CC y dos acordes físicos; permiso Web MIDI y latencia cableada. No se verificó mapa universal de botones. |
| ROL | Piano roll táctil en canvas, inspector, edición reversible, cuantización, groove/humanización con vista previa/restauración, notas fantasma/escala, carriles velocity/release/CC/bend/presión, overdub portable desde Pistas y 10.000 notas con prueba de frame a 320/390 px. | Medir toque y desplazamiento en móvil físico; presupuesto con CPU móvil y beat + 37 live sigue pendiente. |
| DRM | Rack de 16 pads, secuencias con polirritmia, fuentes verificadas Virtuosity/FreePats y paquete TR-808 Fischer/Technopolis CC0 fijado por versión/manifiesto/hash, configuración por pad y scroll táctil. | Calidad/choke con beat y controlador físicos; los pads sin fuente elegida siguen mudos. |
| SMP | WAV/OGG propio validado por firma/SHA; región, reverse, root, loop, mono/legato/glide y envolvente; slicing manual/equidistante/transientes en frames enteros, instalación reversible en pads y paquete con SHA idéntico. En PR #5 se añadió separación visible Repitch/Time-stretch (stretch deshabilitado explícitamente), saturación mono y subgrave paralelo derivado del mismo sample, persistentes y compartidos por live/offline. | Time-stretch de calidad real sigue pendiente; audición física del 808/sampler y ejecución de las regresiones nuevas. |
| AUD | AudioWorklet captura WAV a clip/toma, lock compartido, save/reopen/playback. Count-in, punch de salida automática, cancelación antes del primer frame y Stop parcial probados. Clips beat/absolute, trim/fades/gain/split/crossfade, comp no destructivo y corrección manual de latencia por frame con undo en Chromium. | Calibración de entrada medida, resampling de bus, fallos de hardware/cuota y latencia física. Offset que exige pre-roll anterior a t=0 se rechaza sin mutar. |
| INS | Siete grabaciones núcleo Salamander, 38 Virtuosity, nueve FreePats y TR-808 Fischer/Technopolis CC0 con hashes/licencias; AAC trazable de las grabaciones compatibles como fallback OGG. El catálogo distingue bancos live remotos de bancos de proyecto instalados/exportables. | Meta/Growlybass, 16 capas completas Salamander, fichas de calidad y Safari físico. |
| ARR | Clips, secciones, escenas, lanzamiento/captura, hot swap MIDI, playhead rAF e inspector de audio. Duplicar sección clona anclas µs, crossfade, comp y curvas locales en un CAS/Undo; probado históricamente a 320 px. En PR #5 se añadió agrupación persistente, multiselección, movimiento atómico del grupo, Undo/Redo y protección de crossfades. | Ejecutar las regresiones nuevas del agrupado, edición durante playback con audio físico y móvil físico. |
| MIX | Ganancia/pan/mute/solo, buses, sends y medidores; siete efectos (EQ3, filtro, compresor, saturación, reverb, delay, limitador). En PR #5 se añadió sidechain de audio real por AudioWorklet con fuente explícita, threshold/ratio/attack/release/reducción máxima, medidor de reducción y dependencia silenciosa de la fuente en stems; también comparación A/B original/procesada con compensación RMS por atenuación y salida reversible. | Ejecutar PCM/browser de MIX-04/MIX-06, verificar colas, buses anidados, paridad live/offline/stems y escucha física. |
| AUT | Lanes, CAS, editor de puntos/curvas y playback de gain/pan/master en live y render offline. Expresión MIDI se guarda separada. En PR #5 se añadió Touch Write por gesto único reversible con retorno a la curva, preview live y MIDI Learn basado sólo en el mensaje observado, con puerto/canal/banco, pickup/absoluto/relativo. | Ejecutar unit/E2E nuevos, probar controlador físico, takeover en bancos reales, sesiones largas y equivalencia de exportación bajo carga. |
| EXP | SMF tipo 1/960 PPQ, WAV estéreo PCM, stems ZIP y paquete con SHA; UI de descarga, previsualización/importación y PCM no silencioso probados. Slicing de activo propio, lane local y filtro MIX sobrevivieron bundle/import en base IndexedDB nueva. | Paridad con AUT completo, bibliotecas opcionales y validación de peak/true peak física. |
| UXP | Studio, Pistas y Configuración; 10 vistas auditadas en Chromium táctil 320/390 px sin desborde y targets efectivos ≥44×44 px en estados básicos. Estados dinámicos de mixer, slicing, grabación y arreglo probados a 320 px. | QA exhaustiva de estados, accesibilidad y dispositivos/navegadores físicos. |
| QLT | Históricamente TypeScript, ESLint, build y pruebas focales; beat vertical de cuatro compases con piano, batería, secciones, save/reopen, WAV/MIDI/bundle pasó tras integración de preview. Dist conserva siete OGG núcleo y excluye demo/covers/samples/player. El workflow de PR #5 ahora incluye regresiones de sidechain/A-B, Touch/MIDI Learn, grouping, catálogo y sampler. | El runner actual sigue fallando antes de ejecutar pasos; después exige suite transversal estable, loopback, 37+37 y audición física SMK-37. |

## Logs del corte

- Compilación/lint focal: `.logs/20261101-164647-root-preview-tsc.log`, `.logs/20261101-164647-root-preview-app-eslint.log`, `.logs/20261101-164647-root-preview-test-eslint.log`.
- Build Vite tras AUD/preview: `.logs/20261101-164748-root-preview-build.log`. El dist auditado mantiene siete OGG Salamander y excluye `demo/`, `covers/`, `samples/`, `player/`. Repetir tras AUT y AUD-06.
- Beat vertical de cuatro compases tras preview: `.logs/20261101-164735-root-fourbar-preview.log` (1/1, navegador quieto).
- Overdub MIDI propio: `.logs/20261101-160025-root-overdub-frozen-integration.log`.
- Captura de audio y recarga: `.logs/20261101-160034-root-audio-capture-regression.log`; clips duales PCM y crossfade `.logs/20261101-160155-eng-dual-audio.log`; UI táctil `.logs/20261101-160752-beatmaker-audio-arr-ui2.log`.
- Fallback AAC de grabaciones locales: piano C4 PCM `.logs/20261101-160615-eng-salamander-aac-browser.log`, 38 Virtuosity + nueve FreePats decodificadas y kick/clap reales `.logs/20261101-161004-eng-drum-aac-all-browser.log`.
- Rendimiento de 10.000 notas: `.logs/20261101-160332-prj-10k-structural-profile.log`, `.logs/20261101-154816-beatmaker-roll-10k-budget.log`.
- Carriles ROL con 10.000 notas, gesto velocity/CC/bend/presión y Undo: `.logs/20261101-161747-roll-lane-gesture-stable2.log`; regresión/perf `.logs/20261101-161839-roll-lane-regression.log`.
- Superficie táctil: `.logs/20261101-160740-root-mobile-targets-effective.log`.
- Count-in/punch: `.logs/20261101-164157-root-aud02-count-punch.log` (1/1), grabación previa `.logs/20261101-164209-root-aud02-existing2.log` (3/3), reloj/cancel/loop `.logs/20261101-164232-eng-aud02-final.log` (6/6).
- Mixer siete efectos: `.logs/20261101-163628-root-mix-ui-e2e2.log` (1/1), PCM individual `.logs/20261101-162700-eng-mix02-individual.log`.
- Slicing manual/transiente: `.logs/20261101-163638-root-slicing-ui3.log` (1/1), instalación/paquete `.logs/20261101-162353-prj-smp-slices-e2e.log`.
- Arreglo completo/automatización local: `.logs/20261101-164334-arr-section-audio-mobile.log` (1/1), `.logs/20261101-164102-arr-full-section-unit.log` (14/14).
- Preview bundle: `.logs/20261101-164539-prj-bundle-preview-v3-e2e.log` (2/2), UI `.logs/20261101-164727-root-preview-ui2.log` (1/1), integridad portable `.logs/20261101-163710-prj-portable-integrity-e2e.log` (1/1).
- CAS fallido/GC conservador: `.logs/20261101-165030-prj-failed-cas-assets-e2e.log` (1/1).
- Carga combinada beat+37+FX+PCM: `.logs/20261101-164253-eng-mix-load.log` (1/1); un evento tardío y 62,7 ms en la ráfaga requieren investigación.
- SMK-37 Elite físico: `.logs/smk37-elite-physical-20261101.jsonl`; no contiene pedales ni una validación auditiva.

Las mediciones Chromium de escritorio con viewport móvil verifican comportamiento de software y no sustituyen un teléfono físico, el controlador completo ni captura de salida cableada.


## Anexo: propuesta de continuación SDD (no fusionada ni aprobada)

La [PR #1](https://github.com/afontalvo26/piano-midi-pro/pull/1) sobre
`fix/bus-resample-routing-preflight-20261101` añade implementaciones
**pendientes de ejecutar** para MIX-01, AUD-06 y EXP-02:

- Grafo de sends post-fader con prevención de ciclos, controles en mezclador
  y preservación de cambios por comandos reversibles.
- Tap aislado `post-bus-pre-master` después de procesado del bus,
  captura directa al master separada y exportación de stems con rutas
  auxiliares sin añadir al bus la señal directa a master.
- Referencia de los sends incluidos en la procedencia del resampling,
  exclusión de la pista destino e integridad WAV/ZIP.
- Pruebas focales nuevas de mezcla, bus tap, edición a 320 px, reabrir,
  undo/redo y matriz de 113 criterios en formato legible y JSON.
- Gate estructural `scripts/verify-beatmaker-acceptance.mjs --check`;
  `--release` se bloquea mientras falten evidencias o ensayos físicos.

**Estado de ejecución:** el workflow de GitHub Actions entra en
`failure` antes de ejecutar pasos. En el run
[41364098020](https://github.com/afontalvo26/piano-midi-pro/actions/runs/41364098020),
los dos jobs tienen `steps=[]`, `runner_id=0` y duración de 2–3 s.
No son pruebas TypeScript/Playwright realmente ejecutadas. La causa
operativa precisa no se verificó; no adjudicar el fallo al código sin
logs. La alternativa local es `scripts/validate-studio.ps1`, todavía
sin un reporte registrado. Hasta entonces el trabajo queda en PR draft,
sin merge a la rama de producto.

El corte anterior de Codex y sus logs se conservan como histórico;
las nuevas propuestas NO heredan sus resultados de aceptación.


## Anexo — nueva interfaz aprobada (PR #5, 2026-11-02)

**Rama:** `design/studio-reference-ui-20261101` sobre la propuesta de audio del PR #1. **Sin merge, sin release y sin validación ejecutada satisfactoriamente.** Este anexo no sustituye ni hereda las mediciones del corte del 2026-11-01.

**Código escrito y pendiente de compilar/probar:**
- Shell con cabecera, editor, arreglo, inspector, mixer, navegador, catálogo real y teclado virtual de 37 teclas.
- Operaciones MIDI reversibles: mover/dibujar/dividir clips, cuantización rápida, «Hacer único» para proteger fuentes compartidas, Undo/Redo.
- Transporte con loop editable, seek por compás, compases variables y scheduler por epochs.
- Efectos de pista con perillas persistentes, borradores de gesto para evitar doble commit; selección de banco **por pista** mediante `replaceTrackInstrument` (Salamander/808 instalados).
- Flujo de tomas MIDI integrado en inspector: previsualización/confirmación de overdub, reintento de guardado y exportación de emergencia.
- Alertas de guardado/estado real, MIDI sin fingir identificación SMK-37, estimación de búfer del navegador sin llamarla latencia física.
- Verificador de 113 criterios endurecido para exigir pruebas de software/producción y evidencia física/licencias según ID; test del gate añadido.

**Riesgos importantes sin resolver:**
- [Auditoría SDD 15 puntos](spec-drift-2026-11-02.md) y [ADR de lectura musical contextual](decisions/ADR-UXP-001-score-preview.md).
- Actions sigue fallando antes de disponer de pasos/logs útiles; **no existe certificación TypeScript, lint, Vite o Playwright de estos commits**.
- Instrumentos remotos WebAudioFont siguen siendo live; sólo Salamander/808 tienen asignación por pista en este panel. Otros bancos profesionales, licencias, QA y equivalencia offline pendientes.
- La matriz `acceptance-evidence.json` registra **113 pendientes, 0 aprobados, 0 expedientes con pruebas adjuntas**. No convertir un commit ni un test escrito en una aprobación.
- Screenshot comparable real del navegador a 1586×992, 320–1440 px, zoom 200%, audio PCM/latencia/37+37 y SMK-37 físico Elite/Pro todavía sin ejecutar.

**Comandos previstos cuando se habilite un checkout ejecutable:** `node scripts/audit-beatmaker-requirements.mjs`, `node scripts/verify-beatmaker-acceptance.mjs --check`, `node --test tests/unit/beatmaker-acceptance-gate.test.mjs`, `cd app && npx tsc -b && npx eslint . && npx vite build`, `node scripts/audit-studio-dist.mjs`, `npx playwright test tests/e2e/studio-reference-ui.spec.ts tests/e2e/sequencer-transport.spec.ts --workers=1 --retries=0`. `--release` debe seguir **rojo** hasta completar evidencias reales.


## Anexo de continuidad — navegación y audio por ruta (2026-11-02)

**Implementación no aceptada en PR #5:**

1. `ReferenceStudio` ya no está limitado a los primeros 16 compases: páginas de 4/8/16/32 compases, navegación hacia delante y atrás, centrar playhead y coordenadas tick derivadas de `meterMap`. La ventana recorta correctamente la forma y la posición de los clips, la selección y la región de bucle. Un corte sobre un clip parcialmente visible opera sobre la **posición audible de la ventana**, no el inicio oculto del clip.
2. `ProjectAudioSink` separa el gate de salida principal del gate de los envíos, para no filtrar simultáneamente el dry/master cuando se pone en solo un bus auxiliar. Los stems directos usan el gate principal. Regresión PCM nueva en `tests/e2e/project-mixer-sends.spec.ts`.
3. La gestión `ProjectBrowser` y la biblioteca `RecordedTracks` se alojan en un modal del nuevo Studio. Permiten crear, abrir, renombrar, archivar, duplicar, exportar/importar paquetes, recuperación de drafts y gestión de tomas MIDI sin regresar a la pantalla anterior. Nuevas pruebas de apertura/creación y salida segura de modal.
4. El playhead de escritorio y móvil comparte una única medida CSS de ancho de carril para 320, 390 y 1586 px, con prueba de comparación de coordenadas.
5. El workflow `studio-reference-ui.yml` amplía la ejecución de navegador a `project-mixer-sends.spec.ts`.

**No afirmar aprobado:** el último run aún falló con **0 pasos de job**; su descarga de logs devolvió `BlobNotFound` desde GitHub. El repositorio tampoco puede clonarse desde el contenedor por falla DNS de `github.com`. Sin build, lint, PCM real, Playwright ni hardware comprobado, no hay base para cambiar las 113 filas de `acceptance-evidence.json`.

Bloqueos: runner de CI y logs, certificados físicos SMK-37, fidelidad visual screenshot desktop/móvil, bibliotecas/paquetes/licencias faltantes, pruebas de sesiones largas y mezcla de buses anidados. Conservar PR en borrador.


## Anexo de continuidad — estado real de bancos y pistas armadas

- La tarjeta de la pista ahora informa `loading/ready/error` desde `ProjectAudioDiagnostics.tracks`, y «Audio sin preparar» cuando no existe grafo activo. No presenta ✓ de banco activo sin confirmación del motor. Incluye **Preparar audio del proyecto**, que reutiliza el flujo con integridad y mensajes de error.
- `selectMidiRecordingTarget(document,selectedTrackId)` da prioridad a una pista MIDI armada; si existen varias armadas, exige elegir una entre ellas. Mantiene la opción de grabación de toma libre cuando no hay pista armada. `PianoApp.startRecording` resuelve la selección **antes** de iniciar el recorder.
- El arreglo compacto incluye armado MIDI (R) en cada pista MIDI y una opción equivalente en el inspector; el botón de grabación indica el destino o por qué requiere elección.
- Pruebas E2E escritas: información honesta de bancos sin preparar, cambio de banco seleccionado, prioridad del armado, bloqueo de ambigüedad y título del botón de grabación. **Aún no ejecutadas.**
- Corrección posterior: MIX-04 y MIX-06 **ya tienen implementación propuesta en PR #5**. MIX-04 usa detector AudioWorklet y mantiene la pista key silenciosa al renderizar un stem aislado; MIX-06 conserva ramas original/procesada y compensa RMS sólo por atenuación. Sus pruebas están escritas, pero el runner sigue sin ejecutar pasos, por lo que ambos criterios continúan `pending`.

La matriz de los 113 permanece intacta y en `pending`. El flujo de grabación de audio (`AudioInputSession`) no se confunde con la toma MIDI (`MidiRecorder`).


## Anexo de continuidad — MIX-04/MIX-06, AUT-06/Touch y ARR grouping (2026-11-02)

**Implementado en código, aún no aceptado:**

- **MIX-04:** contrato persistente de sidechain, validación de fuente/rangos/ciclos, detector AudioWorklet a frecuencia de audio, reducción post-insert/post-pan, métricas actual/pico y fuentes detectoras silenciosas en render de stems.
- **MIX-06:** monitor A/B no persistente con ramas original/procesada simultáneas, medición RMS y compensación usando sólo atenuación; cambio con rampa corta y salida reversible al procesado normal.
- **AUT:** Touch Write explícito Read/Touch. Un gesto genera un solo comando reversible, conserva la curva fuera del tramo tocado, previsualiza el valor en el mixer live y retorna suavemente a la lectura al soltar.
- **AUT-06:** MIDI Learn aprende exclusivamente el evento recibido; persiste matcher de puerto, canal, número/control y banco. Pickup no toma control hasta alcanzar/cruzar el valor software; absoluto y dos variantes relativas están diferenciados. CC de expresión sin Learn sigue siendo expresión y no crea un binding de mezcla.
- **ARR-01:** groupId opcional en clips, multiselección, grupo/desgrupo, arrastre/teclado conjunto y CAS/Undo único. Duplicar un clip no duplica implícitamente la pertenencia al grupo y un crossfade bloquea movimientos parciales de sus extremos.
- **CI:** el workflow ahora incluye unit focales y Playwright de sidechain, A/B y automatización, además del lint de los archivos nuevos. Los runs observados continúan terminando antes de ejecutar pasos (`steps=null`), por lo que no constituyen una validación de TypeScript, bundle o navegador.

La matriz de 113 criterios permanece sin cambios. Ningún punto anterior debe promoverse a `approved` hasta que exista ejecución reproducible y evidencia asociada al SHA exacto.


## Anexo SMP/INS — 2026-11-02

- El sampler declara **Repitch** como motor actual y muestra **Time-stretch** deshabilitado con explicación; no presenta repitch como si fuera stretch.
- La voz mono admite saturación 0–1 y subgrave −36–0 dB. El subgrave es una copia low-pass del sample grabado, no un oscilador nuevo, y el mismo `MonoUserSampleEngine` alimenta live y render offline.
- Volver a polifonía elimina los campos mono-only para no dejar configuración inválida oculta.
- El TR-808 Fischer/Technopolis ya no se trata como “pack por conseguir”: existe localmente con procedencia CC0 y manifiesto/hash. Lo que sigue pendiente es QA física y calidad, no autorización ficticia.
- Las nuevas pruebas están escritas y agregadas al workflow, pero no son evidencia aprobada hasta que el runner ejecute pasos reales.


## Anexo de verificación local — 2026-11-02 22:41 (America/Bogota)

Árbol de trabajo sobre `design/studio-reference-ui-20261101` (PR #5), actualizado al head remoto `c045bd7` antes de esta tanda. **No cambia el estado de aceptación**: `acceptance-evidence.json` sigue con 113 pendientes y 0 aprobados, `--release` sigue rojo por diseño, el CI real sigue bloqueado por facturación de la cuenta (issue #2) y no existe QA física SMK-37 (issue #3) ni autorización de redistribución del 808 (issue #4).

**Corregido y ejecutado en esta tanda** (logs en `.logs/`, sin datos simulados):

- `ProjectAudioSink.prepare` ya no se queda con la rama del bajo 808 para una pista `kind:"drum"` con `drumRack`; prepara el rack real. Era la causa de que el beat de cuatro compases dejara los pads en «audio pendiente de preparar» para siempre.
- `decodeAudioData` del TR-808 valida la duración esperada por `sampleRate` en vez de exigir frames idénticos: acepta el resampleo 44,1→48 kHz del contexto y sigue rechazando corrupción de manifiesto/hash.
- `createAudioRoutingPolicy` unifica mute/solo/envíos en timeline, sink y plan de exportación. Un bus principal mudo con envío auxiliar mantiene audible la fuente, no se cuentan clips como omitidos y el stem del bus mudo ya no se duplica.
- Sidechain: el `AudioWorkletNode` se crea a través del contexto Tone, válido también en el render offline (antes fallaba con `parameter 1 is not of type 'BaseAudioContext'`).
- Pads: la sensibilidad por defecto conserva exactamente la respuesta histórica `velocity/127` (DRM-06); sólo las curvas no-default usan piso de audibilidad.
- UI: el banner de estado ya no intercepta clics; la navegación conserva nombre accesible con iconos en móvil; el playhead se mantiene visible en anchos < 1460 px; el selector de proyecto vacío dice «Sin proyecto»; copys de banco por pista y catálogo quedan alineados con el estado real.
- Los E2E de los dos workflows migraron su entrada al shell de referencia (`Crear un proyecto` → `Editor de arreglo completo` → panel legacy), en vez de pulsar botones tapados por el rediseño.
- `scripts/validate-studio.ps1` ahora cubre la suite unitaria completa, ESLint completo de la app, build/dist, el foco de `studio-quality.yml` y el foco de `studio-reference-ui.yml`; `-Full` añade la suite E2E completa.

**Puertas ejecutadas en esta tanda (todas exit 0 sobre el árbol de trabajo):**

- `npx tsc -b` — sin errores.
- `npx eslint .` — sin errores ni warnings.
- `npx vite build` — 1120 módulos; `audit-studio-dist`: 236 archivos, 0 rutas retiradas, 7 OGG núcleo.
- Unit: 185/185 en 41 archivos (`node --test`).
- `node scripts/audit-beatmaker-requirements.mjs` — 113 IDs en 15 módulos.
- `node scripts/verify-beatmaker-acceptance.mjs --check` — estructura PASS, 0/113 aprobados.
- E2E `gate-reference-final`: 53/53 (`studio-reference-ui` 27/27, `sequencer-transport`, sidechain, A/B, automatización, sampler, drum rack).
- E2E `gate-quality-final`: 31/31 (`bus-routing-preflight`, bus resample, mixer sends, four-bar, bundle preview, audio-live-voice 37 voces).

**Sigue pendiente y no se puede certificar desde este entorno:** ejecución real de GitHub Actions con runner (la cuenta está bloqueada por facturación), los 113 expedientes con evidencia atada a commit, 37+37 con CC64/66/67 y loopback p95/p99 en SMK-37 Elite, Pro separado, autorización/licencia del pack 808, decisión de producto SDD-01 («Partitura»), pixel-diff UXP a 1586×992 y QA en móviles físicos. Mientras eso no exista, el PR #5 debe seguir en borrador y las filas de aceptación en `pending`.
