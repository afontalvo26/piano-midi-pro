# MIX — Mixer y efectos: requisitos

Estado: pendiente. Calidad sonora y control por pista sin saturación inadvertida.

## Historias y criterios

- MIX-01 Cada pista tiene gain, pan, mute, solo, arm, medidores pico/RMS y destino. Buses, sends y master forman un grafo sin ciclos; cualquier ruta inválida se rechaza antes de producir audio.
- MIX-02 Cadenas reordenables de EQ, filtro, compresor, saturación/clipper, reverb, delay y limitador con bypass, presets editables y estado persistente. Un efecto no disponible muestra su motivo sin desaparecer del proyecto.
- MIX-03 Ganancia y parámetros se suavizan para evitar clics; el master conserva margen de cabeza, indica picos y clipping antes/después del limitador. Nunca se oculta distorsión tras una etiqueta “profesional”.
- MIX-04 Sidechain de kick a 808/bajo ofrece fuente explícita, ataque/release/ratio y medidor de reducción; live y exportación reproducen el mismo detector o documentan su diferencia.
- MIX-05 Solo/mute afectan secuenciador, monitor y stems según opciones visibles. Mutear pista corta o deja colas según política declarada y no apaga voces live de otra pista.
- MIX-06 Se puede comparar A/B cadena original y procesada con nivel compensado; reset/bypass son reversibles. Presets se cargan sin salto de volumen peligroso.
- MIX-07 Reproducción de beat más 37 notas live y dos acordes con sustain no bloquea audio ni excede presupuesto de voces/memoria; si se alcanza límite, robo de voz es visible y prioriza live.

## Aceptación

Fixture de kick/808/piano con sidechain y reverb, mute/solo y stems reproduce niveles esperados sin clipping digital no solicitado; orden de cadena y bypass sobreviven recarga; 37+37 vuelve a sonar tras Stop.
