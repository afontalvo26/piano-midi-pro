# INS — diseño

## Registro

InstrumentDescriptor inmutable: id, versión, familia, editor/fuente, licencia, créditos, engineId, packageId, patches, rango real, articulaciones, expresiones soportadas, bytes comprimidos y PCM estimado. PackageManifest fija URLs de origen, hashes por archivo, sampleRate, formatos, mapas, créditos y pruebas. La ficha diferencia “fuente investigada”, “port implementado”, “aprobado en navegador” y “aprobado físicamente”.

Motor inicial adaptado del live actual: Salamander y WebAudioFont/FluidR3. Nuevos adapters posibles: SampleMap para SFZ traducido, DrumVoice y Synth808. Un adapter expone prepare, createVoice, control, release, dispose y render offline o una interfaz equivalente compartida. Los bancos SFZ se compilan en build a manifiesto soportado; las extensiones ARIA se inventarían una por una. No se ejecuta código de un paquete ni se carga un plugin de escritorio en el navegador.

## Expresión y polifonía

Velocity elige capas y gain calibrado; se almacenan curvas por preset e instrumento y se ensayan al oído en pp/ff. CC7 (volumen) y CC11 (expresión) se multiplican con headroom y suavizado independiente; CC1 actúa según articulación/modulación disponible. Sustain, sostenuto y una corda respetan la política de muestras; si sólo hay aproximación, la ficha lo declara. Bend y presión sólo afectan voces/canales compatibles. Voice stealing protege las notas recientes y las sostenidas, libera colas y deja contadores en cero después de Stop.

El cache conserva muestras decodificadas por hash, con referencia de pistas/voces y presupuesto global. Descarga opcional es cancelable, verificable y reiniciable; instalación no reescribe el núcleo. Un preset ya cargado nunca cambia debajo de una nota activa. Créditos y licencia aparecen en Configuración y al exportar paquete con muestras.

## QA y decisión

Una hoja de revisión por banco compara calibración de pitch, dinámica 1/16/32/64/96/112/127, ruido, onset, release, mono/estéreo, respuesta pedal y A/B sobre SMK-37. El umbral de aceptación se establece con referencias musicales y mediciones antes de publicar el preset; no se reduce a un número de capas.
