# Arquitectura vigente

La app es una SPA de React, TypeScript y Tone.js. `app/src/main.tsx` monta sólo `PianoApp.tsx`, con Studio, Pistas y Configuración. No hay servidor backend separado.

## Audio en vivo

`audio/liveStudioEngine.ts` crea el grafo de instrumentos, percusión y metrónomo. `liveVoiceController.ts` mantiene las voces por origen MIDI, gestiona pedales y limita polifonía; `liveAudioTiming.ts` programa la nota humana sin añadir toda la ventana de Tone. `studioAudioLock.ts` coordina el audio entre pestañas. Cada cambio de timbre prepara un slot nuevo y deja que las voces anteriores terminen en el suyo.

`instruments/catalog.ts` define los presets curados por categoría y motor. El Salamander predeterminado tiene siete anclas precargadas en `app/public/audio/salamander/core/` y otras 23 anclas locales en `anchors/`, con SHA-256 y atribución. Los doce bancos FluidR3 se descargan al seleccionarlos; `engine/WebAudioFont.ts` decodifica zonas, afinación fina y loops sin ejecutar el JavaScript recibido. `audio/toneSampleVoiceFactory.ts` reproduce una fuente individual por ataque tanto para Salamander como para FluidR3. Los pads siguen en `engine/DrumKitEngine.ts`.

## MIDI y tomas

`midi/message.ts` interpreta eventos; `PianoApp.tsx` conecta la entrada seleccionada y el teclado visual al motor. `midi/profile.ts` y `components/midi/MidiControlPanel.tsx` aplican MIDI Learn. `midi/recorder.ts` genera el archivo SMF; `midi/recordingLibrary.ts` guarda bytes y metadatos juntos en IndexedDB. `components/tracks/RecordedTracks.tsx` permite consultar, renombrar, exportar y borrar cada toma. El diagnóstico y la captura de bytes físicos permanecen en `midi/diagnostics.ts` y `midi/physicalTrace.ts`.

## Entrega y verificación

Vite compila sólo `app/`. `app/public/sw.js` conserva el shell y las siete muestras núcleo; guarda las otras anclas locales al primer uso y las sirve del caché después, sin esperar a la red. Elimina cachés antiguas del producto sin borrar IndexedDB. Playwright valida MIDI simulado, selección y fallos de instrumento, 37 notas con sustain, traspaso de audio entre pestañas y persistencia; la prueba de producción usa `playwright.preview.config.ts` y un preview propio. Ver [requisitos del piano](../.kiro/specs/piano-only/requirements.md) y [calidad e instrumentos](../.kiro/specs/live-instruments/requirements.md).
