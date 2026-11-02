# CLK — tareas y puertas

- [ ] Medir latencia y jitter del motor actual con metrónomo, 37 notas y dos pestañas.
- [x] Implementar tempo map, compás y conversión tick/tiempo con casos de borde y pruebas de propiedad.
- [x] Integrar scheduler de ventana, epoch, cancelación por owner y estados de transporte.
- [x] Añadir loop, seek, count-in, metrónomo y cambios de BPM durante reproducción.
- [x] Enlazar el lock de audio existente con cesión y recuperación del transporte; probar suspensión y vuelta.
- [ ] Probar 100 loops, notas cruzadas, mute/solo, edición durante Play y 37+37 notas con sustain.
- [ ] Aceptar con comparación de eventos programados/sonados, límite de voces estable y ausencia de voces colgadas.
