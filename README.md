# Piano MIDI Pro

Piano en vivo y Beatmaker Studio para el M-VAVE SMK-37 Elite/Pro y otros controladores MIDI. La aplicación tiene tres pantallas: **Studio**, **Pistas** y **Configuración**. Beatmaker sigue en implementación y QA; su [estado verificable](.kiro/specs/beatmaker-studio/implementation-status.md) distingue funciones probadas de pendientes.

- **Studio**: teclado de 37 teclas, entrada MIDI física, pedales, expresión, pads y metrónomo; proyecto propio con piano roll, batería, arreglo, sampler, captura de audio, mezclador y exportación. Cada función tiene límites descritos en la spec y su estado de QA.
- **Pistas**: tomas MIDI grabadas en este navegador, con canales, nombre, exportación `.mid` y borrado. Los bytes originales se guardan en IndexedDB; añadir una toma a un proyecto no los altera.
- **Configuración**: entrada MIDI, mapeo de controles, audio, diagnóstico físico, almacenamiento y fuentes/licencias de sonidos instalados.

Para iniciar la app localmente en Windows, instala las dependencias en `app/` con `npm install` y ejecuta `pwsh -File scripts/start-servers.ps1` desde la raíz. Abre `http://localhost:1234/`. Si el puerto ya está ocupado por la app, el script reutiliza el servidor.

El alcance vigente está en [la especificación de Beatmaker Studio](.kiro/specs/beatmaker-studio/README.md), [la del piano](.kiro/specs/piano-only/requirements.md) y [la de instrumentos](.kiro/specs/live-instruments/requirements.md). La [arquitectura actual](docs/ARCHITECTURE.md) describe los módulos que quedan. Los agentes deben leer [AGENTS.md](AGENTS.md) antes de ejecutar comandos.

## Sonidos en vivo

El sonido predeterminado sigue siendo **Salamander Grand · natural**, el piano que ya tenía la aplicación. Studio ofrece el núcleo Salamander, una opción de cuatro capas grabadas, dos ajustes tonales de ese piano y timbres FluidR3 GM (pianos, guitarras, acordeón, violín, flauta, marimba y vibráfono) reproducidos por WebAudioFont. Los ajustes tonales comparten las mismas grabaciones; cambian suavemente su ecualización. Cada opción indica su fuente y licencia en el selector.

Las 30 anclas Salamander se sirven localmente: siete se preparan al abrir la app y las otras se cargan en segundo plano cuando se toca ese piano. Los timbres FluidR3 requieren internet y se descargan sólo al elegirlos. Si falla la descarga, permanece el instrumento anterior. Los pads usan su motor de percusión independiente.

Salamander es una grabación atribuida a Alexander Holm bajo [CC BY 3.0](app/public/audio/salamander/core/ATTRIBUTION.md). Los bancos FluidR3 tienen su [licencia propia](https://github.com/musescore/MuseScore/blob/main/share/sound/FluidR3Mono_License.md). La referencia de un piano digital Yamaha orienta la calidad deseada; esta app no incluye muestras Yamaha CFX ni el sistema VRM de Yamaha. El MIDI exportado guarda eventos musicales y controles, no el audio ni las muestras del instrumento. La escucha final con el SMK-37 físico depende también de la salida y la interfaz de audio elegidas.
