# ENG — diseño

## Capas

El adaptador live recibe EventEnvelope con eventId, ownerId, inputId, channel, pitch fuente/mapeado, velocity, amplitude, timestamp y controles. El voice allocator mantiene identificadores por pulsación, estado held/sustained/releasing y referencia al InstrumentSlot. No usa pitch como única clave, porque retriggers y varias entradas pueden compartir nota.

InstrumentSlot reúne banco decodificado, factory de voz y bus de pista; queda retenido mientras tenga handles activos. Cambiar instrumento prepara el slot nuevo, hace transición de ganancia y retira el anterior al quedar sin voces. Las muestras se cargan por hash y un cache acotado; los siete OGG núcleo tienen prioridad y no requieren red.

El grafo de una pestaña dueña incluye buses live/transport/preview/pads/metrónomo, MIX y master. studioAudioLock arbitra la pertenencia. Se asignan rampas de ganancia/expresión en audioTime. El callback crítico no parsea archivos, no consulta IndexedDB y no actualiza React por cada muestra; el estado visual se publica por frame o cadencia diagnóstica.

## Pedales y controles

Cada canal/puerto mantiene CC64/66/67, volumen, expresión, modulación, bend y presión. Note Off se registra al llegar aun si pedal retiene la voz; liberar pedal aplica la política correspondiente a ese canal. Sostenuto captura sólo notas activas al pisarlo. Medio pedal tiene resolución MIDI 0–127 pero la respuesta acústica depende del banco y se calibra. Panic elimina eventos futuros, rampas y voces de todos los owners con recuperación explícita.

## Fallos

Una descarga fallida no reemplaza el slot estable; un decode fallido marca el banco parcial. AudioContext suspendido y lock perdido generan epoch de invalidación, limpieza y posible reanudación por gesto. El motor publica contadores y límites verificables por QLT, incluyendo voz robada y memoria PCM.
