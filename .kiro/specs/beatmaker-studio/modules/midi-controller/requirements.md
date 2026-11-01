# MID — MIDI físico y captura: requisitos

Estado: pendiente. SMK-37 Elite y Pro son prioridades distintas; entrada MIDI genérica sigue disponible.

## Historias y criterios

- MID-01 Una sola entrada seleccionada evita dobles Note On por duplicación de puertos. Reconectar, cambiar puerto y perder permiso actualiza estado sin notas pegadas.
- MID-02 Capturar nota, velocidad 1–127, Note Off/velocity, canal, CC1/7/11, CC64/66/67, pitch bend, channel/poly pressure y timestamps. La ruta de grabación conserva evento crudo y su interpretación/ruteo.
- MID-03 Grabar con pista armada, count-in, overdub, replace y punch. Un take completo conserva versión original; cuantización posterior es reversible. Overflow detiene o marca la toma inválida, nunca guarda silenciosamente una toma incompleta.
- MID-04 MIDI Learn asigna pad, perilla, fader, flecha, Play, banco y acciones de Studio por mensaje concreto, canal y dispositivo; detecta colisiones y permite deshacer/reasignar.
- MID-05 SEQ REC/PLAY, ARP, Note Repeat, Scale y Chord pueden actuar internamente en el controlador. El diagnóstico distingue “no emitió mensaje”, “mensaje observado”, “aprendido” y “validado con acción”. No asigna bytes desde una foto o supuesto mapa universal.
- MID-06 La función física y la función de Studio se muestran por separado. Si el dispositivo transforma notas internamente, la captura registra lo recibido y una marca de transformación observada sin inventar las teclas originales.
- MID-07 37 Note On simultáneos, su liberación, sustain y dos acordes seguidos conservan 37 voces distinguibles y recuperación audible. Los pads no roban indebidamente una nota de teclado.
- MID-08 Exportar diagnóstico opcional redactado: bytes MIDI, tiempo relativo, puerto y firmware declarado, sin registrar contenido privado fuera de la sesión ni publicar automáticamente.

## Aceptación

Prueba simulada por cada tipo de mensaje, duplicación de puertos y reconexión; prueba física Elite con captura de cada control disponible; Pro queda pendiente hasta disponer de unidad o bytes. Una acción no se llama verificada sólo porque el UI responde al click.
