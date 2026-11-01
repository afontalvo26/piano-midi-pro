# Diseño de la retirada

## Dependencias que se deben cortar

La implementación anterior montaba `PlayerProvider` e hidrataba catálogo/covers. `App.tsx` usaba `SongData` como estado central de Studio, Pistas, Juego y Partitura. Se reemplazó por `PianoApp.tsx`: estado del instrumento en vivo y colección persistente de tomas, sin esos consumidores ni sus artefactos.

`MidiRecorder` produce los bytes SMF. `RecordingLibrary` guarda bytes y metadatos en una misma transacción IndexedDB al terminar cada toma. Pistas consulta y gestiona ese almacén; exportar `.mid` no monta un reproductor.

El bloqueo entre pestañas quedó en `audio/studioAudioLock.ts`. Mantiene los nombres del protocolo BroadcastChannel para negociar con pestañas antiguas, y silencia voces antes de anunciar la cesión.

## Secuencia aplicada

1. Inventario de módulos/activos y estado de Git; contrato de tomas y motor live.
2. Crear almacén de tomas y Pistas nueva, probar persistencia y exportación.
3. Sustituir App/shell por sólo tres pantallas y motor de piano live. Eliminar importaciones y acciones de transporte/partitura/juego/letras.
4. Retirar providers, módulos huérfanos, app `player/`, catálogos/activos y scripts exclusivos. Actualizar package scripts, Vite y service worker; purgar caches antiguas.
5. Build y pruebas del producto reducido; inspección del bundle y `dist/`.

La sustitución del shell tuvo un solo escritor. Los agentes de audio, MIDI e infraestructura analizaron sus áreas antes de editar y tuvieron propiedad exclusiva de archivos. Los módulos y activos antiguos se resguardaron fuera del repositorio con verificación SHA-256.

## Datos existentes

Las entradas `piano_songs_list` y otras preferencias antiguas no alimentan la app nueva. No se reinterpretan como tomas ni se borra IndexedDB. Los activos del catálogo, incluidos los no rastreados, se resguardaron en `piano-midi-pro-retired-20261031` antes de retirarlos del build; las siete muestras de arranque permanecen en `app/public/audio/salamander/core/`.

## Evidencia de cierre

El build final produjo 20 archivos y 2.297.775 bytes en `app/dist`, sin carpetas `demo`, `covers`, `samples` ni `player`. La suite de desarrollo pasó 27/27 pruebas, el preview compilado pasó 1/1 prueba independiente y las unidades pasaron 24/24. TypeScript y ESLint pasaron. Los tests de 37 notas y sustain usan MIDI y audio simulado en Chromium; la salida física del SMK-37 requiere validación con el equipo real.
