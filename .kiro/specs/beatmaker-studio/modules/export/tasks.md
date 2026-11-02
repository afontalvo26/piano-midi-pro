# EXP — tareas y puertas

- [x] Fijar matriz de formatos, stems, colas, sidechain y licencias de assets incluidos.
- [x] Implementar render snapshot/offline, progreso, cancelación y validador de PCM/WAV.
- [x] Implementar stems alineados, políticas de sends y comparación con master.
- [x] Implementar SMF tipo 1 de arreglo/patrón con controles y tempo map.
- [x] Implementar paquete portable con hashes/licencias y restauración PRJ en base limpia.
- [ ] Probar muestra faltante, efecto incompatible, clipping, silencio, archivo alterado y exportación tras recarga.
- [ ] Aceptar con A/B live/WAV, alineación por frame y exportación byte a byte de tomas históricas.


## Tanda de sends y stems — 2026-11-01

- [x] Proponer exportación del master y stems por pista con grafo de sends en PR #1.
- [x] Registrar explícitamente `sendsIncluded` en el WAV/ZIP de salida.
- [x] Proponer taps distintos para bus y salida directa, con sends y selección de rutas anidadas.
- [x] Escribir test E2E de stem de bus, salida directa y ausencia de filtración desde master.
- [ ] Ejecutar comparación PCM live/offline y exportación real de master/track/bus con sends.
- [ ] Corregir los fallos de ejecución y validar stems por bus con colas y sin doble mezcla.
- [ ] Verificar aditividad y sidechain después de completar MIX-04.
- [ ] Hacer pasar suite transversal y auditoría de build en una revisión fija.
