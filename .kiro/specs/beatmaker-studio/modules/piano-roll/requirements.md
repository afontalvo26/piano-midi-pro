# ROL — Piano roll: requisitos

Estado: pendiente. Editor por evento para melodías, 808 y pasos de batería.

## Historias y criterios

- ROL-01 Crear, preescuchar, seleccionar, mover, duplicar, pegar, silenciar, dividir, unir, redimensionar y borrar una o muchas notas. Editar pitch, inicio, duración y velocidad con gesto o valor numérico exacto. Los demás eventos del patrón no cambian.
- ROL-02 Zoom, scroll y rejilla por compases con snap libre, binario hasta 1/64 y tresillos; los eventos mantienen ticks enteros y microdesplazamiento después de cambiar zoom. Selección y operaciones cruzan el borde de patrón de forma explícita.
- ROL-03 Carriles editables de velocidad, release velocity, CC, presión y bend donde corresponda. La interfaz muestra canal y alcance de cada control; bend MIDI 1.0 por canal no se presenta como expresión polifónica independiente.
- ROL-04 Cuantizar por fuerza, swing o groove con preescucha y restauración del origen; humanizar con semilla reproducible y límites que no inviertan duraciones o creen Note Off previo al Note On.
- ROL-05 Notas fantasma, resaltado de escala, nombres de pads, audición vertical y navegación con teclado. Ninguna escala obliga a cuantizar/destruir notas existentes sin comando del usuario.
- ROL-06 Accesibilidad: foco, atajos documentados, selección anunciada y edición numérica para operación sin arrastre. Miles de notas no montan un nodo DOM por evento fuera de viewport.
- ROL-07 En grabación, el editor muestra una capa de toma en progreso; sólo la toma confirmada entra al historial PRJ. Editar mientras suena recalcula eventos futuros y no altera voces live ya sostenidas.

## Aceptación

Fixture de 10.000 notas permite zoom/scroll y seleccionar cinco eventos exactos; mover, cuantizar, deshacer y recargar devuelve IDs y ticks esperados. Audición y exportación usan la misma velocidad y duración que se ven.
