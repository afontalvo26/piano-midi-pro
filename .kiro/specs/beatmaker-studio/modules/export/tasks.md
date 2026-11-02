# EXP — tareas y puertas

- [ ] Fijar matriz de formatos, stems, colas, sidechain y licencias de assets incluidos.
- [ ] Implementar render snapshot/offline, progreso, cancelación y validador de PCM/WAV.
- [ ] Implementar stems alineados, políticas de sends y comparación con master.
- [ ] Implementar SMF tipo 1 de arreglo/patrón con controles y tempo map.
- [ ] Implementar paquete portable con hashes/licencias y restauración PRJ en base limpia.
- [ ] Probar muestra faltante, efecto incompatible, clipping, silencio, archivo alterado y exportación tras recarga.
- [ ] Aceptar con A/B live/WAV, alineación por frame y exportación byte a byte de tomas históricas.


## Tanda de sends y stems — 2026-11-01

- [x] Proponer exportación del master y stems por pista con grafo de sends en PR #1.
- [x] Registrar explícitamente `sendsIncluded` en el WAV/ZIP de salida.
- [x] Rechazar stems por bus con sends, evitando archivos incorrectos.
- [ ] Ejecutar comparación PCM live/offline y exportación real del master/track con sends.
- [ ] Aislar y verificar stems por bus con sends y colas, sin doble mezcla.
- [ ] Verificar aditividad y sidechain después de completar MIX-04.
- [ ] Hacer pasar suite transversal y auditoría de build en una revisión fija.
