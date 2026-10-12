# Investigación VERIFICADA — samples libres de percusión vallenata y música tropical colombiana

**Método.** Todas las afirmaciones de esta página salen de **requests HTTP reales** ejecutados
desde esta máquina (Node 24 `fetch`, `curl 8.21`, `Invoke-WebRequest`), más la API de GitHub, la
API de archive.org, la API de Wikimedia Commons y el REST API de WordPress de Pianobook. Donde algo
no se pudo verificar, se dice explícitamente.

**Ningún header CORS de este informe está inferido de memoria**: cada `Access-Control-Allow-Origin`
(ACAO) citado se copió de la respuesta real. El script de sondeo hacía, por cada URL:
`HEAD` con `redirect: 'manual'` → `HEAD` siguiendo redirects → `GET` con `Range: 0-65535` para
confirmar que los bytes realmente bajan (se reportan los *magic bytes*).

**Verificación acústica adicional.** Para no creerle al nombre del archivo, cada candidato se
decodificó con `ffmpeg` a PCM mono 22 050 Hz y se midió duración, peak, RMS, *zero-crossing rate*
(ZCR), centroide espectral (FFT propia de 2048 puntos con ventana Hann) y `f0` por autocorrelación.
Eso permitió comprobar, por ejemplo, que las notas 65/66 del kit GM son de verdad un par
timbal alto / timbal bajo, y que las notas 73/74 son de verdad un raspado corto y uno largo.

**Fecha de los requests:** headers `Date` de los servidores, 2026-10-12.

---

## 0. Resumen ejecutivo

| # | Instrumento pedido | ¿Existe algo libre y consumible HOY desde el navegador? | Mejor opción | Licencia |
|---|---|---|---|---|
| 1 | **Caja vallenata** | ❌ **No existe** ninguna librería libre. Sólo aproximaciones tímbricas | VSCO-2-CE `LogDrumLo_MedM_*` (tambor de madera percutido con baquetas) + `OldSnare/snare_rim` | CC0 1.0 |
| 2 | **Guacharaca** | ⚠️ **No existe** guacharaca literal; sí raspadores equivalentes muy buenos | VSCO-2-CE `Percussion/Guiro-Fast/Slow/M/Hit` (13 archivos de raspado) | CC0 1.0 |
| 3 | **Acordeón vallenato de botones** | ✅ **Sí** (lo que ya usás sigue siendo lo mejor) | FreePats `button-accordion-HN` + sus 17 samples de **fuelle/release** | CC0 1.0 |
| 4 | **Timbales latinos** | ✅ **Sí** — notas 65/66 del kit GM vía WebAudioFont | `12865_0_FluidR3_GM_sf2_file.js` (High Timbale) + `12866_…` (Low Timbale) | MIT (empaquetado) / FluidR3 |
| 5 | **Güira / güiro metálico** | ✅ **Sí** | `sfzinstruments/kinwie.dim-cabasa` (250 FLAC de cabasa metálica) | **CC BY 4.0** (atribución) |
| 5b | **Clave cubana** | ✅ **Sí**, con dinámicas y round-robin | VSCO-2-CE `Percussion/Claves1_Hit_v1..v3_rr1..rr2` | CC0 1.0 |
| 6 | **Tres cubano / requinto / guitarra de son** | ❌ **No existe** ninguna librería. Sólo sustitutos de nylon | FreePats `spanish-classical-guitar` (CC0) o `ukulele1` | CC0 1.0 |

**Lo más importante de todo el informe:** el informe previo
([`investigacion-samples-instrumentos-reales.md`](investigacion-samples-instrumentos-reales.md))
decía que para la guacharaca sólo había "EggShaker/Maracas/Cabasa". Eso era **incompleto**: VSCO-2-CE
tiene **13 archivos de güiro** (raspados rápidos, lentos, medios y golpes), **claves con 3 capas de
velocidad × 2 round-robins**, congas/tumba/quinto, bongos, maracas, cabasa, agogó, *log drum* y
*ratchet* — todo **CC0 y con CORS verificado**. Y para los timbales, el kit GM de WebAudioFont sí los
tiene (notas 65/66). Ver §8 para las tres correcciones al informe previo.

---

## 1. Tabla por instrumento — URLs directas verificadas

> **ACAO** = valor literal del header `Access-Control-Allow-Origin`.
> **veredicto** = ¿usable HOY desde el navegador?

### 1.1 Caja vallenata — ❌ no existe

Ninguna fuente libre tiene caja vallenata. Ver §2 para los negativos uno por uno.

| Fuente | URL directa del audio | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| VSCO-2-CE (*aprox.* tambor de madera con baquetas) | `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v1_rr1_Sum.wav` (+ `LogDrumHi_MedM_*`, 262 508 B) | 200 | `*` | 194.0 | wav s16 44.1k estéreo | CC0 1.0 | ⚠️ Sustituto. **Nivel bajísimo: max −29.0 dB** (ver §3.1) |
| VSCO-2-CE (*aprox.* parche con baqueta) | `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/VSCO%201%20Percussion/drums/snare/OldSnare/snare_ff.wav` | 200 | `*` | 66.7 | wav s16 44.1k estéreo | CC0 1.0 | ✅ Nivel correcto (max −4.7 dB) |
| FreePats (*aprox.* caja de madera) | `https://raw.githubusercontent.com/freepats/world-percussion/main/samples/CajonFlamenco/101.flac` | 200 | `*` | 40.4 | flac | CC0 1.0 | ⚠️ Es un cajón flamenco, no una caja de dos parches |
| WebAudioFont GM (*aprox.*) | `https://surikov.github.io/webaudiofontdata/sound/12865_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 22.4 | js + mp3 base64 | MIT / FluidR3 | ⚠️ Es un timbal metálico, no una caja de madera |

**Nada de esto es una caja vallenata.** Son aproximaciones tímbricas y hay que decirlo así.

### 1.2 Guacharaca — ⚠️ no existe literal; raspadores equivalentes sí

La guacharaca es **caña raspada con un tenedor de alambre**: el gesto y el timbre son casi idénticos
a los de un **güiro** (calabaza raspada con un palito). Por eso la familia de güiro de VSCO es el
sustituto correcto, no una maraca ni un *egg shaker*.

| Fuente | URL directa del audio | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **VSCO-2-CE** güiro rápido | `.../VSCO-2-CE/master/Percussion/Guiro-Fast_v1_Sum.wav` | 200 | `*` | 260.9 | wav s16 44.1k estéreo | **CC0 1.0** | ⚠️ usable, **requiere +30 dB** (max −32.5 dB) |
| VSCO-2-CE güiro lento | `.../Percussion/Guiro-Slow_v1_Sum.wav` | 200 | `*` | 454.3 | wav | CC0 1.0 | ⚠️ ídem (+30 dB) |
| VSCO-2-CE güiro medio | `.../Percussion/Guiro-M_v1_Sum.wav` | 200 | `*` | 324.1 | wav s16 44.1k estéreo | CC0 1.0 | ⚠️ ídem (+30 dB) |
| VSCO-2-CE güiro golpe | `.../Percussion/Guiro-Hit_v1_rr1_Sum.wav` | 200 | `*` | 228.8 | wav | CC0 1.0 | ⚠️ ídem |
| VSCO-1 güiro corto | `.../VSCO%201%20Percussion/varWood/guiro_short.wav` | 200 | `*` | 91.3 | wav s24 44.1k estéreo | CC0 1.0 | ⚠️ max −30.3 dB |
| VSCO-1 güiro largo | `.../varWood/guiro_long.wav` | 200 | `*` | 150.3 | wav s24 44.1k estéreo | CC0 1.0 | ⚠️ requiere ganancia |
| VSCO-1 güiro muy largo | `.../varWood/guiro_superlong.wav` (+ `long2`, `gurio_long4`, `short2..short5`) | 200 | `*` | 252.2 | wav s24 44.1k estéreo | CC0 1.0 | ⚠️ el mejor para un compás raspado continuo |
| **WebAudioFont GM 73** (guiro corto) | `https://surikov.github.io/webaudiofontdata/sound/12873_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 3.7 | js + mp3 base64 | MIT / FluidR3 | ✅ **2 234 B de content-length**, sin CORS problems |
| **WebAudioFont GM 74** (guiro largo) | `.../sound/12874_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 11.3 | js + mp3 base64 | MIT / FluidR3 | ✅ ídem |
| VSCO-2-CE *ratchet* (traqueteo) | `.../Percussion/Ratchet1-Slow_v1_rr1_Sum.wav` (+ `Ratchet1-Fast…`, `Ratchet1-Crank…`) | 200 | `*` | **1 542.1** | wav s16 44.1k estéreo | CC0 1.0 | ⚠️ otro gesto de raspado — ojo, pesa 1.5 MB |
| Wikimedia Commons (*no es la guacharaca*) | `https://upload.wikimedia.org/wikipedia/commons/a/a7/Guacharaca.ogg` | 200 | `*` | 891.8 | ogg | CC BY-SA 3.0 | ❌ **TRAMPA: es el canto del ave *Ortalis ruficauda*, no el instrumento** |

**Trampa documentada:** `File:Guacharaca.ogg` de Commons **no es el instrumento**. Su descripción real
es *"Noisy call of a pair of Guacharacas (male and female) … in Caraballeda, Venezuela"* y sus
categorías son `Category:Audio files of Ortalis`, `Category:Ortalis ruficauda`, `Category:Birds of
Venezuela`. Si alguien lo hubiera elegido "porque el nombre coincide", habría sampleado un pájaro.

### 1.3 Acordeón vallenato de botones — ✅ sí (y ya lo tenés)

| Fuente | URL directa del audio | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **FreePats Button Accordion HN** (nota) | `https://raw.githubusercontent.com/freepats/button-accordion-HN/main/Button%20Accordion%20HN%20A4.flac` | 200 | `*` | 188.5 | **flac 44.1k estéreo 16 bit, 1.690 s** | **CC0 1.0** (texto literal: *"Creative Commons Legal Code CC0 1.0 Universal"*) | ✅ **USAR — sigue siendo lo mejor** |
| **FreePats Button Accordion HN** (release de fuelle) | `.../button-accordion-HN/main/rel/Button%20Accordion%20HN%20A4_rel.flac` | 200 | `*` | 34.3 | flac | CC0 1.0 | ✅ **el complemento de fuelle que pedías** |
| WebAudioFont GM acordeón | `https://surikov.github.io/webaudiofontdata/sound/0210_GeneralUserGS_sf2_file.js` | **200 (verificado acá)** | `*` | 42.6 (gz) / 75 (blob) | js + mp3 base64 | MIT / GeneralUser GS | ⚠️ acordeón de teclas, sin capas de velocidad |
| WebAudioFont *Tango Accordion* (bandoneón) | `.../sound/0231_JCLive_sf2_file.js` | **200 (verificado acá)** | `*` | 398.0 (gz) / 730 (blob) | js + mp3 base64 | MIT / JCLive | ⚠️ 33 zonas, timbre bandoneón |
| Pianobook `Accordion LA-Melodiosa` | `https://www.pianobook.co.uk/packs/accordion-la-melodiosa/` | 200 | **`''` (vacío)** | — | Decent Sampler + SFZ, en `.zip` | "free for use" (no legible sin login) | ❌ **requiere login + no hay CORS + es un zip** |
| Pianobook `Accordion Double Reed` | `https://www.pianobook.co.uk/packs/accordion-double-reed/` | 200 | **`''` (vacío)** | — | SFZ, en `.zip` | ídem | ❌ ídem |
| Pianobook `Accordion` / `BANDONEON` / `Toy Accordion` | `/packs/accordion/`, `/packs/bandoneon/`, `/packs/toy-accordion/` | 200 | **`''` (vacío)** | — | Decent Sampler, en `.zip` | ídem | ❌ ídem |

**Inventario real del pack CC0** (contado sobre el árbol de GitHub, 38 blobs):
**17 notas** (B3 → G6) + **17 samples de release** + `PRESET Button Accordion HN tuned.sfz` +
`LICENSE.txt` + `README.txt` + `picture.jpg`. ⚠️ **El informe previo decía "34 notas + 34 release
samples": son 17 + 17.** No hay capas de velocidad: una sola dinámica por nota.

### 1.4 Timbales latinos — ✅ sí, vía kit GM

| Fuente | URL directa del audio | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **WebAudioFont GM nota 65 = High Timbale** | `https://surikov.github.io/webaudiofontdata/sound/12865_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 22.4 | js + mp3 base64 | MIT (empaquetado) / FluidR3 GM | ✅ **USAR — verificado acústicamente** |
| **WebAudioFont GM nota 66 = Low Timbale** | `.../sound/12866_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 23.8 | js + mp3 base64 | MIT / FluidR3 GM | ✅ **par alto/bajo verificado** |
| WebAudioFont variantes de kit | `.../12865_8_FluidR3_GM_sf2_file.js`, `_10_`, `_11_`, `_12_`…`_16_`, y fuentes `Chaos_sf2_file`, `JCLive_sf2_file`, `SBLive_sf2` | (existen en el árbol; `_0_` probado) | `*` | — | js | varias | ✅ hay varias kits/fuentes alternativas |
| Wikimedia Commons **timbales reales** | `https://upload.wikimedia.org/wikipedia/commons/6/69/Timbales.ogg` | 200 | `*` | 62.5 | ogg | **CC BY-SA 4.0** | ⚠️ usable con atribución; descripción literal `"Timbales"`, `Category:Timbales` |
| VSCO-2-CE metales | `.../Percussion/Anvil_Hit1_v1_Sum.wav` (centroide 5 620 Hz), `Cowbell1_Hit_v1_rr1_Sum.wav`, `BrakeDrum1_Hammer_v1_Sum.wav` | 200 (los tres) | `*` | 290.5 / 138.0 / 294.7 | wav s16 44.1k estéreo | CC0 1.0 | ⚠️ metal, pero **no son timbales** |
| VSCO-2-CE / Sonatina — timbales | — | — | — | — | — | — | ❌ **NO tienen timbales**; sólo *timpani* orquestal |

### 1.5 Güira / güiro metálico y clave cubana — ✅ sí

| Fuente | URL directa del audio | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **`sfzinstruments/kinwie.dim-cabasa`** (güira metálica) | `https://raw.githubusercontent.com/sfzinstruments/kinwie.dim-cabasa/master/Dim%20Cabasa%20Samples/bw_rr1_01.flac` | 200 | `*` | 43.2 | **flac 48 kHz mono 24 bit**, 0.633 s | **CC BY 4.0** — texto literal: *"Attribution 4.0 International"* | ✅ **mejor güira: 250 FLAC, round-robins** |
| ídem, serie *forward* | `.../Dim%20Cabasa%20Samples/fw_rr1_01.flac` | 200 | `*` | — | flac 48k | CC BY 4.0 | ✅ existe también la serie `fw_` |
| VSCO-2-CE cabasa | `.../VSCO%201%20Percussion/varMetal/various/cabasa_1.wav` (+ `_2`…`_6`, `cabasa_roll1/2` = 543 298 B) | 200 | `*` | 156.7 | wav s24 44.1k estéreo | **CC0 1.0** | ⚠️ max −28.3 dB, requiere ganancia |
| VSCO-2-CE güiro (madera/calabaza) | `.../Percussion/Guiro-Fast_v1_Sum.wav` … (13 archivos, ver §1.2) | 200 | `*` | 91–454 | wav | CC0 1.0 | ⚠️ requiere normalizar |
| **VSCO-2-CE claves (3 vel × 2 RR)** | `.../Percussion/Claves1_Hit_v1_rr1_Sum.wav` (+ `_v1_rr2`, `_v2_rr1`, `_v2_rr2`, `_v3_rr1`, `_v3_rr2`) | 200 | `*` | 195.2 | wav s16 44.1k estéreo | **CC0 1.0** | ⚠️ **max −36.6 dB → necesita +30 dB** |
| VSCO-1 claves (6 dinámicas) | `.../VSCO%201%20Percussion/varWood/claves_ff.wav` (+ `mf`, `mf_2`, `mf_3`, `mp`, `pp1`) | 200 | `*` | 206.6 | wav s24 44.1k estéreo | CC0 1.0 | ✅ **nivel correcto (max −3.7 dB)** |
| **FreePats Claves** | `https://raw.githubusercontent.com/freepats/world-percussion/main/samples/Claves/01.flac` (hay `01`–`04`) | 200 | `*` | 44.5 | **flac 44.1k mono 24 bit**, 0.524 s | **CC0 1.0** | ✅ **max 0.0 dB — nivel perfecto** |
| WebAudioFont GM 75 = Claves | `.../sound/12875_0_FluidR3_GM_sf2_file.js` | 200 | `*` | **2.2** | js + mp3 base64 | MIT / FluidR3 | ✅ el más liviano de todos |
| FreePats Maracas | `.../world-percussion/main/samples/Maracas/01_01.flac` (y `01_02` = 46 036 B) | 200 | `*` | 43.4 | flac 48k mono 24 bit | CC0 1.0 | ✅ **max 0.0 dB — nivel perfecto** |
| FreePats Conga / Bongos | `.../samples/Conga/v2_01_01.flac`, `.../samples/Bongos/1_01.flac` | 200 | `*` | 28.6 / 48.1 | flac | CC0 1.0 | ✅ |
| Wikimedia Commons **güiro real** | `https://upload.wikimedia.org/wikipedia/commons/0/01/Guiro.ogg` | **200 (×2)** | `*` | 279.2 | ogg | **Public domain** | ✅ descripción literal `"Modern plastic guiro"`, `Category:Güiro`, `Category:Latin music` |
| Wikimedia Commons shekere | `https://upload.wikimedia.org/wikipedia/commons/b/b3/Shekere.ogg` | 429 (throttling) | `*` | 612.3 | ogg | "Copyrighted free use" | ⚠️ licencia ambigua |
| Sonatina cabasa (orquesta) | `.../peastman/sso/master/Sonatina%20Symphonic%20Orchestra/Samples/Percussion/cabasa-a.wav` | 200 | `*` | — | wav | CC Sampling Plus 1.0 (obsoleta) | ⚠️ licencia dudosa |

### 1.6 Tres cubano / requinto / guitarra de son — ❌ no existe

| Fuente | URL directa | HTTP | ACAO literal | KB | Formato | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **FreePats `spanish-classical-guitar`** (*sustituto*) | `https://raw.githubusercontent.com/freepats/spanish-classical-guitar/main/samples/A4.flac` (y `samples/A%231.flac` = 302 163 B, verificado) | 200 | `*` | 102.1 | flac | **CC0 1.0** — README literal: *"Published under the terms of Creative Commons CC0 public domain dedication"* | ✅ **mejor base para un tres** (50+ notas A#1–C6) |
| **FreePats `ukulele1`** (*sustituto* requinto) | `https://raw.githubusercontent.com/freepats/ukulele1/main/samples/A4.flac` (y `samples/C4.flac` = 287 928 B, verificado) | 200 | `*` | — | flac | CC0 1.0 (`LICENSE.txt` 2 826 B, 200) | ✅ registro pequeño de nylon; trae `chuck.wav` y `body-tap.flac` |
| WebAudioFont GM 0240 nylon | `.../sound/0240_FluidR3_GM_sf2_file.js` | **200 (verificado acá)** | `*` | 322.8 (gz) / 437 (blob) | js | MIT / FluidR3 | ⚠️ nylon genérico |
| Comunidad (6 búsquedas) | `api.github.com/search/repositories?q=tres+cubano+sfz` → `total_count: 0`; `requinto+sfz` → 0; `cuatro+venezolano+samples` → 0; `bandoneon+sfz` → 0; `accordion+sfz+free` → 0; `decent+sampler+latin+percussion` → 0 | 200 | `*` | — | — | — | ❌ **no existe ninguna librería libre** |

---

## 2. Negativos verificados, fuente por fuente

Estos son los resultados **duros** de haber buscado en serio. Un "no hay" verificado vale tanto como
un "hay".

### 2.1 GitHub

| Búsqueda | Endpoint real | Resultado |
|---|---|---|
| Repos `guacharaca` | `api.github.com/search/repositories?q=guacharaca` | `total_count: 4` — **ninguno es audio**: `corporacionsantina-jpg/guacharaca` (app TS, "box", 15 archivos, 0 WAV), `TooManyWishes/guacharaca-proyecto`, `guacharacatv1925/guacharaca-tv`, `raulmarrugom/TopDownGuacharaca` (juego) |
| Repos `caja vallenata` | `…?q=caja+vallenata` | `total_count: 0` |
| Repos `vallenato` | `…?q=vallenato` | 63 repos, todos webs/apps de música (ej. `switchroyale/vallenato.js`, MIT) — **cero sample packs** |
| Repos `acordeon vallenato` | `…?q=acordeon+vallenato` | 3 repos: `ionneox/vallenato` (CSS, 7 archivos, 0 audio, verificado uno por uno), `andreselcientifico/vallenato-acordeon-maestro`, `e2jk/vallenato.fr` |
| Repos `latin percussion sfz` | `…?q=latin+percussion+sfz` | `total_count: 0` |
| Repos `timbales percussion` | `…?q=timbales+percussion` | 1 repo: `mikea/timbales` — **147 archivos LilyPond** (partituras), 0 samples |
| Repos `tres cubano` | `…?q=tres+cubano` | 2 repos, ninguno de audio |
| **Code search** `guacharaca` | `api.github.com/search/code?q=guacharaca` | ❌ **401 Unauthorized** — el code search exige autenticación. **No se pudo usar.** Reportado tal como pasó |
| **Code search** `caja vallenata` | `…/search/code?q=caja+vallenata` | ❌ **401 Unauthorized** |

### 2.2 Organización `freepats` — 45 repos, revisados todos

Listado completo vía `api.github.com/orgs/freepats/repos?per_page=100`. **No hay ningún repo de
percusión latina ni colombiana.** Lo único relevante:

| Repo | Licencia | Contenido real |
|---|---|---|
| `world-percussion` | CC0-1.0 | Carpetas: `Bongos`, `CajonFlamenco`, `Castanets`, `Claves`, `Conga`, `Darbuka`, `EggShaker`, `HandClap`, `HighConga`, `LowConga`, `Maracas`, `MutedConga`, `MutedLowConga`, `Tambourine`. **NO hay**: guiro, güira, cabasa, timbales, caja, guacharaca |
| `button-accordion-HN` | CC0-1.0 | 17 notas + 17 releases (ver §1.3) |
| `spanish-classical-guitar` | CC0-1.0 | 56 archivos, notas A#1–C6 |
| `ukulele1` | CC0-1.0 | 18 archivos, 13 notas + `chuck.wav` + `body-tap.flac` |
| `colomboADK` | **GPL-2.0** | ⚠️ **ojo: "Colombo" es la marca del kit de batería, NO es música colombiana.** 85 FLAC de una batería rock: `BassDrum`, `ClosedHiHat`, `Cymbal16iCrash`, `HiTom`, `MidTom`, `LowTom`… **Cero percusión latina**, y GPL-2.0 sobre samples es problemático para una app web |
| `timpani` | CC0-1.0 | timpani orquestal, no timbales |
| `synthesizer-percussion`, `muldjordkit`, `glass`, `hang-D-minor`, 30+ sintetizadores | varias | irrelevantes para este pedido |

### 2.3 Organización `sfzinstruments` — 76 repos, revisados todos

⚠️ **Aviso: son 76 repos y en la lista completa no hay ni un acordeón, ni un bandoneón, ni un
instrumento latinoamericano** salvo los que siguen:

| Repo | Licencia | Qué es |
|---|---|---|
| **`kinwie.dim-cabasa`** | **CC BY 4.0** | ✅ **250 FLAC de cabasa** (48 kHz / 24 bit), round-robins `fw_rr1..N` y `bw_rr1..N` + un `.sfz`. **El mejor hallazgo de esta ronda para güira** |
| `jlearman.SteelDrum` | Unlicense | steel drum cromático (C tenor) |
| `Kastendieck.SteelDrum` | (sin licencia declarada) | steel drum, 3 capas de velocidad |
| `body_percussion` | CC0-1.0 | percusión corporal |
| `karoryfer.frankensnare` | CC0-1.0 | colección de cajas (redoblantes rock) |
| `mappings` | (sin licencia) | sólo mapeos SFZ, sin samples |
| ❌ `tres cubano`, `requinto`, `bandoneon`, `accordion`, `vallenato`, `cumbia`, `timbales`, `guiro`, `clave`, `conga`, `bongo` | — | **0 repos** |

### 2.4 `archive.org` — tiene CORS, pero NO tiene samples

**Hallazgo que corrige al informe previo: archive.org SÍ manda CORS.** Ver §6.2 para los headers
literales. El problema es otro: **no hay sample packs**, sólo álbumes de música.

| Consulta (`advancedsearch.php`) | HTTP | ACAO | `numFound` | Qué devuelve realmente |
|---|---|---|---|---|
| `guacharaca` | 200 | `*` | 112 | Álbumes de **vallenato** (`vallenato-hermanos-zuleta`, `vallenato-los-diablitos`, …) y cumbia |
| `caja vallenata` | 200 | `*` | 92 | Los mismos álbumes de vallenato |
| `vallenato samples` | 200 | `*` | **1** | `lp_joyas-de-la-musica-colombiana-volumen-4…` — un LP, no samples |
| `timbales percussion` | 200 | `*` | 86 | Jazz/soundtracks (Al Di Meola, Ray Barretto) — música |
| `guiro percussion` | 200 | `*` | 46 | Modelos 3D de Thingiverse + álbumes. **Ningún sample pack** |
| `clave cubana percussion` | 200 | `*` | **0** | — |
| `tres cubano` | 200 | `*` | 86 | Noticieros y programas de radio |
| `acordeon vallenato` | 200 | `*` | 106 | Álbumes de vallenato / cumbias con acordeón |
| `latin percussion samples` | 200 | `*` | 58 | Bandas sonoras, Congo, jazz |
| `cumbia samples` | 200 | `*` | 12 | Álbumes y compilaciones |

Se inspeccionó además `archive.org/metadata/<id>` de 14 ítems candidatos (hasta 116 archivos cada
uno): **todos son `.mp3` de canciones o FLAC de álbumes**. Ni un `.wav`, `.sfz`, `.sf2` ni `.zip` de
samples entre los archivos "interesantes".

### 2.5 Pianobook — 4 barreras, ninguna salvable

Investigar Pianobook requirió descubrir que es WordPress con un CPT propio (`pb_samplepacks`).
Lo que se verificó:

1. **`Access-Control-Allow-Origin` vacío en absolutamente todas las respuestas** de
   `www.pianobook.co.uk` (home, `/wp-json/...`, sitemap, fichas de pack). → no se puede `fetch` desde
   el navegador.
2. **La descarga exige login.** Las fichas dicen literalmente **"Log in to download"** y
   **"Create an account for free"**, con enlaces reales a
   `https://www.pianobook.co.uk/members/login?redirect_url=…` y `/members/register`.
3. **El ZIP no aparece por ningún lado accesible.** El REST API del CPT **no expone la URL de
   descarga**: los campos `acf` visibles son sólo mensajes de rechazo (`rejection_detail_*`). La
   media adjunta al pack son sólo dos imágenes (`34638-featured-image.jpg`, un PNG).
4. **Los formatos son de sampler**: la taxonomía `pb_formats` ofrece *Decent Sampler, Kontakt, EXS24,
   SFZ*. Los packs de acordeón son:
   `Accordion` → Decent Sampler · `Accordion Double Reed` → SFZ · `Accordion LA-Melodiosa` →
   Decent Sampler + SFZ · `BANDONEON` → Decent Sampler · `Toy Accordion` → Decent Sampler.
   ⇒ los WAV viven **dentro de un `.zip`**, no tienen URL directa.

**Y no hay nada colombiano.** Sobre 21 taxonomías de instrumento (`pb_instruments`) y sus categorías
(`Drums & Perc` = 211 packs, `Metallic` = 94, `Other` = 109, `Found Sounds` = 338) la búsqueda por
`vallenato`, `caja`, `guacharaca`, `cumbia`, `timbales`, `clave`, `guiro`, `colombia`, `tropical`,
`latin percussion`, `melodeon`, `bandoneon`, `button accordion` da **0 resultados** en el CPT (los
`status=400` son el CPT rechazando el parámetro `search`; los `200` con `x-wp-total=0` son negativos
limpios). Las únicas coincidencias latinas en 745 packs revisados fueron **`Dacr Shaker`** (un
shaker) y **`Trompeta Latina`** (una trompeta).

### 2.6 Freesound — no es usable, y punto

| Endpoint probado | HTTP | ACAO literal | Resultado |
|---|---|---|---|
| `freesound.org/apiv2/search/text/?query=guacharaca` | **401** | `''` | `{"detail":"Authentication credentials were not provided."}` |
| `…/apiv2/search/text/?query=caja%20vallenata` | **401** | `''` | ídem |
| `…/apiv2/search/text/?query=guacharaca&filter=license:"Creative Commons 0"` | **401** | `''` | ídem — **no se puede ni siquiera filtrar por CC0** |
| `freesound.org/search/?q=guacharaca` (HTML) | 200 | `''` | HTML sin CORS, y **sin IDs de sonido ni rutas `data-previews`** → no es raspa-ble |
| `freesound.org/search/?q=timbales&f=license:"Creative Commons 0"` | 200 | `''` | ídem |
| `freesound.org/data/previews/1/1000_1-lq.mp3` | **404** | **`*`** | La ruta de previews **sí tiene CORS**, pero los IDs son impredecibles |
| `freesound.org/data/previews/500/500000_1000000-lq.mp3` | **404** | **`*`** | ídem |
| `cdn.freesound.org/` | 200 | `''` | existe, sin CORS |

**Conclusión: Freesound NO se puede proponer como usable.** El API exige token OAuth2 (401 sin él),
la web no manda CORS y no es raspa-ble, y no hay forma de enumerar IDs de preview válidos sin el API.
El único resquicio (la ruta `/data/previews/` manda `ACAO: *`) es inutilizable en la práctica porque
requiere conocer el ID de antemano, y esos IDs sólo salen del API autenticado.

### 2.7 VSCO-2-CE / Sonatina / tonejs-instruments — respuesta a la pregunta puntual

| Librería | ¿caja vallenata? | ¿guacharaca? | ¿timbales latinos? | Otro latino que SÍ tiene |
|---|---|---|---|---|
| **VSCO-2-CE** | ❌ no | ❌ no (pero **13 archivos de güiro** ≈ guacharaca) | ❌ **no** (sólo `Timpani/*` orquestal, 38 archivos) | ✅ **claves (3 vel × 2 RR), conga, quinto, tumba, bongos, maraca (6), cabasa (8), agogó (10), shaker (8), log drum, cowbell, anvil, ratchet** |
| **Sonatina (peastman/sso)** | ❌ no | ❌ no | ❌ no (sólo `Timpani.sfz`, 36 archivos) | ⚠️ `Conga.sfz` (6 wav `conga-mut/opn/slp-rr1/2`), `cabasa-a/b.wav`, `shaker-*.wav` (7) |
| **tonejs-instruments** | ❌ no | ❌ no | ❌ no | ❌ **0 coincidencias** de todo el vocabulario latino en sus 1 358 blobs. Sólo 20 instrumentos melódicos, ninguno de percusión latina |

### 2.8 WebAudioFont — acá sí está lo que faltaba

El índice oficial `https://surikov.github.io/webaudiofontdata/sound/` **no lista los kits de
batería**, pero existen y están indexados por `128<nota>_<kit>_<fuente>_sf2_file.js`. Se verificaron
**15 notas latinas** del kit 0 con fuente `FluidR3_GM`, **todas 200 y `ACAO: *`**:

| Nota MIDI GM | Instrumento (estándar GM) | Archivo | HTTP | ACAO | content-length |
|---|---|---|---|---|---|
| 60 | High Bongo | `12860_0_FluidR3_GM_sf2_file.js` | 200 | `*` | 5 525 B |
| 61 | Low Bongo | `12861_0_…` | 200 | `*` | 6 625 B |
| 62 | Mute High Conga | `12862_0_…` | 200 | `*` | 4 841 B |
| 63 | Open High Conga | `12863_0_…` | 200 | `*` | 11 167 B |
| 64 | Low Conga | `12864_0_…` | 200 | `*` | 10 242 B |
| **65** | **High Timbale** | `12865_0_…` | 200 | `*` | **22 894 B** |
| **66** | **Low Timbale** | `12866_0_…` | 200 | `*` | **24 398 B** |
| 67 / 68 | High / Low Agogo | `12867_0_…` / `12868_0_…` | 200 | `*` | 5 405 / 7 395 B |
| 70 | Maracas | `12870_0_…` | 200 | `*` | 3 525 B |
| **73 / 74** | **Short / Long Guiro** | `12873_0_…` / `12874_0_…` | 200 | `*` | **3 756 / 11 568 B** |
| **75** | **Claves** | `12875_0_…` | 200 | `*` | **2 234 B** |
| 78 / 79 | Mute / Open Cuica | `12878_0_…` / `12879_0_…` | 200 | `*` | 23 076 / 29 479 B |

**No existe ningún archivo de caja vallenata, guacharaca ni güira en el kit GM**, porque esos
instrumentos no están en el estándar General MIDI.

---

## 3. Verificación ACÚSTICA (no me creas el nombre del archivo)

Cada archivo se decodificó con `ffmpeg` y se midió. Esto es lo que permite afirmar que la nota 65
del kit GM **es** un timbal y no un tom.

| Muestra | dur (s) | peak | ZCR (/s) | centroide | f0 | Lectura |
|---|---|---|---|---|---|---|
| GM 60 High Bongo | 0.315 | 1.000 | 2 559 | 2 066 Hz | **919 Hz** | tambor de mano agudo ✓ |
| GM 61 Low Bongo | 0.389 | 1.000 | 1 802 | 1 625 Hz | **613 Hz** | **más grave que 60** ✓ (par correcto) |
| GM 62 Mute Hi Conga | 0.273 | 0.889 | 2 225 | 1 824 Hz | 848 Hz | apagado = corto y agudo ✓ |
| GM 63 Open Hi Conga | 0.709 | 0.920 | **815** | 635 Hz | 276 Hz | abierto = largo y resonante ✓ |
| GM 64 Low Conga | 0.639 | 1.000 | 810 | 694 Hz | **253 Hz** | **más grave que 63** ✓ |
| **GM 65 High Timbale** | **1.483** | 0.978 | **2 416** | **2 326 Hz** | **266 Hz** | **anillo metálico largo + mucho ruido** ✓ |
| **GM 66 Low Timbale** | **1.602** | 0.947 | 2 291 | **1 979 Hz** | **200 Hz** | **mismo carácter, más grave y más oscuro** ✓ |
| GM 70 Maracas | 0.106 | 0.602 | **11 423** | **7 836 Hz** | — | ráfaga de ruido de banda ancha ✓ |
| GM 73 Short Guiro | **0.213** | 1.000 | 5 743 | 4 553 Hz | — | raspado ruidoso **corto** ✓ |
| GM 74 Long Guiro | **0.500** | 1.000 | 6 720 | 4 179 Hz | — | mismo timbre, **2.35× más largo** ✓ |
| GM 75 Claves | **0.104** | 0.986 | 4 423 | 2 760 Hz | — | click cortísimo ✓ |
| GM 78 Mute Cuica | 1.567 | 0.998 | 1 303 | 877 Hz | 596 Hz | "voz" de tambor de fricción ✓ |
| GM 79 Open Cuica | 1.862 | 1.000 | 882 | 485 Hz | 286 Hz | par mute/open coherente ✓ |
| VSCO Guiro-Fast | 1.514 | **0.016** | 3 053 | 3 576 Hz | — | raspa ruidosa — **pero a −36 dB** ⚠️ |
| VSCO Guiro-Slow | 2.637 | **0.003** | 3 205 | 3 211 Hz | — | ídem |
| VSCO Claves1_Hit | 1.132 | **0.009** | 2 568 | 2 576 Hz | 668 Hz | ídem |
| VSCO Conga-HitN | 1.048 | 0.017 | 646 | 507 Hz | **83 Hz** | conga grave, tonal ✓ |
| VSCO Tumba-HitN | 0.706 | 0.001 | 1 351 | 3 224 Hz | **70 Hz** | la más grave de las tres ✓ |
| VSCO LogDrumLo | 1.126 | 0.035 | 569 | **489 Hz** | 92 Hz | **madera seca** — el más parecido a una caja |
| VSCO Anvil_Hit1 | 1.686 | 0.005 | 5 640 | **5 620 Hz** | 152 Hz | metal puro |
| VSCO Cowbell1 | 0.801 | 0.020 | 2 171 | 1 966 Hz | 232 Hz | campana |
| VSCO snare_ff | 0.387 | **0.546** | 4 230 | 3 646 Hz | 214 Hz | parche con baqueta, nivel correcto |
| VSCO maraca1 | 0.530 | 0.043 | **10 223** | 6 391 Hz | — | ruido de banda ancha ✓ |
| VSCO cabasa_1 | 0.606 | 0.020 | 9 699 | **6 688 Hz** | — | **raspador metálico** ✓ |
| VSCO guiro_short | 0.353 | 0.019 | 4 668 | 3 460 Hz | — | raspa corta ✓ |
| VSCO claves_ff | 0.800 | 0.343 | 7 036 | 5 521 Hz | 817 Hz | claves con nivel correcto ✓ |
| FreePats Claves_01 | 0.524 | 0.854 | 8 631 | 5 219 Hz | 469 Hz | claves, nivel correcto ✓ |
| FreePats Maracas_01_01 | 0.372 | 0.839 | 8 042 | 4 771 Hz | — | maraca, nivel correcto ✓ |
| **Cabasa_bw_rr1_01** | 0.633 | 0.064 | 6 245 | **7 073 Hz** | — | **raspador metálico brillante** ✓ |

**Cómo leer la prueba de los timbales:** las notas 65 y 66 son un **par coincidente** — mismo
carácter (ZCR ~2 300–2 400 /s, decaimiento largo de ~1.5 s, mucho contenido inarmónico), pero 66 es
sistemáticamente más grave (f0 200 vs 266 Hz) y más oscura (centroide 1 979 vs 2 326 Hz). Eso es
exactamente la firma de un par de timbales alto/bajo. Un tom daría ZCR bajo y f0 estable; un plato
daría centroide mucho más alto y sin f0. **Coincide además con el estándar General MIDI**, donde la
nota 65 es High Timbale y la 66 es Low Timbale, y con la verificación previa de que este esquema de
archivos usa `keyRangeLow` = el número de nota del nombre.

### 3.1 ⚠️ Aviso de niveles: VSCO-2-CE viene SIN normalizar

Esto es un problema práctico real y no está documentado en el informe previo. Medido con
`ffmpeg -af volumedetect`:

| Archivo | `max_volume` | Ganancia necesaria |
|---|---|---|
| `Percussion/Claves1_Hit_v1_rr1_Sum.wav` | **−36.6 dB** | **+36 dB** |
| `Percussion/Guiro-Fast_v1_Sum.wav` | **−32.5 dB** | **+32 dB** |
| `VSCO 1 Percussion/varWood/guiro_short.wav` | −30.3 dB | +30 dB |
| `Percussion/LogDrumLo_MedM_v1_rr1_Sum.wav` | **−29.0 dB** | **+29 dB** |
| `VSCO 1 Percussion/varMetal/various/cabasa_1.wav` | −28.3 dB | +28 dB |
| `sfzinstruments/kinwie.dim-cabasa` `bw_rr1_01.flac` | **−20.1 dB** | **+20 dB** |
| `VSCO 1 Percussion/varWood/claves_ff.wav` | **−3.7 dB** | ✅ correcto |
| `VSCO 1 Percussion/drums/snare/OldSnare/snare_ff.wav` | **−4.7 dB** | ✅ correcto |
| FreePats `world-percussion/.../Claves/01.flac` | **0.0 dB** | ✅ correcto |
| FreePats `world-percussion/.../Maracas/01_01.flac` | **0.0 dB** | ✅ correcto |
| FreePats `Button Accordion HN A4.flac` | **0.0 dB** | ✅ correcto |

⇒ **Toda la carpeta `Percussion/` de la raíz de VSCO (la de los `_Sum.wav`) está a ~−30 dB.** Hay que
normalizar en build (o meter un `Tone.Gain` de ~+30 dB por sample) o el resultado va a sonar
inaudible al lado del acordeón. Formatos: la raíz `Percussion/` es **wav PCM 16 bit 44.1 kHz
estéreo**; `VSCO 1 Percussion/` es **wav PCM 24 bit 44.1 kHz estéreo**.

---

## 4. Packs comprimidos y samplers específicos (lo que NO se puede consumir)

| Recurso | URL | HTTP | ACAO literal | Tamaño | Formato | ¿Los WAV internos tienen URL directa? |
|---|---|---|---|---|---|---|
| FreePats ButtonAccordionHN (SFZ+WAV) | `https://github.com/freepats/button-accordion-HN/releases/download/2024-03-29/ButtonAccordionHN-SFZ%2BWAV-20240329.7z` | 302 → 200 | **`''`** (vacío, host final `release-assets.githubusercontent.com`) | 5.74 MB (6 020 026 B) | `.7z` | ❌ **No.** El `.7z` no se puede bajar desde el navegador (sin CORS) y el browser no descomprime 7z. **Sí se pueden bajar los FLAC sueltos del repo** (`raw.githubusercontent.com`, con CORS) |
| FreePats WorldPercussion (SF2) | `https://github.com/freepats/world-percussion/releases/download/2020-09-05/WorldPercussion-SF2-20200905.7z` | 302 → 200 | **`''`** (vacío) | 4.86 MB (5 100 075 B) | `.7z` | ❌ No. Pero los FLAC sueltos del repo **sí** |
| FreePats General MIDI (SF2) | `https://freepats.zenvoid.org/SoundSets/FreePats-GeneralMIDI/FreePatsGM-SF2-20221026.7z` | 200 | **`''`** (vacío) | **226.7 MB** (237 775 919 B) | `.7z` | ❌ No |
| FreePats GM Percussion | `https://freepats.zenvoid.org/SoundSets/GM-PercussionSet/FreePatsGM-Percussion-SF2-20200822.tar.xz` | 200 | **`''`** (vacío) | **14.9 MB** (15 610 628 B) | `.tar.xz` | ❌ No |
| **Pianobook — cualquier pack** | `https://www.pianobook.co.uk/packs/<slug>/` | 200 | **`''`** (vacío) | — | `.zip` con `.dspreset`/`.sfz`/Kontakt | ❌ **No.** Detrás de login ("Log in to download") + sin CORS + es un zip |
| Sonatina Symphonic Orchestra | `https://github.com/peastman/sso` (repo) | 200 | `*` (en `raw.githubusercontent.com`) | — | `.sfz` + `.wav`/`.flac` sueltos | ✅ **Sí**, los samples están sueltos en el repo y se bajan con CORS |

**Resumen de la regla:** todo lo que sea `.7z` / `.tar.xz` / `.zip` de GitHub **Releases** o de
`freepats.zenvoid.org` está **muerto** para el navegador. Lo que vive dentro del **árbol del repo**
(`raw.githubusercontent.com`) **sí** es consumible, archivo por archivo.

---

## 5. Alternativa: transcribir desde los álbumes de archive.org

Como no hay samples, existe un camino legítimo pero laborioso: archive.org tiene ~1000 canciones de
vallenato con CORS real (§6.2). De un álbum se pueden **cortar one-shots** de caja y guacharaca
aislando golpes en los pasajes donde el instrumento suena solo. Requisitos: verificar la licencia de
cada ítem (archive.org aloja mucho material con copyright; los ítems de "Vallenato HERMANOS ZULETA"
etc. son subidas de usuarios sin licencia libre declarada) → **este camino NO es recomendable
legalmente sin revisar ítem por ítem**, y por eso no lo propongo como solución.

---

## 6. Evidencia cruda — verificaciones literales

### 6.1 `raw.githubusercontent.com` — `ACAO: *` en el 100 % de los casos

Salida literal del script de sondeo (formato: `status | ACAO | content-type | content-length | bytes descargados | magic`):

```
200 | ACAO:"*" | audio/wav  | 267144B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Guiro-Fast_v1_Sum.wav
200 | ACAO:"*" | audio/wav  | 465236B | got=65536B magic=RIFFL...WAVE | .../VSCO-2-CE/master/Percussion/Guiro-Slow_v1_Sum.wav
200 | ACAO:"*" | audio/wav  | 234316B | got=65536B magic=RIFFD...WAVE | .../VSCO-2-CE/master/Percussion/Guiro-Hit_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 199848B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Claves1_Hit_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 185024B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Conga-HitN_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 124652B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Tumba-HitN_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 117192B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Quinto-HitN_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 198684B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/LogDrumLo_MedM_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 297488B | got=65536B magic=RIFF....WAVE | .../VSCO-2-CE/master/Percussion/Anvil_Hit1_v1_Sum.wav
200 | ACAO:"*" | audio/wav  | 141332B | got=65536B magic=RIFF.(..WAVE | .../VSCO-2-CE/master/Percussion/Cowbell1_Hit_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  | 214590B | got=65536B magic=RIFF6F..WAVE | .../VSCO%201%20Percussion/drums/other/Bongos/HighBongo1.wav
200 | ACAO:"*" | audio/wav  | 140170B | got=65536B magic=RIFF.#..WAVE | .../VSCO%201%20Percussion/varWood/maraca1.wav
200 | ACAO:"*" | audio/wav  | 160438B | got=65536B magic=RIFF.r..WAVE | .../VSCO%201%20Percussion/varMetal/various/cabasa_1.wav
200 | ACAO:"*" | audio/wav  |  93460B | got=65536B magic=RIFF.m..WAVE | .../VSCO%201%20Percussion/varWood/guiro_short.wav
200 | ACAO:"*" | audio/wav  | 211600B | got=65536B magic=RIFF.:..WAVE | .../VSCO%201%20Percussion/varWood/claves_ff.wav
200 | ACAO:"*" | audio/wav  | 290278B | got=65536B magic=RIFF.m..WAVE | .../VSCO%201%20Percussion/varMetal/various/agogoBell3_ff_1.wav
200 | ACAO:"*" | audio/wav  |  68310B | got=65536B magic=RIFF....WAVE | .../VSCO%201%20Percussion/drums/snare/OldSnare/snare_ff.wav
200 | ACAO:"*" | audio/wav  | 246448B | got=65536B magic=RIFF....WAVE | .../VSCO%201%20Percussion/drums/other/ethnic/congo/open/ethnicHighOpen_hit_f_1.wav
200 | ACAO:"*" | text/plain |   2560B | got= 6555B               | .../VSCO-2-CE/master/LICENSE        -> "CC0 1.0 Universal"
200 | ACAO:"*" | audio/flac |  44257B | got=44257B magic=fLaC...".... | .../kinwie.dim-cabasa/master/Dim%20Cabasa%20Samples/bw_rr1_01.flac
200 | ACAO:"*" | audio/flac |  45553B | got=45553B magic=fLaC...".... | .../freepats/world-percussion/main/samples/Claves/01.flac
200 | ACAO:"*" | audio/flac |  44402B | got=44402B magic=fLaC...".... | .../freepats/world-percussion/main/samples/Maracas/01_01.flac
200 | ACAO:"*" | audio/flac |  29268B | got=29268B magic=fLaC...".... | .../freepats/world-percussion/main/samples/Conga/v2_01_01.flac
200 | ACAO:"*" | audio/flac |  49247B | got=49247B magic=fLaC...".... | .../freepats/world-percussion/main/samples/Bongos/1_01.flac
200 | ACAO:"*" | audio/flac |  41371B | got=41371B magic=fLaC...".... | .../freepats/world-percussion/main/samples/CajonFlamenco/101.flac
200 | ACAO:"*" | audio/flac | 193038B | got=65536B magic=fLaC...".... | .../freepats/button-accordion-HN/main/Button%20Accordion%20HN%20A4.flac
200 | ACAO:"*" | audio/flac |  35125B | got=35125B magic=fLaC...".... | .../freepats/button-accordion-HN/main/rel/Button%20Accordion%20HN%20A4_rel.flac
200 | ACAO:"*" | audio/flac | 104527B | (HEAD)                   | .../freepats/spanish-classical-guitar/main/samples/A4.flac
200 | ACAO:"*" | (HEAD)     |        |                          | .../freepats/ukulele1/main/samples/A4.flac
200 | ACAO:"*" | text/plain |   2826B |                          | .../freepats/ukulele1/main/LICENSE.txt
```

### 6.2 `archive.org` — **SÍ manda CORS** (corrección al informe previo)

Salida literal mostrando **los dos saltos** del redirect:

```
URL: https://archive.org/download/vallenato-hermanos-zuleta/039%20-%20HERMANOS%20ZULETA%20(Alejandro%20Duran).mp3
   HEAD(manual)   status=302 ACAO='*' server=nginx/1.31.3 loc=https://ia800405.us.archive.org/34/items/vallenato-hermanos-zuleta/039...
   HEAD(follow)   status=200 ACAO='*' server=nginx/1.31.3 loc=
   GET            content-length=7011046B  got=65536B magic=ID3.....!.TA

URL: https://archive.org/download/vallenato-norberto/NOCHE%20SIN%20LUNA%20-%20NORBERTO%20ROMERO%20Y%20SU%20CONJUNTO.mp3
   HEAD(manual)   status=302 ACAO='*' server=nginx/1.31.3 loc=https://ia803105.us.archive.org/0/items/vallenato-norberto/NOCHE%20SIN...
   HEAD(follow)   status=200 ACAO='*' server=nginx/1.31.3 loc=

URL: https://archive.org/download/vallenato-hermanos-zuleta        <-- SIN nombre de archivo
   HEAD(manual)   status=200 ACAO=''   server=nginx/1.31.3 loc=   <-- listado HTML: SIN CORS
```

Otras 10 descargas de archivo de archive.org, todas `200` + `ACAO:"*"`:

```
200 | ACAO:"*" | audio/mpeg |  5998995B -> ia803209.us.archive.org | .../la-cumbia-electronica-3_202405/1.Dj%20Pucho%20Mastermix%20-%20Cumbia%20Ziriguidum%202015%20(Edit).mp3
200 | ACAO:"*" | audio/mpeg |  4403160B -> ia800803.us.archive.org | .../vallenato-combinacion-vallenata/A%20pesar%20de%20todo%20-%20La%20Combinacion%20Vallenata.mp3
200 | ACAO:"*" | audio/mpeg | 10080256B -> ia902805.us.archive.org | .../vallenato-los-diablitos/Como%20aquel%20pajarito%20-%20Los%20Diablitos,%20Canta%20Alex%20Manga.mp3
200 | ACAO:"*" | audio/mpeg | 12472960B -> ia600605.us.archive.org | .../vallenato-los-inquietos/AHORA%20QUE%20TE%20VAS%20-%20LOS%20INQUIETOS%20-%201997.mp3
200 | ACAO:"*" | audio/mpeg |  6855221B -> ia803105.us.archive.org | .../vallenato-norberto/NOCHE%20SIN%20LUNA%20-%20NORBERTO%20ROMERO%20Y%20SU%20CONJUNTO.mp3
200 | ACAO:"*" | audio/mpeg |  6689776B -> ia601407.us.archive.org | .../vallenato-miguel-fuentes/AUNQUE%20ME%20DUELA%20-%20LUIS%20MIGUEL%20Y%20SU%20GRUPO%20ELIT%20-%201998.mp3
200 | ACAO:"*" | audio/mpeg | 11389917B -> ia802805.us.archive.org | .../vallenato-decision-vallenata/AMOR%20SIN%20FRONTERAS%20-%20ERICK%20ESCOBAR,...%201999.mp3
200 | ACAO:"*" | audio/mpeg |  8142078B -> ia800401.us.archive.org | .../vallenato-david-henriquez/MAL%20DE%20AMOR%20-%20DAVID%20HENRIQUEZ%20Y%20LUIS%20OROZCO%20(Juan%20Del%20Viar)%201984.mp3
200 | ACAO:"*" | audio/mpeg |  6836517B -> ia800902.us.archive.org | .../vallenato-dionisio-diaz/MI%20VERDADERO%20AMOR%20-%20DIOMEDES%20DIONISIO%20DIAZ%20Y%20ROLANDO%20OCHOA%20-%20Paseo%20...mp3
200 | ACAO:"*" | audio/flac | 18883568B -> dn711105.ca.archive.org | .../vtcl-60018/2008%20-%20Bamboo%20Blade%20O.S.T.%202%20.../01.%206%201_2.flac
403 | ACAO:''   | text/html  |          .../lp_joyas-de-la-musica-colombiana-volumen-4_.../disc1/01.01.%20Los%20Cucaracheros.mp3   <-- ítem restringido
```

> **Conclusión literal:** `archive.org/download/<id>/<archivo>` → **302 con `ACAO: *`**, y el host
> final `ia*.us.archive.org` → **200 con `ACAO: *`**. Ambos saltos mandan CORS.
> El **listado de directorio** (sin nombre de archivo) y los ítems restringidos **no** mandan CORS.

### 6.3 `upload.wikimedia.org` — `ACAO: *` (verificado 200 y 429)

```
200 | ACAO:"*" | application/ogg | 285937B | (HEAD, dos veces) | .../wikipedia/commons/0/01/Guiro.ogg
200 | ACAO:"*" | application/ogg |  63989B | (HEAD)             | .../wikipedia/commons/6/69/Timbales.ogg
200 | ACAO:"*" | application/ogg | 285937B | GET got=65536B magic=OggS........  | .../Guiro.ogg
200 | ACAO:"*" | application/ogg |  63989B | GET got=63989B magic=OggS........  | .../Timbales.ogg
429 | ACAO:"*" | text/html      |   2254B | Shekere.ogg, Eggshaker.ogg, Accordion_registers.ogg, Accordion_chords-01.ogg, Ritmo_cumbia_batería_santiago.ogg
```

> Los `429` son **rate-limiting de Wikimedia por ráfaga de requests**, no un bloqueo de CORS: los
> `429` **también** traen `ACAO: *`, y tras 75 s de espera `Guiro.ogg` volvió a dar `200`. Los
> archivos que sí se pudieron leer dieron `200` + `ACAO: *`.

### 6.4 `surikov.github.io` — `ACAO: *` en las 15 notas latinas

```
200 | ACAO:"*" | application/javascript |  5525B | magic=console.log( | .../sound/12860_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript |  6625B | ... | 12861_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript |  4841B | ... | 12862_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript | 11167B | ... | 12863_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript | 10242B | ... | 12864_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript | 22894B | ... | 12865_0_FluidR3_GM_sf2_file.js   <- High Timbale
200 | ACAO:"*" | application/javascript | 24398B | ... | 12866_0_FluidR3_GM_sf2_file.js   <- Low Timbale
200 | ACAO:"*" | application/javascript |  5405B | ... | 12867_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript |  7395B | ... | 12868_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript |  3525B | ... | 12870_0_FluidR3_GM_sf2_file.js   <- Maracas
200 | ACAO:"*" | application/javascript |  3756B | ... | 12873_0_FluidR3_GM_sf2_file.js   <- Short Guiro
200 | ACAO:"*" | application/javascript | 11568B | ... | 12874_0_FluidR3_GM_sf2_file.js   <- Long Guiro
200 | ACAO:"*" | application/javascript |  2234B | ... | 12875_0_FluidR3_GM_sf2_file.js   <- Claves
200 | ACAO:"*" | application/javascript | 23076B | ... | 12878_0_FluidR3_GM_sf2_file.js
200 | ACAO:"*" | application/javascript | 29479B | ... | 12879_0_FluidR3_GM_sf2_file.js
```
> El `got=` es mayor que el `content-length` porque GitHub Pages sirve gzip y `content-length` es el
> tamaño comprimido; los bytes reales descomprimidos son los de la columna derecha.

### 6.5 Segunda tanda (`raw.githubusercontent.com` + `surikov.github.io`) — todas 200 / `ACAO: *`

```
200 | ACAO:"*" | audio/wav  |  331892B | .../VSCO-2-CE/master/Percussion/Guiro-M_v1_Sum.wav
200 | ACAO:"*" | audio/wav  |  262508B | .../VSCO-2-CE/master/Percussion/LogDrumHi_MedM_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  |  123428B | .../VSCO-2-CE/master/Percussion/Tumba-HitN_v1_rr2_Sum.wav
200 | ACAO:"*" | audio/wav  |  267012B | .../VSCO-2-CE/master/Percussion/Claves1_Hit_v3_rr2_Sum.wav
200 | ACAO:"*" | audio/wav  | 1579076B | .../VSCO-2-CE/master/Percussion/Ratchet1-Slow_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  |  301744B | .../VSCO-2-CE/master/Percussion/BrakeDrum1_Hammer_v1_Sum.wav
200 | ACAO:"*" | audio/wav  |  240040B | .../VSCO-2-CE/master/Percussion/Guiro-Hit_v1_rr2_Sum.wav
200 | ACAO:"*" | audio/wav  |  118436B | .../VSCO-2-CE/master/Percussion/Quinto-Tap1_v1_rr1_Sum.wav
200 | ACAO:"*" | audio/wav  |  153904B | .../VSCO%201%20Percussion/varWood/guiro_long.wav
200 | ACAO:"*" | audio/wav  |  258304B | .../VSCO%201%20Percussion/varWood/guiro_superlong.wav
200 | ACAO:"*" | audio/wav  |  140164B | .../VSCO%201%20Percussion/varWood/claves_mf.wav
200 | ACAO:"*" | audio/wav  |   38512B | .../VSCO%201%20Percussion/varWood/claves_pp1.wav
200 | ACAO:"*" | audio/wav  |   44358B | .../VSCO%201%20Percussion/drums/snare/OldSnare/snare_rim.wav
200 | ACAO:"*" | audio/wav  |  543298B | .../VSCO%201%20Percussion/varMetal/various/cabasa_roll1.wav
200 | ACAO:"*" | audio/flac |   46473B | .../freepats/world-percussion/main/samples/Claves/04.flac
200 | ACAO:"*" | audio/flac |   46036B | .../freepats/world-percussion/main/samples/Maracas/01_02.flac
200 | ACAO:"*" | audio/flac |  287928B | .../freepats/ukulele1/main/samples/C4.flac
200 | ACAO:"*" | audio/flac |  175618B | .../freepats/button-accordion-HN/main/Button%20Accordion%20HN%20G6.flac
200 | ACAO:"*" | audio/flac |  302163B | .../freepats/spanish-classical-guitar/main/samples/A%231.flac
200 | ACAO:"*" | application/javascript |  43667B | .../sound/0210_GeneralUserGS_sf2_file.js
200 | ACAO:"*" | application/javascript | 407574B | .../sound/0231_JCLive_sf2_file.js
200 | ACAO:"*" | application/javascript | 330543B | .../sound/0240_FluidR3_GM_sf2_file.js
```

### 6.6 Niveles medidos con `ffmpeg -af volumedetect`

```
VSCO_LogDrumLo.wav            mean_volume: -50.1 dB   max_volume: -29.0 dB
FP_Maracas_01_01.flac         mean_volume: -22.9 dB   max_volume:   0.0 dB
FP_Claves_01.flac             mean_volume: -24.9 dB   max_volume:   0.0 dB
Cabasa_bw_rr1_01.flac         mean_volume: -45.4 dB   max_volume: -20.1 dB
```

### 6.7 Hosts SIN CORS (`ACAO` literalmente vacío)

```
200 | ACAO:'' | (7z)        | 237775919B | freepats.zenvoid.org/SoundSets/FreePats-GeneralMIDI/FreePatsGM-SF2-20221026.7z
200 | ACAO:'' | (tar.xz)    |  15610628B | freepats.zenvoid.org/SoundSets/GM-PercussionSet/FreePatsGM-Percussion-SF2-20200822.tar.xz
302 | ACAO:'' | -> release-assets.githubusercontent.com | github.com/freepats/button-accordion-HN/releases/download/2024-03-29/ButtonAccordionHN-SFZ+WAV-20240329.7z
200 | ACAO:'' | len=6020026B | host_final=release-assets.githubusercontent.com
302 | ACAO:'' | -> release-assets.githubusercontent.com | github.com/freepats/world-percussion/releases/download/2020-09-05/WorldPercussion-SF2-20200905.7z
200 | ACAO:'' | len=5100075B | host_final=release-assets.githubusercontent.com
200 | ACAO:'' | (HTML) | www.pianobook.co.uk/  (y /wp-json/..., y /packs/accordion-double-reed/, y /sitemap.xml)
200 | ACAO:'' | (HTML) | freesound.org/search/?q=guacharaca
401 | ACAO:'' | application/json | freesound.org/apiv2/search/text/?query=guacharaca   {"detail":"Authentication credentials were not provided."}
200 | ACAO:'' | (HTML) | opengameart.org/
200 | ACAO:'' | (HTML) | 99sounds.org/
200 | ACAO:'' | (HTML) | soundbible.com/
```

### 6.8 Licencias — textos literales vistos

```
VSCO-2-CE/LICENSE              (200, 2560B)  -> "CC0 1.0 Universal / Statement of Purpose ..."
dim-cabasa/LICENSE             (200, 18657B) -> "Attribution 4.0 International ..."
freepats/world-percussion/LICENSE.txt    (200, 7048B) -> "Creative Commons Legal Code CC0 1.0 Universal ..."
freepats/button-accordion-HN/LICENSE.txt (200, 7048B) -> "Creative Commons Legal Code CC0 1.0 Universal ..."
freepats/ukelele1/LICENSE.txt            (200, 2826B)
freepats/spanish-classical-guitar/README.md -> "Published under the terms of Creative Commons CC0 public domain dedication:
                                                https://creativecommons.org/publicdomain/zero/1.0/"
api.github.com/repos/sgossner/VSCO-2-CE        -> license.spdx_id = "CC0-1.0"
api.github.com/repos/freepats/world-percussion -> license.spdx_id = "CC0-1.0"
api.github.com/repos/freepats/button-accordion-HN -> license.spdx_id = "CC0-1.0"
api.github.com/repos/freepats/spanish-classical-guitar -> license.spdx_id = "CC0-1.0"
api.github.com/repos/freepats/ukulele1         -> license.spdx_id = "CC0-1.0"
api.github.com/repos/freepats/colomboADK       -> license.spdx_id = "GPL-2.0"   (batería rock, no latina)
api.github.com/repos/sfzinstruments/kinwie.dim-cabasa -> license.spdx_id = "CC-BY-4.0"
api.github.com/repos/peastman/sso (Sonatina)   -> "Creative Commons Sampling Plus 1.0"  (licencia obsoleta)
Commons File:Guiro.ogg    -> LicenseShortName = "Public domain" | UsageTerms = "Public domain"
Commons File:Timbales.ogg -> LicenseShortName = "CC BY-SA 4.0" | UsageTerms = "Creative Commons Attribution-Share Alike 4.0"
Commons File:Shekere.ogg  -> LicenseShortName = "Copyrighted free use"
Commons File:Guacharaca.ogg -> LicenseShortName = "CC BY-SA 3.0"  (¡pero es un PÁJARO!)
```

---

## 7. Recomendación final

### 7.1 Caja vallenata → **no existe nada libre usable. Hay que aproximar o grabar.**

Sin vueltas: **no hay ninguna librería libre de caja vallenata** en GitHub, archive.org, Wikimedia
Commons, FreePats (45 repos), sfzinstruments (76 repos), VSCO-2-CE, Sonatina, tonejs-instruments ni
Pianobook, y Freesound no es consultable. No inventes que existe.

Lo mejor que se puede armar hoy, todo CC0 y con CORS verificado:

| Rol | Sample | Por qué |
|---|---|---|
| Cuerpo de madera (golpe seco) | **`Percussion/LogDrumLo_MedM_v1_rr1_Sum.wav`** (+ `LogDrumHi_MedM`) — 3 capas × 2 RR | Tambor de madera percutido con baquetas: centroide 489 Hz, f0 92 Hz, decaimiento 1.13 s. Es lo más parecido a la madera de una caja |
| Ataque de baqueta en el parche | **`VSCO 1 Percussion/drums/snare/OldSnare/snare_rim.wav`** y `snare_p.wav`/`snare_pp.wav` | El *rim* da el "tac" de madera sin el zumbido del bordón; los golpes suaves imitan el toque de caja |
| Golpe grave del parche grande | **`Percussion/Tumba-HitN_v1..v3_rr1..rr2_Sum.wav`** | f0 70 Hz: da el cuerpo grave del parche inferior |
| Alternativa de caja de madera | **FreePats `samples/CajonFlamenco/101..`** | Cajón de madera; nivel correcto, pero el gesto es de cajón, no de caja |

Receta práctica: capa `LogDrum` + `snare_rim` + `Tumba`, con un filtro paso-bajo alrededor de 4 kHz,
y **normalizá a −1 dBFS** (los samples de VSCO vienen a −30 dB).

**Si el proyecto necesita una caja vallenata de verdad, la única salida honesta es grabarla** (una
caja vallenata real son ~80–150 USD) o licenciarla. Ninguna búsqueda libre la va a dar.

### 7.2 Guacharaca → **usá la familia de güiro de VSCO-2-CE; es el sustituto correcto**

La guacharaca es caña raspada con un tenedor: mismo gesto que un güiro. Entonces:

1. **Primario (CC0, CORS ✅):** `Percussion/Guiro-Fast_v1_Sum.wav` para el *shhh-shhh* rápido y
   `Guiro-Slow_v1_Sum.wav` para el lento. Son los dos que corresponden a los dos gestos del ritmo
   vallenato. Sumá `Guiro-Hit_v1_rr1/rr2` para acentos y `Guiro-M` para el medio.
   ⚠️ **Normalizá +32 dB.**
2. **Variante de timbre (CC0):** `VSCO 1 Percussion/varWood/guiro_short*.wav` (5 variantes),
   `guiro_long.wav`, `guiro_long2.wav`, `guiro_superlong.wav`, `gurio_long4.wav`. Los "superlong" y
   "long4" sirven para el raspado continuo de un compás entero; los "short" para golpes sueltos.
3. **Opción liviana (MIT/FluidR3, CORS ✅):** el par GM `12873` (Short Guiro, 3.7 KB) + `12874`
   (Long Guiro, 11.3 KB). **Verificado acústicamente: 0.213 s vs 0.500 s, ambos ruidosos.** Con
   `Ratio`/detune se estira el corto. Es lo más barato si el peso importa.
4. **Si querés un *shhh* más metálico** (más güira que guacharaca): `Ratchet1-Slow/Fast/Crank` de
   VSCO, o la cabasa de §7.4.

⚠️ **No uses `File:Guacharaca.ogg` de Commons**: es el canto de un ave.

### 7.3 Acordeón vallenato → **quedate con FreePats Button Accordion HN; no hay nada mejor libre**

- **Seguí con `freepats/button-accordion-HN`**: es un Hohner de botones real, **CC0**, con **CORS
  verificado** (`200`, `ACAO: *`) tanto en las notas como en los samples de release. Está bien
  normalizado (max 0.0 dB) y es **FLAC 44.1 kHz estéreo 16 bit** — decodificable con
  `decodeAudioData` en todos los navegadores modernos.
- **Lo que sí podés sumar hoy, sin salir del pack**: los **17 samples `rel/…_rel.flac`** (34.3 KB
  cada uno) son exactamente el **ruido de fuelle / release** que pedías. Disparados al soltar la nota
  (`triggerAttackRelease` + un `Tone.Player` en el `onstop`) cambian muchísimo la sensación de
  acordeón real. Esto es lo único "complementario" que existe gratis.
- **Lo que NO hay que hacer:** Pianobook tiene packs de acordeón tentadores (`Accordion LA-Melodiosa`
  con SFZ, `Accordion Double Reed`, `BANDONEON`, `Toy Accordion`) pero **exigen login, no mandan CORS
  y son `.zip`**: no son consumibles desde el navegador. Sólo servirían descargándolos a mano y
  auto-hospedándolos, y ni siquiera se puede leer su licencia sin cuenta.
- **Tampoco hay acordeón en `sfzinstruments`** (76 repos revisados) **ni en VSCO-2-CE**.
- **Sobre "más dinámicas": no existe ningún acordeón libre con capas de velocidad.** Ni el de FreePats
  ni los de WebAudioFont las tienen. Lo que se puede hacer es simular la dinámica en el motor:
  ganancia + un filtro paso-bajo que abre con la velocidad + los releases de fuelle. Honestamente: el
  techo del material libre es éste.

### 7.4 Timbales, güira/güiro metálico y clave → **acá sí hay solución buena**

| Instrumento | Qué usar | Licencia | Coste |
|---|---|---|---|
| **Timbales** | **WebAudioFont GM notas 65 + 66** (`12865_0_FluidR3_GM_sf2_file.js` + `12866_0_…`), kit 0 FluidR3. Verificado acústicamente como par alto/bajo. Hay kits alternativos (`_8_`, `_10_`…`_16_`, y fuentes `Chaos`/`JCLive`/`SBLive`) por si querés otro timbre de caja | MIT (empaquetado) / FluidR3 | **22.4 + 23.8 KB** |
| **Clave cubana** | **VSCO-2-CE `Percussion/Claves1_Hit_v1..v3_rr1..rr2_Sum.wav`** — 3 capas de velocidad × 2 round-robins. Si preferís nivel ya correcto: **FreePats `samples/Claves/01..04.flac`** (max 0.0 dB) o **VSCO-1 `claves_ff/mf/mf_2/mf_3/mp/pp1`** | CC0 | 195 KB c/u / 44 KB |
| **Güira metálica** | **`sfzinstruments/kinwie.dim-cabasa`** — 250 FLAC de cabasa metálica, 48 kHz/24 bit, round-robins `fw_rr*` y `bw_rr*`. Centroide 7 073 Hz: es el raspador metálico más creíble que existe gratis | **CC BY 4.0** (atribución obligatoria) | 43 KB por muestra |
| **Güiro (madera/calabaza)** | **VSCO-2-CE** familia `Guiro-*` (ver §7.2) | CC0 | 91–454 KB |
| **Cabasa (alternativa CC0 a la güira)** | `VSCO 1 Percussion/varMetal/various/cabasa_1..6.wav` + `cabasa_roll1/2.wav` | CC0 | 157 KB c/u |
| **Un *shhh* de raspador real, dominio público** | `https://upload.wikimedia.org/wikipedia/commons/0/01/Guiro.ogg` ("Modern plastic guiro", PD, CORS ✅) | **Public domain** | 279 KB (es un patrón rítmico, no un one-shot limpio) |

### 7.5 Tres cubano / requinto / guitarra de son → **no existe. Aproximá con nylon.**

**No hay ninguna librería libre de tres cubano, requinto ni guitarra de son** — 0 resultados en 6
búsquedas de GitHub, nada en las dos organizaciones, nada en VSCO/Sonatina/tonejs, nada en Commons.

Sustitutos con CORS verificado y licencia CC0:
- **`freepats/spanish-classical-guitar`** — guitarra clásica española, ~50 notas **A#1 → C6**,
  `samples/A4.flac` verificado (200, `ACAO: *`, 102.1 KB). Un tres cubano es una guitarra de nylon
  con 3 órdenes dobles: **afinando las cuerdas del tres (G4–C4–E4, o D–G–B) y con un detune leve por
  orden se obtiene un tres convincente.** Es la mejor base disponible.
- **`freepats/ukulele1`** — 13 notas + `chuck.wav` + `body-tap.flac`, CC0. Registro pequeño de nylon:
  sirve para el **requinto** (que es una guitarra pequeña afinada más agudo) directamente, sin
  transponer.
- Como última opción, WebAudioFont GM `0240_*` (nylon, 12 variantes) para bajo coste.

---

## 8. Correcciones a [`investigacion-samples-instrumentos-reales.md`](investigacion-samples-instrumentos-reales.md)

| Afirmación del informe previo | Lo que se midió ahora |
|---|---|
| *"`archive.org/download/...` → `ACAO` vacío; **NO se pueden bajar desde el navegador**"* | ❌ **Incorrecto.** `HEAD` → **302 con `ACAO: *`**, y tras el redirect `ia*.us.archive.org` → **200 con `ACAO: *`**. Verificado en 11 archivos. (Sí es cierto para el listado de directorio y los ítems restringidos, que dan `ACAO: ''` y 403.) |
| *"Para la guacharaca: `EggShaker`/`Maracas`/`Cabasa`"* (implicando que VSCO no aporta nada latino) | ⚠️ **Incompleto.** VSCO-2-CE tiene **13 archivos de güiro** (el sustituto correcto de una guacharaca), **claves con 3 capas de velocidad × 2 round-robins**, conga/quinto/tumba, bongos, maracas (6), cabasa (8), agogó (10), shaker (8), log drum, cowbell, anvil y ratchet — **todo CC0 y con CORS ✅**. Y `sfzinstruments/kinwie.dim-cabasa` (CC BY 4.0) tiene **250 FLAC** de raspador metálico. |
| *"No hay timbales"* (implícito: ningún programa GM de timbales) | ✅ Cierto para *programas melódicos*, pero ❌ **faltaba el kit de batería**: las notas GM **65 = High Timbale** y **66 = Low Timbale** existen en `12865_*` / `12866_*` de WebAudioFont, con CORS ✅ y **verificadas acústicamente** como par alto/bajo. Lo mismo para claves (75), güiro corto/largo (73/74) y maracas (70). |
| *"Button Accordion HN: 34 notas + 34 release samples"* | ❌ **Son 17 notas (B3–G6) + 17 releases** (38 blobs en total, incluidos LICENSE/README/preset/imagen). Contado sobre el árbol de GitHub. |
| *(no mencionado)* Niveles de VSCO | ⚠️ **Nuevo:** la carpeta `Percussion/` de la raíz de VSCO viene **sin normalizar**: `max_volume` de **−36.6 dB** (claves) a **−28.3 dB** (cabasa). Requiere **+28 a +37 dB** o normalización en build. La carpeta `VSCO 1 Percussion/` en cambio está bien nivelada. |
| *(no mencionado)* `File:Guacharaca.ogg` | ⚠️ **Nuevo:** el archivo de Commons con ese nombre **es el canto del ave *Ortalis ruficauda***, no el instrumento. Documentado para que nadie caiga. |
| *(no mencionado)* Pianobook | ⚠️ **Nuevo:** Pianobook se puede consultar por su REST API de WordPress (`/wp-json/wp/v2/pb_samplepacks`), tiene **6 packs de acordeón/bandoneón**, pero **exige login** ("Log in to download"), **no manda CORS** en ningún endpoint, y los formatos son Decent Sampler / Kontakt / EXS24 / SFZ **dentro de zips**. **Cero contenido colombiano** en 745 packs revisados. |

---

## 9. Limitaciones de esta investigación (leer antes de confiar de más)

1. **GitHub Code Search no se pudo usar:** `api.github.com/search/code` devuelve **401 Unauthorized**
   sin token. No se pudo buscar por contenido de archivo (`.sfz`, `.dspreset`), sólo por metadatos de
   repo. **Es posible que exista algún repositorio con samples de caja o guacharaca en su interior que
   esta búsqueda no alcanzó.**
2. **Freesound quedó fuera por completo** (401 en el API, sin CORS en la web, HTML no raspa-ble). Es
   plausible que existan sonidos CC0 de guacharaca ahí, pero **no son consumibles desde el navegador**
   y por eso no se proponen.
3. **Wikimedia Commons limitó por rate-limit** (`429`) a partir del tercer archivo seguido. Se
   verificó `200` + `ACAO: *` en `Guiro.ogg` (dos veces) y `Timbales.ogg`; los demás (`Shekere.ogg`,
   `Eggshaker.ogg`, `Accordion_registers.ogg`, `Accordion_chords-01.ogg`, `Ritmo cumbia batería
   santiago.ogg`) respondieron `429` con `ACAO: *`, lo que indica throttling y no bloqueo, pero **su
   descarga completa no se confirmó**.
4. **No se descargó ni escuchó ningún archivo**: la identificación es por metadatos del servidor
   (status, content-type, magic bytes), por las descripciones/categorías declaradas en Commons, por el
   estándar General MIDI y por las métricas acústicas de §3. Es evidencia fuerte pero **no es oído
   humano**. Antes de shippear, escuchá los 3 o 4 samples elegidos.
5. **Las licencias se leyeron, no se interpretaron jurídicamente.** En particular: CC BY-SA 4.0
   (Commons) y CC BY 4.0 (dim-cabasa) **exigen atribución**, y **CC BY-SA tiene cláusula de compartir
   igual** cuya aplicación a samples dentro de una app propietaria conviene consultar. Las opciones
   **CC0** (VSCO-2-CE, FreePats) y **Public domain** (Commons `Guiro.ogg`) no tienen esa fricción.
6. **No se tocó ningún archivo de `app/` ni de `tests/`.** Este informe es el único archivo creado en
   el repo. Los scripts de sondeo y los JSON de evidencia viven en
   `C:\Users\mejia\AppData\Local\Temp\pmp-probe\`.

---

### Archivos de trabajo (fuera del repo, por si querés reproducir)

- `C:\Users\mejia\AppData\Local\Temp\pmp-probe\probe-urls.mjs` — sondeadador HTTP (status + ACAO real + magic bytes)
- `…\analyze-samples.mjs` — análisis acústico (FFT, ZCR, f0, centroide)
- `…\research-archive-commons.mjs`, `pianobook.mjs`, `pianobook2.mjs`, `pianobook3.mjs`, `pianobook4-freesound.mjs`, `final-checks.mjs`, `last-checks.mjs`
- `…\batch1.json`, `batch2.json`, `acoustic.json`, `ia-search.json`, `ia-files.json`, `commons-search.json`, `pianobook-search.json` — evidencia cruda
- Logs completos: `.logs/20261012-1739*-probe-batch1.log`, `…-probe-batch2.log`, `…-acoustic.log`, `…-ia-commons.log`, `…-pianobook*.log`, `…-pb-freesound.log`, `…-final-checks.log`, `…-last-checks.log`
