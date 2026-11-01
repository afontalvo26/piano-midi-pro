# ARR — diseño

## Modelo

Track contiene ordered ClipInstances con id, sourceId/version, startTick, lengthTick, sourceOffsetTick, loopMode, transpose, gain y mute. SectionMarker sólo anota una región. Scene contiene referencias de clip por track y launchQuantization. PatternSource no contiene posición absoluta del arreglo; repetir un patrón no clona sus notas.

ResolverTimeline recibe revisión PRJ, ventana tick y modo de pista. Devuelve eventos de clips con instanceId, cycleIndex y sourceEventId para deduplicar. Launcher usa state machine queued→active→stopping; el arreglo se inhibe sólo en la pista tomada por launcher. Capturar escena genera comandos PRJ de clip con posiciones quantizadas, sin escribir audio en otro reloj.

## Edición y cancelación

Cada cambio tiene comando reversible y validación de solapes/longitudes. Un clip que termina libera sus voces asociadas según política de cola; un audio clip puede crossfadear; una nota MIDI que cruza clip/loop sigue la política CLK. El resolvedor no accede a DOM ni a IndexedDB durante scheduling.

## Integración

CLK programa resultados; ROL/DRM editan fuentes; AUD/SMP proveen clips de audio; MIX recibe trackId/bus; AUT enlaza curvas a pista, clip o sección. EXP usa el mismo resolvedor y la misma prioridad arreglo/escena que Studio.
