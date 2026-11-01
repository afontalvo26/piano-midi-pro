# Instrumentos en vivo y calidad de piano — requisitos

## Intención del dueño

Conservar el piano actual que le gusta, acercar su respuesta y mezcla a la calidad de un piano digital profesional, y permitir elegir instrumentos reales organizados por familia y por motor. La referencia Yamaha es estética y funcional: las muestras distribuidas no son Yamaha CFX y no se anunciarán como tales.

El producto sigue teniendo sólo Studio, Pistas de grabaciones MIDI propias y Configuración. Esta mejora no trae de vuelta canciones, reproductor, letras, Juego ni Partitura.

## Criterios de aceptación

| ID | Criterio verificable |
|---|---|
| Q1 | Salamander natural sigue siendo el instrumento predeterminado. Sus anclas de audio críticas son locales y verificadas; el arranque decodifica sólo el núcleo necesario, sin inundar red ni hilo principal. |
| Q2 | Studio muestra un catálogo con ID estable, categoría de instrumento, motor/fuente, procedencia y estado de carga. Sólo hay presets con muestras y códigos reales comprobados. |
| Q3 | Los timbres WebAudioFont seleccionados se cargan bajo demanda y reproducen con el controlador de voces individuales del Studio. Una nota repetida, sustain, pitch bend y expresión no pueden liberar otra instancia por error. |
| Q4 | Cambiar instrumento es atómico: el anterior sigue sonando mientras carga el nuevo y sus notas existentes se liberan normalmente. Un fallo o una selección superada conserva el anterior; no suenan notas retrasadas al terminar un fetch. |
| Q5 | El instrumento confirmado persiste tras recargar. La UI informa claramente carga, error, fuente local/red y el instrumento activo; la lista no descarga muestras al navegarla. El selector es usable con teclado y en móvil. |
| Q6 | La mezcla tiene margen para acordes densos: 37 notas, luego otras 37 con sustain, producen señal sin clipping digital, bombeo grave ni voces pegadas; se conserva el techo duro de voces y la coordinación entre pestañas. |
| Q7 | El build contiene sólo los instrumentos y metadatos del Studio, sin catálogo de canciones. La atribución de Salamander y los bancos de terceros queda accesible. |
| Q8 | TypeScript, ESLint, build, pruebas focales de selección/fallo/carrera/persistencia, motor 37+37 y vista móvil pasan con el runner acotado. Los tests simulados no se presentan como validación audible del SMK-37 físico. |

## Límites técnicos explícitos

El banco original Salamander V3 documenta 16 capas de velocidad y muestras de resonancia/liberación, pero su distribución FLAC completa ronda 707 MiB. Esta tanda no debe cargarlo entero en un navegador ni llamar “CFX” a un banco que no es Yamaha. Los instrumentos que requieren red se etiquetan como tales y conservan el piano local cuando no cargan.

Fuentes primarias: [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano), [Yamaha P-225](https://uk.yamaha.com/en/musical-instruments/pianos/products/p-series/p-225/), [WebAudioFont data](https://github.com/surikov/webaudiofontdata).
