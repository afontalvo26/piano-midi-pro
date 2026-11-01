# Diseño de instrumentos en vivo

## Inventario y diagnóstico

`LiveStudioEngine` reproduce Salamander mediante `ToneSampleVoiceFactory` y `LiveVoiceController`: una fuente por ataque, 56 voces activas y 101 fuentes totales como techo. Hoy hay siete OGG locales y el resto de anclas Salamander se pide a la red. El grafo actual incluye compresión 5:1, makeup y limitador; puede aplanar ataques con 37 notas. `WebAudioFont.ts` tiene parser de zonas y manifiesto real, pero su salida `Tone.Sampler` antigua no cumple la identidad de cada ataque del Studio.

## Contrato entre áreas

- `app/src/instruments/catalog.ts`: definiciones estáticas con `id`, etiqueta, familia, `engineId`, fuente discriminada Salamander o WebAudioFont, licencia, procedencia y necesidad de red. No guarda un estado ficticio “listo”.
- `LiveStudioEngine.selectInstrument(id): Promise<boolean>` prepara y valida el candidato, luego cambia el slot activo. `currentInstrumentId` y `diagnostics.instrument` publican activo, pendiente y error.
- Cada slot posee banco de muestras, fábrica de voces, cadena de mezcla y bus. El controlador de voces permanece único; los handles existentes retienen su slot hasta liberarse. Se disponen los slots retirados sólo al quedar vacíos.
- WebAudioFont se decodifica a `AudioBuffer` y se conecta a la misma fábrica de voces individuales. No se usa `Tone.Sampler.triggerRelease(note)` para notas repetidas.
- El selector de Studio filtra familia y motor, presenta el preset activo separado del pendiente y persiste sólo después de un cambio confirmado. Ante error o falta de red, permanece el instrumento anterior.

## Calidad y carga

El timbre Salamander natural conserva el carácter que el dueño prefiere. Las anclas adicionales se alojan localmente con atribución; el núcleo de siete muestras se precarga antes del primer gesto y las demás se decodifican en una cola acotada priorizando el rango visible. La mezcla se ajusta sólo después de medir PCM y latencia con 37+37 notas, sustain y carga del hilo. El limitador queda como protección; se reduce la compresión agresiva si la comparación demuestra menos bombeo sin clipping.

Los presets GM se curan de archivos FluidR3 verificables, con su licencia y la red indicada en UI. Seleccionar uno descarga sólo ese banco. No se precargan todos los instrumentos por visitar la lista.

## Pruebas y evidencia

Se medirán picos/RMS, notas realmente atacadas, voces activas/finales, cambio con pedal, dos pestañas, error de red y selección rápida. Las pruebas de UI comprobarán categoría/motor, persistencia y móvil. El archivo de producción no debe contener los módulos de canciones retirados.
