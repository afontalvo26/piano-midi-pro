# Validación de instrumentos en vivo — 31-10-2026

## Implementación y fuentes

- Salamander Grand natural permanece como predeterminado. Cálido y brillante son dos ecualizaciones suaves de las mismas grabaciones; no se anuncian como bancos nuevos.
- Hay 15 opciones en siete familias: tres Salamander locales y doce timbres FluidR3 distribuidos por WebAudioFont. Los doce códigos reales se descargaron y decodificaron en Chromium. Su rango sugerido de 37 notas quedó sin huecos tras seleccionar las zonas que usa el motor.
- Las 30 anclas Salamander locales pasan longitud, cabecera OGG y SHA-256 frente a los manifiestos con autor y licencia. Se precargan siete. Las otras 23 se decodifican en segundo plano sólo para Salamander y el service worker las guarda al primer uso.
- El parser WebAudioFont no ejecuta el JavaScript remoto. Conserva `originalPitch`, `coarseTune`, `fineTune`, loop y rango de cada zona. El motor valida cobertura antes de cambiar el slot y deja terminar las voces del slot anterior.

## Audio medido

El ensayo automatizado en Chromium reprodujo 37 notas, soltó las teclas con CC64 activo y atacó otras 37. En el piano FluidR3 real: 37/37 y 37/37 ataques, 56 voces activas como máximo, 74 fuentes asignadas en el momento denso, cero ataques descartados y cero fuentes asignadas después de soltar pedal y cola. El violín conservó la nota sostenida a 3,5 s. El piano percusivo dejó terminar naturalmente una nota a alrededor de 5,3 s.

En el bus completo del Salamander, con 37+37 notas y sustain, el compresor actual 5:1 produjo RMS 0,105/0,109 y picos 0,485/0,503 en los dos acordes. Una variante 2:1 produjo RMS 0,084/0,084 y picos 0,446/0,377. Ningún pico llegó a 1,0 ni hubo silencio en el segundo acorde. Se conservó 5:1 porque la alternativa bajó el nivel sin mostrar una mejora objetiva en esta medición. El ensayo no demuestra por sí solo que no exista bombeo perceptivo con una salida física concreta.

## Alcance de la prueba

La suite del navegador simula entrada MIDI y captura el bus de audio del navegador. Las pruebas automatizadas no escuchan la salida real del SMK-37, un DAC o FxSound. Salamander en la app conserva una capa de muestras de Tone.js; el banco original de 16 velocidades, resonancias y liberaciones no está empaquetado. La referencia Yamaha es una meta perceptiva: esta aplicación no usa muestras CFX ni modelado VRM propietario.

Los archivos `.mid` exportados por Pistas contienen eventos y controles; no empaquetan audio ni garantizan el mismo timbre al abrirlos en otro software.

## Puertas de cierre

| Puerta | Resultado |
|---|---|
| `npx tsc -b` en `app/` | Limpio (`.logs/20261031-220620-instruments-final-tsc.log`) |
| `npx eslint .` en `app/` | Limpio (`.logs/20261031-220620-instruments-final-eslint.log`) |
| `node --test tests/unit/*.test.*` | 10/10 (`.logs/20261031-220406-unit-all-instruments.log`) |
| `npx playwright test` | 34/34 (`.logs/20261031-220553-live-instruments-e2e-full.log`) |
| `npx vite build` en `app/` | Correcto (`.logs/20261031-220636-instruments-final-build.log`) |
| `npx playwright test -c playwright.preview.config.ts` | 1/1 sobre build compilado (`.logs/20261031-220700-instruments-production.log`) |
| Activos de `app/dist` | 45 archivos, 30 OGG, 7.673.741 bytes, cero rutas `demo/covers/samples/player` y cero `.mid`/`.kar` |

La prueba de bancos reales está en `.logs/20261031-220518-waf-decay-real.log`; la comparación del bus está en `.logs/20261031-215832-mix-ab-3.log`. Los scripts temporales de medición se retiraron después de registrar los resultados.
