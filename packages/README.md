# `packages/` — el hogar neutro del código compartido

Este directorio es la respuesta a un problema concreto y medido: **el código
compartido vivía dentro del piano**. El motor de audio, los componentes del
reproductor, el estado de la biblioteca y las utilidades estaban en `app/src/`,
y el reproductor los importaba por alias (`@app/*` → `../app/src/*`,
`@engine/*` → `../app/src/engine/*`).

Consecuencia, en palabras del dueño:

> "cada función nueva nace del lado equivocado y hay que hacer malabares"

Cada arreglo del reproductor obligaba a tocar el piano; cada componente nuevo
había que decidir "de quién es"; y la paridad visual se medía contra el piano
como si el piano fuera la referencia, cuando **el producto principal es el
reproductor**.

`packages/` no es "del piano" ni "del reproductor": es el hogar de lo que
**ambos consumen**. A partir de ahora todo lo nuevo se desarrolla y se verifica
**en el reproductor** (1235), y el piano (1234) pasa a ser un consumidor más.

---

## 1. Regla de oro: la dirección de la dependencia

```
        packages/**            ← código compartido (no depende de ninguna app)
         ↑            ↑
         │            │
   app/ (piano)   player/ (reproductor)
```

- **`packages/**` puede importar `packages/**`.** Nada más.
- **Las apps pueden importar `packages/**`.** Es lo esperado.
- **`packages/**` NO importa de `app/` ni de `player/`.** Hay exactamente
  **7 excepciones medidas y documentadas** (§6). Son deuda conocida, no
  licencia para agregar más.

Si un archivo de `packages/` necesita algo del piano, la respuesta por defecto
es **mover eso también a `packages/`**, no importarlo de la app.

---

## 2. Qué vive acá

| Carpeta | Viene de | Qué es | Fase |
|---|---|---|---|
| `packages/engine/` | `app/src/engine/**` (19 archivos) | Motor de audio: samplers, cadenas, paneo, groove, procesado de samples y los tres manifiestos | 2 |
| `packages/utils/` | `app/src/utils/**` (17) | Utilidades puras: mapeo de instrumentos, parseo de MIDI, letras, ajustes, perfil | 2 |
| `packages/audio/` | `app/src/audio/**` (1) | `audioTiming.ts`: la conversión ticks↔segundos **escuchados** | 2 |
| `packages/types/` | `app/src/types/**` (3) | Tipos de canción, partitura y gamificación | 2 |
| `packages/constants/` | `app/src/constants/**` (8) | Catálogo de demos, familias de instrumentos, colores, constantes de audio y juego | 2 |
| `packages/music/` | `app/src/music/**` (14) | Estado del reproductor: `PlayerContext`, `libraryStore`, resolución de pistas, carátulas, vistas, avisos, MediaSession | 2 |
| `packages/components/player/` | `app/src/components/player/**` (12) | La barra, la cola, la vista de reproducción, los menús y los diálogos + `player.css` | 3 |
| `packages/components/library/` | `app/src/components/library/**` (6) | La pantalla Música + `music.css` | 3 |
| `packages/components/songs/` | `app/src/components/songs/**` (6) | La pestaña Canciones + `SongLibrary.css` | 3 |
| `packages/components/common/` | `app/src/components/common/**` (9) | `Button`, `Modal`, `Icons`, `Slider`, `Tabs`, `Toast`… | 3 |
| `packages/components/score/` | `app/src/components/score/PartMixer.tsx` (1) | Sólo el mezclador por pista: es lo único de `score/` que el reproductor usa | 3 |

**Total: 96 archivos.**

### Qué se queda en cada app, y por qué
| Se queda | Dónde | Por qué |
|---|---|---|
| `App.tsx` (6.500 líneas, con el Studio) | `app/src/` | **Regla dura del encargo**: es el consumidor principal del código compartido. Si un movimiento obligara a partirlo, hay que parar y avisar. |
| `components/studio/**` (teclado, controles, `LyricsPanel`) | `app/src/` | Exclusivo del piano. (Ojo: `PlayerSection` lo importa — ver §6.) |
| `components/score/**` salvo `PartMixer` | `app/src/` | `ScoreViewer`, `ScoreInfoBar`, `ImportPanel`, `scoreCache`: partituras, exclusivo del piano. (Ojo: `SongLibrary` importa `ImportPanel` — ver §6.) |
| `components/game/**`, `components/gamification/**` | `app/src/` | Modo Juego y avatares. |
| `game/**`, `hooks/**`, `services/**`, `contexts/**`, `state/**`, `parsers/**`, `analysis/**`, `workers/**` | `app/src/` | Exclusivos del piano (o, en el caso de `workers/`, una decisión pendiente — ver §7). |
| `App.css`, `index.css` | `app/src/` | **Decisión consciente (fase 4 del encargo).** `App.css` son 3.828 líneas del armazón del piano; partirlo es el movimiento más riesgoso de toda la migración y el reproductor ya lo importa tal cual. Se deja donde está y el reproductor lo sigue importando por `@app/App.css`. Ver §5. |

---

## 3. Los alias

Ambas apps declaran **el mismo alias** en su `vite.config.ts` **y** su
`tsconfig.app.json`. Tienen que estar en los dos lados: Vite lo usa para
bundlear y TypeScript para type-checkear, y si se declara en uno solo la app
compila pero `tsc -b` falla (o al revés: compila y a runtime da 404).

| Alias | Resuelve a | Para qué |
|---|---|---|
| `@shared/*` | `packages/*` | **El alias nuevo.** Todo el código compartido. |
| `@app/*` | `app/src/*` | **Sólo dependencias inversas** (§6). No usar para código nuevo. |
| `@engine/*` | `app/src/engine/*` | **En retirada.** Desaparece en la fase 4, cuando `engine/` ya vive en `packages/`. |

Detalles que importan y ya nos mordieron:

- **Sólo la forma con barra**: `@shared/engine/instrumentSources`. Vite no
  resuelve `@shared` a secas, y no queremos un `packages/index.ts` sólo para eso.
- **`@shared/*` es agnóstico**: no lleva el nombre de ninguna app, así que mover
  algo de `app/` a `packages/` no obliga a renombrar el import en el reproductor.
- **`server.fs.allow`**: las dos apps tienen que permitir servir archivos fuera
  de su carpeta (`packages/` está en la raíz). Sin esto Vite responde **403** a
  los módulos compartidos en dev, y el error no dice por qué.
- **Sin `baseUrl`** en los `tsconfig`: está deprecado en TypeScript 6 y las rutas
  de `paths` ya se resuelven relativas al archivo de config, que es lo que
  queremos.

---

## 4. Dependencias: una sola copia de React y de Tone.js

`packages/` **no tiene `package.json` y no se instala nada.** No es un workspace
de npm/pnpm: es una carpeta de código fuente.

- `app/node_modules/` es el único `node_modules` real.
- `player/node_modules` y **`packages/node_modules`** son **junctions** a él
  (`New-Item -ItemType Junction -Path packages/node_modules -Target app/node_modules`).
  **Las dos hay que mantenerlas.** `scripts/start-servers.ps1` las recrea si
  faltan.

### ⚠ `packages/node_modules` NO es cosmético

Sin esa junction, la fase 2 **rompe las dos apps**, y rompe de una forma que
despista: Node y TypeScript resuelven los paquetes caminando **hacia arriba**
desde el archivo que importa. Un archivo en `packages/engine/` busca `tone` en
`packages/engine/node_modules`, después `packages/node_modules`, después
`<raíz>/node_modules` — donde sólo está Playwright — y **ahí se queda: nunca
mira `app/node_modules`**. El resultado es `Cannot find module 'tone'` en todo
el motor, más una cascada de `Parameter 'err' implicitly has an 'any' type` que
parecen un problema de tipos y son sólo la consecuencia de que `Tone` quedó en
`any`.

Esto no es teoría: apareció en el primer ensayo de la fase 2 (ver §5). Hoy está
resuelto con la junction.

**Por qué una junction y no una copia — y por qué no es un atajo:**

Si hubiera dos copias de React o de Tone.js, habría **dos `AudioContext`** — dos
grafos de audio que no se ven entre sí, dos `Tone.Transport`, y los samples de
una app sonando encima de la otra sin forma de pararlos. Es exactamente el bug
histórico de "los samples siguen sonando" pero hecho arquitectura.

Con la junction los tres caminos apuntan a los **mismos archivos físicos** (mismo
File ID de NTFS), así que Tone se instancia una sola vez. Verificado:

```
app\node_modules\tone\package.json       -> FileId 0x…160ca7
packages\node_modules\tone\package.json  -> FileId 0x…160ca7   (idéntico)
player\node_modules\tone\package.json    -> FileId 0x…160ca7   (idéntico)
```

`packages/` **no declara dependencias**: las hereda de la app que lo consume
(ambas apps ya declaran `tone`, `@tonejs/midi`, `react`, `tonal`…). Si algún día
`packages/` necesita un paquete que ninguna app tiene, se agrega a **las dos**
apps.

---

## 5. Cómo se migra: `scripts/migrate-to-shared.mjs`

Mover 96 archivos a mano y arreglar ~390 imports a ojo es donde se cuela un
`../` de menos y la app deja de compilar. El codemod lo hace mecánicamente:

```powershell
# Reporte: no escribe nada. El modo por defecto NO escribe (hay que pedir --apply).
pwsh -File scripts/run-bounded.ps1 -Command "node scripts/migrate-to-shared.mjs --dry-run --stage=2" -TimeoutSec 90

# Aplicar (después del git mv de esa fase):
pwsh -File scripts/run-bounded.ps1 -Command "node scripts/migrate-to-shared.mjs --apply --stage=2" -TimeoutSec 90
```

Corre **antes o después** del `git mv` y da el mismo resultado: en vez de
resolver los relativos contra el disco (donde un archivo que se movió apunta a
una ruta que ya no existe), los resuelve contra la ubicación *pre-movimiento*
que conoce la tabla `MOVES`, y recién ahí aplica el movimiento a las dos puntas.

Reporta tres cosas que hay que mirar:

- **`→ @shared/*`**: el caso normal.
- **`DEPENDENCIA INVERSA`**: código compartido que necesita código del piano.
  Las deja compilando (con `@app/*`) pero las lista, separando las de **runtime**
  de las **sólo de tipos** — no es lo mismo, una se borra al compilar.
- **`DESTINO INEXISTENTE`**: el import apunta a algo que no es un módulo. Puede
  ser un asset (inocente) o un error de la tabla. El script sale con código 1.

### Orden por fases (cada una su commit, para poder revertir selectivamente)

| Fase | Qué mueve | Verificación |
|---|---|---|
| 1 | Nada: `packages/` + alias + este codemod | `tsc -b` en las dos apps · dry-run del codemod |
| 2 | `engine/`, `utils/`, `audio/`, `types/`, `constants/`, `music/` | `tsc -b` ×2 · HTTP 200 en 1234 y 1235 · **RMS del reproductor > −30 dB** (`scripts/measure-player.mjs`) · el piano suena (`scripts/measure-mix.mjs`) · specs e2e |
| 3 | Los componentes compartidos + su CSS | Todo lo de la fase 2 **más** paridad visual en 0,00 % (método de `player/INFORME-PARIDAD.md`) |
| 4 | Nada: READMEs y borrar `@app/*` / `@engine/*` | `tsc -b` ×2 |

**Regla dura: si una fase no compila o el audio no suena, se revierte esa fase
y se reporta.** Nunca se deja una app rota.

### Ensayar antes de mover: `scripts/rehearse-migration.ps1`

Las fases 2 y 3 mueven 96 archivos y reescriben ~390 imports **sobre el árbol de
trabajo**, donde además hay otros agentes editando. El ensayo hace la migración
entera en una copia descartable (`.logs/rehearsal`, gitignoreada) y corre
`tsc -b` ahí adentro, así que se sabe si compila **antes** de tocar el repo:

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "pwsh -NoProfile -File scripts/rehearse-migration.ps1 -Stage 3" -TimeoutSec 900
```

Tres detalles del ensayo que valen la pena:

1. **Pide la tabla de movimientos al codemod** (`--print-moves`), no la
   duplica: una tabla copiada en dos lugares se desincroniza y el ensayo
   terminaría validando algo distinto de lo que se aplica.
2. **Compara contra un control**: corre `tsc -b` también en el repo real, que es
   el estado sin migrar, y reporta sólo los errores que aparecen **de nuevo**.
   Sin eso, un archivo a medio editar por otro agente se leería como "la
   migración rompió".
3. **Detecta si el árbol se movió durante el ensayo** (huella de `app/src` y
   `player/src` antes y después). Si se movió, el veredicto es *no concluyente*
   en vez de *falló*: con otro agente guardando archivos, "error nuevo" y "bug
   de la migración" no son lo mismo, y confundirlos manda a buscar un bug que no
   existe.

**Resultado ya medido** (23:23–23:25, árbol de ese momento):
`fase 2 → COMPILA en las dos apps` · `fase 3 → COMPILA en las dos apps`.
Los dos bugs del codemod que aparecieron en el camino están arreglados (§5.1).

**Lo que el ensayo NO verifica**: audio, HTTP, e2e y paridad visual. Eso sólo se
puede medir con las apps corriendo. El ensayo dice que **compila**, no que
**suena**.

### 5.1 Los dos bugs que encontró el ensayo (y por qué el ensayo valía la pena)

Ninguno de los dos se veía leyendo el codemod. Los dos aparecieron al mover de
verdad y compilar:

1. **`Cannot find module 'tone'` / `'react'` en todo el motor.** No era el
   codemod: `packages/` no tenía `node_modules`, y Node/TS no suben hasta
   `app/node_modules`. Se arregló con la junction (§4). **Sin el ensayo, la
   fase 2 habría roto las dos apps en el primer intento.**
2. **`components/score/PartMixer.tsx` quedaba con sus dos imports roto.** Es el
   único movimiento de **archivo** de la tabla (no de carpeta), y el matcher
   comparaba `app/src/components/score/PartMixer.tsx`, mientras que un import
   escribe `./PartMixer` (sin extensión) — así que no matcheaba nunca.
   Consecuencia: `App.tsx` y `components/score/index.ts` seguían apuntando a una
   ruta que ya no existía → 2 errores `TS2307`. Se arregló aceptando el nombre
   con y sin extensión; los totales pasaron de 90 archivos/388 imports a
   **91/390**, que son exactamente los 2 que faltaban.

También se corrigió la verificación de destinos del codemod: mira la ruta
PRE y POST movimiento, porque el script puede correr antes o después del
`git mv` y en cada caso existe sólo una de las dos.

### 5.2 El chequeo de assets (fuentes, imágenes, workers)

Hay un modo de falla que **no lo ve `tsc` ni la consola**: una referencia
relativa a un asset que no había que reescribir, pero que se rompe igual porque
el archivo que la contiene se movió. Se ve en la cara del usuario — una fuente
que no carga, una imagen que no aparece — y en ningún otro lado.

Por eso el codemod no verifica sólo lo que reescribe: resuelve **todas** las
referencias relativas del árbol (imports, `@import` de CSS, `url()` de CSS y
`new URL(..., import.meta.url)`) contra la ubicación post-movimiento y avisa si
alguna no resuelve a nada.

```powershell
# Hoy: "✓ las 518 referencias resuelven (incluidos los url() de fuentes)"
node scripts/migrate-to-shared.mjs --dry-run --stage=all
```

**El caso concreto que esto cubre (y su verificación).** El panel de letra usa
la tipografía **Figtree** autoalojada en `app/src/assets/fonts/` (2 subsets
`.woff2`, licencia SIL OFL 1.1), y `components/studio/lyrics.css` la referencia
con URL **relativa**: `url("../../assets/fonts/figtree-latin.woff2")`. Si el CSS
se moviera a `packages/` y la fuente se quedara en `app/src/assets/`, esa URL
dejaría de resolver **en silencio**.

No pasa, y está medido: `components/studio/` y `app/src/assets/` **se quedan los
dos** en el piano, así que conservan su posición relativa. Verificado en el
sandbox migrado de la fase 3:

```
lyrics.css sigue en app/src/components/studio/   -> True
url(../../assets/fonts/figtree-latin.woff2)      -> EXISTE: True
url(../../assets/fonts/figtree-latin-ext.woff2)  -> EXISTE: True
```

**Si algún día se mueve `components/studio/` o `assets/`**, el chequeo de
referencias lo va a marcar antes de que llegue a producción. Y la verificación
final en el navegador (no alcanza con que la ruta exista: la fuente tiene que
cargar de verdad):

```js
document.fonts.check('400 16px "Figtree"') === true
```

### 5.3 Lo que el codemod NO toca (a propósito)

- **Claves de `localStorage`.** `pm_lyrics_open` (estado del cajón de letra) y
  `piano_groove_amount` (perilla Groove) las comparten el piano y el reproductor
  a propósito. Los matchers son delimitados y sólo aceptan especificadores que
  empiezan con `.`/`..` o con un alias, así que un literal como
  `"piano_groove_amount"` no es candidato. Verificado en el sandbox: los dos
  aparecen la misma cantidad de veces antes y después (1 y 3).

**Lo que el ensayo NO verifica**: audio, HTTP, e2e y paridad visual. Eso sólo se
puede medir con las apps corriendo. El ensayo dice que **compila**, no que
**suena**.

---

## 6. Dependencias inversas medidas (la deuda conocida)

Medido con el codemod en dry-run sobre el árbol actual. **7 en total**, con la
fase en la que aparecen:

| # | Quién (compartido) | Necesita (se queda en el piano) | Tipo | Fase |
|---|---|---|---|---|
| 1 | `utils/profile.ts` | `game/engine` | **tipos** | 2 |
| 2 | `utils/profile.ts:473` | `game/engine` (`EnhancedGameStats`) | **tipos** | 2 |
| 3 | `utils/songRatings.ts` | `game/engine` | **tipos** | 2 |
| 4 | `types/gamification.ts` | `game/engine` (`GameDifficulty`) | **tipos** | 2 |
| 5 | `utils/midiWorkerClient.ts` | `workers/midiParser.worker.ts` | **RUNTIME** | 2 |
| 6 | `components/songs/SongLibrary.tsx` | `components/score/ImportPanel` | **RUNTIME** | 3 |
| 7 | `components/player/PlayerSection.tsx` | `components/studio/LyricsPanel` | **RUNTIME** | 3 |

**Las 4 de tipos (1–4) son baratas y tienen arreglo limpio:** `GameDifficulty` y
`EnhancedGameStats` se definen en `app/src/game/types.ts` (líneas 4 y 54). Mover
ese único archivo a `packages/types/game.ts` elimina las cuatro de una vez. No
se hizo porque `game/` está en la lista de "exclusivo del piano" del encargo.

**Las 3 de runtime son decisiones de arquitectura, no bugs:**

- **5** — el worker se crea con `new URL("../workers/midiParser.worker.ts",
  import.meta.url)`. Los alias no funcionan dentro de `new URL(...)`, así que el
  codemod emite un relativo que sube hasta `app/src/`. La alternativa limpia es
  mover `app/src/workers/` a `packages/workers/` (**1 solo archivo**, y las dos
  apps lo usan) — el codemod ya lo soporta con `--workers-to-packages`.
- **6 y 7** — `SongLibrary` monta `ImportPanel` y `PlayerSection` monta
  `LyricsPanel` de forma **estática y siempre** (no son imports condicionales ni
  dinámicos). O sea: el reproductor ya está usando esos dos componentes del
  piano hoy, vía `@app/*`. Sacar la dependencia significa mover
  `components/score/ImportPanel.tsx` y `components/studio/LyricsPanel.tsx`
  (+ `lyrics.css`) a `packages/components/`. No se hizo porque el encargo dice
  que `score/` y `studio/` se quedan.

**Ninguna de las 7 rompe la migración.** Todas compilan y corren por `@app/*`.
Están acá para que la deuda sea visible y medible en vez de descubrirla dentro
de seis meses.

---

## 7. Decisiones pendientes del dueño

1. **`app/src/workers/` (1 archivo).** Es la única dependencia inversa de
   runtime que aparece ya en la fase 2, y la más fácil de cerrar:
   `--workers-to-packages`. **Recomendación: moverlo.**
2. **`app/src/game/types.ts` (1 archivo).** Cierra las 4 dependencias inversas
   de tipos. **Recomendación: moverlo a `packages/types/game.ts`.**
3. **`ImportPanel.tsx` y `LyricsPanel.tsx`.** Cierran las 2 de runtime de la
   fase 3. Moverlos contradice "Studio y score se quedan" pero **el reproductor
   ya los usa**. Es la tensión real del diseño y la decide el dueño.
4. **`App.css` / `index.css`.** Quedan en el piano a propósito (§2). Si algún
   día se parten, la parte compartida tiene que ser un archivo nuevo que las
   dos apps importen, nunca un recorte del original.

---

## 8. Cómo agregar una función nueva (el flujo, después de la migración)

1. **¿La usa el reproductor?** Va en `packages/`, en la carpeta del dominio que
   le toque (`engine/`, `music/`, `components/…`). **Nunca en `app/src/`.**
2. **¿Es exclusiva del piano** (Studio, teclado, Juego, partituras, ajustes)?
   Va en `app/src/`, y **no se importa desde `packages/`**.
3. **Se desarrolla y se verifica en el reproductor** (1235):

   ```powershell
   # Los servidores ya están corriendo. Para reiniciarlos:
   pwsh -File scripts/start-servers.ps1

   # Type-check de las dos apps
   pwsh -File scripts/run-bounded.ps1 -Command "npx tsc -b" -Cwd player -TimeoutSec 180
   pwsh -File scripts/run-bounded.ps1 -Command "npx tsc -b" -Cwd app    -TimeoutSec 180

   # ¿Suena de verdad? RMS medido sobre el grafo de audio, no lo que dice la UI.
   # Criterio: señal > −30 dB.
   pwsh -File scripts/run-bounded.ps1 -Command "node scripts/measure-player.mjs" -TimeoutSec 180

   # Paridad visual contra el piano (13 regiones, tiene que dar 0,00 %)
   pwsh -File scripts/run-bounded.ps1 -Command "node scripts/qa-player-vs-piano.mjs" -TimeoutSec 300

   # Specs del piano que tocan lo compartido
   pwsh -File scripts/run-bounded.ps1 -Command "npx playwright test 03-playback 08-player 11-cambio-de-cancion 12-groove" -TimeoutSec 600
   ```

   **Nunca en primer plano**: todo lo que pueda tardar más de ~20 s va por
   `scripts/run-bounded.ps1` (ver `AGENTS.md`).
4. **El piano no se toca** salvo que la función nueva rompa su consumo. Si hay
   que tocar `App.tsx`, se avisa antes: son 6.500 líneas con el Studio adentro.

### Cómo se comprueba que el reproductor "suena" y no sólo "dice que suena"

`scripts/measure-player.mjs` engancha un `AnalyserNode` al
`AudioDestinationNode` interceptando `AudioNode.prototype.connect`, y mide RMS
en dBFS de la salida real. Un reproductor con la UI perfecta y el grafo de audio
roto da `-Infinity` dB y se ve igual en una captura de pantalla: por eso la
verificación es numérica.
