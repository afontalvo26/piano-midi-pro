# ENG — Motor de audio live: requisitos

Estado: pendiente. Evoluciona el motor actual sin perder su respuesta inmediata.

## Historias y criterios

- ENG-01 Un único AudioContext/grafo audible por pestaña dueña y un solo dueño entre pestañas. El relevo libera voces y recursos del dueño saliente sin duplicar salida ni bloquear el nuevo.
- ENG-02 37 teclas simultáneas, liberación de 37, sustain CC64 completo/parcial, sostenuto CC66, una corda CC67, dos acordes seguidos y retriggers de la misma nota conservan identidad por puerto/canal/origen y no dejan sonido pegado.
- ENG-03 CC1/7/11, pitch bend, channel/poly pressure y velocity 1–127 llegan a la voz/parametro soportado con suavizado. Los niveles muy bajos son graduables; el piso de ruido o límite real del banco se declara.
- ENG-04 Live, transporte, preview, pads y metrónomo tienen propietarios de voces separados, buses definidos y prioridad de CPU. Stop/Seek afecta transporte; soltar teclado live afecta sólo su nota; panic explícito libera todos.
- ENG-05 Voice stealing, colas de reverb, sample buffers y slots de instrumentos tienen límites medidos y contadores. Si se llega a un límite, degradar según prioridad documentada y registrar el evento; nunca congelar AudioContext.
- ENG-06 Inicio/fin de muestra, transiciones de capa, pedales, cambios de instrumento y variación de gain no generan clic ni saturación oculta. Núcleo Salamander local suena sin red; fuentes opcionales informan carga/error.
- ENG-07 Diagnóstico de audio expone estado, sampleRate, latencia estimada, voces por dueño, PCM residente, fallos de muestra, clipping/dropouts y pérdida del lock sin actualizar la UI a frecuencia de audio.
- ENG-08 El modo de baja latencia se mide con salida cableada real. Procesos pesados de análisis, descarga y edición no compiten en el hilo crítico de audio.

## Aceptación

Prueba de 37+37 con pedal y beat, después Stop/Seek/cambio de preset/relevo de pestaña: cero voces huérfanas, nuevo acorde audible, cero dropouts en la corrida de QLT y respuesta p95 dentro de la meta física registrada.
