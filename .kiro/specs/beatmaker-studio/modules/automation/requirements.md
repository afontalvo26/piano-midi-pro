# AUT — Automatización y expresión: requisitos

Estado: pendiente. Separar interpretación MIDI de parámetros de mezcla e instrumentos.

## Historias y criterios

- AUT-01 Registrar parámetros automatizables con id estable, rango, unidad, escala lineal/log, smoothing y alcance (nota, clip, pista, bus, master). Un parámetro retirado abre en estado desconocido sin desplazar otras curvas.
- AUT-02 Crear, grabar, dibujar, mover, copiar, pegar y borrar puntos/segmentos con valores exactos. Modos de escritura read, touch, latch y write se definen antes de mostrarlos; la primera versión puede ofrecer read/touch explícitos.
- AUT-03 La reproducción resuelve precedencia de valor base, preset, automatización de clip/pista y control físico en vivo. La UI muestra valor efectivo y dueño; soltar un fader aprendido no deja un salto.
- AUT-04 CC1/7/11, sustain/sostenuto/una corda, bend y presión de una toma siguen como eventos de expresión MIDI con canal/nota y tiempos originales. Automatización de mixer se guarda separada.
- AUT-05 Curvas lineales/step y, cuando se implemente, curvas suavizadas, se programan con resolución suficiente para evitar zipper noise; live y exportación usan la misma interpolación.
- AUT-06 MIDI Learn puede enlazar un control a un parámetro permitido, con takeover pickup/relative/absolute según mensaje observado; no confunde un fader de banco con otro sin evidencia.
- AUT-07 Undo, duplicación de clips, cambio de tempo y hacer único conservan asociación y valor de curva correcto.

## Aceptación

Grabar fader sobre ocho compases, editar tres puntos, duplicar clip, guardar, reabrir y comparar valores efectivos en cinco ticks y señal exportada. Un CC11 de una nota MIDI no mueve el fader maestro.
