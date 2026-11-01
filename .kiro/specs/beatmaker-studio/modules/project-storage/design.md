# PRJ — diseño

## Modelo y límites

Documento inmutable versionado con Project, Track, Pattern, Note, Clip, Scene, AssetRef, MixState y AutomationLane. Todos los tiempos musicales se almacenan en ticks enteros con PPQ de esquema (inicial 960), no en píxeles ni milisegundos. Una revisión es un número monótono con hash del documento serializado canónicamente. Las muestras grandes viven fuera de la fila principal.

API propuesta: createProject, applyCommand, getRevision, listProjects, commitRevision, readAsset, stageAsset, exportBundle, importBundle y convertRecordedTake. La interfaz de lectura es tipada; ningún editor escribe IndexedDB directamente. El proyecto usa un almacén nuevo o una migración aditiva: la base piano-midi-pro-recordings versión 1 no se recrea ni se vacía.

## Consistencia y recuperación

La escritura del documento y sus índices es una transacción IndexedDB. El archivo de audio se escribe primero en área temporal con hash; después se confirma su referencia; un limpiador sólo retira temporales que ninguna revisión referencia. No se presume transacción atómica entre IndexedDB y OPFS. Exportación toma snapshot de revisión confirmada; importación valida manifest, tamaños, rutas y hashes antes de crear IDs nuevos. La lectura de versiones futuras queda en modo seguro de solo lectura.

El lector SMF para tomas históricas tiene límites de bytes, pistas, eventos y duración; conserva los bytes de la toma como fuente. La conversión registra decisiones de canal, tempo, CC y pares Note On/Off, además de un informe de eventos descartados. Undo se implementa con operaciones inversas o snapshots compactos por límite de memoria; no guarda buffers PCM en la pila de historial.

## Integración

CLK consume snapshots inmutables; ROL, DRM y ARR emiten comandos PRJ; EXP toma una revisión fija. UX muestra revisión, guardado y faltantes. Los cambios de esquema tienen fixture de migración y procedimiento de rollback documentado antes de desplegar.
