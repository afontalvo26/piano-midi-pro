# PRJ — tareas y puertas

- [ ] Inventariar tomas reales existentes y probar exportación/hash antes de diseñar migración.
- [x] Fijar esquema tipado v1, límites de tamaño, invariantes referenciales y JSON canónico; documentar compatibilidad hacia delante.
- [x] Implementar almacén nuevo, comandos reversibles y guardado por revisiones; probar fallo/cierre durante transacción.
- [x] Implementar staging de audio, GC por referencias, cuota, copia portable y validación previa a importación.
- [x] Implementar lector SMF acotado y conversión explícita de tomas antiguas sin alterar los bytes originales.
- [ ] Probar autosave, undo/redo, nombres duplicados, proyecto futuro, corrupción, falta de activo y actualización de service worker.
- [ ] Aceptar sólo con comparación de revisión tras recarga, hash intacto de tomas y restauración de paquete sin pérdidas.
