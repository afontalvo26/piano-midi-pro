# MIX — tareas y puertas

- [ ] Medir niveles y headroom del grafo live actual con piano, pads y 37+37.
- [ ] Implementar buses, validación acíclica, gain/pan, mute/solo y medidores reales.
- [ ] Implementar efectos versionados, bypass y cambio de orden sin clic.
- [ ] Añadir sends, sidechain, cola y compensación de latencia.
- [ ] Comparar live/offline, stems, clipping y A/B nivelado.
- [ ] Aceptar con fixture audio y recuperación tras saturación, Stop y cambio de preset.


## Tanda de implementación y pendientes concretos — 2026-11-01

- [x] Proponer código de sends post-fader por pista, validación acíclica y UI móvil en PR #1.
- [x] Escribir pruebas para volumen de envío, stems y reversibilidad en PR #1.
- [ ] Conseguir corrida válida de esas pruebas, TypeScript, lint y build; los jobs Actions actuales fallan antes de entrar en un runner.
- [ ] Medir y corregir mute/solo en las rutas paralelas y su efecto en el transporte y los stems.
- [x] Proponer tap aislado de buses con envíos, sin contribuciones de rutas directas/master, y escribir aserciones antidesbordamiento.
- [ ] Ejecutar pruebas reales de esos taps, corregir fallos y validar en salida física.
- [ ] Diseñar y aprobar detector sidechain, control de reducción, lookahead y paridad live/offline.
- [ ] Implementar y medir sidechain kick→808, A/B y reducción de clics.
- [ ] Registrar medición de headroom, clipping y estrés de 37+37 en hardware real.

Marcar `[x]` de arriba confirma **creación de la propuesta o del test**,
no aceptación del requisito; ningún `MIX-xx` está aprobado por esa sola razón.
