# EXP — Exportación y portabilidad: requisitos

Estado: pendiente. Un proyecto propio entrega audio final y fuentes editables verificables.

## Historias y criterios

- EXP-01 Exportar WAV estéreo PCM con sampleRate y profundidad elegibles entre opciones realmente implementadas, rango de compases, normalización opcional y cola de efectos configurable. Progreso y cancelación no alteran el proyecto.
- EXP-02 Exportar stems por pista o bus con nombres/IDs inequívocos; declarar si incluyen sends, master FX, sidechain y colas. Todos empiezan en el mismo origen temporal y se pueden alinear sin ajuste manual.
- EXP-03 Exportar SMF tipo 1 de patrón o arreglo propio con tempo map, compás, pistas/canales, notas, velocity, CC, bend y presión soportados. Eventos que no caben en MIDI 1.0 se informan, no se pierden en silencio.
- EXP-04 Render live/offline comparte resolvedor de clips, probabilidad con semilla, instrumentos, automatización y mixer. Si falta un banco o un efecto offline, bloquear exportación completa o pedir sustitución explícita.
- EXP-05 Paquete portable incluye documento versionado, activos seleccionados, licencias/atribuciones obligatorias, hashes y manifiesto. La opción “referencias externas” no se etiqueta portable completo.
- EXP-06 Validar duración, canales, valores no finitos, clipping, silencio inesperado y tamaño antes de ofrecer archivo; nunca devolver un WAV vacío como éxito.
- EXP-07 Pistas conserva exportación exacta de tomas MIDI originales; exportar un proyecto nuevo no modifica ni borra esas tomas.

## Aceptación

Beat fixture de tres secciones: WAV audible, stems alineados al frame de inicio, SMF con eventos esperados y paquete que restaura en base nueva. Alterar un byte del paquete provoca error antes de escribir.
