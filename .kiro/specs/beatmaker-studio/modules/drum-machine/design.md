# DRM — diseño

## Modelo

DrumKit = mapa padId→VoiceDefinition/AssetRef, MIDI note, grupo choke y parámetros. DrumPattern contiene eventos musicales NoteEvent en ticks; la rejilla de pasos es una proyección con metadatos de step (probabilidad, ratchet, microtiming). Los golpes fuera de rejilla siguen visibles y editables en ROL. No se mantienen dos listas de notas divergentes.

El generador determinista de pasos recibe projectSeed, clipId, cycleIndex y stepId. Produce decisiones de probabilidad y subeventos ratchet con IDs derivados, sin mutar el patrón. CLK programa el resultado; EXP usa el mismo generador y semilla. Swing aplica al tiempo musical antes de convertir a audioTime y nunca altera el original sin comando.

## Motor

Cada pad usa un bus/ruta MIX y una política de voces, con choke scoped al kit. Las voces one-shot dejan sonar la cola definida; gate responde a Note Off. Sustitución de kit conserva IDs/notes y pide resolver pads faltantes. Las muestras deben pasar por INS/SMP para licencia, decodificación y memoria.

## Integración

MID asigna hardware a padId; PRJ guarda kits y patrones; ROL comparte NoteEvent; ARR referencia patrones; MIX recibe submezcla/stems. La UI muestra si un golpe vino de un pad, ratchet o entrada MIDI en vivo.
