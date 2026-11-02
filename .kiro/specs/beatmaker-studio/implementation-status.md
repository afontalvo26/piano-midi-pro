# Beatmaker Studio — estado verificable del corte

Fecha: 2026-11-01. Este registro no aprueba el producto; identifica lo que ya se probó y lo que aún exige implementación o QA. El árbol de trabajo compartido conserva cambios ajenos y no tiene una entrega publicada.

| Módulo | Evidencia disponible | Pendiente para aceptación |
|---|---|---|
| PRJ | Documento 960 PPQ, comandos reversibles/CAS, IndexedDB separado de Pistas, hashes, journal recuperable, activos, paquete y cuota/GC. Overdub MIDI y slicing de WAV propio conservan bytes originales. Clips audio absolute/beat, crossfade y comp sobreviven save/undo/bundle. Importación muestra previsualización con hashes/licencias verificados sin escribir; crea copia sólo tras acción explícita. CAS fallido devuelve sólo sus marcas nuevas a staging bajo Web Lock. | Medir importación de paquetes grandes en móvil, migraciones futuras y cuota real. Un crash entre marca de activo y CAS puede conservar bytes huérfanos; el GC los retiene por seguridad. |
| ENG | Motor live con dueño de voces; Salamander, Virtuosity, sampler propio mono/legato/glide y metrónomo grabado. 37 on/off durante beat con efectos, medidores y PCM automatizados sin notas omitidas ni NaN. OGG con AAC derivado bajo demanda para siete pianos, 38 golpes Virtuosity y nueve claps FreePats. | Medición física 37+37, latencia, dropouts, memoria y Safari iOS. Un evento tardío y 62,7 ms para 37 Note On en Chromium headless requieren perfilado. |
| CLK | Reloj 960 PPQ y scheduler µs, Stop/Seek, dueño por transporte y coincidencia de eventos con índices floor/ceil conservadores. Count-in/punch usan AudioContext; cancelación, Stop y loop con tempo variable pasan prueba focal. | Automatización y render offline siguen en integración; navegadores físicos pendientes. |
| MID | Tomas propias preservadas; 90 s de bytes WinMM del SMK-37 Elite conectado: 520 eventos, 260 on/off, 23 pitches, hasta 7 simultáneas, cero notas colgadas al terminar. | Captura de 37 teclas simultáneas, pedales/CC y dos acordes físicos; permiso Web MIDI y latencia cableada. No se verificó mapa universal de botones. |
| ROL | Piano roll táctil en canvas, inspector, edición reversible, cuantización, groove/humanización con vista previa/restauración, notas fantasma/escala, carriles velocity/release/CC/bend/presión, overdub portable desde Pistas y 10.000 notas con prueba de frame a 320/390 px. | Medir toque y desplazamiento en móvil físico; presupuesto con CPU móvil y beat + 37 live sigue pendiente. |
| DRM | Rack de 16 pads, secuencias con polirritmia, fuentes verificadas Virtuosity/FreePats, configuración por pad y scroll táctil. | Calidad/choke con beat y controlador físicos; los pads sin fuente elegida siguen mudos. Evaluando pack analógico grabado CC0 para completar el kit sin inventar un 808. |
| SMP | WAV/OGG propio validado por firma/SHA; región, reverse, root, loop, mono/legato/glide y envolvente; slicing manual/equidistante/transientes en frames enteros, instalación reversible en pads y paquete con SHA idéntico. | Time-stretch, saturación/subgrave, 808 grabado con autorización clara de redistribución y audición física. |
| AUD | AudioWorklet captura WAV a clip/toma, lock compartido, save/reopen/playback. Count-in, punch de salida automática, cancelación antes del primer frame y Stop parcial probados. Clips beat/absolute, trim/fades/gain/split/crossfade, comp no destructivo y corrección manual de latencia por frame con undo en Chromium. | Calibración de entrada medida, resampling de bus, fallos de hardware/cuota y latencia física. Offset que exige pre-roll anterior a t=0 se rechaza sin mutar. |
| INS | Siete grabaciones núcleo Salamander, 38 Virtuosity y nueve FreePats con hashes/licencias; AAC trazable de las mismas 54 grabaciones como fallback OGG, cargado sólo ante fallo de decodificación. | Meta/Growlybass, 16 capas completas Salamander, fichas de calidad, Safari físico y 808 autorizado. |
| ARR | Clips, secciones, escenas, lanzamiento/captura, hot swap MIDI, playhead rAF e inspector de audio. Duplicar sección clona anclas µs, crossfade, comp y curvas locales en un CAS/Undo; probado a 320 px. | Agrupación completa, edición durante playback con audio físico y móvil físico. |
| MIX | Ganancia/pan/mute/solo, buses y medidores; siete efectos (EQ3, filtro, compresor, saturación, reverb, delay, limitador) con bypass/orden/parámetros y paridad PCM live-like/WAV focal. | Sends, sidechain, A/B, políticas completas de colas, automatización y paridad transversal de stems. |
| AUT | Lanes, CAS, puntos/curvas y registro base de gain/pan/master en documento; duplicar clip/sección conserva curvas. Expresión MIDI se guarda separada. | Editor táctil, playback de lanes, touch write, MIDI Learn de parámetros y equivalencia de exportación en implementación. |
| EXP | SMF tipo 1/960 PPQ, WAV estéreo PCM, stems ZIP y paquete con SHA; UI de descarga, previsualización/importación y PCM no silencioso probados. Slicing de activo propio, lane local y filtro MIX sobrevivieron bundle/import en base IndexedDB nueva. | Paridad con AUT completo, bibliotecas opcionales y validación de peak/true peak física. |
| UXP | Studio, Pistas y Configuración; 10 vistas auditadas en Chromium táctil 320/390 px sin desborde y targets efectivos ≥44×44 px en estados básicos. Estados dinámicos de mixer, slicing, grabación y arreglo probados a 320 px. | QA exhaustiva de estados, accesibilidad y dispositivos/navegadores físicos. |
| QLT | TypeScript, ESLint, build y pruebas focales; beat vertical de cuatro compases con piano, batería, secciones, save/reopen, WAV/MIDI/bundle pasó tras integración de preview. Dist conserva siete OGG núcleo y excluye demo/covers/samples/player. | Suite transversal en árbol estable, 808 autorizado, loopback, 37+37 y audición física SMK-37. |

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
