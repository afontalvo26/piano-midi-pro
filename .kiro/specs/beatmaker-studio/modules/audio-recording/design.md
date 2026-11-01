# AUD — diseño

## Captura

InputSession pertenece a una pista armada y a una generación CLK. Captura frames o bloques con sampleRate y timestamp del AudioContext, más marca de monotonic clock para correlación; no usa la cadencia de React como tiempo. Se guarda en chunks temporales con secuencia/hash. Al terminar, PRJ confirma AssetRef y TakeRef; los chunks huérfanos se recuperan o limpian tras inspección.

MonitoringGraph separa input→monitor bus del input→capture. Hay opción de monitor off/auto/on con estado visible. La detección simple de posible realimentación considera dispositivos y nivel, pero no promete reconocer todas las rutas físicas. La compensación de latencia es metadato por dispositivo/take, no un desplazamiento irreversible de frames.

## Edición

AudioClip refiere assetId, startFrame/endFrame, timelineStartTick o timelineStartSeconds, fades y gain. Comping es una lista de regiones seleccionadas de takes, con crossfades; nunca combina destructivamente los archivos base. El render usa el mismo grafo MIX que Studio y un bus de resampling que excluye la pista destino por diseño.

## Dependencias

CLK arma el intervalo, PRJ almacena assets, SMP calcula waveform/preview, MIX maneja monitor y routing, EXP renderiza. La compatibilidad de APIs MediaDevices/AudioWorklet se prueba en navegadores objetivo; se ofrece mensaje de indisponibilidad cuando la ruta no existe.
