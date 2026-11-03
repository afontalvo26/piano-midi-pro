# Studio UI — contrato visual del mockup aprobado

> Alcance **exclusivo UI/UX** de [PR #5](https://github.com/afontalvo26/piano-midi-pro/pull/5). Esta es la **referencia aprobada**, no una propuesta para reinterpretar colores o disposición. Se preserva la arquitectura del motor; la conexión de UI añadió soporte de cambio de región de bucle del transporte, lectura de latencia estimada y ajustes de efectos ya soportados. No se ha alterado el mapeo MIDI físico ni el formato de proyectos.

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
- Los cuatro macros del instrumento están conectados mediante comandos reversibles a filtro, EQ3, reverb y compresor de la pista seleccionada. Sus valores deben derivarse de los efectos reales, nunca de una simulación local.
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

**Actualización local 2026-11-02:** con el checkout actualizado al head de PR #5, `studio-reference-ui.spec.ts` pasó 27/27 y el foco completo de `studio-reference-ui.yml` pasó 53/53 en Chromium local, además de `tsc`, ESLint completo, build y auditoría `dist`. Sigue **sin** pixel-diff contra el mockup, sin CI real ejecutado y sin revisión en navegadores/dispositivos físicos.


## Tanda funcional posterior — 2026-11-02

Los siguientes controles ya tienen **implementación de código** en esta rama, todavía sin ejecutar pruebas de navegador:

| Control visible | Acción vinculada | Prueba escrita |
|---|---|---|
| Seleccionar y arrastrar clip | Selección de patrón y movimiento con comando reversible; teclado ←/→ desplaza en 1/16 | `studio-reference-ui.spec.ts` |
| Dibujar clip | Reutiliza patrón existente de la pista y crea clip, sincronizado con documento | `studio-reference-ui.spec.ts` |
| Cortar clip | Divide patrones o audio con operadores oficiales | `studio-reference-ui.spec.ts` |
| Cuantizar 1/16 | Modifica la fuente del patrón mediante comando reversible; aún carece de control de fuerza y preescucha en el shell | `studio-reference-ui.spec.ts` (prueba escrita, no ejecutada) |
| Compás/cabezal | Ruler accesible apunta al tick real del transporte | Pendiente integración E2E con audio |
| Región de bucle ajustable (valor inicial 5–12) | Inicio y final editables; aplica el meterMap del proyecto y replanifica scheduler por epochs | `studio-reference-ui.spec.ts` y `sequencer-transport.spec.ts` (sin ejecutar) |
| Teclado 37 y octavas | Piano virtual original, note-on/off, rango MIDI, tres pedales | `studio-reference-ui.spec.ts` |
| Brillo, Cuerpo, Reverb, Dinámica | Actualiza filtro, EQ3, reverb y compresor por comandos persistidos | `studio-reference-ui.spec.ts` |
| «Partitura» contextual | Vista de lectura implementada, pero contradice una exclusión del contrato anterior; **no aprobada para release** | Discrepancia SDD-01 en `.kiro/specs/beatmaker-studio/spec-drift-2026-11-02.md` |
| Inspector del clip | Muestra datos reales de la pista y permite silenciar/activar/eliminar clip | `studio-reference-ui.spec.ts` |
| Mixer y biblioteca | Usa callbacks reales y conserva editores avanzados | `studio-reference-ui.spec.ts` |

### Límites técnicos pendientes

- La UI aún requiere **build y prueba completa en navegador**, incluyendo una comparación real con el screenshot aprobado; el PR continúa en borrador.
- El navegador WebAudioFont cambia el **instrumento en vivo**; el selector añadido en la misma biblioteca asigna **por pista** sólo los bancos locales que el motor de proyecto ya admite: piano Salamander y bajo 808 Fischer. Otros instrumentos/procesadores de pistas requieren ingeniería separada; el selector global no los asigna silenciosamente.
- La vista de notación es lectura básica de **patrones propios** y se separa explícitamente de la antigua app «Partitura» por [ADR-UXP-001](../.kiro/specs/beatmaker-studio/decisions/ADR-UXP-001-score-preview.md). Aún requiere aprobación de producto y QA.
- CPU y latencia física siguen sin estar medidos; si el navegador ofrece baseLatency/outputLatency, la cabecera puede mostrar una **estimación del búfer de salida**, no un valor de latencia MIDI o loopback.
- Quedan tareas del producto no reducidas a UI: funciones de automatización e instrumentos, QA de 113 criterios, dispositivos reales, compatibilidad móvil y licencias.
- Deben ejecutarse las pruebas de `studio-reference-ui.spec.ts` y `sequencer-transport.spec.ts` con el runner funcional. Un archivo de prueba escrito no constituye aceptación.

## Control de cambios Spec-Driven

La [auditoría de desviaciones](../.kiro/specs/beatmaker-studio/spec-drift-2026-11-02.md) prevalece sobre cualquier descripción promocional de avance. Este documento controla apariencia; el contrato `UXP/CLK/ROL/INS/MIX/QLT` controla comportamiento. Corregir JSX y añadir pruebas **no es aceptación** mientras no exista corrida real con build y evidencia asociada al SHA.

El botón «Avanzar» ahora hace seek de un compás, la detección de MIDI ya no inventa un SMK-37, y la cabecera expone Undo/Redo y fallos de proyecto. Los cambios aún necesitan validación visual, funcional y auditiva.


## Rutas funcionales añadidas posteriormente

- `Grabar toma` y el botón Rec del transporte abren el inspector de **tomas MIDI**. Desde «Tomas» también se puede previsualizar y confirmar un overdub en un patrón sin destruir el archivo histórico, o recuperar una toma que no se guardó mediante exportación de emergencia.
- La biblioteca de instrumentos distingue **sonido para tocar live** de **banco de una pista del proyecto**. Los dos bancos de pista visibles están respaldados por paquetes locales/versionados del motor del proyecto. Cambiar un banco obliga a reevaluar la preparación de audio; no se hace intercambio silencioso durante la reproducción.
- «Hacer único» se exige para cuantizar rápidamente un clip cuyo patrón está compartido. Editar la fuente compartida sin aviso viola ARR-02.
- Las acciones Undo/Redo y los cambios de FX/ganancia se muestran en el nuevo shell y deben devolver errores recuperables si la sesión rechaza una edición.
- El gate SDD de liberación demanda pruebas de código y producción para todo requisito; física y licencias cuando corresponda. Las pruebas están escritas, **no ejecutadas ni certificadas en este entorno**.


## Navegación del proyecto completa en el Studio (sin cambios al mockup estático)

- La cabecera de proyecto abre un **modal integrado** que contiene el navegador real `ProjectBrowser` y las tomas reales `RecordedTracks`. El usuario puede crear/abrir/exportar/restaurar proyectos sin volver a la interfaz heredada. Se mantienen el formato `.pmp`, hashes, drafts y recuperación de la implementación original.
- La regla de 16 compases del mockup corresponde al **viewport inicial**, no a una limitación de la música. La regla ahora permite ver y editar cualquier tramo posterior por páginas y zoom de 4, 8, 16 o 32 compases, manteniendo color, geometría general y comportamiento de clips.
- La forma de un clip cortado por los extremos de la vista debe representar exclusivamente su parte audible en la ventana. El playhead, la regla y los carriles comparten coordenadas relativas (a 320 px la cabecera es de 150 px; en escritorio 295 px).
- El mezclador aplica gates de salida principal por separado de los sends para aislar un bus solo en PCM; los puntos de captura de stem directo usan esa ruta efectiva.
- [Trazabilidad de correcciones y QA pendiente](../.kiro/specs/beatmaker-studio/spec-drift-2026-11-02.md). No se ha ejecutado la captura comparativa ni el pipeline de pruebas para este último SHA.
