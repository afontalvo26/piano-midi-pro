# Beatmaker Studio — índice de especificaciones por módulo

Estado: implementación parcial en curso; ningún módulo ni la matriz transversal está aprobado en su totalidad. Revisión: 2026-11-01. [Evidencia del corte actual](implementation-status.md).

## Contrato de producto

Studio permite interpretar, grabar, crear loops, editar notas y audio, arreglar, mezclar y exportar música propia. Pistas conserva las tomas MIDI propias y abre proyectos propios. Configuración aloja audio, MIDI, diagnósticos y bibliotecas instaladas. La reproducción de un proyecto propio ocurre dentro de Studio. No vuelven Música, Canciones, catálogo de canciones MIDI, reproductor antiguo, letras, karaoke, Juego, Partitura ni la app player.

El código ya ofrece instrumento live, grabación SMF e IndexedDB para tomas. El corte actual añade proyecto versionado, motor secuenciado, piano roll, rack, sampler local, captura/edición básica de audio, arreglo, mezclador básico y exportaciones MIDI/WAV/stems con pruebas focales. Siguen abiertos efectos, automatización audible, 808 autorizado, bancos opcionales, flujos avanzados de grabación y QA físico. Un requisito escrito o una prueba simulada no equivale a aceptación completa.

## Especificaciones

| ID | Módulo y contrato | Responsable de los datos | Prerrequisitos |
|---|---|---|---|
| PRJ | [Proyecto y persistencia](modules/project-storage/requirements.md) | Proyecto, versiones, activos, historial, migraciones | Ninguno |
| ENG | [Motor de audio live](modules/audio-engine/requirements.md) | AudioContext, voces, pedales, expresión y recursos | INS, CLK |
| CLK | [Reloj, transporte y secuenciador](modules/transport/requirements.md) | Posición, plan de eventos, voces de transporte | PRJ |
| MID | [MIDI físico y captura](modules/midi-controller/requirements.md) | Eventos crudos, mapeos aprendidos, tomas | CLK, PRJ |
| ROL | [Piano roll](modules/piano-roll/requirements.md) | Edición de notas y controladores | PRJ, CLK |
| DRM | [Drum rack y pasos](modules/drum-machine/requirements.md) | Kits, pads, pasos y choke | PRJ, CLK, INS |
| SMP | [Sampler, slicing y 808](modules/sampler-808/requirements.md) | Muestras del usuario y zonas de sampler | PRJ, CLK, INS |
| AUD | [Grabación y edición de audio](modules/audio-recording/requirements.md) | Tomas de entrada, clips y compensación | PRJ, CLK, SMP |
| INS | [Instrumentos profesionales](modules/instrument-library/requirements.md) | Catálogo, licencias, paquetes y motores | PRJ |
| ARR | [Arreglo y escenas](modules/arrangement/requirements.md) | Clips de arreglo, escenas y arbitraje | PRJ, CLK, ROL, DRM |
| MIX | [Mixer y efectos](modules/mixer-effects/requirements.md) | Rutas, buses, efectos y medidores | CLK, INS |
| AUT | [Automatización y expresión](modules/automation/requirements.md) | Curvas editables y parámetros | PRJ, CLK, MID, MIX |
| EXP | [Exportación y portabilidad](modules/export/requirements.md) | Render, stems, MIDI y paquete | Todos los datos y audio |
| UXP | [Studio, Pistas y Configuración](modules/studio-experience/requirements.md) | Navegación, foco, estado visible | Interfaces de los módulos |
| QLT | [Calidad y aceptación transversal](modules/quality-gates/requirements.md) | Evidencia, presupuestos, regresiones | Todos |

Cada módulo tiene requirements.md, design.md y tasks.md. La investigación de bibliotecas está en [instrumentos-oficiales.md](instrumentos-oficiales.md). Los documentos generales [requisitos](requirements.md), [diseño](design.md) y [tareas](tasks.md) describen la secuencia global. ENG e INS evolucionan juntos sobre el motor live existente; el orden de la tabla no implica orden de implementación.

Los [contratos comunes v1](contracts.md) fijan las fronteras entre módulos y la exigencia vigente de muestras profesionales grabadas para el pack Beatmaker.

## Interfaces comunes que se fijan antes de programar

1. Unidad temporal canónica: ticks musicales enteros con PPQ versionado; la conversión a segundos usa un tempo map validado. El reloj de audio programa sonido; React sólo pinta.
2. IDs estables para proyecto, pista, patrón, nota, clip, activo, parámetro y toma. Una nota identifica origen MIDI, canal, pitch original, pitch interpretado y dueño de voz.
3. Una sola fuente de verdad del proyecto. Cada comando de edición es validado, reversible y serializable; la vista no cambia directamente el motor ni IndexedDB.
4. El grafo de audio distingue live, transporte y preview. Cada fuente libera sus propias voces en Stop, Seek, mute o pérdida del lock; no apaga una tecla física de otra fuente.
5. Instrumento y preset son por pista. Los paquetes de muestras se identifican por versión y hash. Faltantes se muestran como error recuperable.
6. Una curva de automatización referencia un parámetro tipado del registro, con rango, unidad, suavizado y dueño. Los CC de la interpretación permanecen como datos MIDI.
7. Live y exportación comparten semántica de eventos, instrumentos, mezcla y automatización. Cada desviación técnica se documenta y mide.
8. Service worker y limpieza de caché no borran IndexedDB ni los activos propios. Las tomas antiguas siguen exportables byte a byte.

## Secuencia de aceptación

Primero PRJ + CLK + ENG + MID + ROL + DRM + INS + ARR + MIX mínimo + EXP, en un corte vertical: beat de cuatro compases, 808, piano, cinco ediciones individuales, arreglo intro/verso/hook, guardado, recarga, WAV, stems, MIDI y paquete restaurado. Después ampliar sampler, audio, efectos, automatización y escenas. QLT y UXP acompañan cada corte; las casillas no se cierran por probar sólo Chromium simulado.

Estados de evidencia: especificado, implementado, prueba automatizada, medición de producción, audición física SMK-37 y aprobado. Sólo se declara terminado un criterio cuando su evidencia requerida existe. Elite y Pro se reportan separados; no se inventa un mapa universal de botones.
