# ARR — Arreglo y escenas: requisitos

Estado: pendiente. Produce música propia en Studio mediante clips y loops editables.

## Historias y criterios

- ARR-01 Línea temporal por compás y pista para clips MIDI, drum y audio; mover, duplicar, cortar, alargar, recortar, mutear y agrupar. Los límites de clip no destruyen la fuente.
- ARR-02 Patrón compartido frente a “hacer único” se indica claramente. Editar fuente compartida actualiza instancias relacionadas; editar copia única afecta sólo esa copia.
- ARR-03 Secciones intro, verso, hook, puente y outro son marcadores editables, no estructuras obligatorias. Se puede duplicar sección conservando referencias y automatización pertinente.
- ARR-04 Launcher de escenas permite probar combinaciones de clips; lanzamiento cuantizado por compás o subdivisión. El usuario puede grabar una actuación de escenas en el arreglo.
- ARR-05 Por pista existe una sola autoridad en un instante: arreglo o launcher. Al cambiar autoridad se definen cola, Note Off y crossfade; la UI muestra la fuente activa.
- ARR-06 Clips de audio distinguen beat anchoring y tiempo absoluto, y los cambios de BPM muestran su efecto antes de confirmar. Clips MIDI siguen ticks.
- ARR-07 Edición durante reproducción invalida sólo eventos futuros de clips afectados. Selección, zoom y scroll toleran proyectos largos sin congelar el audio.

## Aceptación

Crear intro/verso/hook con tres patrones y dos escenas; duplicar un patrón, hacer única una instancia, modificarla y verificar que las demás no cambian. Lanzar y capturar escenas, recargar y exportar sin notas duplicadas en el cambio de autoridad.
