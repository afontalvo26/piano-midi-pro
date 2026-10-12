# Investigación — MIDI de salsa brava: qué existe realmente y qué no

**Encargo**: "descargar mucho más" de las salsas bravas top del
[ranking](investigacion-salsa-brava-top.md).
**Fecha**: sesión de esta investigación.
**Método**: sondas HTTP reales con `fetch` desde **Node** (el sandbox de este repo
bloquea la red desde `pwsh` — ver §5), análisis de los `.mid` bajados con
`@tonejs/midi`, y `web_search` / `web_fetch`.

> ### Resultado en una línea
> **Bajé 1 tema de salsa, y es el único que existe en los repositorios libres.**
> No es un problema de esfuerzo ni de búsqueda: es que **el MIDI de salsa brava
> prácticamente no existe** en las fuentes abiertas. El camino que sí escala es
> **generar las transcripciones**, no descargarlas.

---

## 1. Lo que sí se bajó (verificado)

| Archivo | Origen | Bytes | Verificación |
|---|---|---|---|
| `app/public/demo/Salsa_-_Pedro_Navaja.mid` | <https://bitmidi.com/pedro-navaja-mid> → `/uploads/84382.mid` | 142 990 | ✅ `MThd`, format 0, 1 pista consolidada, PPQ 192 |

**No es un archivo cualquiera con el nombre puesto**: lo analicé con `@tonejs/midi`
y coincide con la grabación de *Siembra* (1978).

| Propiedad | Valor medido | Contraste |
|---|---|---|
| Duración | **417,6 s = 6:57** | La versión de *Siembra* dura **7:20**; 6:57 es coherente con un arreglo de karaoke (cierre seco) |
| Tempo | **187 BPM** constante | Tempo de salsa dura; encaja con el tema |
| Compás | sin marca de compás en el header | Normal en `.mid` de karaoke |
| Pistas | 10 (6 con notas) | — |
| Instrumentación | flauta (prog 73), bajo eléctrico finger (33), **standard kit** (canal 9, 11 022 notas), **bright acoustic piano** (prog 1, 2 122 notas), trompeta (56), saxo tenor (66) | La percusión en canal 9 + piano montuno confirman salsa, no otra cosa |
| Rango del piano | **B2 .. E5** | Tumbao en registro medio-bajo, típico del género |

⚠️ **Aviso de calidad**: es **format 0** (todo en un solo track, canales separados) y
la pista de batería tiene **11 022 notas** — es un `.mid` de karaoke, no una
transcripción de estudio. Sirve para tocar/reproducir, pero **no esperes fidelidad al
arreglo de Willie Colón** (no hay trombón, que es la firma del disco; en su lugar hay
saxo tenor).

---

## 2. Fuentes sondeadas: resultado real

Probé 13 endpoints. Esto es lo que devolvió cada uno, sin maquillar:

| Fuente | Resultado | Detalle |
|---|---|---|
| **BitMidi** | ✅ **Único que sirve archivos directo** | `bitmidi.com/uploads/<id>.mid`, 200, `Content-Type: audio/midi`. Pero su catálogo latino es **casi nulo** (ver §3) |
| **padulcofrade.com** | ⚠️ Sirve archivos, **bloquea listados** | Los `.mid` del `download-midi.jobs.json` bajan bien (**200**, 66 494 bytes en el control), pero cualquier **directorio da 403** → no se puede crawlear para descubrir temas nuevos |
| **musicasampler.com** | ❌ **Requiere login** | Tiene el catálogo de salsa más grande que encontré (**432 páginas** de listado, incluido "Héctor Lavoe - El Cantante"), pero **la página de detalle no tiene ningún link de descarga**: cero `href` con `task=`, cero formulario, cero botón. El archivo está detrás de cuenta de usuario. **No lo voy a eludir**: su propio sitio advierte que bloquea cuentas por intentos fallidos |
| **midifiles.com** | ❌ **503** en todas las rutas | `/de/interpret/hector-lavoe`, `/es/...` → 503 (bloqueo anti-bot) |
| **midiworld.com** | ❌ Sin salsa | Su propio buscador dice literalmente **"Search result: found nothing!"** para `q=salsa`; sus géneros listados no incluyen latino/salsa |
| **midkar.com** | ❌ **404** en todas las rutas | `/Latin/`, `/latin.html`, `/index.html` → 404 (355 bytes) |
| **vanbasco.com** | ❌ **`fetch failed`** | Ni siquiera resuelve por HTTP |
| **archive.org** (MIDI + latino) | ❌ **5 resultados, 0 útiles** | `numFound: 5`, y los 5 son piezas experimentales de mambo con licencia **CC BY-NC-ND** (que prohíbe obras derivadas → inútiles para un proyecto que necesita editar el MIDI) |
| **freemidi.org** | ❌ Sin MIDI accesible | 200 pero **0 links a `.mid`/`.kar`/`.zip`** |
| **fullpartituras.com** | ⚠️ Catálogo existe | Lista "Salsa: MIDIs gratis" pero es un sitio comercial con descarga tras registro |
| **ireproductionsmusic.com** | 💰 Comercial | Vende partituras + MIDI de Frankie Ruiz, etc. — **esta es la vía legal de pago** si se quiere material bueno y con licencia |

---

## 3. Barrido de slugs en BitMidi (22 temas del ranking)

Rastreé por URL directa los 22 temas del top. **Resultado: 1 de 22.**

```
  OK  pedro-navaja         -> /uploads/84382.mid  (851 plays)
  --  el-cantante          HTTP 404      --  las-caras-lindas   HTTP 404
  --  quimbara             HTTP 404      --  fuego-en-el-23     HTTP 404
  --  anacaona             HTTP 404      --  que-se-sepa        HTTP 404
  --  mi-gente             HTTP 404      --  el-nazareno        HTTP 404
  --  la-murga             HTTP 404      --  toro-mata          HTTP 404
  --  aguanile             HTTP 404      --  brujeria           HTTP 404
  --  plastico             HTTP 404      --  el-raton           HTTP 404
  --  che-che-cole         HTTP 404      --  idilio             HTTP 404
  --  indestructible       HTTP 404      --  ojos-chinos        HTTP 404
  --  sonido-bestial       HTTP 404      --  periodico-de-ayer  HTTP 404
  --  lloraras             HTTP 404      --  [...]
```

Búsquedas por texto en BitMidi: `lavoe` → **0 resultados**; `rubén blades` → **0**;
`quimbara` → **0**; `anacaona` → **0**; `salsa` → 6 resultados, ninguno de salsa
(blue-salsa, everybody-salsa, etc.).

---

## 4. Por qué el MIDI de salsa brava no existe (y qué significa)

**El cuello de botella es legal, no técnico.** Las composiciones del canon son de
**1965-1981** y están bajo copyright vigente. En EE.UU. una obra publicada en 1978
entra al dominio público en **2074** (95 años desde publicación). Nada de esto es de
dominio público en 2026.

Eso produce el desierto que medí:

- Los repositorios libres (BitMidi, MidKar, MidiWorld) existieron alrededor de música
  **folk, clásica, de dominio público o pop de uso masivo** — no de catálogo latino con
  dueño activo.
- **Fania/Craft Recordings sigue reeditando y litigando** el catálogo. Un `.mid` de
  salsa brava es una obra derivada sin licencia, y los sitios grandes no lo publican.
- Los sitios que **sí** lo tienen (musicasampler) lo esconden **detrás de registro**
  precisamente por eso.

**Las dos excepciones que encontré y conviene tener presentes:**

1. **Obras anteriores a ~1930** ya son de dominio público — pero eso es mambo/son
   pre-salsa, no salsa brava.
2. **MIDI comercial con licencia** (IRE Productions y similares): es pago, pero es la
   única vía legal para conseguir material de calidad y con derechos claros.

**Recomendación honesta**: para el proyecto, **descargar no es el camino**. El camino
es **generar**. Y el repo ya tiene el motor para hacerlo: el
[MUSIC-ANALYZER](MUSIC-ANALYZER.md) y el pipeline de *Score Reader* están para
transcribir audio a MIDI. Eso produce material propio, sin problema de derechos, y con
la ventaja de que se puede ajustar el arreglo a lo que el reproductor necesita
(separar el montuno del tumbao, aislar la percusión, etc.).

---

## 5. Aprendizajes de infraestructura (útiles para futuras descargas)

1. **La red del sandbox está asimétrica**: `pwsh` **no** sale (todo `Invoke-WebRequest`
   falla con *"The SSL connection could not be established"* → es TLS interceptado, no
   falta de ruta), pero **`node` sí sale** sin problema. Cualquier verificación de red
   tiene que hacerse con `scripts/*.mjs`, no con PowerShell.
2. **`@tonejs/midi` es CommonJS**: hay que importarlo como
   `import pkg from '@tonejs/midi'; const { Midi } = pkg;` — el named import
   (`import { Midi } from ...`) revienta con `ERR_UNSUPPORTED_ESM_URL_SCHEME` /
   `SyntaxError: Named export not found`.
3. **Protocolo de verificación de un MIDI bajado** (usarlo siempre, es barato):
   comprobar `MThd` en los primeros 4 bytes, y luego con `@tonejs/midi` mirar
   duración, PPQ, tempo, y **la instrumentación y el rango del piano**. Un archivo con
   el nombre correcto puede ser cualquier cosa; la duración contra la grabación de
   referencia es el mejor discriminador (acá: 6:57 vs. 7:20 del álbum).
4. **Un 403 en un directorio no significa que la fuente esté caída**: padulcofrade
   bloquea listados pero sirve archivos. Las rutas puntuales del `jobs.json` siguen
   funcionando.

---

## 6. Estado del pack `app/public/demo/` (115 archivos)

| Familia | Cantidad | Ejemplos |
|---|---|---|
| Boleros | ~88 | *Perfidia*, *Obsesión*, *Dos Gardenias*, *Bésame Mucho* |
| Vallenato / Carlos Vives / Diomedes Díaz | ~18 | *La Gota Fría*, *Matilde Lina*, *Sin Medir Distancias* |
| Clásico / pop | 9 | *Für Elise*, *Moonlight Sonata*, *Bohemian Rhapsody* |
| **Salsa** | **1** ← *nuevo* | **Pedro Navaja** |

O sea: el pack tenía **cero salsa brava** hasta ahora. Por eso el ranking de
[investigacion-salsa-brava-top.md](investigacion-salsa-brava-top.md) es el mapa de lo
que falta, no un inventario de lo que hay.

---

## 7. Opciones para seguir (en orden de lo que rinde)

1. **Generar transcripciones propias** con el Music Analyzer del proyecto, empezando
   por los 5 pilares del ranking. Es la única vía que escala a los 40 temas, no tiene
   riesgo de derechos, y alimenta el Core del producto. **Camino recomendado.**
2. **Comprar MIDI con licencia** (IRE Productions u otro) para los 10-15 temas clave.
   Rápido y legal, pero se paga y el arreglo no es ajustable.
3. **Registrarse en musicasampler** y bajar a mano lo que hay (tiene "El Cantante" de
   Lavoe). Legal desde su ToS, pero manual, uno por uno, y la calidad es de karaoke.
4. **Arrullar el pack con lo que sí es libre**: hay muchísimo MIDI de **son, mambo,
   guaracha y bolero** de dominio público que comparte el 80% del lenguaje pianístico
   de la salsa brava (el tumbao y el montuno son los mismos). Sirve para poblar el
   reproductor y probar el motor mientras se generan las transcripciones del canon.

---

## 8. Fuentes

- BitMidi — *Pedro Navaja*: <https://bitmidi.com/pedro-navaja-mid> ·
  archivo directo <https://bitmidi.com/uploads/84382.mid>
- BitMidi — buscador (para replicar el barrido):
  <https://bitmidi.com/search?q=salsa>
- musicasampler — categoría *Midis de Salsa* (432 páginas):
  <https://musicasampler.com/index.php/midis-en-ms/category/10-midis-de-salsa>
- musicasampler — *Héctor Lavoe - El Cantante* (detalle, sin link de descarga):
  <https://musicasampler.com/index.php/midis-en-ms/download/10-midis-de-salsa/42465-hector-lavoe-el-cantante-midi-gratis>
- midiworld — búsqueda sin resultados:
  <https://www.midiworld.com/search/?q=salsa>
- IRE Productions — partituras y MIDI latinos (vía comercial):
  <https://www.ireproductionsmusic.com/es/partituras-y-midi-de-musica-latina-por-artista/>
- archive.org — API de búsqueda usada (MIDI + latino):
  <https://archive.org/advancedsearch.php?q=mediatype%3A%28audio%29+AND+format%3A%28MIDI%29+AND+%28salsa+OR+son+cubano+OR+mambo%29&output=json>
- Duración de referencia de *Pedro Navaja* (7:20, *Siembra* 1978):
  <https://en.wikipedia.org/wiki/Pedro_Navaja>
