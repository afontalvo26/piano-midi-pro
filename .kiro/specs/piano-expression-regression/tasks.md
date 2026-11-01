# Tareas — expresión y fidelidad

- [x] Diagnosticar por separado ruta de audio, mapping/calibración MIDI e interfaz antes de editar.
- [x] Medir A/B PCM del sampler anterior y la nueva ruta; separar diferencias reales de código que no estuvo conectado.
- [x] Añadir curva Expresiva, calibración por puerto, piso hasta cero y 127 pasos crecientes.
- [x] Distinguir puerto realmente escuchado, MIDI físico y teclado virtual en Studio; mostrar cinco intensidades.
- [x] Recuperar ataque/cola del piano anterior, ruta seca con MOD=0 y conservar aftertouch.
- [x] Preparar 52 OGG de cuatro capas con manifest, hashes y atribución.
- [x] Activar cuatro capas sólo tras selección, con preparación atómica, compensación de nivel y límite de memoria de 432 MiB PCM residente.
- [x] Validar continuidad en cambios de capa, señal 37+37, fallo/cancelación, cambio de octava y arranque sin carga masiva.
- [x] Cerrar TypeScript, ESLint, build, 47 pruebas E2E y prueba del build de producción con carga de 52 OGG.
- [ ] Registrar cinco velocidades y escucha del SMK-37 físico y salida usada; pendiente de respuesta del dueño.
