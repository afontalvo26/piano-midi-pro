# AUT — diseño

## Registro y curvas

ParameterDescriptor(typeId, version, ownerId, parameterId, min, max, unit, scale, smoothing, default) fija validación. AutomationLane(owner, parameterRef, points, interpolation, mode) usa ticks enteros y valores normalizados con conversión exacta al parámetro. Se detectan puntos duplicados en tick y se mantiene orden estable. Los CC MIDI son EventLane del patrón y no se convierten automáticamente a curvas de mixer.

El resolvedor calcula: base/preset → curva de alcance activo → gesto físico según modo de escritura → smoothing de DSP. La precedencia se documenta por parámetro y se muestra en UX. Para evitar saltos al salir de touch, el valor vuelve a la curva mediante rampa. Eventos de pad/step con probabilidad se resuelven antes de programar parámetros por voz.

## Programación

CLK entrega horizonte temporal; AUT genera segmentos de control con epoch y owner. Los nodos Web Audio reciben rampas en audioTime; no se persigue el playhead con setState. EXP usa el mismo resolvedor y curva. Los eventos MIDI CC y bend se aplican en orden temporal respecto a Note On/Off y se mantienen por canal.

## Límites

No se promete MPE por nota en MIDI 1.0 convencional. Un plugin/adaptador que no expone un parámetro automatizable no muestra lane falsa. Los mapeos físicos MID guardan identidad del puerto y tipo de mensaje para evitar colisiones.
