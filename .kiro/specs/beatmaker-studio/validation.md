# Beatmaker Studio — matriz de validación y metas iniciales

Estado: metas de diseño con mediciones automatizadas parciales; ninguna fila de aceptación física está cerrada. Entorno de referencia propuesto: navegador Chromium con Web MIDI, SMK-37 Elite por USB, salida de audio cableada y frecuencia/buffer consignados en el reporte. Otros navegadores, Pro, Bluetooth, FxSound y SMK-37 Elite Audio requieren filas propias.

| Área | Meta inicial de aceptación | Método y evidencia |
|---|---|---|
| Polifonía | 37 Note On + 37 Note Off, sustain y dos acordes, con cero voces colgadas y un ataque audible posterior; repetir mientras suena beat | Fixture de eventos + contadores del motor + captura de salida física |
| Estabilidad | Cero dropouts y cero bloqueos de AudioContext en 5 minutos de loop con drums/808/piano y ráfagas de 37 teclas | Captura loopback, marcas de interrupción y estado de audio |
| Latencia cableada | Objetivo p95 MIDI→salida ≤25 ms y p99 ≤40 ms en entorno de referencia; publicar mediana/jitter y cualquier incumplimiento | Pulso MIDI físico correlacionado con audio loopback; comparar antes/después |
| Dinámica | Conservar velocity 1–127; para notas de referencia, energía no decrece al subir velocity salvo excepción documentada por muestra; pp, p, mp, mf, f, ff diferenciables al oído | Render escalonado, curva de energía y escucha A/B nivelada |
| Afinación | No modificar accidentalmente el pitch de una muestra; notas calibradas contra tabla propia del banco, incluida afinación estirada de piano | Análisis de frecuencia estable y revisión de mapa/sampleRate |
| Niveles | Cero muestras no finitas, cero clipping digital no solicitado; objetivo de salida final ≤−1 dBFS sample peak y revisión de true peak | Análisis de PCM WAV y medidor independiente |
| Tiempo musical | Cero ticks de diferencia tras guardar/recargar y en SMF con PPQ idéntico; eventos coincidentes programados al mismo audioTime | Fixtures de timeline, export/import y scheduler |
| Portabilidad | Hash de toma histórica idéntico; paquete completo restaura assets y documento; archivo corrupto se rechaza sin escribir | SHA-256 antes/después, base vacía, inyección de fallo |
| Rendimiento | Sin congelar editor al mostrar 10.000 notas; PCM residente dentro del presupuesto publicado por modo; primer sonido del núcleo sin red | Perfil de frames, memoria y arranque de build de producción |
| Licencias | Cada paquete instalado registra origen, versión, hash y licencia; cada CC BY muestra crédito; fuentes NC no se incluyen | Auditoría de manifiestos y dist |

## Línea base automatizada del 2026-11-01

| Área | Resultado observado | Límite de la evidencia |
|---|---|---|
| SMK-37 Elite por cable | Captura WinMM de 90 s con 520 eventos Note On/Off, 23 pitches y máximo siete notas simultáneas; bytes en `.logs/smk37-elite-physical-20261101.jsonl`. | No incluye 37 teclas, pedales/CC, dos acordes de 37, salida de audio ni latencia. No valida Pro. |
| Polifonía y lock | Pruebas Chromium simulan 37 notas, sustain, segundo acorde y una sola pestaña dueña del audio; `.logs/20261101-155620-eng-live-retention.log`. | Falta entrada física de 37 teclas y comprobar cero voces colgadas con loopback. |
| Beat propio | Flujo de cuatro compases con piano, batería, intro/verso/hook, guardado, MIDI, WAV PCM no silencioso y paquete restaurado en viewport 320 px; `.logs/20261101-155228-root-four-bar-flow4.log`. | El fixture todavía carece de un 808 de grabación profesional/licencia aprobada y de aprobación auditiva. |
| Rendimiento del editor | En Chromium de escritorio emulando 390 px, 10.000 notas: edición individual de proyecto 2,8 ms y lote de 128 notas 1,3 ms tras validador focal; `.logs/20261101-160332-prj-10k-structural-profile.log`. Piano roll de 10.000 notas p95 de frame 16,7 ms en 320 px; `.logs/20261101-154816-beatmaker-roll-10k-budget.log`. | Estas cifras son del CPU de escritorio; falta presupuesto y medición en teléfono físico con beat y 37 notas live. |
| Superficie móvil | En Chromium táctil emulado a 320 y 390 px, ocho espacios de Studio, Pistas y Configuración sin desborde horizontal; botones, inputs y selects habilitados con área efectiva de al menos 44×44 px (checkbox mediante etiqueta). Auditoría `.logs/20261101-160740-root-mobile-targets-effective.log`; prueba repetible 320 px `.logs/20261101-161149-root-mobile-target-gate.log`. | No prueba Safari/Android físicos, todos los estados dinámicos ni latencia de toque. |
| Portabilidad | Overdub desde Pistas conserva SHA-256 del `.mid` antes/después, undo/redo y recarga `.logs/20261101-160025-root-overdub-frozen-integration.log`; clips de audio absoluto/split/crossfade conservan bytes y referencias en paquete `.logs/20261101-155828-prj-audio-storage-split-e2e.log`. | Falta recorrido completo con todos los efectos, automatización, bibliotecas opcionales y sonido físico. |
| Grabación programada | Cuenta y punch de un compás, cancelación antes del primer frame y WAV con frames del intervalo pasan `.logs/20261101-164157-root-aud02-count-punch.log`; regresión de grabación previa 3/3 `.logs/20261101-164209-root-aud02-existing2.log`. | La entrada es simulada por Chromium; falta micrófono/loopback y medición de latencia física. |
| Mezcla y automatización base | Siete efectos individuales tienen PCM no silencioso y paridad live-like/WAV focal `.logs/20261101-162700-eng-mix02-individual.log`. Curvas step/linear de ganancia/pan/master: PCM live-like/WAV con diferencia máxima cero `.logs/20261101-165429-eng-aut-pcm.log`; hot-swap con scheduler atrasado y sin caída a base `.logs/20261101-170026-eng-aut-hotswap-pcm3.log`. | Falta touch write, MIDI Learn de parámetros, bezier, sends/sidechain, paridad transversal de stems y escucha física. |
| Restauración | Previsualización JSON/V2/V3 verifica documento, bytes y licencia sin escribir IndexedDB; archivo corrupto se rechaza `.logs/20261101-164539-prj-bundle-preview-v3-e2e.log`. UI exige confirmar copia nueva `.logs/20261101-164727-root-preview-ui2.log`. CAS fallido devuelve sólo su marca nueva a staging `.logs/20261101-165030-prj-failed-cas-assets-e2e.log`. | La validación de bundles grandes aún usa el hilo principal; crash entre marca y CAS puede retener bytes huérfanos. |
| Línea base CPU 4× | Chromium 320 px con CPU emulada 4× y 10.000 puntos AUT: frame p95 16,7 ms; con 10.000 notas ROL: frame p95 33,4 ms, zoom 46,2 ms `.logs/20261101-165633-beatmaker-cpu4x-stable.log`. | Es CPU de escritorio ralentizado, no teléfono físico; ROL aún muestra jank bajo esta carga. |

## Ficha de resultado por corrida

Registrar: fecha; commit/árbol; build; navegador/versión; sistema/CPU/RAM; SMK-37 variante y puerto; firmware si se conoce; entrada/salida/driver; sampleRate/buffer; instrumento/paquete/hash; proyecto fixture; metodología; p50/p95/p99; peak/RMS; dropouts; voces máximas/finales; capturas/logs/audio; resultado por requisito; observaciones auditivas; limitaciones. Una cifra sin su configuración no valida el producto.

## Orden de pruebas

1. Baseline de Studio actual y conservación de tomas; pruebas sin alterar IndexedDB personal.
2. Cada módulo: contrato unitario, interacción focal y render musical.
3. Corte transversal: beat completo, guardado, recarga, exportación, restauración, 37+37, dos pestañas y actualización de service worker.
4. Build de producción y auditoría de assets; audición/loopback física Elite. Pro se valida en una corrida propia cuando haya evidencia.

Ninguna fila está aprobada por la existencia de esta spec. El reporte de ejecución anexará resultados y diferencias reales.


## Gate de cierre SDD añadido el 2026-11-01

- Inventario reproducible: `scripts/audit-beatmaker-requirements.mjs`.
- Expediente individual de 113 IDs: `acceptance-evidence.json`; cada
  fila comienza como `pending`, incluso si existe código para ella.
- Verificador: `scripts/verify-beatmaker-acceptance.mjs --check`
  comprueba integridad del expediente sin declarar nada aceptado.
  La modalidad `--release` exige expedientes aprobados con evidencia,
  y ensayo físico real Elite bajo `smk37-elite-physical-evidence.json`.
- QA software reproducible Windows:
  `pwsh -File scripts/validate-studio.ps1` y sus logs `.logs/`.
- El CI de GitHub Actions fue **eliminado por decisión del dueño**
  (2026-11-02). No hay workflow que ejecute pasos; la validación ejecutable
  es el script local anterior. Su historial de runs no certifica ni bloquea
  entregas.

**Comprobación vía API GitHub realizada:** las 15 specs contienen 113
IDs de requisito, todos secuenciales y únicos; los siete OGG núcleo
existen en el árbol fuente. Eso no sustituye la compilación ni la auditoría
de los archivos generados `dist`.
