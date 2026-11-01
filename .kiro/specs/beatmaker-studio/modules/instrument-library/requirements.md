# INS — Instrumentos profesionales: requisitos

Estado: pendiente. La investigación de fuentes y prioridades está en [instrumentos-oficiales.md](../../instrumentos-oficiales.md).

## Historias y criterios

- INS-01 Selector por familia, instrumento real, motor, fuente, licencia, tamaño y estado: núcleo local, instalado, disponible para descarga, incompleto o fallido. Cada pista guarda instrumentId, packageVersion y preset; cambiar otra pista no altera su sonido.
- INS-02 El piano principal usa muestras reales Salamander y conserva 37 voces simultáneas, release, pedales CC64/66/67, CC1/7/11, bend y presión donde el instrumento los soporte. Modo calidad ofrece las 16 capas de la fuente después de instalación verificada; el núcleo ligero local conserva respuesta inmediata y se etiqueta como tal. La respuesta a velocity 1–127 es monótona en energía percibida con carácter tímbrico por capas, sin escalones ofensivos ni silencio prematuro.
- INS-03 Los instrumentos candidatos se admiten sólo con fuente oficial, licencia que permita redistribución en software, créditos, versión/hash, mapa de notas/velocity/articulaciones y test de audio. CC BY conserva atribución visible; licencia NC o sólo permiso para composiciones no se empaqueta.
- INS-04 Motor de muestras soporta key zones, velocity zones, round robin, release trigger, sustain/half pedal si existe, keyswitch/articulaciones que se implementen, tuning y voice stealing priorizado. Un opcode SFZ no soportado se rechaza o se traduce explícitamente; no se declara compatibilidad SFZ completa.
- INS-05 Paquetes pesados son opcionales y se cargan por demanda. Preload del núcleo local garantiza primer sonido sin red; instalación verifica hash y no cambia un proyecto abierto de versión silenciosamente.
- INS-06 Igual instrumento/preset y eventos produce resultado comparable en live y exportación. Voz de preview, live y secuenciada tiene dueño; cambiar preset deja terminar o libera las voces anteriores según política visible.
- INS-07 Afinación, dinámica, ruido, transiciones, clipping, canales, memoria y tiempo de primera nota tienen ficha de QA. “Profesional” se muestra sólo para bancos aprobados por audición real y mediciones, no por licencia o marca de piano.
- INS-08 Compatibilidad genérica GM permanece como respaldo con descripción honesta; un banco web remoto no se presenta como descargado y no se usa en exportación offline sin estar disponible localmente.

## Aceptación

Cada candidato pasa manifiesto/licencia/hash, 37 teclas, seis niveles dinámicos, acordes con sustain, cambio entre dos pistas, reproducción+live y exportación A/B. Un paquete faltante muestra diagnóstico; no sustituye en silencio el instrumento de un proyecto.
