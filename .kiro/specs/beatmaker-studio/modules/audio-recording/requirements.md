# AUD — Grabación y edición de audio: requisitos

Estado: pendiente. Grabación propia de voz, instrumento externo y resampling interno.

## Historias y criterios

- AUD-01 Solicitar permiso de micrófono/entrada sólo al armar o monitorizar pista de audio; mostrar dispositivo activo, nivel, clipping y estado de permiso. No grabar en segundo plano sin indicador.
- AUD-02 Capturar con count-in, punch-in/out, múltiples tomas y comping no destructivo. Guardar frames con tiempo de inicio de audio y referencia a posición musical; una interrupción marca el take como incompleto y recuperable.
- AUD-03 Monitor de entrada configurable con advertencia de realimentación y mute predeterminado cuando la entrada y salida pueden acoplarse. Desactivar monitor no modifica la grabación.
- AUD-04 Calibrar latencia de entrada y compensarla por take sin mover destructivamente el audio original. El usuario puede corregir offset con precisión de frame y volver al valor capturado.
- AUD-05 Audio clips admiten trim, fade, gain, split, move, duplicate y crossfade básico; conserva fuente y undo. Beat anchored y tiempo absoluto tienen semántica explícita al cambiar BPM.
- AUD-06 Resampling interno graba un bus elegido del proyecto en un clip nuevo sin micrófono; indica fuente, duración, efectos incluidos y evita bucle de grabarse a sí mismo.
- AUD-07 Si hay cuota insuficiente, dispositivo desconectado o permiso revocado, cerrar la toma con error claro y recuperar segmentos confirmados sin corromper el proyecto.

## Aceptación

Dos tomas con punch y comping reabren con frames, offsets y fades intactos; revocar permiso a mitad de toma deja datos recuperables; un resample del bus no incluye el micrófono ni el propio clip.
