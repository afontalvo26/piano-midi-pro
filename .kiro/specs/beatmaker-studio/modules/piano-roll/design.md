# ROL — diseño

## Datos y edición

ROL recibe un PatternSnapshot de PRJ: NoteEvent(id, startTick, durationTick, pitch, velocity, releaseVelocity, channel, source, microOffset, probability, ratchet) y lanes de expresión. El editor mantiene selección efímera por IDs; los cambios duraderos son comandos PRJ validados. Coordenadas de pantalla se convierten a tick/pitch mediante una única transformación con scroll y zoom, y el redondeo de snap ocurre sólo al confirmar el comando.

Las notas fantasma y la preescucha se leen de snapshots; no modifican otros patrones. Los eventos de CC/bend se ordenan por tick y canal; una edición de automatización de mixer se envía al módulo AUT, no se codifica como CC MIDI si no corresponde. El grabador MID entrega un overlay de notas abiertas con tiempo actual, sin escribir notas “infinita” en PRJ.

## Render y rendimiento

Viewport virtual o canvas de notas con capa accesible para selección/edición; hit testing por índice espacial o intervalo temporal. Actualizaciones de puntero se agrupan por frame, audio se programa desde CLK. El historial agrupa drag completo en un comando. Una transformación de 10.000 notas corre fuera del camino de audio y permite cancelar antes de confirmar.

## Casos límite

Longitud mínima de una unidad de tick; pitch 0–127 y velocidad 1–127; eventos simultáneos conservan orden estable. “Hacer único” pertenece a ARR y crea patrón nuevo antes de edición de instancia. Clip transpuesto muestra pitch real y fuente sin duplicar valores en el modelo.
