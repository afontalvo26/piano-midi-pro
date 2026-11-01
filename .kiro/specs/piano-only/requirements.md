# Piano sin catálogo ni reproductor — requisitos

## Alcance confirmado por el dueño

- Quedan **Studio**, **Pistas de mis grabaciones MIDI** y **Configuración**.
- Salen Música, Canciones, letras/karaoke, reproductor y sus controles, Juego y Partitura.
- Pistas presenta tomas creadas por la grabadora MIDI del piano. No importa canciones ni reproduce tomas; permite conservarlas y exportarlas.
- El piano en vivo conserva teclado físico/virtual, expresión, pedales, metrónomo, pads, MIDI Learn, ajustes de audio y diagnóstico SMK-37.

## Criterios verificables

| ID | Criterio |
|---|---|
| R1 | La navegación y cualquier entrada de UI exponen sólo Studio, Pistas y Configuración. Una pantalla antigua guardada migra a Studio. |
| R2 | No se monta `PlayerProvider`, `PlayerSection`, transporte de canción, cola, seeker, letras, biblioteca, Juego ni Partitura. Tampoco quedan imports dinámicos ni rutas alcanzables de esas funciones. |
| R3 | Studio toca con MIDI físico, teclado virtual y pedal; 37 notas simultáneas, dos ráfagas con CC64 y recuperación conservan la integridad de audio. |
| R4 | Grabar en Studio guarda cada toma completa antes de iniciar otra. Pistas lista tomas persistidas y sus canales, con nombre, fecha, duración, cantidad de notas, exportación `.mid` y borrado explícito. No hay botón Reproducir. |
| R5 | Configuración reúne MIDI y ajustes de piano/audio. Los controles aprendidos que antes accionaban transporte de canción desaparecen o tienen una acción útil explícita; no quedan controles mudos. |
| R6 | El build y el service worker no distribuyen ni cachean MIDI demo, carátulas, letras, motor de canciones, Juego, Partitura o la app `player/`. Sí conserva muestras del piano en vivo y bloqueo de audio entre pestañas. |
| R7 | La retirada no elimina muestras compartidas ni cambios ajenos por un patrón amplio. Los activos no rastreados o modificados del catálogo se inventarían y se preservan fuera de la app antes de retirarlos. |
| R8 | TypeScript, ESLint focal, build directo y pruebas focales de Studio/MIDI/37 teclas/grabación/persistencia y ausencia de UI pasan con runner acotado. El `dist/` nuevo no contiene `/demo/` ni `/covers/`. |

No hay servidor backend separado en este repositorio: la retirada abarca código cliente, app `player/`, derivados estáticos, scripts y cachés asociados al reproductor.
