# Studio UI — contrato visual del mockup aprobado

> Alcance **exclusivo UI/UX** de [PR #5](https://github.com/afontalvo26/piano-midi-pro/pull/5). Esta es la **referencia aprobada**, no una propuesta para reinterpretar colores o disposición. No se alteran procesos MIDI, audio, exportación ni modelo de proyectos en este corte.

## Composición de referencia

Referencia estática aprobada: lienzo **1586 × 992 px**, aplicación desktop dark mode con barra superior, sidebar de navegación, arreglo + piano roll, inspector lateral y consola de mezcla inferior.

| Región | x | y | ancho | alto |
|---|---:|---:|---:|---:|
| Barra de proyecto y transporte | 0 | 0 | 1586 | 64 |
| Sidebar izquierda | 0 | 64 | 238 | resto del viewport |
| Arreglo y línea de tiempo | 244 | 70 | 1013 | 287 |
| Piano Roll / editor contextual | 244 | 362 | 1013 | 315 |
| Inspector derecho | 1262 | 70 | 318 | 607 |
| Mezclador inferior | 244 | 682 | 1336 | 183 |

Las coordenadas anteriores se prueban con `tests/e2e/studio-reference-ui.spec.ts` (tolerancia geométrica ±3 px, por redondeo CSS). Es una comprobación de contenedores: **no certifica igualdad pixel a pixel del diseño completo**.

## Reglas visuales innegociables

- Fondo grafito casi negro, capas índigo/azul nocturno, paneles con borde tenue y luces violetas controladas.
- Barra superior única, navegación vertical izquierda y controles de transporte en el mismo nivel.
- Acentos eléctricos: violeta para selección y clips piano/cuerdas; cian para playhead y audio; verde esmeralda para MIDI conectado y pistas rítmicas.
- No introducir paletas nuevas, gradientes genéricos de marketing ni hero gigante encima de la música.
- Arreglo con 16 compases en la primera vista y lista de pistas alineada. Los clips deben proceder del proyecto real; **no crear datos ficticios** para que el screenshot parezca lleno.
- Editor real de Piano Roll bajo el arreglo, con barras de velocidad. No sustituirlo por una imagen. Los modos adicionales cambian la zona contextual sin desmontar el shell.
- Inspector a derecha: portada del piano tomada de la imagen aprobada, título real del sonido seleccionado, macros en círculos, estado MIDI real y miniteclado.
- Mixer inferior con faders, pan, mute/solo, medidores y master. El usuario debe poder cambiar el volumen y revertirlo con los comandos del proyecto.
- No reportar CPU o latencia con números simulados. Cuando no exista medición, indicar `—` o `Sin medir`.
- Los cuatro macros de la portada son **una maqueta de control** hasta estar vinculados a parámetros de audio, tarea fuera de este corte UI. No confundir la visualización con procesamiento real.
- Mantener todas las funciones anteriores mediante acceso al editor completo mientras se termina la migración visual, sin borrar botones de acción de la app anterior.

## Código del shell

- `app/src/components/studio/ReferenceStudio.tsx`: composición, navegación, inspección, clips y controles.
- `app/src/components/studio/ReferenceStudio.css`: geometría, tipografía, color, bordes, espaciado y responsive.
- `app/src/components/studio/reference-grand-piano.svg`: recorte optimizado de la imagen original del piano para la tarjeta de instrumento, sin interfaz superpuesta.
- `app/src/PianoApp.tsx`: callbacks a proyecto, transporte, MIDI, instrumentos, Piano Roll, arreglo, mezclador y exportación.
- `tests/e2e/studio-reference-ui.spec.ts`: estructura, navegación, dimensiones, capturas de evidencia, comportamiento compacto y catálogo.

## Puertas antes de declarar «idéntico»

1. Ejecutar `npm ci` en raíz y app; correr `cd app && npx tsc -b && npx eslint src/PianoApp.tsx src/components/studio/ReferenceStudio.tsx src/components/studio/InstrumentBrowser.tsx && npx vite build`.
2. Correr `npx playwright test tests/e2e/studio-reference-ui.spec.ts --workers=1 --retries=0`. Conservar screenshots/trace.
3. Capturar UI renderizada a 1586×992 sobre proyecto de **datos reales** y confrontar manualmente con el mockup aprobado: posición/altura, anchura, colores, tamaños, titulares, radios, sombras, densidad, tipografía, fotografías y mini gráficos.
4. Iterar CSS y JSX tras cada diferencia; documentar la versión aprobada y commit fijo.
5. Repetir con 1200, 950, 650, 390 y 320 px sin desbordamiento de página ni pérdida de acciones críticas.
6. Validar navegación por teclado, foco, alto contraste y controles táctiles en navegador real.

**Estado a la fecha de esta propuesta:** JSX/CSS y pruebas **escritos en GitHub**, sin screenshot de aplicación compilada ni corrida de pruebas validada en el entorno actual. El bloqueo de runner Actions del repo permanece en el issue #2. Este documento no equivale a aceptación visual.
