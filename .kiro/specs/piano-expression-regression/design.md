# Diseño — expresión y fidelidad del piano en vivo

## Fuente y ruta de entrada

Una entrada Web MIDI sólo aparece como activa cuando tiene listener adjunto. La identificación por nombre de SMK-37 permite seleccionar su puerto principal, pero no supone mensajes de botones que no se hayan observado. Cada `Note On` conserva velocity cruda 1–127, puerto, canal y nota física. El remapeo de rango usa la identidad SMK-37 o una calibración física explícita; un controlador genérico sin calibrar conserva su pitch MIDI.

La calibración de velocity se almacena por perfil y `inputId`. PC y mouse usan su propio valor virtual y nunca entrenan el banco físico. El aprendizaje físico altera como máximo 25 % de la normalización, conserva los 127 pasos estrictamente crecientes y no satura al llegar al máximo observado. La curva Expresiva inicial usa gamma 1,7 con piso 0,5 %; el piso puede bajar a cero. Las curvas guardadas se respetan y Studio ofrece cambiar desde Suave/Fija sin borrar ajustes.

## Señal de audio

El sonido Salamander natural de una capa sigue siendo el predeterminado y la referencia A/B. Cada ataque mantiene identidad propia para repetición, pedal y 37+37 voces. Con MOD=0, la ruta debe ser seca y sin retardo agregado. La envolvente de ataque y la liberación normal deben coincidir con el `Tone.Sampler` anterior; robos de voz y `All Sound Off` conservan una rampa corta para evitar clicks. Aftertouch conserva margen de ganancia incluso a velocity 127.

En el preset de una capa, un ajuste tonal por velocity sólo modifica el color; el nivel lo gobierna la curva de ganancia. Se verifica espectro a ganancia fija y RMS con la curva real para evitar que un filtro simule expresión sólo por bajar volumen.

## Cuatro capas grabadas, opcionales

El preset `salamander-layered` usa 52 OGG de Salamander V3, en cuatro capas reales y 13 anclas a cada tres semitonos de C3 a C6. Se carga únicamente al seleccionarlo; el preset activo sigue sonando durante descarga y decodificación. Deben verificarse los hashes, 37 notas de cobertura, memoria decodificada y niveles por capa antes del cambio atómico. Un error o cancelación deja el preset anterior.

Cada capa ya tiene distinta amplitud grabada. El motor compensa el RMS de ataque por ancla antes de aplicar la curva de respuesta física para evitar multiplicar dos veces la dinámica. Se mide continuidad en límites de capa y polifonía 37+37. Las cuatro capas no reproducen todos los controles, ruidos y resonancias del SFZ completo de 16 capas; la interfaz no las presenta como equivalentes.

## Evidencia

- Pruebas puras: 127 niveles estrictos, pp/mezzo/forte, banco por puerto y remapeo.
- Pruebas de navegador: puertos ambiguos/desconectados, fuente física frente a virtual, cinco intensidades, sonido real RMS/espectro y 37+37 con recuperación.
- A/B PCM con el mismo OGG C4, pitch, ataque, liberación y ganancia entre sampler anterior y fábrica actual.
- TypeScript, ESLint, build y suite focal/final con `scripts/run-bounded.ps1`.
- El usuario confirma con su SMK-37 cinco velocidades y salida de audio. Sin ese dato no se declara verificada la sensación táctil física.
