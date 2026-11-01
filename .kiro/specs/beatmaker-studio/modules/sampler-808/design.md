# SMP — diseño

## Activos y regiones

AssetRef guarda hash SHA-256, bytes, duración, sampleRate, canales, origen y ubicación local. SampleRegion guarda startFrame/endFrame, rootMidi, cents, fades, loopMode y reverse; el editor usa frames de origen para evitar deriva por redondeo. El audio fuente es inmutable. La transformación es un grafo pequeño y versionado que EXP puede repetir.

El análisis de transientes y waveform usa worker o tarea diferida, con límite de memoria y cancelación; los picos de waveform se guardan como caché regenerable. Decodificar/convertir se hace al preparar un instrumento o un clip, no por cada repintado. Si un formato decodifica de manera diferente según navegador, se documenta y se ofrece transcodificación local controlada.

## Voz 808

Voice808 parte de una muestra de subgrave/808 grabada profesionalmente para una biblioteca musical, con procedencia y permiso de redistribución comprobados. Tiene afinación de root note, envolvente de amplitud y pitch, glide, legato y límite de frecuencia/subgrave. El pack Beatmaker inicial no usa un oscilador genérico como sustituto de esa grabación. Monofonía es por instancia de pista; otras pistas y live no comparten choke. En release, rampa corta evita clic y permite cola definida.

## Integración

PRJ guarda transformaciones y enlaces; DRM usa SampleRegion en pads; ARR coloca AudioClip con beat anchoring o tiempo absoluto explícito; INS registra paquetes oficiales. EXP debe renderizar exactamente las mismas regiones/modos.
