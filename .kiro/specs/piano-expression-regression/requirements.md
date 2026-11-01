# Regresión de sonido y expresión del piano — 31-10-2026

## Reporte del dueño

El piano actual suena peor que el anterior y se percibe como si las teclas físicas del SMK-37 se tocaran con el teclado de computadora. La versión anterior es la referencia de comparación; las pruebas simuladas anteriores de 37 notas no validaron su calidad audible.

## Criterios de aceptación

| ID | Resultado comprobable |
|---|---|
| E1 | Una comparación controlada, con las mismas muestras, notas, velocities, niveles y salida, identifica qué partes de la ruta nueva cambian el ataque, espectro, estéreo, volumen y cola respecto de la ruta anterior. No se atribuye la regresión a un código no conectado. |
| E2 | El Studio distingue entrada MIDI física de mouse/teclado virtual y muestra la velocity cruda y la expresión aplicada, de modo que una pulsación física no pueda confundirse con el valor fijo virtual. No duplica entradas al conectar varios puertos. |
| E3 | Pulsaciones físicas con distintas velocities conservan gradación de nivel y timbre; la calibración no aplana el rango ni silencia acordes. La curva y el ajuste activo se muestran y pueden restaurarse sin borrar grabaciones. |
| E4 | CC1, CC7, CC11, aftertouch, pitch bend, sustain, sostenuto, una corda y half pedal se oyen y se reflejan en diagnóstico según los mensajes que el dispositivo realmente emita. Un control no observado no se declara verificado. |
| E5 | Un cambio de instrumento o preset no sustituye de forma inadvertida el Salamander preferido. Se puede comparar/restaurar el sonido anterior de forma clara y reversible. |
| E6 | Con 37 teclas y dos acordes con sustain, el motor mantiene todos los ataques posibles dentro de su límite, no se queda pegado, y recupera voces, latencia y nivel tras soltar. |
| E7 | TypeScript, ESLint, build, pruebas focales, suite final de Studio y prueba de producción pasan con runner acotado. Studio, Pistas y Configuración siguen siendo las únicas pantallas; no vuelven canciones ni reproductor. |
| E8 | Con calibración física inicial, la respuesta de 1 a 127 es estrictamente creciente y conserva cada paso MIDI como valor flotante; velocity 8 debe ser pianissimo, 32 suave, 64 intermedia, 96 fuerte y 127 máxima, con separación útil entre todos. El piso puede llegar a cero y no obliga a oír un golpe al mínimo. |
| E9 | La calibración pertenece al puerto/perfil MIDI que la produjo. El teclado de computadora y el mouse no aprenden ni usan esa calibración. Una reconexión o cambio de puerto no modifica de golpe el nivel de una nota ya activa. |
| E10 | La comprobación de expresión incluye medidas de nivel RMS, pico y contenido de agudos para distintas velocities con una muestra real; un test que sólo verifica que hay señal no basta. Se documenta si la muestra activa posee una sola capa grabada y qué timbre sólo es aproximado. |
| E11 | El piano anterior de una capa permanece como preset predeterminado y referencia A/B. El preset opcional Salamander de cuatro capas reales usa muestras atribuidas e íntegras, cubre C3–C6 con anclas a no más de 1,5 semitonos, y sólo se activa al seleccionar y terminar de cargar todas las capas. Una falla de descarga, decodificación, cobertura o memoria conserva el sonido anterior sin notas mudas. |

## Evidencia pendiente

- Comparación medible de la ruta antigua con la actual, separando lo que realmente estuvo conectado al piano en vivo.
- Bytes/velocities del SMK-37 físico de esta sesión y escucha posterior a la corrección. Las pruebas de navegador simulado no sustituyen esa escucha.
