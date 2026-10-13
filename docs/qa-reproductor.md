# QA funcional del reproductor — Piano MIDI Pro

**Sesión de QA:** 2026-10-12, 20:17 → 21:35 (hora local).
**Alcance:** los 46 controles visibles al inicio más la carga de archivos y el flujo de biblioteca (**82 controles en la tabla autoritativa**, sobre 101 mediciones totales).
**Método:** Playwright sobre el dev server en `http://localhost:1234` (ver §7), con la salida de audio medida de verdad: un tap sobre `AudioNode.prototype.connect` que engancha un `AnalyserNode` cuando el destino es `AudioDestinationNode`, y el nivel leído en dBFS (RMS).
**Arreglos:** no se tocó una sola línea de `app/`. Todo lo que sigue son mediciones.

---

## 0. Versión del árbol y cómo leer las etiquetas

**La QA se hizo en dos tandas porque el código cambió mientras se medía.** El informe se cierra sobre el árbol congelado:

| | |
|---|---|
| **Rama** | `feat/reproductor-instrumentos-reales` |
| **HEAD (árbol congelado)** | `b7b63a7` |
| **Congelamiento verificado** | `git status --short -- app/src` **vacío**, y el SHA256 de `App.tsx` idéntico en dos muestras separadas 6 s |
| **Commits de referencia** | `12c96e1` (la barra sigue la canción cargada + play/pausa) · `69d6ac3` (desacoplar el playback del render del Studio) · `0d1ea5d` (arranque en frío + píldora) · `b7b63a7` ("canción anterior" en el índice 0) |

### Etiquetas que llevan las filas

| Etiqueta | Qué significa |
|---|---|
| **post-freeze** | Medido sobre `b7b63a7` con `app/src` congelado. **Es lo que describe el código actual.** |
| **pre-12c96e1** | Medido entre 20:17 y 20:41, antes del primer arreglo. Registro histórico. |
| **CORREGIDO y verificado** | Bug reproducido en la versión vieja, arreglado, y **re-medido** sobre el árbol congelado. |
| **ortogonal** | Control que no pasa por el camino que cambió (Key FX, pedales, teclado, navegación…): se midió una vez y sigue válido. |

### Contadores

Se cuentan **82 controles** en la **tabla autoritativa** (la canónica menos las filas superadas; el desglose y la lista de exclusiones están en §5.1, y `qa-all-collect.mjs` los imprime con su motivo).

| Resultado | Filas | Cuáles |
|---|---|---|
| **OK** | **78** | incluye los 3 arreglos re-verificados |
| **FALLA** | **4** | **2 mediciones de BUG 5** + **1 limitación menor** (el slider) + **1 fila pre-`12c96e1`** que el árbol ya no tiene |
| **CORREGIDO y verificado** | **3 bugs** | BUG 1, BUG 2 y BUG 3 |
| **NO VERIFICABLE** | **0** | el único "no verificable" (la pausa pre-fix) quedó superado por la re-medición |

**Ninguna de las 4 "FALLA" queda sin explicar**: las tres primeras son BUG 5 y el slider, con pasos exactos en §2; la cuarta es una medición vieja que se conserva por trazabilidad.

---

## 1. Tabla por control

Leyenda: **OK** = existe, está habilitado cuando corresponde y al accionarlo cambia algo observable · **FALLA** = no responde o responde mal, con la medición al lado · **CORREGIDO** = fallaba en la versión medida y ya no · **NO VERIFICABLE** = no se pudo medir.

### 1.1 Barra del reproductor (`.pm-bar`)

| Control | Selector | Resultado | Evidencia (qué cambió, medido) | Captura |
|---|---|---|---|---|
| Estado inicial (baseline) | `.pm-bar` | **OK** | `título="Nada en reproducción"`, `artista="Elegí una canción para empezar"`, cola 0, seeker `0/0.1` **deshabilitado**; deshabilitados: Canción anterior, Canción siguiente, chip Studio, chip Juego. 46 controles visibles, 0 errores de consola | `bar-00-inicio.png` |
| `input[aria-label="Posición de reproducción"]` (seeker) | `.pm-bar .pm-bar__range` | **OK** *(posterior)* | valor 10,2 s → **154,7 s** de 309,3 s; relojes de la barra `["2:34","5:09"]`; deshabilitado al inicio=**true** (`max=0.1`), con canción cargada=**false** | `switch-d1-seeker-tras-cambio.png` |
| `button[aria-label="Abrir …"]` (vista de reproducción) | `.pm-bar__now` | **OK** *(posterior)* | abre `.pm-np[aria-label="Reproducción actual"]` con título "El Osito Dormilón", artista "Binomio de Oro", origen "Vallenato 1 de 25" y 12 botones propios (Cerrar, + Playlist, Compartir, Me gusta, Aleatorio, Anterior, Pausar, Siguiente, Repetir, Volumen, Practicar en Studio, Ver partitura); `.pm-bar` sigue montada debajo | `barrows2-05-np-abierta.png` |
| Reproducción aleatoria | `.pm-bar button[title="Aleatorio (S)"]` | **OK** | `aria-pressed` false → true → false en dos pulsaciones, con la clase `is-active` acompañando | `bar-06-aleatorio-antes.png` · `bar-06-aleatorio-despues.png` |
| Canción siguiente | `.pm-bar button[aria-label="Canción siguiente"]` | **OK** | título "El Osito Dormilón" → "Sombra Perdida"; seeker reiniciado a 6,0 s de 259 s; cola 24 → 23; RMS −20,5 dB tras el salto | `bar-04-siguiente-antes.png` · `bar-04-siguiente-despues.png` |
| **Canción anterior** | `.pm-bar button[aria-label="Canción anterior"]` | **CORREGIDO y verificado** *(post-freeze)* | ver **BUG 3** | `prev2-A-antes.png` · `prev2-A-despues.png` |
| Reproducir / Pausar (botón central) | `.pm-bar__transport button` (central) | **CORREGIDO y verificado** *(post-freeze)* | ver **BUG 1** | `postfreeze-A2-antes-de-pausar.png` · `postfreeze-A3-tras-pausar.png` · `postfreeze-A4-siete-segundos.png` |
| Activar repetición (ciclo) | `.pm-bar .pm-repeat` | **OK** | ciclo completo observado: `Activar repetición[false]` → `Repetir una canción[true]` → `Desactivar repetición[true]` → `Activar repetición[false]`. El `aria-label` codifica los tres estados | `bar-07-repeticion.png` |
| Al terminar la cola, seguir con radio del artista | `.pm-bar button[title="Al terminar la cola…"]` | **OK** | `aria-pressed` true → false → true (arranca en **true**) con la clase `is-on` acompañando | `bar-08-auto-antes.png` · `bar-08-auto-despues.png` |
| Ver la cola (Q) | `.pm-bar button[title="Ver la cola (Q)"]` | **OK** | `aria-expanded` false → true; aparece `aside.pm-drawer[aria-label="Cola de reproducción"]` con "23 por delante · 25 en total" y las filas con carátula, título, artista y duración; contador de la barra = 24 | `bar-03-cola-abierta.png` · `switch-d4-cola-tras-cambio.png` |
| Silenciar | `.pm-bar button[aria-label="Silenciar"]` | **OK** | `aria-label` "Silenciar" → **"Activar sonido"**; slider de volumen leído **0**; RMS **−21,5 → −72,9 dB** (51,4 dB de caída) | `bar-09-mute-antes.png` · `bar-09-mute-despues.png` |
| `input[aria-label="Volumen"]` — uso normal | `.pm-bar__volume-range` | **OK** | con teclado (vía real): `Home` → store **0**, `End` → store **1**; RMS **−55,9 dB con el slider en 0** y **−16,1 dB en 1** (39,9 dB de rango). Ojo: el mínimo **no es silencio** — el mapeo es `dB = −40 + volumen×40` (`music/PlayerContext.tsx`) | `barrows2-03-volumen-minimo.png` · `barrows2-03-volumen-maximo.png` |
| `input[aria-label="Volumen"]` — asignación por script | `.pm-bar__volume-range` | **FALLA** (limitación acotada) | `el.value="0.25"` + eventos `input`/`change`: el store **no cambia** (1 → 1). Con teclado sí cambia. Afecta a tooling/scripts que muevan el slider por JS, **no** al usuario (teclado y arrastre funcionan) → severidad **baja** | `barrows2-04-volumen-programatico.png` |
| Chip "Studio" (Practicar esta canción en el Studio) | `.pm-bar button[title="Practicar esta canción en el Studio"]` | **OK** | con canción en la barra: `disabled=false`; en el estado vacío: `disabled=true`. Al pulsarlo desde la pestaña Canciones el rail activo pasa a **"Studio"** | `bar-12-chips.png` · `bar-12-studio-despues.png` |
| Chip "Juego" (Jugar esta canción en modo ritmo) | `.pm-bar button[title="Jugar esta canción en modo ritmo"]` | **OK** | `disabled=false` con canción cargada; al pulsarlo el rail activo pasa a **"Juego"** | `bar-13-juego-despues.png` |
| Errores de consola en toda la sesión de barra | (global) | **FALLA** *(pre)* | 3 errores de consola, todos del mismo tipo: recursos externos. Ver **BUG 4** | — |

### 1.2 Vista de reproducción (`.pm-np`), abierta desde la barra

| Control | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| Siguiente | `.pm-np button[aria-label="Siguiente"]` | **OK** | la barra pasó de "El Osito Dormilón" a "Sombra Perdida" | `barrows2-06-np-siguiente.png` |
| Cerrar la vista de reproducción | `.pm-np button[aria-label="Cerrar la vista de reproducción"]` | **OK** | tras pulsarlo `.pm-np` ya no está en el DOM (`true`) | `barrows2-07-np-cerrada.png` |

### 1.3 Studio (controles del `.playback-bar` y del panel izquierdo)

| Control | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| `input[aria-label="Cargar archivo MIDI"]` | `input[type=file]` | **OK** | `accept=".mid,.midi"`; cargar `Bolero_-_Besame_Mucho.kar` cambia el topbar a `"Bolero_-_Besame_Mucho · Original: 100 BPM · 2:55"` y el seeker del Studio a `max=175,485 s`. **Ojo:** el `accept` no incluye `.kar` pero el parser sí lo acepta | `studio-01-cancion-cargada.png` |
| Reproducir (botón `.btn.primary`) | `.playback-bar .btn.primary` | **CORREGIDO / a re-medir** | la medición principal dio `RMS −inf` con el botón en "Pausa"; el diagnóstico posterior dio **−22,0 dB** con `AudioContext.state="running"` y el reloj del contexto avanzando 14,85 s. Ver **§3.1**: la ventana de muestreo cayó dentro del arranque en frío | `karsilence-02-tras-reproducir.png` |
| Detener | `.playback-bar button:has-text("Detener")` | **OK** | RMS −inf a los 2,5 s y −inf a los 4,7 s; reloj vuelve a `"0:00 / 2:55"`; el botón vuelve a "Reproducir"; **11 fuentes de audio seguían vivas** — liberación pendiente (ver §3.5) | `studio-03-detener.png` |
| Letra / "Esta canción no trae letra" | `.playback-bar button:has-text("Letra")` | **OK** | con el `.kar` cargado el botón **no** está deshabilitado: `title="Ver la letra sincronizada"`, `aria-pressed=false`, contador `.lyrics-count = 26`; tras pulsar: `aria-pressed=true`, `title="Volver a las métricas"` y el panel muestra la letra con su crédito ("Trabajo realizado por David G.") | `studio-04-letra-antes.png` · `studio-04-letra-despues.png` |
| Encender / Apagar metrónomo | `.playback-bar button:has-text("Metrónomo")` | **OK** | `title` "Encender metrónomo" → **"Apagar metrónomo"** → "Encender metrónomo"; la clase pasa de `btn` a **`btn primary`**; con el transporte parado el RMS pasa de −inf a **−33,6 dB** (el metrónomo suena) | `studio-05-metronomo-antes.png` · `studio-05-metronomo-encendido.png` · `studio-05-metronomo-apagado.png` |
| Solo piano (ocultar otros) | `.piano-only-toggle` | **OK** | `aria-pressed` false → true; `title` "Solo piano (ocultar otros)" → "Mostrar todos los instrumentos"; el knob se mueve (`left=16px`) y la pista se pinta `rgb(139, 92, 246)`; clase `active` | `studio-06-solopiano-antes.png` · `studio-06-solopiano-despues.png` |
| `input[aria-label="BPM (tempo)"]` | `input[type=number]` | **OK** | 100 → **90** (min 10, max 400). Es un campo controlado: refleja `Math.round(song.bpm × playbackRate)`, así que el valor se asienta en el número pedido | `studio-07-bpm-antes.png` · `studio-07-bpm-despues.png` |
| `input[aria-label="Posición de la canción"]` | `.seeker-container input[type=range]` | **OK** | valor fijado a **87,8 s** de 175 s; el reloj del Studio pasó de `"0:00 / 2:55"` a **`"1:27 / 2:55"`** | `studio-08-seeker-antes.png` · `studio-08-seeker-despues.png` |
| `[aria-label="Seleccionar rango de teclado"]` | `.keyboard-minimap[role=slider]` | **OK** | arrastre de 20 % a 80 % del minimap: rango **`C4–C7` → `C5–C8`**; minimap con 37/88 teclas `.in-range`; 22 blancas y 15 negras renderizadas | `studio-09-rango-antes.png` · `studio-09-rango-despues.png` |
| Una corda | `.ic-pedal[title="Una corda — suaviza y oscurece el timbre"]` | **OK** | clase `"ic-pedal "` → (mousedown) `"ic-pedal ic-pedal--active"` → (mouseup) `"ic-pedal "` | `studio-10-unacorda-antes.png` · `studio-10-unacorda-pisado.png` · `studio-10-unacorda-soltado.png` |
| Sostenuto | `.ic-pedal[title="Sostenuto — mantiene solo notas activas al pisarlo"]` | **OK** | gana `ic-pedal--sostenuto` al pisarlo y lo pierde al soltarlo | `studio-11-sostenuto-antes.png` · `studio-11-sostenuto-pisado.png` · `studio-11-sostenuto-soltado.png` |
| Sustain | `.ic-pedal[title="Sustain — resonancia de todas las cuerdas"]` | **OK** | gana `ic-pedal--sustain` al pisarlo y lo pierde al soltarlo | `studio-12-sustain-antes.png` · `studio-12-sustain-pisado.png` · `studio-12-sustain-soltado.png` |
| Sustain **con una nota** (¿hace algo?) | idem + tecla | **OK** | nota mantenida 2 s: **con pedal el pico es −41,5 dB y la cola llega a 1181 ms; sin pedal −50,3 dB y 735 ms**. Diferencia de pico **+8,7 dB**: el pedal refuerza y alarga. (`sustain-curvas.json`, 26 puntos por curva) | `sustain-01-sin-pedal.png` · `sustain-02-con-pedal.png` |
| `input[aria-label="Half-pedaling — blur armónico controlado"]` | `.ic-slider` | **OK** *(posterior)* | valor 0.6 (min 0, max 1, step 0.01) → la etiqueta de la fila pasó de `"100%"` a **`"60%"`** | `studio-13-halfpedal-antes.png` · `studio-13-halfpedal-despues.png` |

### 1.4 Temas de color / Key FX

| Control | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| Los 7 botones "Tema de color X" | `.keyfx-swatch[aria-label^="Tema de color"]` | **OK** | los 7 (Violeta, Cian, Lima, Fuego, Hielo, Rosa, Oro) quedan activos al pulsarlos, `aria-pressed=true`, **un solo** swatch activo a la vez, y cada uno escribe su color en `--active-key-color` de la primera tecla blanca (`#8b5cf6`, `#06b6d4`, `#84cc16`, `#f97316`, `#bae6fd`, `#f43f5e`, `#fbbf24`) | `studio-14-temas.png` |
| Elegir color personalizado + `input[type=color]` | `.keyfx-swatch--custom` | **OK** *(posterior)* | `input[type=color]` `#8b5cf6` → **`#ff0066`**; el botón custom queda activo (`aria-pressed=true`), su fondo toma el color y `--active-key-color` de la tecla blanca pasa a **`#ff0066`** | `studio-15-colorcustom-antes.png` · `studio-15-colorcustom-despues.png` |
| `input[aria-label="Brillo del efecto Key FX"]` | `.keyfx-slider` | **OK** | valor 0.9 → **0.3**; la etiqueta de la fila "Brillo" pasó a **"30%"**; `--active-key-glow` **no cambia** en las teclas en reposo (sólo se aplica al pulsarlas), así que la evidencia visual es la etiqueta | `studio-16-brillo-antes.png` · `studio-16-brillo-despues.png` |
| `input[aria-label="Intensidad del efecto Key FX"]` | `.keyfx-slider` | **OK** | valor 0.9 → **0.35**; etiqueta de la fila "Intensidad" → **"35%"** | `studio-17-intensidad-antes.png` · `studio-17-intensidad-despues.png` |

### 1.5 Teclado

| Control | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| Tecla blanca, mousedown/mouseup | `.piano-key-element.white` | **OK** | mousedown sobre la 5ª blanca → **1** tecla con `.active-press` y `--press-depth=0.75`; RMS del entorno **−inf → −33,3 dB** al pisarla; tras mouseup **0** teclas activas. 22 blancas y 15 negras visibles | `studio-18-teclado-antes.png` · `studio-18-teclado-pisada.png` · `studio-18-teclado-soltada.png` |
| Tecla negra | `.piano-key-element.black` | **OK** | mousedown sobre la 3ª negra → 1 tecla negra con `.active-press`; RMS **−43,2 dB** | `studio-19-teclanegra.png` |

### 1.6 Navegación (rail)

Las 8 entradas navegan y **la barra del reproductor sobrevive el cambio de pantalla** en todas.

| Control | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| Studio | `.rail-item[title="Studio"]` | **OK** | `.active` → "Studio"; marcador `.studio-workspace` presente; encabezados "Métricas del Sistema"; `hasPedals=true`, `hasKeyFx=true` | `studio-21-nav-studio.png` |
| Modo Juego | `.rail-item[title="Modo Juego"]` | **OK** | rail "Juego"; `.studio-workspace` presente; encabezados "Modo Juego 37 teclas" / "HUD Juego" | `studio-21-nav-juego.png` |
| Música — tu reproductor | `.rail-item[title="Música — tu reproductor"]` | **OK** | rail "Música"; `.panel-screen--music` presente; estanterías Vallenato / Boleros / Clásica para piano / Pop & Rock | `studio-21-nav-musica.png` |
| Canciones | `.rail-item[title="Canciones"]` | **OK** | rail "Canciones"; 157 `.lib-card` | `studio-21-nav-canciones.png` |
| Pistas | `.rail-item[title="Pistas"]` | **OK** | rail "Pistas"; encabezado "Gestor de Pistas MIDI" | `studio-21-nav-pistas.png` |
| Configuración MIDI | `.rail-item[title="Configuración MIDI"]` | **OK** | rail "MIDI"; encabezados "Panel MIDI Avanzado" / "Conectividad MIDI" / "Parámetros de Expresividad" | `studio-21-nav-midi.png` |
| Ajustes | `.rail-item[title="Ajustes"]` | **OK** | rail "Ajustes"; encabezados "Configuraciones Generales" / "Ajustes Visuales" / "Efectos y Motor de Audio" | `studio-21-nav-ajustes.png` |
| Partitura | `.rail-item[title="Partitura"]` | **OK** *(posterior)* | rail "Partitura"; encabezado "Importar Partitura". La pantalla **no usa `.panel-screen`** (monta su propio bloque de importación / `ScoreViewer`), por eso la primera pasada la marcó como fallo: era el marcador, no la navegación | `studio-21-nav-partitura.png` |

### 1.7 Biblioteca y carga de archivos

| Control / flujo | Selector | Resultado | Evidencia | Captura |
|---|---|---|---|---|
| Pestaña "Canciones" lista la biblioteca | `.lib-card` / `.lib-card__play` | **OK** *(posterior)* | **157 tarjetas** (todas en cuadrícula), **157 botones `.lib-card__play`**, buscador `input[aria-label="Buscar canciones por título o artista"]`, bloque `[aria-label="Subir tu propio MIDI"]`. La primera tarjeta es "Binomio de Oro - El Osito Dormilón" con 🪗 Vallenato / 69 BPM / 5:09 / 4.1k notas / 9 pistas | `library-01-canciones.png` |
| (3) Canciones → elegir una canción | `.lib-card__play` | **OK** *(posterior)* | elegir "Binomio de Oro - El Osito Dormilón": la pantalla salta a **Studio**, el topbar pasa de `"Sin canción cargada · Original: 120 BPM · 0:00"` a `"Binomio de Oro - El Osito Dormilón · Original: 69 BPM · 5:09"`, el seeker del Studio queda en `max=309 s` **y la barra pasa de "Nada en reproducción" a "El Osito Dormilón" con cola 156** | `library-02-elegir-antes.png` · `library-02-elegir-despues.png` |
| (3) Canciones → reproducir la elegida | `.playback-bar .btn.primary` | **OK** *(posterior)* | RMS **−18,5 dB** con 79 fuentes vivas (medido a los 16 s del click, precisamente porque el arranque en frío tarda ~8 s) | `library-03-reproduciendo.png` |
| (3) Canciones → cambiar a otra canción | `.lib-card__play` (4ª) | **OK** *(posterior)* | de "El Osito Dormilón" a "Olvídala": topbar y barra cambian, **el reloj del transporte vuelve a `0:00`**, el audio baja de −20,5 dB a −inf y las fuentes vivas caen de 79 a 31 | `library-04-cambiar-antes.png` · `library-04-cambiar-despues.png` |
| (3) Canciones → reproducir la segunda | `.playback-bar .btn.primary` | **OK** *(posterior)* | RMS **−14,2 dB** con el topbar ya en "Binomio de Oro - Olvídala · Original: 100 BPM · 4:49" | `library-05-segunda-sonando.png` |
| Pestaña "Música" carga la biblioteca del reproductor | `.pm-card` | **OK** *(posterior)* | **33 tarjetas `.pm-card`** (todas con `.pm-card__info`) en 4 estanterías | `library-06-musica.png` |
| (3) Música → cambiar de canción desde una tarjeta | `.pm-card__info:has-text("La Creciente")` | **OK** *(posterior)* | barra "Olvídala" → **"El Osito Dormilón"** (309 s, RMS −18,6 dB) → **"La Creciente"** (193 s, RMS −24,6 dB). El título de la barra coincide con la tarjeta pulsada | `library-07-tarjeta1.png` · `library-08-tarjeta3.png` |
| (3) Música → cambiar a otra canción de la MISMA estantería | `.pm-card__info:has-text("La Creciente")` | **OK** *(pre)* | "El Osito Dormilón" (12,3 s/309,3 s) → "La Creciente" (15,6 s/193,3 s), cola 22, RMS −23,9 dB | `cardclick-03-creciente-pre.png` · `cardclick-03-creciente-post.png` |
| (3) Música → cambiar a una canción de OTRA estantería | `.pm-shelf (Boleros) .pm-card__info` | **OK** *(pre)* | "La Creciente" (Vallenato) → **"Bésame Mucho"** (Boleros, Los Panchos), con la cola reemplazada por la de la estantería nueva (22 → **82**), 9,7 s de 175,5 s, RMS −18,0 dB | `cardclick-04-otra-estanteria-pre.png` · `cardclick-04-otra-estanteria-post.png` |
| Biblioteca → importar un MIDI propio | `[aria-label="Subir tu propio MIDI"] input[type=file]` | **OK** *(posterior)* | 157 tarjetas antes; al cargar `Yann_Tiersen_-_Comptine_dun_autre_ete.mid` la app salta a la pestaña **Studio** con topbar `"Yann_Tiersen_-_Comptine_dun_autre_ete · Original: 100 BPM · 2:12"`; de vuelta en Canciones hay **158 tarjetas**, la primera es la importada, aparece la insignia **"Importado"** y las dos entradas de Comptine | `library-09-importado-efimero.png` · `library-09-importado.png` |
| **Cambio de canción A→B por el input del Studio: ¿queda audio de A?** | `input[aria-label="Cargar archivo MIDI"]` | **OK** *(posterior)* | durante A: barra "Bolero_-_Besame_Mucho"; tras cargar B: **RMS −inf**, y a los 8 s sigue en **−inf** con el seeker del Studio en 0,0 s. **No quedó audio de A** | `switch-b1-B-por-studio.png` |
| **Cambio A→B: B suena después del cambio** | `.playback-bar .btn.primary` | **OK** *(posterior)* | B desde cero: RMS **−22,2 dB** con 72 fuentes vivas; topbar "BinomioDeOro_-_El_Osito_Dormilon · Original: 69 BPM · 5:09"; seeker del Studio en 8,9 s | `switch-b3-B-sonando.png` |
| **La barra tras cargar por el input del Studio** | `input[aria-label="Cargar archivo MIDI"]` | **CORREGIDO y verificado** *(post-freeze)* | ver **BUG 2** | `postfreeze-B1-antes.png` · `postfreeze-B2-tras-cargar.png` · `postfreeze-B3-segundo-archivo.png` |
| **(4) Los controles de la barra siguen respondiendo tras un cambio** — seeker | `.pm-bar__range` | **OK** *(posterior)* | 10,2 s → **154,7 s** de 309 s | `switch-d1-seeker-tras-cambio.png` |
| … — siguiente | `.pm-bar button[aria-label="Canción siguiente"]` | **OK** *(posterior)* | "El Osito Dormilón" → "Sombra Perdida", cola 23 | `switch-d2-siguiente-tras-cambio.png` |
| … — cola | `.pm-bar button[title="Ver la cola (Q)"]` | **OK** *(posterior)* | `aria-expanded` false → true; panel con las 25 filas | `switch-d4-cola-tras-cambio.png` |
| … — chip Studio | `.pm-bar button[title="Practicar esta canción en el Studio"]` | **OK** *(posterior)* | `disabled=false` con "Sombra Perdida" en la barra | `switch-d4-cola-tras-cambio.png` |
| … — **anterior** | `.pm-bar button[aria-label="Canción anterior"]` | **CORREGIDO y verificado** *(post-freeze)* | ver **BUG 3** | `prev2-A-despues.png` · `prev2-B-despues.png` |
| Input del Studio con una cola ya activa | `input[aria-label="Cargar archivo MIDI"]` | **FALLA** *(post-freeze)* | ver **BUG 5** | `cola-01-tras-cargar-1.png` · `cola-03-tras-cargar-3.png` · `cola-05-despues-de-siguiente.png` |

---

## 2. BUGS ENCONTRADOS

### BUG 1 — El botón "Pausar" de la barra no pausaba · **severidad ALTA** · ENCONTRADO Y CORREGIDO (`12c96e1`)

**Pasos de reproducción**

1. Abrir `http://localhost:1234/`.
2. Ir a la pestaña **Música** y pulsar la tarjeta "El Osito Dormilón" (queda sonando, cola 24).
3. Esperar 12 s y pulsar el botón central de `.pm-bar`, el que dice **"Pausar"**.

**Resultado medido (versión pre-12c96e1)**

| Pulsación | Posición antes → después | RMS antes → después | Etiqueta del botón |
|---|---|---|---|
| click normal | 10,4 s → **14,2 s** | −19,3 → **−22,0 dB** | sigue **"Pausar"** |
| `dispatchEvent('click')` directo sobre el nodo | 15,1 s → **18,7 s** | −21,9 → −18,8 dB | sigue **"Pausar"** |
| tecla **Espacio** (el atajo que anuncia el `title`) | 19,8 s → **23,3 s** | −20,0 → −19,6 dB | sigue **"Pausar"** |

Y en un seguimiento continuo de 10 s sin tocar nada, **la posición pasó de 24,2 s a 33,6 s (Δ = 9,4 s)** con el RMS entre −57,0 y −19,5 dB: el transporte seguía corriendo.

**Descartes que hacen que esto sea un bug y no un problema de mi instrumento**

- **El click sí llegaba al handler**: con un contador propio en el nodo, el botón registró **1 click** — y el icono pintado siguió siendo el de pausa (`path d="M6 5h4v14H6zM14 5h4v14h-4z"`, idéntico antes y después).
- **El tap de audio sí detecta señal**: el botón "Silenciar", sobre el mismo audio y en la misma sesión, bajó el RMS **de −21,5 a −72,9 dB**.
- **La secuencia por el Studio tampoco lo arreglaba**: Detener → Reproducir (Studio) → botón central: −22,1 dB → **−18,9 dB**, con la posición de 7,4 s a 12,5 s.

**Causa (leída en el código, no supuesta)**: `toggle()` en `app/src/music/PlayerContext.tsx` decide con `store.getSnapshot().paused`. La reproducción arranca por `loadEntry(targetIndex, playNow=true)`, que hace `setIsPlaying(true)` pero **nunca pone `paused` en `false`**. Como el store nace con `paused: true` (`libraryStore.ts`), el primer click volvía a entrar en la rama `play()` en vez de `pause()` — y `play()` sólo reanudaba desde la posición actual.

**Estado**: **CORREGIDO Y VERIFICADO** sobre el árbol congelado (`qa-all-postfreeze.mjs`, tres indicadores independientes):

| | Antes del click | 2,5 s después | 7,5 s después |
|---|---|---|---|
| Etiqueta del botón central | "Pausar" | **"Reproducir"** | **"Reproducir"** |
| Icono (`path d`) | `M6 5h4v14H6zM14 5h4v14h-4z` (pausa) | `M8 5v14l11-7z` (**play**) | `M8 5v14l11-7z` (**play**) |
| `__PMP_TRANSPORT__.state` | **`started`** @ 11,70 s | **`paused`** @ 13,05 s | **`paused`** @ 13,05 s |
| Posición de la barra | 13,0 s | 13,0 s | **13,0 s (congelada)** |
| RMS | **−18,2 dB** | **−423,7 dB** | **−inf dB** |

El nodo registró **1 click** (el click llegó) y los tres indicadores coinciden: bajó ≥20 dB, la posición se congeló **y** el transporte de Tone dejó de estar en `started`. La corrección no se deduce: se mide.

**Capturas**: `postfreeze-A2-antes-de-pausar.png` · `postfreeze-A3-tras-pausar.png` · `postfreeze-A4-siete-segundos.png`. El estado anterior al arreglo está en `.logs/qa/pre-12c96e1/results-pause.json`.

---

### BUG 2 — La barra se quedaba en "Nada en reproducción" al cargar con el input del Studio · **severidad ALTA** · ENCONTRADO Y CORREGIDO (`12c96e1`)

**Pasos de reproducción**

1. Abrir la app en la pestaña **Studio** (estado inicial: barra en "Nada en reproducción", cola 0).
2. En el bloque "Cargar MIDI", elegir un archivo de `app/public/demo/` — probado con `Bolero_-_Besame_Mucho.kar` y con `Beethoven_-_Moonlight_Sonata_1st.mid`.
3. Mirar la barra inferior y el chip "Studio" de la barra.

**Resultado medido (versión pre-12c96e1)**

| Qué | Valor medido |
|---|---|
| Topbar del Studio | **`"Bolero_-_Besame_Mucho · Original: 100 BPM · 2:55"`** (el archivo SÍ se parseó) |
| Seeker del Studio | `max = 175,485 s` (la canción SÍ está cargada) |
| Título de la barra | **`"Nada en reproducción"`** |
| Artista de la barra | **`"Elegí una canción para empezar"`** |
| Cola de la barra | **0** |
| Seeker de la barra | `0 / 0.1`, **deshabilitado** |
| Chip "Practicar esta canción en el Studio" | **deshabilitado** |
| ¿Se sincroniza sola? | **No**: 10 muestras a lo largo de 15 s reproduciendo desde el Studio, la barra nunca dejó de decir "Nada en reproducción" |

Con un `.mid` en vez de un `.kar` pasaba igual, así que **no era el formato del archivo**.

**Cuándo pasa exactamente y cuándo no**

- **Pasa** cuando la carga entra por el `input[type=file]` del Studio (`handleFileUpload → parseMidiFile`): actualiza `song` de `App.tsx` y `libraryStore.registerTracks(...)`, pero **no encola nada en el reproductor**, y la barra se pinta del estado del reproductor (`player.current` ← `library.tracks[currentTrackId]` ← `queue[index]`).
- **No pasa** al elegir una canción desde la pestaña **Canciones**: ahí la barra sí se puebla (y con la biblioteca entera: cola 156).
- **No pasa** al pulsar una tarjeta de la pestaña **Música**: `player.playCollection(...)` encola y la barra se actualiza.

**Estado**: **CORREGIDO Y VERIFICADO** sobre el árbol congelado (`qa-all-postfreeze.mjs`, leyendo índice y cola con `window.__PMP_PLAYER__`):

| | antes | tras cargar `Bolero_-_Besame_Mucho.kar` | tras cargar `BinomioDeOro_-_El_Osito_Dormilon.kar` |
|---|---|---|---|
| Título de la barra | "El Osito Dormilón" | **"Bolero_-_Besame_Mucho"** | **"BinomioDeOro_-_El_Osito_Dormilon"** |
| Artista de la barra | "Binomio de Oro" | "Mis importaciones" | "Mis importaciones" |
| Cola | 25 | **158** | **159** |
| Chip "Practicar esta canción en el Studio" | habilitado | **habilitado** | **habilitado** |
| Seeker de la barra | habilitado | **habilitado** | **habilitado** |
| RMS tras el cambio | — | — | **−inf** (no queda audio del anterior), 31 fuentes vivas |

La barra sigue el archivo cargado en las dos cargas consecutivas, sin detener la reproducción entre medio.

**Lo que este arreglo deja abierto**: el índice se queda en 0 y la cola acumula. Eso es el **BUG 5**, que sigue vigente y se mide aparte.

**Capturas**: el fallo original en `switch-a1-A-por-studio.png` · `switch-a2-A-sonando-studio.png`; el arreglo en `postfreeze-B2-tras-cargar.png` · `postfreeze-B3-segundo-archivo.png`.

---

### BUG 3 — "Canción anterior" quedaba sin efecto cuando la actual es la primera de la cola · **severidad MEDIA** · CORREGIDO Y VERIFICADO (`b7b63a7`)

**La causa NO era la carrera que se sospechaba al principio.** Era que `previous()` sólo miraba la cola: al elegir la primera fila de la biblioteca la canción queda en `index = 0`, no hay ranura anterior, y el código reiniciaba la misma canción con `seek(0)`. Con 0,7–1,6 s de reproducción ese salto es imperceptible, así que el botón **parecía muerto**. Con índice > 0 sí retrocedía: de ahí lo intermitente.

**Pasos de reproducción del fallo (versión vieja)**

1. Pestaña **Música**, pulsar la **primera** tarjeta de una estantería → la canción queda en el índice **0** de la cola.
2. Esperar 1–2 s y pulsar **"Canción anterior"**.
3. Resultado viejo: la misma canción volvía a 0 s. A la vista, nada.

**Cómo lo verifiqué sobre el árbol congelado** (`qa-all-prev2.mjs`, leyendo índice y cola con `window.__PMP_PLAYER__`):

| Montaje | Estado antes de pulsar | Qué hizo "anterior" |
|---|---|---|
| **A · historial con otra canción** | actual **"El Osito Dormilón"** en el índice **0**; historial: *El Osito Dormilón (actual), Sombra Perdida*; posición forzada a **1,4 s** | **"El Osito Dormilón" → "Sombra Perdida"** ✅ volvió a la última que sonó |
| **B · historial con otra canción** (perfil persistido) | actual **"Sombra Perdida"** en el índice **0**; historial: *Sombra Perdida (actual), El Osito Dormilón*; posición **1,4 s** (y otro intento a **0,5 s**) | **"Sombra Perdida" → "El Osito Dormilón"** ✅ |
| **C · control con índice > 0** | índice 1, posición 9,3 s | retrocedió a la ranura 0 ✅ |

La rama nueva está en `PlayerContext.tsx:445-464`: si `i > 0` retrocede de ranura; si es la primera, busca en `library.history` la última canción distinta de la actual y la inserta delante con `insertBeforeCurrent` (`libraryStore.ts:642`).

**Qué queda sin cubrir (documentado, no arreglado)**: si el historial no tiene ninguna otra canción que ofrecer, sigue reiniciando la misma. En la práctica el historial se hidrata de `localStorage`, así que eso exige un perfil sin reproducciones previas — situación de primer arranque. **No hay pasos para reproducirlo en una sesión ya usada**, y en todas mis corridas el historial siempre tuvo al menos otra entrada, así que lo dejo como limitación conocida y no como bug abierto.

**Capturas**: `prev2-A-antes.png` · `prev2-A-despues.png` · `prev2-B-despues.png`. El fallo original está en `.logs/qa/pre-12c96e1/`.

---

### BUG 4 — Arranque en frío: varios segundos de silencio antes de la primera nota, con la píldora parpadeando · **severidad MEDIA** · VIGENTE (mitigado en parte por `0d1ea5d`)

**Cómo se mide esto de forma honesta.** El número crudo mezcla dos cosas distintas y hay que separarlas, porque sumadas dicen mentira:

| columna | qué es |
|---|---|
| **crudo** | ms desde el click en "Reproducir" hasta la primera señal > −70 dB |
| **silencio propio de la canción** | la primera nota del archivo, **leída del parser** (`@tonejs/midi`, el mismo que usa la app), no supuesta |
| **piso teórico** | arranque del transporte + silencio propio |

**Medida limpia** — `QA_Arranque_0s.mid`, un fixture que generé para esto con la primera nota en **t = 0,000 s** (8 notas de piano, sin percusión, validado con el parser de la app en `qa-all-fixture-check.mjs`):

| | valor |
|---|---|
| arranque del transporte (`__PMP_TRANSPORT__.state === "started"`) | **679 ms** |
| **primera señal audible (crudo)** | **1545 ms** |
| silencio propio de la canción | **0 ms** |
| **piso teórico** | **679 ms** |
| margen desde que el transporte corre hasta que se oye la primera nota | **866 ms** |

Con el fixture el crudo y el piso describen el mismo caso, así que **1545 ms es la medida limpia del motor** (contra los 13 717 ms del reporte original del otro agente).

**Caso real** — `Bolero_-_Besame_Mucho.kar` desde el segundo 0:

| | valor |
|---|---|
| arranque del transporte | 3129 ms |
| **primera señal audible (crudo)** | **7350 ms** |
| silencio propio (primera nota global) | **2400 ms** |
| piso teórico | 3129 + 2400 = **5529 ms** |
| margen desde el transporte | **4221 ms** |

El crudo (7350 ms) queda **por encima** del piso (5529 ms): hay 1821 ms que el silencio de la canción no explica. El parser además matiza el «4,35 s de silencio inicial» que se me había advertido: en este `.kar` la **primera nota global** está en **2,40 s** (percusión: 2201 golpes desde ahí) y las **melódicas** entran recién en **4,79 s**. Entre 2,40 s y 4,79 s el tema hace ruido de percusión pero ningún instrumento melódico.

**Por qué sigue siendo un bug aunque haya mejorado: la píldora explica el arranque, pero parpadea.**

Medido con un `MutationObserver` sobre el contenedor de píldoras —y no con muestreo periódico, que pierde textos cortos—, la secuencia real es:

| ms | texto |
|---|---|
| +81 | `Preparando el motor de audio…` |
| +248 | `Cargando piano real...` |
| +308 | `Cargando percusión (12 piezas)...` |
| +479 | `Cargando instrumentos 0/4…` |
| +975 | `Cargando instrumentos 1/4…` |
| +1224 | `Cargando instrumentos 3/4…` |
| +3083 | *(vacío)* |
| +3914 | `✓ Percusión lista: 9/12 piezas reales` |
| +6030 | `✓ 4 instrumento(s) real(es) listos` |
| +7455 | *(vacío)* |

Lo bueno: el contador **avanza de verdad** (0/4 → 1/4 → 3/4) y los dos textos que se querían ver **sí se pintan**.

Lo malo: **`Preparando el motor de audio…` sólo está en pantalla ~120 ms** y después el mensaje queda **vacío entre 3083 ms y 3914 ms**, justo durante la espera larga. Mi primera medición con un poller de 50 ms no alcanzó a verlo; hizo falta el `MutationObserver`. Eso es exactamente lo que le pasa al usuario.

**Estado**: **vigente**. El arranque del motor mejoró mucho (1545 ms con el fixture), pero en el caso real sigue habiendo un tramo de varios segundos sin indicación estable.

**Capturas**: `startup-fixture-antes.png` · `startup-fixture-primer-sonido.png` · `startup-cancion-primer-sonido.png` · `pill-cancion-final.png`.

---

### BUG 5 — Cargar por el input del Studio acumula la cola, y "siguiente" reproduce una canción vieja · **severidad MEDIA** · VIGENTE

**Esto NO es cosmético: se midió la consecuencia.** (`qa-all-cola.mjs`, leyendo la cola real con `window.__PMP_PLAYER__`.)

**Pasos de reproducción**

1. Empezar con la barra vacía ("Nada en reproducción", cola 0, índice −1).
2. En la pestaña **Studio**, cargar **tres** archivos seguidos por "Cargar MIDI":

| # | archivo cargado | barra | índice | cola | ¿pausado? |
|---|---|---|---|---|---|
| 1 | `Bolero_-_Besame_Mucho.kar` | "Bolero_-_Besame_Mucho" | 0 | **158** | true |
| 2 | `Beethoven_-_Moonlight_Sonata_1st.mid` | "Beethoven_-_Moonlight_Sonata_1st" | 0 | **159** | true |
| 3 | `Scott_Joplin_-_The_Entertainer.mid` | "Scott_Joplin_-_The_Entertainer" | 0 | **160** | true |

3. Ir a la pestaña **Música** y pulsar **"Canción siguiente"**.

**Resultado medido: veredicto (a) — reproduce una canción vieja de la cola**

| | antes | después de "siguiente" |
|---|---|---|
| Barra | `Scott_Joplin_-_The_Entertainer` | **`El Osito Dormilón`** |
| Índice | 0 | **1** |
| Topbar del Studio | — | `Binomio de Oro - El Osito Dormilón · Original: 69 BPM · 5:09` |
| Botón central | "Reproducir" | **"Pausa"** |
| RMS | — | **−22,1 dB** (está sonando) |

Un segundo "siguiente" siguió avanzando: índice 1 → **2**, barra → **"Sombra Perdida"**, RMS **−21,2 dB**.

O sea: después de previsualizar tres archivos en el Studio, **"Canción siguiente" arranca a recorrer la biblioteca de demostración** desde la ranura 1, y sigue. La cola acumulada tiene **160 entradas** y el usuario nunca pidió esa lista.

**Qué está pasando**: cada carga por el input del Studio inserta el archivo en la ranura 0 del reproductor y deja el índice en 0, empujando el resto hacia atrás. La barra queda coherente con lo cargado (ese era el arreglo de BUG 2), pero la cola se ensucia y **el botón "siguiente" pasa a operar sobre una lista que el usuario no eligió**.

**Estado**: **vigente**. No lo arreglé (no me corresponde). Es un efecto lateral del arreglo de BUG 2, y el otro agente estaba desacoplando justamente el playback del Studio, así que puede haber desaparecido — **conviene comprobarlo con estos mismos pasos antes de darlo por cerrado**.

**Capturas**: `cola-01-tras-cargar-1.png` · `cola-03-tras-cargar-3.png` · `cola-04-antes-de-siguiente.png` · `cola-05-despues-de-siguiente.png` · `cola-06-segundo-siguiente.png`.

---

### Hallazgo menor — el slider de volumen ignora la asignación programática de `.value` · **severidad BAJA**

`document.querySelector(".pm-bar__volume-range").value = "0.25"` seguido de `dispatchEvent(new Event("input"))` y `dispatchEvent(new Event("change"))` **no cambia el valor del store** (1 → 1). Con el **teclado** (`Home`, `End`, flechas) sí cambia (0 → 1, con **39,9 dB** de diferencia real en la salida medida) y con el ratón funciona.

Afecta a herramientas y tests que muevan el slider por JavaScript, **no al usuario final**.

**Capturas**: `barrows2-04-volumen-programatico.png`.

---

## 3. NO PUDE VERIFICAR

### 3.1 `Studio: "Reproducir"` con una ventana de escucha corta — resuelto a medias

Mi primera medición marcó `RMS −inf` con el botón ya en "Pausa". No era un fallo de audio: **la ventana de muestreo (18 muestras × 600 ms ≈ 11 s) caía casi entera dentro del arranque en frío**, que entonces era de ~8 s.

Sobre el árbol congelado la reproducción del Studio **sí se verificó** por otras vías: `.kar` a **−22,0 dB** y **−18,2 dB**, `.mid` a **−27,4 dB**, con `AudioContext.state = "running"` y su reloj avanzando **14,85 s**. Lo que **no** tengo es una fila limpia y dedicada de ese botón con el nuevo arranque de ~1,5 s: la lógica de `startPlayback` es la misma que la del reproductor de la barra, que sí está medida (BUG 1), pero no lo medí botón por botón.

### 3.2 `Navegación: "Partitura"` con una partitura realmente cargada

Verifiqué que la entrada del rail navega (rail activo "Partitura", encabezado "Importar Partitura"). **No verifiqué** la vista con un documento cargado: hace falta importar un MusicXML (`.xml`/`.mxl`) y no hay ninguno en `app/public/demo/` (sólo `.mid` y `.kar`).

### 3.3 `input[aria-label="Cargar archivo MIDI"]` con un `.mid` que traiga letra

El `accept` del input es **`.mid,.midi`** y `handleFileUpload` no filtra por extensión, así que un `.kar` se acepta igual de bien. Probé la carga con `.kar` y `.mid`, y la letra con el `.kar` de Bésame Mucho (26 líneas), pero **no con un `.mid` con letra embebida**.

### 3.4 Liberación de voces al Detener — indicio sin confirmar

Al pulsar **Detener** el reloj vuelve a 0:00 y el RMS queda en −inf (silencio digital correcto), **pero quedaron 11 fuentes de audio vivas** según el contador de `AudioBufferSourceNode` (`start 15 / stop 3`). Puede ser un contador que no ve los `stop()` diferidos de `stopVoicesDeferred`, o una fuga real. **No lo cuento como bug** porque no medí memoria ni consumo: queda como indicio a instrumentar.

### 3.5 Efecto audible de "Una corda" y "Sostenuto"

Comprobé que ambos pedales cambian de estado visual al pisarlos (`ic-pedal--active` y `ic-pedal--sostenuto`), pero **no medí su efecto sobre el audio**. "Una corda" debe suavizar el timbre: eso pide comparar espectros, no niveles RMS.

### 3.6 Ruido de consola: 404 de recursos externos

Consistente en todas las sesiones: `samples/trumpet/A4.ogg` y `samples/trombone/A3.ogg` (`net::ERR_ABORTED`) y **404** de `https://surikov.github.io/webaudiofontdata/sound/12884_0_FluidR3_GM_sf2_file.js` y del mismo archivo en `cdn.jsdelivr.net`. Son dependencias remotas de muestras; no rompen ninguna canción que probé, pero **alargan el arranque** (BUG 4).

### 3.7 `PAGEERROR ReferenceError: midiToFrequency is not defined` — no reproducido sobre el árbol congelado

En una corrida intermedia (20:53, con `App.tsx` editándose en vivo) la consola acumuló 83 errores, uno de ellos `PAGEERROR ReferenceError: midiToFrequency is not defined`. **No lo reporto como bug**: el símbolo está importado y definido (`App.tsx:124` ← `constants/audio.ts:135`), y un `ReferenceError` sobre un import existente es la firma de un módulo servido a medias por Vite durante una reedición.

Sobre el árbol congelado **no volvió a aparecer** en ninguna de mis corridas post-freeze (0 errores de consola en las de arranque). Queda como observación cerrada por no reproducible, y el chequeo barato que lo zanjaría del todo es `npx tsc -b`.

---

## 4. Aprendizaje metodológico

### 4.1 `mouse.click` usa viewport, `boundingBox()` usa página

**`page.mouse.click(x, y)` usa coordenadas de VIEWPORT; `locator.boundingBox()` devuelve coordenadas de PÁGINA.** Mezclarlas sin hacer scroll antes hace que el click caiga en el vacío y el informe diga "el control no responde" cuando el que no respondió fue el arnés.

Me pasó: al pulsar la 2ª tarjeta de la pestaña Música, la barra no cambiaba de canción y parecía un bug del reproductor. El `elementFromPoint` del punto que estaba pulsando devolvía `undefined` — **no había nada ahí**. La tarjeta estaba 700 px más abajo del viewport.

| Señal de alarma | Qué la delató |
|---|---|
| Un click "no hace nada" | El mismo click con `locator.click()` (que hace auto-scroll) sí funcionaba |
| Títulos que no cuadran | Leer el título del nodo que se va a pulsar y compararlo con el que devuelve `elementFromPoint` |
| Índices que se mueven | Las listas se re-renderizan durante la reproducción: **elegir por texto, no por índice** (`locator.filter({ hasText })`) |

**Regla**: para pulsar cualquier nodo que pueda estar fuera del viewport, `locator.click()` siempre; y si hay que calcular coordenadas a mano, `scrollIntoViewIfNeeded()` primero y verificar con `elementFromPoint` que el punto cae dentro del nodo.

### 4.2 Otras tres trampas que costaron una corrida cada una

| Trampa | Cómo se manifiesta | Cómo evitarla |
|---|---|---|
| **El silencio inicial de la canción** | El RMS da −inf durante segundos y parece que "no suena" | Medir la primera nota **con el parser** y descontarla, o usar un fixture que empiece en 0 s |
| **El arranque en frío** | Muestrear 10 s y concluir "no suena" cuando el motor tarda 1,5–7 s | Esperar a que el transporte esté en `started` y recién ahí muestrear; o esperar la primera señal con un bucle, no con un `waitForTimeout` fijo |
| **La posición y el umbral de reinicio** | "Canción anterior" parece roto cuando en realidad reinició porque la posición pasaba de 3 s | Leer `RESTART_THRESHOLD` (3 s) y **forzar la posición con el seeker antes de cada pulsación**; nunca dejar correr la canción entre pasos |
| **Un `setInterval` para observar un texto de UI** | Textos que duran ~120 ms se pierden y se reporta "el texto no cambia" | Usar `MutationObserver` sobre el nodo: registra cada mutación real, sin pérdidas |

---

## 5. Resumen numérico final (árbol congelado `b7b63a7`)

### 5.1 Conteo consolidado

`node scripts/qa-all-collect.mjs` consolida los `results-*.json` en tres conjuntos. El informe usa el **autoritativo**:

| Conjunto | Filas | Qué es |
|---|---|---|
| Mediciones totales | 101 | todas las filas de control medidas en la sesión |
| **Tabla autoritativa** | **82** | **la canónica menos las 19 filas superadas** ← la que se cita |
| Diagnóstico / no-control | 11 | filas de sanidad del instrumento, recursos HTTP fallidos, etc. |

**Tabla autoritativa (82 controles): 78 OK · 4 FALLA · 0 NO VERIFICABLE.**

Las **4 "FALLA"** son, con nombre y apellido:

| Fila | Etiqueta | Qué es |
|---|---|---|
| `(2) Input del Studio con una cola ya activa en la barra` | post-freeze | **BUG 5**, verificado |
| `BUG 5 (a) · Cargar 3 archivos por el input del Studio acumula la cola` | post-freeze | **BUG 5**, medido |
| `BUG 5 (b) · ¿Qué hace "Canción siguiente" después de cargar 3 archivos?` | post-freeze | **BUG 5**, la consecuencia |
| `Barra: input[aria-label="Volumen"] — asignación programática de .value` | pre-12c96e1 | limitación menor, vigente: **no afecta al usuario** |

**Las 19 filas superadas** (excluidas de la autoritativa, con su motivo — el script las imprime):

- **13 artefactos de medición**, ya re-medidos en otra fila: 2 del cambio de canción que caían dentro del arranque en frío, 1 de la tarjeta con índice desplazado, 3 de "anterior" pulsado por encima del umbral de reinicio, 1 de la píldora observada con `setInterval` en vez de `MutationObserver`, 3 del botón Reproducir del Studio con ventana de muestreo corta, 1 de la vista de reproducción (selector de evidencia equivocado), 1 del marcador de la pantalla Partitura y 1 del Sustain con nota suelta.
- **6 mediciones pre-`12c96e1`** que describen código que el árbol congelado ya no tiene (dos de "anterior", tres del slider de volumen y la de la pausa).

Ninguna exclusión es una preferencia: cada una tiene su re-medición en el conjunto autoritativo, o su bug propio en §2.

### 5.2 Los 4 arreglos, con mi verificación independiente

| # | Arreglo | Cómo lo verifiqué | Veredicto |
|---|---|---|---|
| 1 | `12c96e1` — play/pausa de la barra | RMS **−18,2 → −inf dB**, `__PMP_TRANSPORT__.state` **`started` → `paused`**, posición **congelada en 13,0 s**, icono de pausa → play, y el nodo contó **1 click** | **CONFIRMADO** |
| 2 | `12c96e1` — la barra sigue la canción cargada | cargar `Bolero_-_Besame_Mucho.kar`: barra → **"Bolero_-_Besame_Mucho"**, cola 25 → 158, chip Studio **habilitado**; segundo archivo → **"BinomioDeOro_-_El_Osito_Dormilon"**, RMS **−inf** (sin resto del anterior) | **CONFIRMADO** |
| 3 | `b7b63a7` — "canción anterior" en el índice 0 | con la actual en el índice **0** y el historial con otra canción, "anterior" **cambió de canción** (→ "Sombra Perdida"), a **1,4 s** y a **0,5 s** de posición. Control con índice > 0 sigue retrocediendo | **CONFIRMADO** |
| 4 | `0d1ea5d` — arranque en frío + píldora | con fixture de primera nota en **t=0**: transporte **679 ms**, primera señal **1545 ms** (medida limpia del motor). Píldora: **avanza de verdad** (0/4 → 1/4 → 3/4) y los textos se pintan (MutationObserver) | **CONFIRMADO en lo medido**, con la salvedad de §5.3 |

Sobre `69d6ac3` (desacoplar el playback del render) **no mido fps ni atrasos de nota**: mi instrumentación es de nivel de audio, no de rendimiento de frames. No lo valido ni lo desmiento.

### 5.3 Bugs vigentes al cierre

| # | Bug | Severidad | Paso de reproducción | Medición |
|---|---|---|---|---|
| **4** | Arranque en frío con la píldora parpadeando | **MEDIA** | Cargar una canción por el Studio y pulsar "Reproducir" | caso real: crudo **7350 ms**, silencio propio **2400 ms**, piso teórico **5529 ms**. "Preparando el motor de audio…" visible sólo **~120 ms**; mensaje **vacío de 3083 a 3914 ms** |
| **5** | La cola se acumula y "siguiente" reproduce una canción vieja | **MEDIA** | Cargar 3 archivos por el Studio → pestaña Música → **"Canción siguiente"** | índice 0 → **1**, barra `Scott_Joplin_-_The_Entertainer` → **`El Osito Dormilón`**, RMS **−22,1 dB**: suena una canción que el usuario no pidió |
| — | Slider de volumen ignora la asignación programática de `.value` | BAJA | `el.value = "0.25"` + eventos `input`/`change` | el store **no cambia** (1 → 1); con teclado sí (0 → 1, **39,9 dB** reales) |

**Limitación conocida, no bug abierto**: "canción anterior" sigue reiniciando la misma canción si el historial no tiene ninguna otra que ofrecer. Exige un perfil sin reproducciones previas y no encontré pasos para reproducirlo en una sesión ya usada (ver BUG 3).

---

## 6. Cómo volver a correr este QA

Los scripts están en `scripts/qa-all-*.mjs`. **Todos aceptan el dev server tal como está: no levantan nada.**

### Precondiciones

| | |
|---|---|
| **Puerto** | **1234** (el de `app/vite.config.ts`, `strictPort: true`) |
| **Ojo con IPv6** | el server escucha en **`::1`**. `http://127.0.0.1:1234` da *connection refused*; hay que usar **`http://localhost:1234`** |
| **Si el server no está** | levantarlo como job en segundo plano desde `app/` (`npx vite`), **nunca** en primer plano |
| **Todo comando largo** | por `pwsh -File scripts/run-bounded.ps1 -Command "node scripts/qa-all-X.mjs" -TimeoutSec N` |
| **Antes de medir** | confirmar que `app/src` está quieto (`git status --short -- app/src` vacío) — si alguien está editando, los números no valen |

### Orden recomendado

| Paso | Comando | Para qué | Tope |
|---|---|---|---|
| 1 | `node scripts/qa-all-fixture.mjs` && `node scripts/qa-all-fixture-check.mjs` | genera y **valida** el `.mid` con la primera nota en t=0 | 20 s |
| 2 | `node scripts/qa-all-recon.mjs` | inventario vivo de controles y pantallas; detecta si el DOM cambió de forma | 180 s |
| 3 | `node scripts/qa-all-postfreeze.mjs` | **el más importante**: pausa, barra ↔ input del Studio, "anterior" | 420 s |
| 4 | `node scripts/qa-all-startup.mjs` | arranque en frío con las tres columnas | 300 s |
| 5 | `node scripts/qa-all-pill.mjs` | qué textos pinta la píldora (MutationObserver) | 300 s |
| 6 | `node scripts/qa-all-cola.mjs` | consecuencia de la cola acumulada | 300 s |
| 7 | `node scripts/qa-all-bar.mjs` · `qa-all-studio.mjs` · `qa-all-library.mjs` · `qa-all-switch.mjs` · `qa-all-cardclick.mjs` · `qa-all-sustain.mjs` | suites por área | 300–600 s |
| 8 | `node scripts/qa-all-collect.mjs` | consolida todo en la tabla canónica con etiqueta temporal | 10 s |

**Los pasos 3 a 6 son los que dan la señal en minutos.** Si sólo hay tiempo para uno, `qa-all-postfreeze.mjs`.

### Confusores a evitar (cada uno ya costó una conclusión falsa)

1. **El silencio inicial de la canción.** Antes de decir "no suena", medir la primera nota **con el parser** (`@tonejs/midi`) y restarla. O usar `QA_Arranque_0s.mid`. En Bésame Mucho la primera nota global está en **2,40 s** y las melódicas en **4,79 s**.
2. **El arranque en frío.** No muestrear con un `waitForTimeout` fijo: esperar a `__PMP_TRANSPORT__.state === "started"` y después a que la señal cruce −70 dB, en un bucle.
3. **`mouse.click` por coordenadas.** Usar `locator.click()` (auto-scroll) o, si hay que calcular el punto, `scrollIntoViewIfNeeded()` + comprobar con `elementFromPoint`.
4. **Elegir por índice.** Las listas se re-renderizan y re-ordenan: elegir **por texto**.
5. **`RESTART_THRESHOLD` (3 s).** "Canción anterior" reinicia el tema si la posición pasa de 3 s. Para probar el retroceso de ranura hay que **forzar la posición con el seeker antes de cada pulsación**.
6. **Observar texto de UI con `setInterval`.** Un texto que dura ~120 ms se pierde. Usar `MutationObserver`.

### Handles de QA que expone la app (sólo en DEV)

| Handle | Para qué |
|---|---|
| `window.__PMP_PLAYER__` | `getSnapshot()` / `getCurrentTrackId()` / `getTrack(id)`: **la cola y el índice reales**, en vez de deducirlos del DOM |
| `window.__PMP_TRANSPORT__` | el `Tone.Transport`: `state` y `seconds` — "está sonando" deja de ser una suposición |
| `window.__RMS` / `window.__TAPS` | los inyecta `scripts/qa-all-lib.mjs`: nivel de salida en dBFS y cuántas conexiones al destino se engancharon |

---

## 7. Scripts y artefactos

| Script | Qué mide |
|---|---|
| `qa-all-lib.mjs` | Utilidades compartidas: tap de audio (RMS), instrumentación de fuentes, estado de `.pm-bar`, capturas, acumulador de resultados, registro de recursos fallidos |
| `qa-all-fixture.mjs` | Genera `QA_Arranque_0s.mid` sin dependencias (escribe el SMF a mano) |
| `qa-all-fixture-check.mjs` | Valida ese fixture con el MISMO parser que usa la app |
| `qa-all-recon.mjs` | Inventario en vivo de los 46 controles y de las 9 pantallas |
| `qa-all-postfreeze.mjs` | **Verificación sobre el árbol congelado**: pausa, barra ↔ input del Studio, "anterior" en el índice 0 |
| `qa-all-startup.mjs` | Arranque en frío con las tres columnas (crudo / silencio propio / piso teórico) |
| `qa-all-pill.mjs` | Textos de la píldora capturados con `MutationObserver` |
| `qa-all-cola.mjs` | Consecuencia de la cola acumulada: qué hace "siguiente" |
| `qa-all-prev2.mjs` | "Canción anterior" en el índice 0, con y sin historial |
| `qa-all-pausefix.mjs` | Pausa real con contador de clicks propio y contraste contra "Silenciar" |
| `qa-all-bar.mjs` | Barra completa (14 filas) |
| `qa-all-barrows2.mjs` | Casos ambiguos de la barra: anterior con la posición baja, slider por teclado y por script, vista de reproducción |
| `qa-all-studio.mjs` | Studio, pedales, Key FX, teclado y navegación (29 filas) |
| `qa-all-sustain.mjs` | Curva de decaimiento con y sin pedal (26 puntos por curva) |
| `qa-all-library.mjs` | Los tres flujos de biblioteca + importación (9 filas) |
| `qa-all-switch.mjs` | Los 4 casos especiales: cambio A→B con tap de audio, sincronización de la barra, controles tras el cambio |
| `qa-all-cardclick.mjs` | Cambio de canción por tarjeta, dirigido por título |
| `qa-all-karsilence.mjs` | Por qué un `.kar` parecía mudo: estado del `AudioContext`, versión fría vs. caliente |
| `qa-all-warmup.mjs` | Primera medición del tiempo hasta la primera señal (resolución de 200 ms) |
| `qa-all-collect.mjs` | Consolida `results-*.json` en la tabla canónica con etiqueta temporal |

Artefactos:

- **Resultados crudos**: `.logs/qa/results-*.json` (una fila por control, con la evidencia completa).
- **Tabla canónica**: `.logs/qa/canonical.json` y `.logs/qa/all-rows.json`.
- **Trazas de arranque**: `.logs/qa/startup-trazas.json`.
- **Curvas de audio**: `.logs/qa/sustain-curvas.json`.
- **Evidencia histórica pre-`12c96e1`**: `.logs/qa/pre-12c96e1/`.
- **Capturas**: `.logs/qa/*.png`, incluidas las parejas antes/después de cada control.
- **Salida completa de cada corrida**: `.logs/*qa-all-*.log`.

**Nota sobre el dev server**: el server original del dueño (pid 8240) murió a las ~21:20, en medio de las re-mediciones. Lo levanté de nuevo como job gestionado en el mismo puerto (`npx vite` desde `app/`, pid 14456, HTTP 200, `::1:1234`). Es una instancia nueva, no un puerto distinto ni un `preview`. Si en el futuro el puerto no responde, el chequeo barato es `Get-NetTCPConnection -LocalPort 1234 -State Listen`.
