# DRM — Drum rack y secuenciador de pasos: requisitos

Estado: pendiente. Debe permitir producir beats completos desde pads físicos, ratón y teclado.

## Historias y criterios

- DRM-01 Rack de al menos 16 pads visibles con bancos: muestra/instrumento por pad, nota MIDI, nombre, color, gain, pan, pitch, inicio/fin, ataque/decay, one-shot/gate, mute/solo y preescucha. El pack Beatmaker aprobado usa grabaciones profesionales verificadas; no sustituye pads faltantes por síntesis genérica.
- DRM-02 Kit mínimo local con kick, snare, clap, closed/open hat y percusión con licencia verificable. El proyecto conserva la versión/hash exacta de cada fuente; una descarga opcional fallida no silencia el kit mínimo.
- DRM-03 Choke groups: closed hat cierra open hat con rampa sin clic; exclusión es por grupo y pista, sin cortar voces de otro kit o teclado live.
- DRM-04 Secuenciador por pad/patrón con longitud en pasos configurable, división de pulso, velocity/acento, swing, probabilidad, ratchet, microtiming y desplazamiento de inicio. Un step y su(s) evento(s) MIDI son la misma información editable.
- DRM-05 Permite polirritmia de longitudes distintas por pad sin derivar el reloj; se muestra el ciclo común y se limita la duración máxima para evitar planes infinitos.
- DRM-06 Pads SMK-37 se aprenden por bytes reales; velocity física queda preservada. Note Repeat del dispositivo no se duplica con el ratchet del software sin selección visible.
- DRM-07 Cada paso se abre en ROL con sus notas; editar desde una vista se refleja en la otra sin conversiones que pierdan velocity, ratchet o probabilidad.

## Aceptación

Programar 4 compases de kick/snare/hat, hats 1/32 con variación de velocidad y choke, duplicar, editar cinco golpes y exportar/reabrir. Cien loops no acumulan voces; semilla fija reproduce la misma probabilidad en live y WAV.
