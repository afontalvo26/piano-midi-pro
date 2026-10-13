# Informe — copiar el reproductor del piano al reproductor independiente

**Encargo:** "ese reproductor es increíblemente pobre, no se parece en absoluto;
copiar exactamente el reproductor del piano, UI/UX exacto".

**Resultado:** el reproductor de `player/` (1235) ahora **usa los componentes y el
CSS reales del piano** (`@app/*`). La comparación píxel a píxel contra el piano
(1234) da **0,00 % de diferencia en las 13 regiones del reproductor** (barra,
pantalla Música y pestaña Canciones). Lo único que difiere es lo que el encargo
prohíbe traer, y está listado abajo con su medición.

---

## 1. Qué componentes y CSS del piano se importaron

Nada se copió: se importa por los alias `@app/*` → `../app/src/*` y `@engine/*` →
`../app/src/engine/*`, declarados en `player/vite.config.ts` **y**
`player/tsconfig.app.json`.

### Componentes del reproductor (importados tal cual)

| Ruta | Qué aporta |
|---|---|
| `app/src/components/player/PlayerSection.tsx` | Todo lo que el reproductor necesita del armazón: la barra + la cola + la vista de reproducción + los menús + los diálogos + el `PlayerUiContext` |
| `app/src/components/player/PlayerBar.tsx` | La barra inferior real (seeker, aleatorio, anterior/play/siguiente, repetir, auto, cola, silenciar, volumen) |
| `app/src/components/player/parts.tsx` | `Cover`, `LikeButton`, `NowPlayingBars`, `ProgressBar`, `TransportButton` y los íconos |
| `app/src/components/player/player.css` | 2.072 líneas: barra, cola, vista de reproducción, menús, diálogos, toasts |
| `app/src/components/library/MusicPanel.tsx` | La pestaña Música como la monta el piano (persiste la vista activa) |
| `app/src/components/library/MusicScreen.tsx` | La pantalla Música completa (1.025 líneas): navegación interna, estanterías, tarjetas, listas, playlists |
| `app/src/components/library/music.css` | Su estilo (951 líneas) |
| `app/src/components/library/TrackRow.tsx`, `TrackCard.tsx` | Las tarjetas y filas que usa la pantalla |
| `app/src/components/songs/SongLibrary.tsx` | La pestaña Canciones (buscador, géneros, cuadrícula/lista, panel de importar) |
| `app/src/components/songs/SongCard.tsx`, `GenreNav.tsx`, `format.ts` | Sus piezas |
| `app/src/components/songs/SongLibrary.css` | Su estilo (746 líneas) |
| `app/src/components/score/ImportPanel.tsx` | El importador que `SongLibrary` monta adentro |
| `app/src/components/common/Icons.tsx` | Los íconos del rail |
| `app/src/components/player/index.ts`, `components/library/index.ts`, `components/songs/index.ts` | Los barriles (se importan los barriles, no archivos sueltos) |

### Estado del reproductor

| Ruta | Qué aporta |
|---|---|
| `app/src/music/PlayerContext.tsx` | La cola, el aleatorio, el repetir, la radio, el historial, los atajos, el MediaSession, el contrato `PlaybackHost` |
| `app/src/music/libraryStore.ts` | La biblioteca persistida (catálogo, playlists, "me gusta", reproducciones) |
| `app/src/music/useLibrary.ts`, `meta.ts`, `covers.ts`, `views.ts`, `constants.ts`, `toast.ts`, `share.ts`, `resolve.ts`, `ids.ts`, `types.ts` | Los selectores, los metadatos, las carátulas, el modelo de vistas, los avisos, el compartir y la resolución de una pista a `SongData` |
| `app/src/music/useMediaSession.ts` | Metadatos del sistema + atajos de teclado |

### Catálogo, tipos y utilidades

`app/src/constants/demoSongs.ts` (con `demoBoleros.ts` y `demoSalsa.ts`),
`app/src/constants/piano.ts` (`INSTRUMENT_FAMILIES`), `app/src/constants/ui.ts`
(`TRACK_COLORS`), `app/src/types/song.ts`, `app/src/audio/audioTiming.ts`,
`app/src/utils/settings.ts`, `playbackRouting.ts`, `instrumentMapping.ts`,
`midiLyrics.ts`, `midiWorkerClient.ts` + `app/src/workers/midiParser.worker.ts`.

### Motor

`@engine/instrumentSources`, `instrumentChain`, `wafManifest` y —por debajo—
`vscoSampler`, `freePatsAccordion`, `WebAudioFont`, `GMSamplerEngine`,
`DrumKitEngine`, `percussionSamples`, `sampleLevels`, `sampleProcessing`,
`instrumentPanning` y los tres manifiestos. **Los archivos de `player/src/audio/`
no se tocaron**: el grafo maestro, la agenda de notas y el cargador del sampler de
piano ya eran la base correcta.

### CSS

`player/src/main.tsx` importa **`@app/index.css`** (variables, reset, scrollbars) y
**`@app/App.css`** (armazón `.app-container`/`.sidebar-rail`/`.topbar-header`/
`.panel-screen`, botones `.btn`, mezclador de pistas) **tal cual**. Los CSS de cada
componente los importa el propio componente al importarse.

`player/src/shell/shell.css` existe pero **está vacío de reglas**: el armazón es el
mismo DOM con las mismas clases que `App.tsx`, así que el CSS del piano lo resuelve
solo. El archivo queda documentado para el próximo ajuste, con la regla de no
reescribir nada del piano.

**Archivos que se borraron** (eran la UI pobre hecha a mano): `player/src/App.tsx`,
`styles.css`, `PlayerController.ts`, `usePlayer.ts`, `format.ts`,
`components/PlayerBar.tsx`, `components/TrackMixer.tsx`, y después `audio/songLoader.ts`
y `types.ts` (quedaron sin uso al pasar la carga al `music/resolve.ts` del piano).

---

## 2. Qué hubo que replicar del puente de audio de `App.tsx`

`PlayerContext` no habla con el motor: le pide el audio a un **`PlaybackHost`**
(`load`, `play`, `pause`, `stop`, `seek`, `setVolume`, `getPosition`, `onEnded`) que
en el piano registra `App.tsx` desde un `useMemo` sobre ~40 refs y estados de React.
Ese host **no se puede importar** sin importar el piano entero (6.512 líneas con el
Studio, el teclado, el modo Juego, los pedales y las partituras adentro), así que se
replicó en `player/src/host/PlayerEngineHost.ts`. Lo replicado, y por qué:

| Qué | Cómo lo hace `App.tsx` | Por qué no se pudo reutilizar |
|---|---|---|
| **Carga + precarga** | `handlePlayerLoad`: cortocircuita si la canción ya es la del motor; si no, `stopPlayback()`, `setSong()`, y dos efectos (`song.title`/`isAudioReady`) que bajan **sólo** los instrumentos y las piezas de percusión que la canción usa, separando los de los primeros 6 s (bloquean el arranque) del resto | Vive dentro del componente, con `songSamplesReadyRef`, `drumReadyRef`, `samplesPausedRef` y el estado del Studio. Se replicó con `AudioEngine.loadSong` + `loadPercussion` (que ya existían) y un `generation` propio |
| **Arranque** | `startPlayback`: `initializeAudio()` → esperar los samples del arranque con tope → `scheduleSongOnTransport()` → `Tone.Transport.bpm` → `ticksForHeardSeconds(from)` → `startTransportMusic()` | Es el mismo orden; se copió literal (incluido `ticksFor`, que ubica la posición **escuchada**, no la del scheduler) |
| **Pausa / Detener / Seek** | `pausePlayback`, `stopPlayback`, `seekTo`: fade de los buses → `stopVoicesDeferred` para cortar las voces ya inaudibles → liberar **todo** (piano + capa de fuentes + batería) | Se replicó con los mismos helpers (`fadeOutNodesVolume`, `stopVoicesDeferred`, `releaseAllInstruments`) |
| **Volumen** | `setVolume(volume, muted)` → `dB = muted ? −60 : −40 + volumen × 40` | Misma fórmula (el mínimo **no** es silencio, es −40 dB: igual que en el piano) |
| **Reloj** | El rAF escribe `stateRef.current.currentTime` por frame y publica a React cada `PLAYBACK_PUBLISH_MS` (100 ms) | Acá **no se publica nada**: `PlayerContext` expone `getPosition()` imperativo y `PlayerBar` tiene su propio rAF. Medido: **0 publicaciones a React en 5 s** |
| **Fin de canción** | El rAF de `App.tsx` para el transporte, pero **`player.notifyEnded()` nunca se llama**: el `onEnded` del puente queda registrado y sin invocar, así que la cola no avanza sola | Acá el reloj del motor **sí** llama a `notifyEnded()`, que es exactamente para lo que `PlayerContext` lo expone |
| **Mezclador por pista** | `App.tsx` guarda `trackMuted`/`trackSolo`/`trackVolumes`/`trackInstruments`, los espeja en un `stateRef` y el callback de `Tone.Transport.schedule` los lee **por nota** | Se replicó igual: el estado vive en el shell, se empuja al motor y el scheduler lo lee por nota (`getMix()`) |
| **Instrumento por pista** | El release usa el instrumento con el que se **atacó** la nota (`activeNoteInstrumentsRef`), no el actual: si no, cambiarlo a mitad de canción deja la nota vieja sonando para siempre | Se replicó con un mapa `voiceInstruments` por voz |
| **Cambio de canción** | `stop()` → `setSong()` → precarga; los samples de VSCO (hasta 84 s) hay que liberarlos o suenan encima de la siguiente | Igual, y además el mezclador se reinicia a los valores del archivo **antes** de precargar (en `App.tsx` esa carrera existe entre dos efectos) |

**Diferencias deliberadas con `App.tsx`** (las dos son mejoras, no paridad):

1. **Sin `nextFrame()`.** El piano espera dos `requestAnimationFrame` en `play()`
   porque su `startPlayback` cierra sobre la canción del render anterior. Acá el
   motor guarda la canción en un campo propio: `load()` + `play()` en el mismo tick
   son correctos sin demora artificial.
2. **El fin de canción avisa** (ver arriba).

**Puente React:** `player/src/host/usePlayerEngineHost.ts`. El motor es un
**singleton de módulo**, no un `useState`/`useRef`: es lo que permite leerlo durante
el render (para `useSyncExternalStore`) sin violar las dos reglas del linter de
React 19 (`react-hooks/refs` y `react-hooks/immutability`) y es la convención que ya
usa `libraryStore`.

---

## 3. Capturas comparativas y diferencias visuales

Todo en `.logs/qa/player-vs-piano/`. Método: `scripts/qa-player-vs-piano.mjs`, mismo
viewport (1600×900), mismas condiciones (misma pantalla, misma canción pulsada,
`localStorage` limpio en los dos orígenes, animaciones y transiciones congeladas), y
**diffs alineados por región** (cada región se recorta de su propia caja, con
tolerancia de ±1 px de corrimiento para no confundir sub-píxel con diferencia real).

| Región | Píxeles distintos |
|---|---|
| Barra · transporte (aleatorio, anterior, play, siguiente, repetir) | **0 / 8.160 = 0,00 %** |
| Barra · ahora suena (carátula, título, artista, corazón) | **0 / 30.144 = 0,00 %** |
| Barra · progreso (relojes + seeker) | **0 / 21.280 = 0,00 %** |
| Barra · volumen | **0 / 3.600 = 0,00 %** |
| Música · navegación interna | **0 / 136.640 = 0,00 %** |
| Música · encabezado ("Buenas noches" + botones) | **0 / 395.200 = 0,00 %** |
| Música · estanterías (tarjetas con carátula) | **0 / 312.320 = 0,00 %** |
| Música · una tarjeta | **0 / 31.920 = 0,00 %** |
| Canciones · portada | **0 / 225.792 = 0,00 %** |
| Canciones · buscador y toggle de vista | **0 / 61.824 = 0,00 %** |
| Canciones · chips de género | **0 / 56.448 = 0,00 %** |
| Canciones · panel de importar | **0 / 295.680 = 0,00 %** |
| Canciones · cuadrícula y una tarjeta | **0 / 564.480** y **0 / 68.688 = 0,00 %** |
| Barra completa | 2.644 / 114.000 = **2,32 %** → sólo los chips |
| Pantalla Música completa | 717.500 / 1.440.000 = **49,83 %** → el corrimiento de 73 px |

### Diferencias visuales que ENCONTRÉ y corregí

1. **El CSS propio del reproductor viejo pisaba el del piano.** `player/src/styles.css`
   definía `.btn`, `.songs`, `.panel`, `.app`… y `App.css` también define `.btn`: la
   barra real habría salido con el botón equivocado. Se corrigió borrando la UI vieja
   y pasando a importar el CSS del piano.
2. **Faltaban las tipografías.** `player/index.html` no cargaba Outfit/Inter (el
   piano sí, en `app/index.html`). Sin eso, todo el texto caía a la fuente del
   sistema y la comparación fallaba por tipografía. Se corrigió copiando el bloque de
   fuentes y el CSS crítico del piano.
3. **La portada de la biblioteca tiene una animación infinita de 18 s**
   (`.lib-hero__bg`, `lib-hero-shift`). Mi primera medición la marcó como **84,88 % de
   diferencia**: eran dos fases distintas del mismo degradado, no dos estilos. Se
   corrigió el **método** (congelar animaciones antes de capturar) y pasó a **0,00 %**.
4. **Sub-píxel en el recorte.** Dos páginas independientes pueden dejar un elemento en
   `y = 210,5` y en `y = 137,0`; redondear el recorte desplaza una captura medio píxel
   y todo el degradado y el antialiasing del texto "difieren" (**80,60 % con delta
   máximo de sólo 76/765**). Se corrigió el método con una búsqueda del mejor
   corrimiento de ±1 px.
5. **`localStorage` distinto por origen.** La pantalla Música muestra colecciones
   generadas con el historial de reproducción ("Recién escuchadas", "Más
   escuchadas"), y 1234 y 1235 son orígenes distintos: sin limpiarlo, las estanterías
   mostraban canciones diferentes y la comparación medía **estado**, no CSS. Se
   corrigió limpiando el almacenamiento en las dos antes de capturar.

Ninguna de las cinco era un defecto de componentes: dos eran CSS/HTML de verdad
(1 y 2) y tres eran defectos de mi instrumento de medición (3, 4 y 5). Los dos
defectos reales están arreglados.

### Diferencias que QUEDAN (a propósito, con su captura)

1. **Rail:** 8 entradas en el piano vs 3 acá (Música, Canciones, Pistas). Las otras
   cinco son Studio, Juego, Pistas-duplicada, MIDI, Ajustes y Partitura: pantallas que
   el encargo prohíbe traer. Por eso el `.rail-item` activo está en `y = 256` en el
   piano y en `y = 112` acá (mismo ítem lógico, distinta posición en la lista).
2. **Topbar:** el piano muestra la píldora de MIDI y el botón de perfil (`Lv.1
   Player`); acá hay la píldora del motor y el contador de canciones. El perfil y la
   configuración MIDI son parte de lo que no se trae.
3. **Chips de la barra:** el piano tiene `Auto · Studio · Juego`; acá sólo `Auto`.
   Los otros dos navegan a pantallas que no existen. **Es el 2,32 % de la barra: el
   diff muestra sólo esa zona** (`diff-barra-completa.png`).
4. **73 px de alto.** El piano muestra, arriba de cada pantalla, la **barra de
   transporte del Studio** (`Pausa | Detener | Letra | Metrónomo | Solo Piano |
   Cargar MIDI | Tempo | BPM | seeker`). Es del Studio, no del reproductor, así que
   no se trae. Consecuencia medida: `.panel-screen` arranca en `y = 143` en el piano y
   en `y = 70` acá, y **todas** las `rect.y` de la pantalla bajan exactamente 73 px
   (`.pm-shelf` 339→266, `.pm-card` 375→302, `.pm-nav__item` 202→129). Los **anchos y
   altos coinciden** en todos los casos. Además, el bloque "Importar" del nav de
   Música va **anclado abajo**, así que también queda 73 px más abajo. Es la única
   diferencia de armado, y es la que explica el 49,83 % de la captura completa.
5. **Un elemento flotante en la barra:** el piano y el reproductor muestran los dos
   los botones "Compartir esta canción" y "Esta canción no trae letra" en la zona
   derecha de la barra (se ven en las dos capturas, en la misma posición). Es del
   piano y se comporta igual.

### Capturas

| Archivo | Qué es |
|---|---|
| `piano-1234-musica.png` · `player-1235-musica.png` | Pantalla Música, catálogo cargado, barra vacía |
| `piano-1234-musica-cancion-en-barra.png` · `player-1235-musica-cancion-en-barra.png` | La misma canción ("El Osito Dormilón") cargada en la barra |
| `piano-1234-canciones.png` · `player-1235-canciones.png` | Pestaña Canciones (157 tarjetas) |
| `diff-barra-completa.png` | El diff de la barra: sólo la zona de los chips |
| `diff-canciones-hero.png` · `diff-canciones-tarjetas.png` · `diff-musica-estanterias.png` … | Los diffs por región (todos en negro = sin diferencias) |

---

## 4. Tabla de paridad funcional

Evidencia: `scripts/qa-player-paridad.mjs` (29/29 OK, `.logs/20261012-224803-…`),
`scripts/measure-player.mjs` (veredicto TODO OK, `.logs/20261012-225532-…`) y
`scripts/qa-player-consola.mjs` (`.logs/20261012-225622-…`). Todo medido contra la
**UI real** (clicks y arrastres de Playwright, no llamadas internas), con un tap de
RMS sobre `AudioNode.prototype.connect` → `AnalyserNode` → dBFS (el mismo
instrumento del QA del piano). La corrida de paridad se hizo con el árbol de
`app/src` **quieto** (huella `8f3ab578bab8ae41` idéntica al empezar y al terminar).

| Función | ¿Anda? | Evidencia medida |
|---|---|---|
| Catálogo de Música | ✅ | **33 tarjetas en 4 estanterías** — el piano mide 33 en 4 (`docs/qa-reproductor.md` §1.7) |
| Reproducir (tarjeta de Música) | ✅ | Primer sonido a 8.401 ms (arranque en frío) · **RMS pico −18,6 dB** |
| Pausa | ✅ | RMS **−77,4 dB** (silencio) y la posición **congelada**: 9,06 s → 9,06 s tras 1,8 s · el botón pasa a "Reproducir" |
| Reanudar | ✅ | Señal a 1.017 ms del click |
| Seeker (arrastre real del rango) | ✅ | Arrastre del 20 % al 70 %: **10,1 s → 218,2 s de 309,3 s** (el `max` del rango es idéntico al del piano: 309,30245890624997) · RMS pico −21,0 dB después |
| Siguiente | ✅ | "El Osito Dormilón" → "Sombra Perdida", con señal en la ventana de transición (RMS pico −34,4 dB: es el cruce, no el cuerpo de la canción) |
| Anterior | ✅ | Vuelve a "El Osito Dormilón" (con la posición forzada a 1 s, por debajo del umbral de reinicio de 3 s) · primera señal a 5.854 ms · RMS pico **−19,2 dB** |
| Aleatorio | ✅ | `aria-pressed` false → true → false, con la clase `is-active` acompañando |
| Repetir | ✅ | Ciclo completo de los tres estados por `aria-label`: `Activar repetición` → `Repetir una canción` → `Desactivar repetición` → `Activar repetición` |
| Auto (radio al terminar) | ✅ | `aria-pressed` true → false → true |
| Ver la cola | ✅ | El panel real se abre con **25 filas** y "24 por delante · 25 en total" |
| Silenciar | ✅ | RMS pico **−18,5 → −72,7 dB** (54,2 dB de caída) · `aria-label` pasa a "Activar sonido" |
| Volumen | ✅ | RMS pico **−52,9 dB** en el mínimo → **−11,6 dB** en el máximo (41,3 dB de rango). El mínimo **no** es silencio: es −40 dB, igual que el piano |
| **Cambio de canción sin audio de la anterior** | ✅ | La traza continua da un **mínimo de −664,3 dB** (silencio digital) entre las dos canciones, y `soundingVoices()` sin notas de la vieja. La nueva entra 2,86 s después (su propio intro) a **−13,1 dB** |
| Detener | ✅ | RMS −14,2 dB → mínimo **−309,1 dB** y **−Infinity sostenido** · posición 0,00 s · **0 voces colgadas** en las 8 pistas |
| Pestaña Canciones | ✅ | **157 tarjetas, 157 botones `.lib-card__play`**, buscador, panel de importar, grupos `[Vallenato, Bolero, Salsa, Pop & Rock, Clásica]` — los mismos 157 del piano |
| Tarjetas de Música | ✅ | Encuestan la canción al frente con la biblioteca detrás y reproducen |
| **Importar MIDI** (`Bolero_-_Besame_Mucho.kar`) | ✅ | Señal a 7.329 ms · **RMS pico −13,3 dB (> −30 dB, el criterio pedido)** · la barra muestra "Bolero_-_Besame_Mucho" · 24 voces vivas en 8 pistas |
| Mezclador · montaje | ✅ | 9 pistas · 9 selectores de instrumento · 9 sliders · 9 "Silencio" · 9 "Solo" · encabezado "Gestor de Pistas MIDI" |
| Mezclador · volumen | ✅ | Slider de la pista 1 de **0,8 ("80 %") a 0 ("0 %")** · RMS pico −13,2 → −15,8 dB |
| Mezclador · silenciar todas | ✅ | RMS −32,9 dB al instante → −71,4 dB a 1,5 s → **−323,5 dB a 4 s**, y **0 voces** con el transporte corriendo. La caída no es instantánea porque el reverb es un envío de 1,5 s: el piano tiene la misma cadena |
| Mezclador · solo | ✅ | Con 1 pista en Solo: RMS pico **−16,7 dB** |
| Mezclador · instrumento | ✅ | "Acoustic Grand Piano" → "Violin": se aplica, la píldora reporta la fuente real (`vsco (capas)`) y sigue sonando a −17,0 dB |
| Notas colgadas tras Detener | ✅ | `soundingVoices()` = `{}` · contador de fuentes de audio: 901 `start` / 889 `stop` |
| **Regla del reloj** | ✅ | **0 publicaciones de estado a React en 5,0 s de reproducción** (300 frames muestreados cada 16 ms) |
| **Errores de consola** | ✅ | **0 propios.** El piano produce 2 (los 404 del CDN de webaudiofont, documentados en `docs/qa-reproductor.md` §3.6) y el reproductor **exactamente los mismos 2**: la comparación da *0 errores que sólo tenga el reproductor y 0 que sólo tenga el piano* |
| `tsc -b` y `eslint` en `player/` | ✅ | Los dos limpios (0 líneas de salida) |
| `tsc -b` en `app/` | ✅ | Limpio |
| `npx playwright test 08-player 11-cambio-de-cancion` en `app/` | ✅ | **12 passed** (1,1 m) |

### Un bug real encontrado y arreglado en el reproductor

**Las flechas del teclado sobre un slider del mezclador también buscaban en la
canción.** El atajo global de la barra (`app/src/music/useMediaSession.ts`) ignora
los inputs de texto pero **no** los `range` (`TEXT_INPUT_TYPES` no incluye "range"),
así que con el foco en el volumen de una pista, `←` movía el slider **y** hacía
`seek(−5 s)`. Medido: 25 pulsaciones = **125 s de salto** y la canción retrocedía al
intro. Se arregló en `player/src/shell/TracksScreen.tsx` con `stopPropagation()` de
las cuatro flechas, para no tocar `app/src`.

**El piano tiene el mismo choque** (su mezclador está en la pantalla Pistas, con el
mismo `useMediaSession`). No se arregló ahí para no tocar el piano durante este
encargo: **es una decisión que el dueño debería revisar.**

### Otro arreglo (robustez)

**El catálogo avisaba progreso por cada archivo** (~130 renders de la pantalla
Música): un click en ese momento cae sobre un nodo que React está por reemplazar y
**se pierde** (medido: la primera corrida no reprodujo nada). Se limitó el aviso a
~4 por segundo (`player/src/host/catalog.ts`).

---

## 5. Lo que quedó sin verificar, y decisiones a revisar

### Sin verificar (honesto)

1. **La vista de reproducción completa (`.pm-np`), el menú de pista, y los diálogos
   de compartir / playlists / detalles** no se compararon píxel a píxel. Son los
   mismos componentes y el mismo CSS (se montan: los botones "Compartir esta
   canción" y "Esta canción no trae letra" aparecen en el DOM de la barra en las dos
   apps, en la misma posición), pero **no los capturé**. Lo único verificado de esa
   familia es el panel de la cola, que abre con sus 25 filas.
2. **No medí fps ni long tasks.** Mi instrumentación es de audio y de DOM, no de
   rendimiento de frames. Sí medí lo que el encargo pedía sobre ese eje: **0
   publicaciones de estado a React por frame**.
3. **El arranque en frío tarda 7,3–8,4 s** hasta el primer sonido (motor + samples
   del piano + instrumentos + percusión, todo de CDN). Está dentro de lo que el QA
   del piano mide (7.350 ms de caso real), pero no lo desglosé por etapa.
4. **No verifiqué el reproductor con `npm run build`.** `tsc -b` y `eslint` están
   limpios; el bundle de producción (`vite build`) no lo corrí.
5. **El renderer de la página se cayó una vez** (1 de 5 corridas largas) con
   "Execution context was destroyed", sin navegación ni crash registrados, mientras
   **otro proceso estaba editando `app/src`** (mtime 22:31–22:52 durante mi sesión, y
   las recargas por HMR quedaron registradas). No pude probar la causa más allá de esa
   correlación; con el árbol quieto no volvió a pasar en 3 corridas limpias seguidas.
   Los scripts ahora imprimen la huella de `app/src` antes y después para poder
   distinguirlo de un fallo real.
6. **No toqué ni un archivo de `app/`.** Lo verifiqué por tiempo de modificación: los
   archivos de `app/src` que aparecen modificados en `git status` tienen mtime
   **posterior al inicio de mi sesión pero de otro proceso** (`App.tsx` 22:39,
   `groove.ts` 22:45, `lyricText.ts` 22:52…). Mis ediciones están **sólo** en
   `player/**` y `scripts/**`. En consecuencia, el "app/ en verde" que reporto
   (tsc + 12 tests) refleja el árbol en curso de ese otro proceso tanto como el mío.

### Decisiones que el dueño debería revisar

1. **Tres comportamientos en los que el reproductor hace MÁS que el piano, a
   propósito, porque no hay Studio:**
   - **Fin de canción:** acá `notifyEnded()` se llama y la cola avanza sola (repetir
     una / siguiente / radio / parar). En el piano, el `onEnded` del puente queda
     registrado y **sin invocar**, así que al terminar un tema la cola no avanza.
     Si el dueño prefiere paridad exacta, se saca una línea.
   - **Tarjeta de Canciones:** acá **reproduce** (`playTrack`: la canción adelante y la
     biblioteca detrás). En el piano, "Tocar" manda la canción al **Studio** sin
     arrancarla (`loadTrack`). Como acá no hay Studio donde pulsar play, elegir una
     canción y que no pase nada parecería roto. La etiqueta accesible de la tarjeta es
     literalmente "Tocar".
   - **Importar un MIDI:** acá se carga **sin cola detrás** (`loadTrack`, para no
     repetir el BUG 5 del piano: la cola acumulándose y "siguiente" saltando a la
     biblioteca) y **se le da play**. En el piano aterriza en el Studio y espera.
2. **El mezclador no se persiste.** En el piano, `trackMuted`/`trackSolo`/
   `trackVolumes`/`trackInstruments` viven en `localStorage`, aunque se reinician en
   cada cambio de canción; acá son estado de sesión. Dentro de una sesión el
   comportamiento es idéntico (los dos vuelven a los valores del archivo al cambiar de
   canción); recargando la página, acá se pierde.
3. **No hay botón "Detener" en el reproductor... ni en la barra del piano.** El
   "Detener" del piano está en la barra del Studio. Verifiqué el camino de parada
   llamando al **mismo** `host.stop()` que usa `PlayerContext` al cargar sin
   reproducir, y midiendo: silencio sostenido, posición 0 y 0 voces. Si el dueño
   quiere un botón visible, hay que agregarlo a `PlayerBar` (o sea, tocar el piano).
4. **El conflicto de las flechas** (punto 4 de arriba): arreglado en el reproductor,
   vigente en el piano. Si se arregla en `app/src/music/useMediaSession.ts` hay que
   tener cuidado: el seeker de la barra **sí** espera que las flechas hagan `seek`
   (±5 s), así que un "ignorar todos los `range`" degradaría ese control a un paso de
   0,1 s. El arreglo hay que hacerlo por componente, no en el hook.
5. **El aviso de progreso del catálogo** ahora está limitado a ~4/s: la lista de
   Música aparece de a tandas en vez de archivo por archivo. Es a propósito (evita
   perder clicks), pero es un cambio de sensación al arrancar.

---

## Archivos que creé o modifiqué

### Nuevos (reproductor)

| Archivo | Qué es |
|---|---|
| `player/src/host/PlayerEngineHost.ts` | El puente de audio (el `PlaybackHost` del piano) |
| `player/src/host/usePlayerEngineHost.ts` | Su enganche React (singleton de módulo) |
| `player/src/host/catalog.ts` | Catálogo de demos + `?demo=<archivo>` |
| `player/src/host/midiImport.ts` | Importar un MIDI propio |
| `player/src/shell/PlayerShell.tsx` | El armazón: rail, topbar, tres pantallas |
| `player/src/shell/TracksScreen.tsx` | El mezclador por pista con la UI del piano |
| `player/src/shell/shell.css` | Sin reglas (documentado) |

### Modificados

`player/src/main.tsx` (proveedor + CSS del piano), `player/index.html` (fuentes +
CSS crítico), `player/src/testHooks.ts` (asa nueva), `player/README.md`
(reescrito), `scripts/measure-player.mjs` (reescrito para el reproductor nuevo).

### Borrados (UI pobre del reproductor viejo)

`player/src/App.tsx`, `styles.css`, `PlayerController.ts`, `usePlayer.ts`,
`format.ts`, `components/PlayerBar.tsx`, `components/TrackMixer.tsx`,
`audio/songLoader.ts`, `types.ts`.

### Scripts de QA nuevos

| Script | Qué mide | Salida |
|---|---|---|
| `scripts/qa-player-vs-piano.mjs` | Comparación lado a lado (geometría, estilo computado, diffs por región) | `.logs/qa/player-vs-piano/` |
| `scripts/qa-player-paridad.mjs` | Las 29 verificaciones funcionales con RMS | `.logs/<fecha>-…-paridad.log` |
| `scripts/qa-player-consola.mjs` | Ruido de consola 1234 vs 1235, mismo flujo | idem |
| `scripts/qa-player-smoke.mjs` | Humo: monta, catálogo, tres pantallas | idem |
| `scripts/qa-player-diag.mjs` | Traza RMS/voces/transporte cada 250 ms | idem |
| `scripts/qa-pixel-probe.mjs` | RGB de puntos concretos de dos PNG | idem |
