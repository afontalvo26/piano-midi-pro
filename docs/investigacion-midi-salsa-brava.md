# Pack de salsa brava — 41 MIDIs descargados

**Estado**: ✅ **hecho.** 41 archivos en `app/public/demo/`, 3,09 MB, verificados con
el mismo parser que usa la app en runtime.

> ⚠️ **Este documento reemplaza una conclusión equivocada.** En la primera pasada
> escribí que "el MIDI de salsa brava no existe en los repositorios libres". **Era
> falso.** La fuente ya estaba documentada en este mismo repo desde el pack de boleros:
> `karaokegratis.com.ar`. No hay que buscar afuera, hay que usar lo que ya teníamos.

---

## 1. La fuente: `karaokegratis.com.ar`

Es la misma que usa [scripts/boleros-download.mjs](../scripts/boleros-download.mjs)
para los 83 boleros. Funciona así:

| Pieza | Detalle |
|---|---|
| Catálogo | **3 163 posts**, uno por canción. WordPress con categorías alfabéticas (`/category/a/` … `/category/s/`) |
| Búsqueda | `https://www.karaokegratis.com.ar/?s=<consulta>` |
| Archivo | Cada post tiene **un `.zip`** con un `.kar` (MIDI karaoke) adentro |
| URL del zip | `/wp-content/uploads/2018/06/<Artista> - <Canción>.zip` |
| Registro | **No requiere.** Descarga directa |
| Velocidad | 41 archivos en **36 s** |

---

## 2. Lo que se bajó (41 archivos)

Corazón del canon del [ranking](investigacion-salsa-brava-top.md):

| Tema | Archivo | BPM | Dur |
|---|---|---|---|
| **Pedro Navaja** (Blades/Colón) | `Salsa_-_Ruben_Blades_Pedro_Navaja.kar` | 187 | 4:51 |
| **Plástico** (Blades/Colón) | `Salsa_-_Ruben_Blades_Plastico.kar` | 190 | 7:45 |
| **El Cantante** (Lavoe) | `Salsa_-_Hector_Lavoe_El_Cantante.kar` | 185 | 6:27 |
| **Mi Gente** (Lavoe) | `Salsa_-_Hector_Lavoe_Mi_Gente.kar` | 202 | 3:48 |
| **Quimbara** (Celia Cruz) | `Salsa_-_Celia_Cruz_Quimbara.kar` | 120 | 3:18 |
| **Anacaona** (Cheo Feliciano) | `Salsa_-_Cheo_Feliciano_Anacaona.kar` | 185 | 4:21 |
| **Las Caras Lindas** (Ismael Rivera) | `Salsa_-_Ismael_Rivera_Las_caras_lindas.kar` | 100 | 5:31 |
| **El Nazareno** (Ismael Rivera) | `Salsa_-_Ismael_Rivera_El_Nazareno.kar` | 97 | 5:29 |
| **Fuego en el 23** (Sonora Ponceña) | `Salsa_-_Sonora_Poncena_Fuego_En_El_23.kar` | 87 | 5:53 |
| **Brujería** (El Gran Combo) | `Salsa_-_El_Gran_Combo_De_Puerto_Rico_Brujeria.kar` | 93 | 4:03 |
| **El Ratón** (Cheo Feliciano) | `Salsa_-_Cheo_Feliciano_El_Raton.kar` | 100 | 4:23 |
| **Juan Pachanga** (Blades) | `Salsa_-_Ruben_Blades_Juan_Pachanga.kar` | 200 | 4:49 |
| **Idilio** (Willie Colón) | `Salsa_-_Willie_Colon_Idilio.kar` | 95 | 5:57 |
| **Boranda** (Sonora Ponceña) | `Salsa_-_Sonora_Poncena_Boranda.kar` | 175 | 7:23 |
| **El Todopoderoso** (Lavoe) | `Salsa_-_Hector_Lavoe_Todo_Poderoso.kar` | 245 | 4:33 |

Y también: *Puro Teatro* y *Que Te Pedí* (La Lupe), *La Muerte*, *Nido de Amor*,
*El Menú* (El Gran Combo), *Burundanga*, *Yo Viviré*, *La Negra Tiene Tumbao*
(Celia Cruz), *Amor y Control*, *El Padre Antonio*, *Ligia Elena*, *Decisiones*,
*Sin tu cariño* (Blades), *Casi Te Envidio* (Andy Montañez), *Porque Me Citas*
(Bobby Valentín), *Anamile* (Grupo Niche), *Rebelión* (Joe Arroyo), *Miedo al Cha Cha
Chá* (Tito Rodríguez), *Mi Jaragual*, *Es Tarde* (Ismael Rivera), *La Vida Es Un
Carnaval*, *Canción*, *El Gran Varón*, *Todo Me Gusta De Ti*.

**Estadísticas del lote**: todos con pista de piano (salvo los 2 de La Lupe),
175-245 BPM en los temas duros, 4-22 pistas, hasta 22 017 notas (Grupo Niche *Anamile*).

---

## 3. Bugs encontrados y corregidos en el pipeline

Los tres costaron tiempo real; quedan documentados para que no vuelvan.

### 3.1 `download-midi.mjs` no tenía timeout → colgaba para siempre

**Síntoma**: el lote de 6 archivos bajaba en 3,5 s, pero el de 58 agotó un tope de
**900 s** sin escribir una segunda línea en el log.

**Causa**: `fetch()` sin `AbortSignal.timeout()`. Cuando karaokegratis dejaba la
conexión colgada (throttling tras el crawl de ~150 requests), el proceso esperaba
indefinidamente. El `run-bounded.ps1` mataba al agente, pero el log quedaba en 1 línea.

**Arreglo** ([scripts/download-midi.mjs](../scripts/download-midi.mjs)):
`FETCH_TIMEOUT_MS = 25000` + 3 reintentos con backoff de 1,5 s.

### 3.2 El proceso no terminaba aunque el trabajo estuviera hecho

**Causa**: los sockets keep-alive de undici mantienen vivo el event loop.
**Arreglo**: `process.exit(0)` explícito al final de `main()`. Sin esto el runner
acotado espera de gusto.

### 3.3 El buscador de WordPress devuelve un resultado comodín

**Síntoma**: 15 consultas distintas resolvieron todas a **"Neil Young - Im The
Ocean"**, y mi validación las aceptó.

**Causa**: validaba con `titulo.includes(primeraPalabra)`, y "El" está en *"Neil Young
- **El** Im The Ocean"*? No: el fallo fue que tokens genéricos como `el`, `la`, `gran`,
`combo`, `sonora`, `joe` hacían match con cualquier título.

**Arreglo** ([scripts/salsa-discover.mjs](../scripts/salsa-discover.mjs)):
1. Lista de tokens vacíos (`el`, `la`, `los`, `gran`, `combo`, `sonora`, `tito`, `joe`…)
   que no sirven para validar.
2. Hay que ver **al menos un token significativo** (>4 letras) del artista en el título.
3. El título además debe pasar un filtro `SELLO_SALSA` (nombres de artistas del género).

### 3.4 Aprendizaje de red del sandbox

La red está **asimétrica**: `pwsh` no sale (TLS interceptado:
*"The SSL connection could not be established"*), pero **`node` sí sale**.
Toda verificación de red va por `scripts/*.mjs`.

---

## 4. Uso

```powershell
# 1. Descubrir posts -> zips (tarda ~10 min: son ~100 busquedas + fetches)
node scripts/salsa-discover.mjs          # escribe scripts/salsa-brava.jobs.json

# 2. Bajar (41 archivos en ~36 s)
node scripts/download-midi.mjs scripts/salsa-brava.jobs.json

# 3. Verificar que la app los pueda leer
node scripts/salsa-verify.mjs
```

**Convención de nombres**: `Salsa_-_<Artista>_<Cancion>.kar`, igual que
`Bolero_-_` y `Vallenato_-_`, para que la biblioteca los agrupe.

---

## 5. Pendientes (temas del canon que NO están en esa fuente)

Verificados como **ausentes** en karaokegratis: *Sonido Bestial*, *La Murga*,
*Aguanile*, *Che Che Colé*, *Periódico de Ayer*, *Pa Bravo Yo*, *Indestructible*,
*Quítate Tú*, *Planté Bandera*, *Qué Se Sepa*, *Cui Cui*, *Azúcar*, *Vámonos pa'l
monte*, *Toro Mata*, *Hacha y Machete*, *Tiburón*, *Maestra Vida*, *Abran Paso*,
*Oye Como Va*, *Ran Kan Kan*, *Llorarás*.

Para esos quedan las vías ya documentadas: **generar transcripciones** con el
Music Analyzer del proyecto, o **comprar MIDI con licencia**.

---

## 6. Fuentes

- karaokegratis — buscador: <https://www.karaokegratis.com.ar/>
- karaokegratis — ejemplo de post con zip:
  <https://www.karaokegratis.com.ar/2018/06/ruben-blades-pedro-navaja/>
- Zip directo:
  <https://karaokegratis.com.ar/wp-content/uploads/2018/06/Ruben Blades - Pedro Navaja.zip>
- Pipeline ya existente para boleros: [scripts/boleros-download.mjs](../scripts/boleros-download.mjs)
