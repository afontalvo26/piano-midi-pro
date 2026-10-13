# Portadas reales para el catálogo demo (fuente: Spotify)

**Encargo**: conseguir la portada de *todas* las canciones del catálogo demo, en
HD, lo más rápido posible, usando **Spotify** como fuente y un **navegador real
en vivo** (Playwright).

**Resultado**: las ~~157~~ canciones del catálogo tienen su arte resuelto y
descargado; la app lo muestra en lugar del gradiente con iniciales que se
generaba antes. Este documento explica de dónde salió cada imagen, por qué el
camino "obvio" (la Web API) no se pudo usar, y cómo regenerarlo.

---

## 1. El catálogo: 157 canciones, no 117

Primer hallazgo: los comentarios del repo (`music/covers.ts`, `music/meta.ts`)
hablaban de **117** archivos MIDI. El conteo real es mayor.

| Pack | Filas | Fuente declarada |
|---|---:|---|
| `constants/demoSongs.ts` (inline) | 34 | curado a mano (vallenato, clásica, pop) |
| `constants/demoBoleros.ts` | 83 | karaokegratis.com.ar |
| `constants/demoSalsa.ts` | 40 | karaokegratis.com.ar |
| **Total** | **157** | |

En `app/public/demo/` hay **158** archivos: los 157 del catálogo más
`QA_Arranque_0s.mid`, un fixture de tests sin fila en el catálogo (por eso no
tiene portada: nunca se muestra en la biblioteca).

Composición por género: bolero 83 · salsa 40 · vallenato 25 · pop 5 · clásica 4.

Las tres fuentes se parsean con `scripts/covers-catalog.mjs`, que es la **única**
definición de "qué canciones existen" para todo el pipeline. Si el catálogo y la
app se desincronizan, las portadas caen en la fila equivocada, así que ese
módulo además valida: ids duplicados, packs que parsean a cero, y filas cuyo
archivo no está en disco (hoy: 0 problemas).

---

## 2. Por qué no se usó la Web API de Spotify

Los dos caminos "correctos" están cerrados para este proyecto:

- **Web API oficial** (`api.spotify.com`): exige OAuth con `client_id` y
  `client_secret`. No hay credenciales en el repo, y pedirlas habría cambiado el
  encargo (crear una app en el dashboard de Spotify) por un resultado peor: la
  API devuelve JSON, no la evidencia visual que sí da el navegador.
- **oEmbed público**: funciona sin credenciales, pero **sólo acepta un id de
  track conocido**. No sirve para *buscar*. Se usó igual, como verificación
  (§5), una vez que la búsqueda ya devolvió un id.

La página pública de búsqueda (`open.spotify.com/search/<query>`) renderiza
exactamente lo que ve una persona y no pide cuenta. Por eso la fuente es un
**Chromium real manejado por Playwright sobre el protocolo DevTools**, tal como
se pidió.

```powershell
pwsh -File scripts/covers-chrome.ps1          # levanta Chromium con CDP
$env:SPOTIFY_CDP = (Get-Content $env:TEMP\pm-cdp.txt -Raw).Trim()
node scripts/covers-discover.mjs              # ~25 min para las 157
node scripts/covers-fetch.mjs                 # descarga y escribe el manifest
```

### El obstáculo real: el sandbox bloquea Chromium

Chromium no arranca bajo el sandbox de archivos de DSH. No es un fallo de
Playwright: en Windows su IPC (Mojo) necesita *named pipes*, y bajo confinamiento
el proceso muere con

```
FATAL:mojo\public\cpp\platform\platform_channel.cc:108] Check failed: . : Access is denied. (0x5)
```

El lanzador de Playwright tampoco puede usar su `--remote-debugging-pipe` por lo
mismo (`spawn EPERM`). La solución fue lanzar el navegador **fuera** del sandbox,
con `--remote-debugging-port`, y que Playwright se **conecte** a él en vez de
lanzarlo (`chromium.connectOverCDP`). El script imprime el endpoint y lo deja en
`$env:TEMP\pm-cdp.txt` para reutilizar la misma sesión entre corridas.

Detalle aparte: la red de esta máquina pasa por un proxy que reescribe TLS. En
Node hizo falta `NODE_TLS_REJECT_UNAUTHORIZED=0` para el `fetch` de oEmbed; el
navegador no lo necesita, usa el almacén de certificados de Windows.

---

## 3. "HD" en Spotify son 640 px (y está medido, no supuesto)

Spotify publica **un solo máster cuadrado** por álbum y lo sirve en slots de
tamaño fijos dentro de la URL:

```
https://i.scdn.co/image/ab67616d 00004851 e646fcd49b6dfc91d1dba2ae
                       └master┘ └slot┘ └────── hash de la imagen ──────┘
```

Sondeando el CDN en vivo (ver `covers-discover.mjs`, constante `HD_SLOT`):

| Slot | Resultado real |
|---|---|
| `00004851` | 64×64 · 3,8 KB |
| `00001e02` | 300×300 · 51,8 KB |
| `0000b273` | **640×640 · 160,6 KB** |
| `00009000`, `00008000`, `00007000`, … | **404** |

No existe nada más grande en el CDN público. Así que el pipeline **reescribe el
slot a `0000b273`** en todas las URLs: la página suele entregar el slot de 64 o
300 px (el que necesita su grilla), y quedarse con ese habría sido exactamente el
error a evitar.

640 px es además suficiente de sobra para la app: el uso más grande es
`.pm-cover--hero` a **240 px** (2,7× de margen) y el promedio de los 157 archivos
ronda los 120 KB, ~19 MB en total.

---

## 4. Cómo se elige la versión correcta

Buscar "La Gota Fría" devuelve decenas de grabaciones. La coincidencia se resuelve
en dos pasadas y con una penalización explícita:

1. **Consulta precisa** (`"<título> <artista>"`), y se puntúan *todas* las filas
   visibles, no la primera:
   `score = (0,5 · similitud_título + 0,5 · similitud_artista) · penalización`.
2. **Segunda pasada sin artista** (`"<título>"`) sólo si la primera quedó por
   debajo de 0,6. Es el caso de las filas de bolero cuyo artista en el catálogo es
   un marcador genérico (`"Bolero Clásico"`, `"Vallenato Clásico"`, `"Varios"`),
   que no matchea con nada en Spotify y escondía la grabación canónica.
3. **Penalización de karaoke** (×0,35). Buscar *"Ay Hombre Jorge Celedón"*
   devuelve *"Ay Hombe (In the Style of Jorge Celedon) [Karaoke Version]"*, de un
   sello de karaoke: puntúa alto en ambos lados y habría puesto una carátula de
   karaoke. Se demota, no se excluye — para un tema oscuro la edición de karaoke
   puede ser el único arte que exista.
4. **Confirmación por oEmbed**: el id ganador se resuelve contra
   `open.spotify.com/oembed` para comprobar que existe y trae el título canónico.

La similitud del artista es **contra cada crédito por separado** (el mejor), no
contra la lista unida: Spotify acredita a todos los intérpretes
("Jorge Celedón, Jimmy Zambrano") mientras el catálogo nombra uno, así que
comparar contra la cadena unida castigaría a un match perfecto.

### Cobertura y umbral

`covers-fetch.mjs` escribe en el manifest sólo los matches con
`confidence ≥ 0.5`. **Una portada equivocada es peor que el gradiente con
iniciales**: el gradiente se lee como una decisión de diseño, una foto de otro
disco se lee como un bug. Los descartes quedan listados en
`scripts/covers-failures.json` con el motivo, y en la app esas canciones siguen
mostrando su portada generada.

---

## 5. Qué se entregó y dónde vive

| Ruta | Qué es |
|---|---|
| `app/public/covers/<n>-<slug>.jpg` | 157 JPEG de 640×640 |
| `app/public/covers/manifest.json` | `{ covers: { "<trackId>": "/covers/..." } }` |
| `scripts/covers-found.json` | hallazgo crudo: id, título/artista de Spotify, confianza, candidatos alternativos |
| `scripts/covers-failures.json` | lo que no se envió, con motivo |
| `app/src/music/coverStore.ts` | lookup + suscripción para React |

La clave del manifest es el **`trackId` estable** de la app (`d./demo/...`, ver
`music/ids.ts`), no el título: dos canciones pueden llamarse igual y una subida
del usuario puede compartir nombre con una demo.

### Integración en la app

- `music/coverStore.ts` lee el manifest **una vez** al arrancar
  (`loadCoverManifest()` en `main.tsx`) y lo expone con
  `useSyncExternalStore`. Es un archivo estático: una request, no 157.
- `components/player/parts.tsx` (`Cover`) pinta la foto real cuando existe y
  **deja el gradiente debajo**, así que no hay salto de layout: mientras el JPEG
  decodifica (o si falta) se ve el arte generado, con las mismas iniciales.
- Un `gradient` explícito del llamador (playlists, artistas, géneros) sigue
  ganando sobre la foto del track: ahí el color es una decisión, no un fallback.
- `public/sw.js` cachea `/covers/` con **cache-first** (el nombre del archivo es
  *content-addressed*: un máster por canción, así que un hit siempre está
  vigente) y la versión de caché subió a `v3`.
- Sigue sin haber portadas en `localStorage`: el manifest vive en disco y el
  `TrackMeta` persistido no carga 157 URLs.

### Qué NO tiene portada real

- **Subidas del usuario**: sus `trackId` (`u.<nombre>:<bytes>`) no pueden existir
  en un manifest construido desde el catálogo demo.
- **Playlists, artistas y géneros**: no son canciones; conservan su gradiente.

---

## 6. Cómo regenerarlo

```powershell
# 1. Navegador en vivo (deja el endpoint en $env:TEMP\pm-cdp.txt)
pwsh -File scripts/covers-chrome.ps1

# 2. Buscar portadas (resumible: salta las que ya tienen coverUrl)
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
$env:SPOTIFY_CDP = (Get-Content $env:TEMP\pm-cdp.txt -Raw).Trim()
node scripts/covers-discover.mjs                 # --limit 20 para probar
                                                 # --only d./demo/x.kar
                                                 # --refresh para rehacer todo

# 3. Descargar + escribir el manifest
node scripts/covers-fetch.mjs                    # --force  re-baja los archivos
                                                 # --min-confidence 0.7

# 4. Verificar que la app realmente las pinta
node scripts/covers-verify.mjs http://127.0.0.1:1234/
```

Al agregar canciones nuevas al catálogo, `covers-discover.mjs` sólo busca las que
faltan, así que el costo es proporcional a lo agregado.

### Verificación

`covers-verify.mjs` abre la app en el navegador y cuenta los `<img>` que
resolvieron a píxeles reales (`naturalWidth > 0`). Un manifest lleno de URLs no
prueba nada si los `<img>` dan 404, que es justo el modo de falla que se quiere
detectar. Deja `screenshots/covers-verification.png` y
`scripts/covers-verify.json`.

Tras la última corrida: **157/157** con portada, **0** requests fallidas a
`/covers/`, todas de **640 px**.
