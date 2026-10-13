# Reproductor MIDI (`player/`)

**El mismo reproductor que tiene el piano, sin el piano.**

No es una imitación: la barra inferior, la pantalla **Música**, la pestaña
**Canciones** y el mezclador por pista son **los componentes reales de
`app/src`**, importados por el alias `@app/*`, con su CSS. Lo único propio de este
proyecto es el **cableado**: qué pasa cuando el usuario elige una canción, importa
un archivo o toca el mezclador.

- **Puerto:** `1235` (`strictPort: true` — si está ocupado, Vite falla en vez de
  saltar a otro puerto en silencio).
- **El piano sigue en el `1234`.** Este proyecto no lo toca, no lo reinicia y no
  comparte su dev server.

---

## Cómo correrlo

```powershell
pwsh -File scripts/start-servers.ps1     # piano 1234 + reproductor 1235 (no hace nada si ya responden)
```

o sólo el reproductor, como job en segundo plano (un dev server **nunca
termina**: ver `AGENTS.md`):

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "npx vite" -Cwd player -TimeoutSec 600 -Label player-dev
```

### Dependencias

**`package.json` no declara dependencias a propósito.** React y Tone.js se
resuelven desde `../app/node_modules` (hay una junction
`player/node_modules → app/node_modules`): una **única copia física**. Dos copias
de Tone.js serían dos contextos de audio y dos cachés de samples para el mismo
motor.

| Comando | Qué hace |
|---|---|
| `npm run dev` | dev server en 1235 |
| `npm run build` | `tsc -b && vite build` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | `eslint src vite.config.ts` |
| `npm run preview` | sirve `dist/` en 1235 |

---

## Qué se reutiliza y qué no

### Se reutiliza (fuente única de verdad)

| Alias / ruta | Qué es |
|---|---|
| `@app/*` → `../app/src/*` | **Los componentes del reproductor**: `components/player/PlayerSection` (barra, cola, vista de reproducción, menús, diálogos), `components/library/MusicPanel` (pantalla Música), `components/songs/SongLibrary` (Canciones), `music/PlayerContext` (la cola, el aleatorio, el repetir, la radio, los atajos), `music/libraryStore` (la biblioteca), `music/resolve`, `constants/demoSongs`, `types/*`, `utils/settings`, `audio/audioTiming`, `utils/playbackRouting` |
| `@engine/*` → `../app/src/engine/*` | El motor de audio: cadena de fuentes con failover, EQ/paneo por familia, kit de percusión |
| `app/src/index.css` + `app/src/App.css` | El estilo del armazón, los botones y el mezclador. El CSS de cada componente lo importa el propio componente (`player.css`, `music.css`, `SongLibrary.css`) |
| `app/public/demo` | Los MIDI de demostración, servidos en `/demo/<archivo>` por un middleware de `vite.config.ts`: las ~200 canciones del piano sin duplicar un byte |

Los alias están declarados en **dos** lugares que tienen que coincidir:
`player/vite.config.ts` → `resolve.alias` y `player/tsconfig.app.json` →
`compilerOptions.paths`.

### Es propio de `player/`

| Archivo | Qué hace |
|---|---|
| `src/host/PlayerEngineHost.ts` | El **puente de audio**: implementa el `PlaybackHost` que `PlayerContext` espera (`load`/`play`/`pause`/`stop`/`seek`/`setVolume`/`getPosition`). En el piano ese puente vive dentro de `app/src/App.tsx` (~6.000 líneas, con el Studio, el teclado, el modo Juego y las partituras adentro), así que se replica acá |
| `src/host/usePlayerEngineHost.ts` | El enganche React del puente. El motor es un **singleton de módulo**, igual que `libraryStore` |
| `src/host/catalog.ts` | Carga el catálogo de demos y lo registra en la biblioteca (replica el `useEffect` de demos de `App.tsx`) |
| `src/host/midiImport.ts` | Importar un MIDI propio (replica `parseMidiFile` de `App.tsx`) |
| `src/shell/PlayerShell.tsx` | El armazón: rail (Música · Canciones · Pistas · Autores · Ajustes), topbar y las pantallas |
| `src/shell/TracksScreen.tsx` | El mezclador por pista, con la UI del piano (`.track-item-card`, `.btn-mute-solo`, `active-mute`, `active-solo`) |
| `src/shell/SettingsScreen.tsx` | **Ajustes**: la perilla **Groove** (interpretación), con el patrón `.settings-group`/`.settings-row`/`.slider-custom` del piano |
| `src/shell/keys.ts` | El corte de las flechas del teclado en los sliders de panel (ver "Detalles que cuestan") |
| `src/audio/*` | El grafo maestro, la agenda de notas (con el plan de Groove), el cargador de samples de piano y la tabla GM. Es la base que ya existía |

### NO se trae

Studio, teclado en pantalla, modo Juego, avatares/mascotas, pedales (una corda /
sostenuto / sustain / half-pedaling), Key FX, perfiles y partituras MusicXML.

Tampoco la **barra de transporte del Studio** (`Pausa | Detener | Letra |
Metrónomo | Solo Piano | Cargar MIDI | Tempo | BPM | seeker`) que el piano muestra
arriba de cada pantalla: es del Studio, no del reproductor. Es la única diferencia
de armado medible (**73 px de alto**), y está documentada abajo.

---

## Las reglas del proyecto, y cómo se cumplen acá

### 1. Cero sonido sintetizado

No hay un solo oscilador en el camino de audio. En `audio/scheduler.ts` cada nota
resuelve su fuente al dispararse: piano acústico → sampler Salamander; cualquier
otro instrumento → su sample real; sample todavía bajando o sin fuente real → **la
nota se saltea** (silencio). El contador de "notas salteadas" es el dato honesto
de cuánto se perdió por esa regla.

### 2. Liberar siempre las voces

`PlayerEngineHost.releaseVoicesSmoothly()` suelta **la capa de fuentes**
(`releaseAllInstruments()`), **el kit de percusión** y **el sampler de piano**, con
un fade corto de los buses para que el corte no haga click. Se llama al detener,
al pausar, al buscar y al cambiar de canción.

Sin esto, los samples de VSCO (7–84 s) siguen sonando encima de la canción
siguiente. Medido: el nivel cae a **−664 dB** (silencio digital) al cambiar de
canción, sin una sola voz viva.

### 3. No publicar estado de React por nota

El reloj escribe un **`ref`** y la barra lo lee con su propio
`requestAnimationFrame`; el contexto del reproductor expone `getPosition()` como
lectura imperativa. Medido con `scripts/measure-player.mjs`: **0 publicaciones a
React en 5 s de reproducción** (300 frames muestreados).

### 4. Precargar al cargar, no al pulsar play

`load()` dispara la precarga enseguida: sólo se esperan los instrumentos que suenan
en los primeros 6 s (`EARLY_AUDIO_WINDOW_SEC`) y el tope de espera al arrancar es
de **2,5 s** (`SAMPLES_WAIT_MS`). El resto baja en segundo plano.

El `AudioContext` no puede arrancar sin un gesto del usuario, así que el motor se
**calienta con el primer gesto** (`warmUpOnFirstGesture`, en captura sobre
`pointerdown`/`keydown`): sin eso, en una pestaña recién abierta la precarga no
podría empezar hasta el primer click en play.

### 5. El fin de canción sí avisa

En el piano, `PlayerContext.notifyEnded()` nunca se llama al terminar un tema (el
`onEnded` del puente queda registrado y sin invocar), así que la cola no avanza
sola. Acá el reloj del motor lo llama, que es justo para lo que el contexto expone
`notifyEnded`: repetir-una, siguiente, radio automática o parar.

### 6. El estado de React y el del motor nunca se contradicen

`PlayerContext` marca "está reproduciendo" **antes** de que el motor arranque de
verdad: en frío eso puede tardar segundos (construir el grafo + bajar samples). Si
en esa ventana llega un `pause()`, el contexto pone `isPlaying = false` pero el
`play()` en vuelo seguía y arrancaba el transporte igual: la canción sonaba con el
botón en "Reproducir", el reloj en "0:00" y el scrubber congelado (la barra sólo
repinta mientras `isPlaying` es true).

El caso real que lo dispara es **pulsar dos veces la misma tarjeta de Música**: la
segunda vez ya es la canción activa y `TrackCard`
(`app/src/components/library/TrackCard.tsx:38`) hace `player.toggle()`.

Se arregla con dos cosas en el host:

- **`playToken`**: cada `play()` se lleva una generación, y `pause()`/`stop()`/
  `load()` la incrementan para cancelar el arranque en vuelo. Después de cada
  `await`, `play()` compara y abandona si lo cancelaron.
- **`wantPlaying`**: la intención del host. Si por cualquier camino un arranque
  obsoleto llegara a arrancar el transporte, el reloj lo detecta (`!wantPlaying`
  con el transporte corriendo) y lo deja en pausa.

Verificado con `scripts/qa-player-isplaying.mjs`, que recorre los 7 caminos de
arranque y falla si hay señal audible (> −40 dB) con `isPlaying` en false.

---

## Cómo se verifica

| Script | Qué mide | Tope |
|---|---|---|
| `node scripts/qa-player-vs-piano.mjs` | Capturas y diffs píxel a píxel 1234 vs 1235, alineados por región. Salida en `.logs/qa/player-vs-piano/` | 480 s |
| `node scripts/qa-player-paridad.mjs` | 29 verificaciones funcionales con RMS medido (play/pausa, seeker arrastrado, siguiente/anterior, aleatorio, repetir, cola, silenciar, volumen, cambio de canción, Canciones, importar, mezclador) | 700 s |
| `node scripts/qa-player-isplaying.mjs` | Los 7 caminos de arranque contra el invariante "nunca audio con `isPlaying` en false" | 480 s |
| `node scripts/qa-player-groove.mjs` | La perilla Groove: UI, persistencia, mouse, teclado, y el plan agendado medido (a 0 % identidad exacta; a 100 % topes y sin deriva) | 480 s |
| `node scripts/qa-player-arranque.mjs` | Desglose del arranque en frío por etapa + primer sonido audible + silencio propio del archivo | 300 s |
| `node scripts/measure-player.mjs` | Arranque, regla del reloj, cambio de canción, detener, errores de consola | 300 s |
| `node scripts/qa-player-consola.mjs` | Compara el ruido de consola con el del piano, con el mismo flujo | 500 s |
| `node scripts/qa-player-diag.mjs` | Traza RMS/voces/transporte cada 250 ms (diagnóstico) | 300 s |
| `node scripts/qa-pixel-probe.mjs` | RGB de puntos concretos de dos PNG (decide si un diff es real o sub-píxel) | 90 s |

Los scripts de QA del piano (`scripts/qa-all-*.mjs`) siguen siendo del piano: usan
`window.__PMP_TRANSPORT__` y el DOM del Studio.

### Asa de medición

En desarrollo, `window.__PLAYER__` expone:

```js
window.__PLAYER__.host             // el motor (getSnapshot, isPlaying, seek, stop…)
window.__PLAYER__.position()       // segundos escuchados
window.__PLAYER__.soundingVoices() // pista → notas MIDI vivas (detecta colgadas)
window.__PLAYER__.skippedNotes()   // notas salteadas por falta de sample
window.__PLAYER__.audioState()     // estado del AudioContext
window.__PLAYER__.loadedSongId()   // qué canción tiene el motor
window.__PLAYER__.intendsToPlay()  // intención del host (no el estado del transporte)
window.__PLAYER__.startTimings()   // desglose del arranque en frío, por etapa (ms)
window.__PLAYER__.grooveAmount()   // posición vigente de la perilla Groove
```

Y el plan de Groove que fue al Transport (sólo desarrollo), igual que el
`window.__PMP_GROOVE__` del piano:

```js
window.__PLAYER_GROOVE__ // { amount, ppq, rows: [{ id, track, role, ticks, offsetMs, velocityIn, velocityOut, … }] }
```

No maneja el reproductor: la reproducción se mide **pulsando la UI real** (la
tarjeta de Música, el botón de la barra). El asa sólo lee. En producción no publica
nada.

---

## La perilla Groove (interpretación)

Está en **Ajustes** (rail → Ajustes), con el mismo patrón visual que la pantalla de
Ajustes del piano: etiqueta + subtítulo + slider `.slider-custom` + valor en %.

- **Qué hace**: microtiming y dinámica. Cada rol (percusión, bajo, armonía, melodía)
  cae en un punto ligeramente distinto del pulso y con una leve variación de
  intensidad. A 0 % suena exactamente como el archivo MIDI.
- **El cálculo no se copió**: es `@app/engine/groove` (módulo puro y determinista),
  importado por alias. El reproductor sólo aporta el plan por pista en
  `audio/scheduler.ts` (los ticks, la duración y la velocity de cada nota).
- **Persiste en la MISMA clave que el piano** (`piano_groove_amount`), así que el
  valor es el mismo en los dos.
- **Se aplica al agendar** (play y seek), igual que el piano: arrastrar el slider no
  reagenda ni corta lo que está sonando.
- Las flechas del teclado mueven la perilla y **no** buscan en la canción (ver el
  choque de los `range` más abajo).

Medición (`scripts/qa-player-groove.mjs`, 16/16 OK): a 0 % los **6.453** ticks y
velocities agendados son idénticos a la fórmula sin perilla; a 100 %, **6.261**
notas llevan desvío, el máximo es **11,48 ms** (tope del módulo: 15 ms), la media
global 0,68 ms y la diferencia entre la primera y la última mitad de la canción
1,28 ms (sin deriva acumulativa). La melodía se mueve menos que la armonía (R6):
5,06 ms contra 10,61 ms.

## Arranque en frío, desglosado

Medido con `scripts/qa-player-arranque.mjs` (marcas del host desde el click):

| Etapa | Frío (primera canción) | Caliente (otra canción) | Botón central |
|---|---|---|---|
| espera de samples de la canción | 2.590 ms | 477 ms | — |
| transporte arrancado | 2.651 ms | 505 ms | 84 ms |
| primera nota disparada | 8.524 ms | — | — |
| primer sonido audible | 8.726 ms | 4.295 ms | 666 ms |
| notas salteadas por falta de sample | **0** | **0** | **0** |

**No hay 7-8 s de motor: hay ~2,6 s de espera de samples (el tope `SAMPLES_WAIT_MS`,
que es una decisión de diseño, no una demora accidental) y el resto es el silencio
propio del archivo.** La primera nota de `El Osito Dormilón` está en ~5,9 s del
archivo y las mezclas medidas lo confirman: en la corrida caliente, con el motor ya
construido, el transporte arranca a los 505 ms y el primer sonido aparece a los
4,3 s, que es el intro del Bolero (el QA del piano documenta su primera nota de
percusión en 2,40 s y la melódica en 4,79 s). Con 0 notas salteadas, el silencio no
es una pérdida: es la canción.

---

## Detalles que cuestan y conviene no volver a aprender

- **`?demo=<archivo>`** carga y reproduce una demo suelta por nombre de archivo:
  sirve para escuchar cualquiera de los ~200 MIDI del proyecto, no sólo los ~130
  del catálogo curado, y para que las mediciones tengan material determinista.
- **El aviso de progreso del catálogo está limitado a ~4 por segundo**
  (`catalog.ts`). Avisar por cada archivo son ~130 renders de la pantalla Música:
  un click en ese momento cae sobre un nodo que React está por reemplazar y se
  pierde (medido).
- **Las flechas del teclado sobre un slider del mezclador** se cortan en el
  componente (`TracksScreen`). El atajo global de la barra
  (`music/useMediaSession.ts`) ignora los inputs de texto pero **no** los `range`,
  así que sin ese corte la flecha movía el volumen *y* buscaba ±5 s en la canción
  (medido: 125 s de salto). **El piano tiene el mismo choque**: no se arregló ahí
  para no tocar `app/src`.
- **Sin `StrictMode`** (a diferencia del piano): remontar los efectos arranca el
  `AudioContext` dos veces y duplica la carga de samples en cada arranque en frío.
- **Mientras alguien edite `app/src`, este dev server recarga la pestaña.** El
  reproductor importa esos módulos, así que Vite los vigila: una edición en
  `app/src` a mitad de una medición se ve como *"Execution context was destroyed"*.
  Los scripts de QA imprimen la huella de `app/src` antes y después para poder
  distinguir eso de un fallo real.

---

## Diferencias visuales conocidas (medidas)

Comparado lado a lado con el piano (`scripts/qa-player-vs-piano.mjs`, mismas
condiciones y viewport 1600×900, animaciones congeladas):

| Región | Píxeles distintos |
|---|---|
| Barra: transporte (aleatorio/anterior/play/siguiente/repetir) | **0,00 %** |
| Barra: ahora suena (carátula, título, artista, corazón) | **0,00 %** |
| Barra: progreso (relojes + seeker) | **0,00 %** |
| Barra: volumen | **0,00 %** |
| Música: navegación interna | **0,00 %** |
| Música: encabezado y estanterías | **0,00 %** |
| Canciones: portada, buscador, géneros, panel de importar, tarjetas | **0,00 %** |
| Barra completa | 2,32 % → sólo los chips **Studio** y **Juego** (no se traen) |

Lo que **sí** difiere, a propósito:

1. **Rail:** el piano tiene 8 entradas; acá hay 3 (Música, Canciones, Pistas).
2. **Topbar:** el piano muestra la píldora de MIDI y el botón de perfil; acá hay la
   píldora del motor y el contador de canciones.
3. **Chips de la barra:** el piano tiene `Auto · Studio · Juego`; acá sólo `Auto`
   (los otros dos llevan a pantallas que no se traen).
4. **73 px de alto:** el piano muestra arriba de cada pantalla la barra de
   transporte del Studio. Sin ella, el contenido empieza 73 px más arriba y el
   bloque "Importar" del nav de Música (que va anclado abajo) queda 73 px más
   abajo. Todo lo demás del armazón es idéntico.
