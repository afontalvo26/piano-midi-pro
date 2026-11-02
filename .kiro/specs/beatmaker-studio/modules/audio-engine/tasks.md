# ENG — tareas y puertas

- [ ] Medir el motor actual en build de producción: 37+37, pedal, dos pestañas, PCM, clipping y latencia cableada.
- [x] Formalizar EventEnvelope/VoiceOwner y separar live, transporte, preview, pads y metrónomo.
- [x] Revisar voice allocator para retriggers, pedal parcial, sostenuto, una corda, bend y presión con tests de liberación.
- [x] Implementar límites de voz/PCM y diagnóstico de robo, colas, decode, lock y dropouts.
- [x] Asegurar transiciones de instrumento/ganancia sin clic y primer sonido offline desde núcleo local.
- [ ] Validar con fixture QLT y SMK-37 físico; no cerrar por test simulado si sigue sonando mal.
