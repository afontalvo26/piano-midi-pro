# MIX — diseño

## Grafo

TrackBus → inserts ordenados → fader/pan → send taps → bus/master. Un compilador del grafo valida rutas y construye nodos de audio; cambios se aplican por rampa/crossfade corto. Un bus no puede enviarse a sí mismo ni a un descendiente. El reloj y la propiedad de audio proceden de CLK/studioAudioLock; no se crea un AudioContext por pista.

Cada efecto tiene typeId/version, parámetros tipados, rango, unidad, default, smoothing, latencia reportada y modo offline. AUT se conecta al registro de parámetros; EXP reutiliza DSP o declara una incompatibilidad antes de exportar. Reverb y delay poseen cola finita estimable. Sidechain es una señal de control de un bus fuente explícito, con compensación de latencia cuando corresponda.

## Niveles y medidores

La ruta se calibra con referencias a -dBFS y headroom acordado; los límites se fijan a partir de mediciones del motor. Los medidores calculan pico/RMS de señal, no sólo el valor del fader. Registrar eventos de clipping, dropouts, voces robadas y PCM residente en diagnóstico; evitar actualizar React por muestra.

## Integración

INS y SMP entregan voces al bus de pista; AUD inserta monitor/resample en puntos explícitos; ARR gobierna mute/solo musical; EXP renderiza mezcla y stems con la misma topología.
