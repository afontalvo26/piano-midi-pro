# Informe VERIFICADO — librerías de samples de instrumentos REALES para reproductor MIDI web (Tone.js v15)

**Método**: todas las afirmaciones provienen de requests HTTP reales ejecutados con `Invoke-WebRequest` / `WebClient` (con `-TimeoutSec`), más la API de GitHub y la de archive.org. Fecha de verificación: **2026-10-12** (según el header `Date` de GitHub). Donde algo no se pudo verificar, se dice explícitamente.

---

## 0. HALLAZGO CRÍTICO: el patrón de URLs que asumías es incorrecto

Las 4 URLs que propusiste **dan 404 las cuatro**:

| URL probada | Resultado real |
|---|---|
| `.../sound/0021_0_FluidR3_GM_sf2_file.js` | **404** |
| `.../sound/0021_1_JCLive_sf2_file.js` | **404** |
| `.../sound/0021_2_GeneralUserGS_sf2_file.js` | **404** |
| `.../sound/0021_3_Arachno_sf2_file.js` | **404** |

**No existe ningún índice numérico `_0_/_1_/_2_` después del id.** El patrón real es:

```
https://surikov.github.io/webaudiofontdata/sound/<ID>_<Fuente>_sf2_file.js
```

donde `<ID>` = **3 dígitos del programa GM (base 0) + 1 dígito de variante**, y `<Fuente>` ∈
`GeneralUserGS`, `FluidR3_GM`, `Aspirin`, `JCLive`, `Chaos`, `SBLive`, `SoundBlasterOld`, más algunas fuentes de instrumento específico (`LK_Godin_Nylon`, `Stratocaster`, `LesPaul`, `Acoustic_Guitar`, `Soul_Ahhs`).

**Trampa peligrosa**: `0021_GeneralUserGS_sf2_file.js` **sí devuelve 200** (791 094 bytes = 772.6 KB), pero **NO es un acordeón**: sus zonas internas se llaman `Grand_Piano_D6`, `Grand_Piano_G6`, `Grand_Piano_C7`. Es el programa GM 2 (Electric Grand Piano), variante 1. Si hubieras usado ese archivo "porque da 200", habrías escuchado un piano.

**Los ids correctos son**:
- Acordeón = programa GM 22 (base 0 = 21) → **`0210`, `0211`, `0212`**
- Armónica = programa 23 (base 0 = 22) → **`0220`, `0221`**
- Bajo acústico = **`0320`**; bajo eléctrico finger = **`0330`**

Confirmado por dos fuentes independientes: (a) el índice oficial `https://surikov.github.io/webaudiofontdata/sound/` (200, `Access-Control-Allow-Origin: *`, 1477 enlaces, secciones con nombre "Accordion: Organ (12 variantes)"), y (b) los nombres de muestra dentro de cada archivo (`Accordian_D2`, `Harmonica_E3`, `Nylon_E3`, `Violin_G_4_R_`).

### Índice para enumerar TODO

| Recurso | URL | Evidencia |
|---|---|---|
| Índice HTML oficial (por instrumento) | `https://surikov.github.io/webaudiofontdata/sound/` | 200, 120 272 bytes, ACAO `*`, 1477 `<a href>`. **No incluye kits de batería** |
| Árbol completo del repo (5226 `.js`) | `https://api.github.com/repos/surikov/webaudiofontdata/git/trees/master?recursive=1` | 200, 6741 entradas, `truncated=false`, 5226 archivos `sound/*.js`, 443 prefijos de programa distintos |

---

## A. Tabla comparativa por fuente

| Fuente | URL base | CORS (header literal) | Tamaño típico | Formato | ¿Capas de velocidad / articulaciones? | Licencia | Veredicto |
|---|---|---|---|---|---|---|---|
| **WebAudioFont** (surikov) | `https://surikov.github.io/webaudiofontdata/sound/` | `Access-Control-Allow-Origin: *` ✅ | 3 KB – 1.6 MB (típico 20–550 KB) | **JS** con `zones[]` y audio **base64 MP3** (`SUQz…` = ID3) | **Multisample real** (12 zonas en acordeón, 25 en piano GUS, 34 en cuerdas FluidR3) + **loop points reales** (`loopStart`/`loopEnd`) + AHDSR. **SIN capas de velocidad** (0 campos `velocity`/`velRange`) | MIT en el repo `webaudiofontdata` (Copyright 2017 Srgy Surkv); **los samples conservan la licencia de origen**: GeneralUser GS (S. Christian Collins) y FluidR3 (MuseScore) | ✅ **USABLE HOY — mejor opción general** |
| **tonejs-instruments** (nbrosowsky) | `https://nbrosowsky.github.io/tonejs-instruments/samples/<inst>/<nota>.mp3` | `Access-Control-Allow-Origin: *` ✅ (también en jsDelivr y raw.githubusercontent) | 147–324 KB **por nota**; ~152 MB por formato (total 455.8 MB en mp3+ogg+wav) | `.mp3` + `.ogg` + `.wav` crudos | **SIN capas de velocidad** (0 nombres con marcador `vel`/`_v1`/`pp`/`mf`/`ff`; **0 subcarpetas**). El mito de "guitar-acoustic con carpetas por velocidad" es **FALSO** | Código MIT (`LICENSE.md`); **Samples CC-BY 3.0** (requiere atribución). Origen declarado en `sample-source-info.txt`: VSCO 2 (`VSO2`), Karoryfer, Iowa, Freesound | ⚠️ **Usable pero pesado y SIN acordeón, SIN armónica, SIN percusión latina** |
| **VSCO 2 Community Edition** | `https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/<ruta>.wav` | `Access-Control-Allow-Origin: *` ✅ (verificado: 200, 1 132 648 bytes) | 0.07 – 1.8 MB por muestra (típico ~1 MB) | `.wav` crudo + `.sfz` | ✅ **SÍ: capas de velocidad reales `_v1_/_v2_/_v3_` + round-robin `_rr1_/_rr2_`** | **CC0 1.0** (verificado en `LICENSE`) | ✅ **Usable, la mejor expresividad; pesado (1 MB por nota) y hay que mapear a mano** |
| **Sonatina Symphonic Orchestra** (peastman/sso) | `https://raw.githubusercontent.com/peastman/sso/master/Sonatina%20Symphonic%20Orchestra/<ruta>.wav` | `Access-Control-Allow-Origin: *` ✅ (verificado: 200, 134 KB) | 134 – 516 KB por muestra | `.wav` (1626) + `.flac` (1436) + `.sfz` (747) | SFZ con articulaciones (KS, Legato, Marcato, Staccato); sin marcadores de velocidad en el nombre | ⚠️ **Creative Commons Sampling Plus 1.0** (licencia antigua/obsoleta, lectura ambigua) | ⚠️ **Usable con reservas por licencia** |
| **FreePats — Button Accordion HN** | `https://raw.githubusercontent.com/freepats/button-accordion-HN/main/Button%20Accordion%20HN%20A4.flac` | `Access-Control-Allow-Origin: *` ✅ (verificado: 200, 189 KB, `Content-Type: audio/flac`) | 153 – 285 KB por nota (34 FLAC) + 34 release samples (~34 KB) | `.flac` crudo + `PRESET Button Accordion HN tuned.sfz` (4 KB) | Notas individuales + samples de release + SFZ afinado; **sin capas de velocidad** | **CC0-1.0** (verificado vía API de GitHub: `license.spdx_id = CC0-1.0`) | ✅✅ **USABLE HOY — mejor opción para acordeón de botones** |
| **FreePats — World Percussion** | `https://raw.githubusercontent.com/freepats/world-percussion/main/samples/<Inst>/<n>.flac` | mismo host `raw.githubusercontent.com` (CORS `*` verificado en el repo hermano) | 31 – 48 KB por golpe (195 FLAC + 45 WAV) | `.flac` / `.wav` + `WorldPercussion 20200905.sfz` | Múltiples golpes/articulaciones por instrumento (hasta 41 en EggShaker, 34 en Bongos) | **CC0-1.0** | ✅ **USABLE HOY** — Conga, HighConga, LowConga, MutedConga, MutedLowConga, Bongos, Maracas, Claves, CajonFlamenco, Castanets, Darbuka, EggShaker, HandClap, Tambourine. **NO tiene caja vallenata ni guacharaca ni timbales** |
| **FreePats (paquetes 7z)** | `https://freepats.zenvoid.org/SoundSets/FreePats-GeneralMIDI/FreePatsGM-SF2-20221026.7z` · `.../SoundSets/GM-PercussionSet/FreePatsGM-Percussion-SF2-20200822.tar.xz` · release `ButtonAccordionHN-SFZ+WAV-20240329.7z` | ❌ **SIN CORS** (`ACAO` vacío en la respuesta final) | 5.7 MB / 8.3 MB / 14.9 MB / **226.8 MB** | `.7z`, `.tar.xz` | SF2 y SFZ+WAV | FreePats = licencias libres (CC0/CC-BY según set) | ❌ **No consumible desde el navegador** (sin CORS + formato comprimido que el browser no descomprime) |
| **GeneralUser GS** (S. Christian Collins) | Página oficial `https://schristiancollins.com/generaluser.php` = app JS (200, 3872 bytes, **0 enlaces `.sf2`**). Espejo: `https://archive.org/download/general-user-gs/GeneralUser-GS.zip` | ❌ `ACAO` vacío (endpoint de descarga de archive.org) | **55.7 MB** (zip) | `.zip` → `.sf2` | Capas de velocidad sí (es un SF2 completo) | Licencia propia de S. Christian Collins (gratuita, con condiciones; enlazada desde el README de surikov) | ❌ **No fetchable por CORS**; además requeriría parser SF2 |
| **SGM-V2.01** | `https://huggingface.co/spaces/asigalov61/Allegro-Music-Transformer/resolve/main/SGM-v2.01-YamahaGrand-Guit-Bass-v2.7.sf2` | ✅ `Access-Control-Allow-Origin: *` (verificado: 200) | **528.3 MB** | `.sf2` | Sí (SF2 completo) | No verificada en esta ronda | ⚠️ Descargable con CORS pero **528 MB + parser SF2** ⇒ no práctico |
| **Timbres of Heaven** | `https://archive.org/download/timbres-of-heaven-xgm-4.00-g.-7z/Timbres%20of%20Heaven%20(XGM)%204.00(G).7z` | ❌ `ACAO` vacío | **285.3 MB** | `.7z` | Sí (SF2 completo) | No verificada | ❌ **No fetchable por CORS** |
| **Arachno SoundFont** | No se encontró URL directa: `https://www.arachnosoft.com/main/download.php?id=arachno` responde 200 (87 452 bytes) pero **sin ningún `href` a `.sf2`/`.zip`** | — | — | — | — | — | ❌ **No verificable / no hay URL directa** |
| **musical-artifacts.com** | `https://musical-artifacts.com/artifacts?tags=accordion&formats=sf2` | — | — | — | — | — | ❌ **403 Forbidden (Cloudflare)** — inutilizable programáticamente. `artifacts.json` responde 200 pero **sin CORS** |

---

## B. Variantes WebAudioFont disponibles (ids completos + tamaño real del blob)

> Los tamaños son el `size` real del blob en el árbol de GitHub; los marcados con ✅ los confirmé además con GET HTTP real.

### Acordeón GM (`0210`/`0211`/`0212`) — 12 variantes
| Archivo | Tamaño | Zonas (verificado) |
|---|---|---|
| `0210_GeneralUserGS_sf2_file.js` ✅ | **75 KB** | 12 (`Accordian_D2`, `Accordian_F_2`, `Accordian_A_2`, …) |
| `0210_Aspirin_sf2_file.js` ✅ | 21 KB | 10 (`Accordion_Gb2`…) |
| `0210_Chaos_sf2_file.js` | 21 KB | — |
| `0210_FluidR3_GM_sf2_file.js` ✅ | 290 KB | 6 (`Accordian_C5_R_`…) |
| `0210_JCLive_sf2_file.js` ✅ | 81 KB | 13 (`Accord_D2`…) |
| `0210_SBLive_sf2.js` ✅ | 127 KB | 23 (`Accordion_Gb2`, `Accordion_Bb2`…) |
| `0210_SoundBlasterOld_sf2.js` | 22 KB | — |
| `0211_Aspirin_sf2_file.js` | 16 KB | — |
| `0211_FluidR3_GM_sf2_file.js` | 283 KB | — |
| `0211_GeneralUserGS_sf2_file.js` | 80 KB | — |
| `0211_SoundBlasterOld_sf2.js` | 15 KB | — |
| `0212_GeneralUserGS_sf2_file.js` | 81 KB | — |

### Tango Accordion / bandoneón (`0230`–`0233`) — 13 variantes (útil para **bolero**)
| Archivo | Tamaño |
|---|---|
| `0231_JCLive_sf2_file.js` ✅ | **730 KB** (33 zonas) |
| `0230_FluidR3_GM_sf2_file.js` ✅ | 290 KB |
| `0232_FluidR3_GM_sf2_file.js` | 283 KB |
| `0230_GeneralUserGS_sf2_file.js` ✅ | 81 KB (13 zonas) |
| `0231_GeneralUserGS_sf2_file.js` | 81 KB |
| `0230_JCLive_sf2_file.js` | 81 KB |
| `0230_SBLive_sf2.js` | 112 KB |
| `0231_FluidR3_GM_sf2_file.js` | 80 KB |
| `0233_FluidR3_GM_sf2_file.js` | 79 KB |
| `0230_Aspirin_sf2_file.js` / `0230_Chaos_sf2_file.js` / `0230_SoundBlasterOld_sf2.js` / `0231_SoundBlasterOld_sf2.js` | 38 / 25 / 20 / 15 KB |

### Armónica (`0220`/`0221`) — 8 variantes
| Archivo | Tamaño | Zonas |
|---|---|---|
| `0220_JCLive_sf2_file.js` ✅ | **244 KB** | 11 (`Harmonica_D2`, `Harmonica_F_2`, `Harmonica_A_2`) |
| `0220_Aspirin_sf2_file.js` | 28 KB | — |
| `0220_Chaos_sf2_file.js` | 14 KB | — |
| `0220_FluidR3_GM_sf2_file.js` ✅ | 80 KB | 8 (`harmon_c2_R_`, `harmnc_e3_R_`) |
| `0220_GeneralUserGS_sf2_file.js` ✅ | 27 KB | 6 (`Harmonica_E3`, `Harmonica_A3`, `Harmonica_E4`) |
| `0220_SBLive_sf2.js` | 38 KB | — |
| `0220_SoundBlasterOld_sf2.js` | 17 KB | — |
| `0221_FluidR3_GM_sf2_file.js` | 79 KB | — |

### Bajos
| Id | Archivo | Tamaño |
|---|---|---|
| **0320** acústico | `0320_FluidR3_GM_sf2_file.js` ✅ | 262 KB (10 zonas, `Acoustic_Bass_E2`…) |
| | `0320_SBLive_sf2` / `0320_JCLive_sf2_file` / `0320_Aspirin_sf2_file` / `0320_Chaos_sf2_file` / `0320_SoundBlasterOld_sf2` | 71 / 40 / 31 / 28 / 28 KB |
| | `0320_GeneralUserGS_sf2_file` / `0321_GeneralUserGS` / `0322_GeneralUserGS` | 8 / 17 / 8 KB |
| **0330** finger | `0330_FluidR3_GM_sf2_file.js` ✅ | **438 KB** (9 zonas, `Finger_Bass_E2`…) |
| | `0330_Aspirin` / `0330_Chaos` / `0330_SBLive_sf2` / `0330_GeneralUserGS` / `0330_SoundBlasterOld_sf2` / `0330_JCLive` | 64 / 64 / 61 / 27 / 26 / 23 KB |
| | `0331_GeneralUserGS` / `0332_GeneralUserGS` | 11 / 5 KB |
| **0340** pick | `0340_FluidR3_GM_sf2_file.js` ✅ | **544 KB** |
| | `0340_SBLive_sf2` / `0340_GeneralUserGS` / `0340_JCLive` / `0340_SoundBlasterOld` / `0340_Aspirin` / `0340_Chaos` / `0341_Aspirin` / `0341_GeneralUserGS` | 107 / 55 / 38 / 24 / 18 / 18 / 64 / 14 KB |
| **0350** fretless | `0350_FluidR3_GM_sf2_file` / `0350_JCLive` / `0350_SBLive_sf2` / `0350_GeneralUserGS` / `0350_SoundBlasterOld` / `0350_Chaos` / `0350_Aspirin` / `0351_GeneralUserGS` | 351 / 292 / 85 / 39 / 30 / 25 / 16 / 5 KB |
| **0360** slap 1 | `0360_FluidR3_GM_sf2_file` / `0360_SBLive_sf2` / `0360_JCLive` / `0360_GeneralUserGS` / `0360_SoundBlasterOld` / `0360_Chaos` / `0360_Aspirin` / `0361_GeneralUserGS` | 645 / 131 / 35 / 31 / 28 / 27 / 19 / 6 KB |

### Guitarras (nylon `0240`, steel `0250`, jazz `0260`, clean `0270`, overdrive `0290`, distorsión `0300`)
| Archivo | Tamaño |
|---|---|
| `0240_FluidR3_GM_sf2_file.js` ✅ (nylon) | 437 KB (10 zonas, `Nylon_E3`…) |
| `0240_LK_Godin_Nylon_SF2_file.js` | 320 KB |
| `0240_JCLive_sf2_file` / `0240_Aspirin_sf2_file` / `0240_SBLive_sf2` / `0240_GeneralUserGS` / `0240_SoundBlasterOld` / `0240_Chaos` | 288 / 202 / 197 / 118 / 55 / 28 KB |
| `0241_JCLive` / `0242_JCLive` / `0243_JCLive` / `0241_GeneralUserGS` | 307 / 286 / 305 / 4 KB |
| `0250_Acoustic_Guitar_sf2_file.js` (steel) | **905 KB** |
| `0252_Acoustic_Guitar_sf2_file.js` | **1 562 KB** |
| `0250_LK_AcousticSteel_SF2_file.js` ✅ | 596 KB (9 zonas) |
| `0250_FluidR3_GM_sf2_file.js` ✅ (steel) | 492 KB (10 zonas, `Steel_E3`…) |
| `0250_SBLive_sf2` / `0250_GeneralUserGS` / `0250_Chaos` / `0250_Aspirin` / `0250_JCLive` / `0250_SoundBlasterOld` | 252 / 117 / 97 / 95 / 66 / 44 KB |
| `0251_Acoustic_Guitar` / `0253_…` / `0254_…` / `0251_GeneralUserGS` / `0252_GeneralUserGS` / `0253_GeneralUserGS` / `0254_GeneralUserGS` / `0255_GeneralUserGS` | 895 / 798 / 717 / 112 / 11 / 34 / 54 / 4 KB |
| `0260_Stratocaster_sf2_file.js` (jazz) | 730 KB |
| `0260_JCLive_sf2_file.js` | 792 KB |
| `0260_FluidR3_GM_sf2_file.js` ✅ | 288 KB |
| `0260_GeneralUserGS` / `0260_Chaos` / `0260_SBLive_sf2` / `0260_Aspirin` / `0260_SoundBlasterOld` / `0261_Stratocaster` / `0262_Stratocaster` / `0261_GeneralUserGS` / `0261_SoundBlasterOld` | 180 / 58 / 51 / 42 / 18 / 783 / 730 / 2 / 15 KB |
| `0270_Stratocaster_sf2_file.js` (clean) | 730 KB |
| `0270_JCLive` / `0270_Gibson_Les_Paul_sf2_file` / `0270_SBAWE32_sf2_file` / `0270_FluidR3_GM` ✅ / `0270_GeneralUserGS` / `0270_SBLive_sf2` / `0270_Aspirin` / `0270_Chaos` / `0270_SoundBlasterOld` | 341 / 304 / 273 / 251 / 161 / 83 / 47 / 18 / 9 KB |
| `0290_LesPaul_sf2` (overdrive) | **1 939 KB** |
| `0291_LesPaul_sf2` | **3 775 KB** |
| `0290_JCLive` / `0290_FluidR3_GM` ✅ / `0290_LesPaul_sf2_file` / `0290_GeneralUserGS` / `0290_SBAWE32` / `0290_Aspirin` / `0290_SBLive_sf2` / `0290_Chaos` / `0290_SoundBlasterOld` | 1 075 / 828 / 492 / 314 / 242 / 196 / 74 / 44 / 27 KB |
| `0300_LesPaul_sf2` (distorsión) | **3 775 KB** |
| `0300_JCLive` / `0300_FluidR3_GM` ✅ / `0300_Aspirin` / `0300_Chaos` / `0300_SBAWE32` / `0300_GeneralUserGS` / `0300_SBLive_sf2` / `0300_SoundBlasterOld` | 466 / 763 / 316 / 224 / 181 / 144 / 108 / 32 KB |
| `0301_JCLive` | 2 837 KB |

### Sax (alto `0650`, tenor `0660`, barítono `0670`, soprano `0680`)
| Archivo | Tamaño |
|---|---|
| `0650_FluidR3_GM_sf2_file.js` | 268 KB |
| `0650_GeneralUserGS_sf2_file.js` ✅ | **167 KB** (13 zonas, `Alto_Sax_F3`…) |
| `0650_Aspirin` / `0650_JCLive` / `0650_SBLive_sf2` / `0650_Chaos` / `0650_SoundBlasterOld` / `0651_Aspirin` / `0651_FluidR3_GM` | 137 / 97 / 81 / 52 / 37 / 59 / 272 KB |
| `0660_FluidR3_GM_sf2_file.js` ✅ | **697 KB** (15 zonas, `Tenor_B3_R_`) |
| `0660_JCLive` / `0660_GeneralUserGS` / `0660_Chaos` / `0660_SBLive_sf2` / `0660_SoundBlasterOld` / `0660_Aspirin` / `0661_FluidR3_GM` / `0661_GeneralUserGS` | 119 / 107 / 70 / 58 / 37 / 32 / 712 / 13 KB |

### Metales (trompeta `0560`, trombón `0570`, tuba `0580`, muted `0590`, french horn `0600`, brass `0610`/`0620`)
| Archivo | Tamaño |
|---|---|
| `0560_FluidR3_GM_sf2_file.js` ✅ | **70 KB** (6 zonas, `tp_e3`, `tp_g3`, `tp_c4`) |
| `0560_JCLive` / `0560_GeneralUserGS` / `0560_SoundBlasterOld` / `0560_SBLive_sf2` / `0560_Chaos` / `0560_Aspirin` | 67 / 56 / 37 / 35 / 21 / 15 KB |
| `0570_FluidR3_GM_sf2_file.js` ✅ | **148 KB** (13 zonas, `tromboneG3`…) |
| `0570_JCLive` / `0570_Aspirin` / `0570_SBLive_sf2` / `0570_GeneralUserGS` / `0571_GeneralUserGS` / `0570_SoundBlasterOld` / `0570_Chaos` | 147 / 99 / 63 / 62 / 62 / 29 / 16 KB |
| `0600_FluidR3_GM_sf2_file.js` (french horn) | 439 KB |
| `0600_JCLive` / `0600_SBLive_sf2` / `0600_Aspirin` / `0601_GeneralUserGS` / `0600_GeneralUserGS` / `0600_Chaos` / `0600_SoundBlasterOld` / `0601_FluidR3_GM` / `0602`/`0603_GeneralUserGS` | 363 / 165 / 137 / 145 / 36 / 27 / 18 / 436 / 49 / 127 KB |
| `0610_*` brass section: `0610_GeneralUserGS` 23 KB, `0610_Aspirin` 17 KB, `0610_SoundBlasterOld` 32 KB; `0620_GeneralUserGS` 28 KB | |

### Flautas / maderas (flauta `0730`, pan flute `0750`)
| Archivo | Tamaño |
|---|---|
| `0730_FluidR3_GM_sf2_file.js` ✅ | **169 KB** (9 zonas, `Flute_C_4_R_`) |
| `0730_JCLive` / `0730_GeneralUserGS` / `0730_Aspirin` / `0730_SBLive_sf2` / `0730_SoundBlasterOld` / `0730_Chaos` / `0731_Aspirin` / `0731_FluidR3_GM` / `0731_SoundBlasterOld` | 324 / 253 / 251 / 47 / 18 / 16 / 161 / 171 / 34 KB |
| `0750_SBLive_sf2` (pan flute) | 385 KB |
| `0750_FluidR3_GM_sf2_file.js` ✅ | **107 KB** (8 zonas, `pan_flute_f_4_R_`) |
| `0750_Aspirin` / `0750_JCLive` / `0750_SoundBlasterOld` / `0750_GeneralUserGS` / `0750_Chaos` / `0751_Aspirin` / `0751_FluidR3_GM` / `0751_SoundBlasterOld` / `0751_GeneralUserGS` | 98 / 89 / 34 / 28 / 21 / 12 / 106 / 18 / 5 KB |

> **Nota caña de millo**: no existe en ningún soundfont GM. El sustituto más cercano es **Pan Flute (`0750`)** (zampoña, timbre aireado similar) o **Whistle (`0780`)**. No hay ninguna librería libre de caña de millo colombiana que haya podido verificar.

### Cuerdas (violín `0400`, viola `0410`, cello `0420`, contrabajo `0430`, tremolo `0440`, pizz `0450`, arpa `0460`, timpani `0470`, ensemble `0480`)
| Archivo | Tamaño |
|---|---|
| `0400_FluidR3_GM_sf2_file.js` ✅ (violín) | **451 KB** (14 zonas, `Violin_G_4_R_`) |
| `0400_JCLive` / `0400_Aspirin` / `0400_GeneralUserGS` / `0400_SBLive_sf2` / `0400_SoundBlasterOld` / `0400_Chaos` / `0401_Aspirin` / `0401_FluidR3_GM` / `0401_GeneralUserGS` / `0402_GeneralUserGS` | 363 / 161 / 252 / 112 / 34 / 25 / 95 / 433 / 275 / 71 KB |
| `0420_FluidR3_GM_sf2_file.js` ✅ (cello) | **633 KB** (18 zonas, `Cello_C_3_R_`) |
| `0420_GeneralUserGS` / `0420_Aspirin` / `0420_JCLive` / `0420_Chaos` / `0420_SBLive_sf2` / `0420_SoundBlasterOld` / `0421_FluidR3_GM` / `0421_GeneralUserGS` | 266 / 225 / 179 / 165 / 67 / 20 / 640 / 59 KB |
| `0410_FluidR3_GM` (viola) / `0410_GeneralUserGS` / `0411_FluidR3_GM` / otros | 436 / 172 / 449 / (+ 99, 95, 34, 22 KB) |
| `0480_FluidR3_GM_sf2_file.js` ✅ (Strings Ens. 1) | **1 616 KB** (34 zonas — **incluye pares estéreo `Strings_G2L` / `Strings_G2R`**) |
| `0480_GeneralUserGS_sf2_file.js` ✅ | **783 KB** (23 zonas, `StrLoop_C1`…) |
| `0480_JCLive` / `0480_SBLive_sf2` / `0480_Aspirin` / `0480_Chaos` / `0480_SoundBlasterOld` | 647 / 474 / 207 / 137 / 90 KB |
| `0481_GeneralUserGS` 831 KB · `0482_GeneralUserGS` 821 KB · `0483` 241 · `0484` 53 · `0485` 35 · `0486` 16 · `0487` 214 · `0488` 54 · `0489` 38 KB | |
| `04810`–`04817_GeneralUserGS_sf2_file` (56 / 26 / 21 / 24 / 56 / 10 / 16 / 38 KB) — secciones/solos individuales del ensemble | |
| `0481_FluidR3_GM` 732 KB · `0481_Aspirin` 95 KB · `0482_Aspirin` 137 KB | |

### Piano
| Archivo | Tamaño | Zonas |
|---|---|---|
| `0000_SBLive_sf2` | **1 284 KB** | — |
| `0000_FluidR3_GM_sf2_file.js` ✅ | **1 209 KB** | 20 (`P200_Piano_D2_R_`…) |
| `0000_GeneralUserGS_sf2_file.js` ✅ | **934 KB** | 25 (`Grand_Piano_D1`, `Grand_Piano_F1`, `Grand_Piano_A_1`…) |
| `0000_JCLive_sf2_file` | 841 KB | — |
| `0000_Aspirin_sf2_file` / `0000_Chaos_sf2_file` / `0001_FluidR3_GM` / `0001_GeneralUserGS` / `0002_GeneralUserGS` / `0003_GeneralUserGS` | 710 / 184 / 1 216 / 800 / 821 / 103 KB | — |

### Kits de batería GM (canal 10, notas 35–81) — **esquema totalmente distinto**

**No existen ids `1280_*` / `1281_*`.** El esquema real es:

```
https://surikov.github.io/webaudiofontdata/sound/128<NOTA>_<KIT>_<Fuente>_sf2_file.js
```

- `128<NOTA>` = **12800 + número de nota MIDI**. Notas 35…81 ⇒ ids `12835` … `12881` (exactamente **47 ids**).
- `<KIT>` = índice de kit: `0`=Standard, `8`=Room, `16`=Power, `20`=Electronic, `21`=TR-808, `22`=Jazz, `27`=Brush, `30`=Orchestra Kit (nombres tomados de los `.html` del repo: `drums_0_FluidR3_GM_sf2_fileStandard.html`, `drums_16_…Power.html`, `drums_30_…Orchestra_Kit.html`).
- `<Fuente>` ∈ **`Chaos_sf2_file`, `FluidR3_GM_sf2_file`, `JCLive_sf2_file`, `SBLive_sf2`**. **`GeneralUserGS` NO existe para batería**: `12852_0_GeneralUserGS_sf2_file.js` → **404 verificado**.
- Cada archivo contiene **UNA SOLA NOTA** (`keyRangeLow` = la nota; verificado: `12835_0_FluidR3_GM_sf2_file.js` = 7 KB, 1 zona, `keyRangeLow:35`; `12852_0_FluidR3_GM_sf2_file.js` = 71 KB, 1 zona, `keyRangeLow:52`).

⇒ **Un kit GM completo 35–81 = 47 requests** de ~7–71 KB ≈ 1–1.5 MB en total por kit/fuente. Es enumerable pero verboso; conviene precargar solo las notas que use el MIDI.

### Percusión "percussive" GM (por si sirve de aproximación latina)
`1130_*` Agogo (6–26 KB) · `1140_*` Steel Drums (8–208 KB) · `1150_*` Woodblock (2–19 KB) · `1160_*` Taiko (4–218 KB). **No hay Congas/Bongos/Timbales/Maracas/Güira/Claves como programas melódicos GM** — sólo existen como notas dentro del kit de batería.

---

## C. Recomendación priorizada

### 1) Acordeón vallenato
**Primario: FreePats Button Accordion HN (CC0, CORS ✅)**
`https://raw.githubusercontent.com/freepats/button-accordion-HN/main/Button%20Accordion%20HN%20A4.flac` — 200, 189 KB, `audio/flac`, `ACAO: *`. 34 notas + 34 release samples + `PRESET Button Accordion HN tuned.sfz`. Es un **acordeón de botones real (Hohner)** grabado, exactamente el timbre que buscas. Cargable con `Tone.Sampler` (FLAC es decodificable por `decodeAudioData` en Chrome/Firefox/Safari modernos; si necesitas máxima compatibilidad, convertir a WAV/OGG en build).

**Fallback / capa de expresión: WebAudioFont `0210_GeneralUserGS_sf2_file.js`** (75 KB, 12 zonas, 44.1 kHz, con loop points). Suena a acordeón de teclas (no de botones) y sin velocidades, pero pesa 75 KB y funciona ya.

**Para bolero / tango: `0231_JCLive_sf2_file.js`** (Tango Accordion, 730 KB, 33 zonas) — timbre tipo bandoneón, muy útil en bolero.

### 2) Armónica
- **`0220_JCLive_sf2_file.js`** — 244 KB, 11 zonas (`Harmonica_D2/F_2/A_2`). El más rico y el rango más grave.
- **`0220_FluidR3_GM_sf2_file.js`** — 80 KB, 8 zonas. Mejor relación calidad/peso.
- `0220_GeneralUserGS_sf2_file.js` — 27 KB, 6 zonas, si necesitas algo mínimo.
- ⚠️ **tonejs-instruments NO tiene armónica**; no la busques ahí.

### 3) Bajo
- Acústico: **`0320_FluidR3_GM_sf2_file.js`** (262 KB, 10 zonas, con `loopStart/loopEnd` para notas largas). Ligero: `0320_GeneralUserGS_sf2_file.js` (8 KB, pero 1 nota raíz → muy dependiente del pitch-shift).
- Eléctrico finger (el estándar en vallenato/tropical): **`0330_FluidR3_GM_sf2_file.js`** (438 KB, 9 zonas). Ligero: `0330_GeneralUserGS` (27 KB).
- Eléctrico pick: `0340_FluidR3_GM_sf2_file.js` (544 KB).

### 4) Metales y maderas
- Trompeta: **`0560_FluidR3_GM_sf2_file.js`** (70 KB, 6 zonas). Para más expresividad real (capas de velocidad), **VSCO-2-CE `Brass/Trumpet/…`** (~1 MB por muestra, `_v1/_v2/_v3` + `_rr1/_rr2`, CC0, CORS ✅).
- Trombón: **`0570_FluidR3_GM_sf2_file.js`** (148 KB, 13 zonas).
- Sax alto: **`0650_GeneralUserGS_sf2_file.js`** (167 KB, 13 zonas) — con `_R_` de release; tenor: `0660_FluidR3_GM_sf2_file.js` (697 KB, 15 zonas).
- Flauta: **`0730_FluidR3_GM_sf2_file.js`** (169 KB, 9 zonas). Para caña de millo, **`0750_FluidR3_GM_sf2_file.js`** (Pan Flute, 107 KB) como aproximación.
- French horn / brass section: `0600_FluidR3_GM` (439 KB), `0610_GeneralUserGS` (23 KB).

### 5) Percusión latina + kit GM
- **Congas, bongos, maracas, claves, cajón, castañuelas, darbuka, tambourine → FreePats World Percussion (CC0, CORS ✅)**, `https://raw.githubusercontent.com/freepats/world-percussion/main/samples/<Carpeta>/<n>.flac`, 31–48 KB por golpe. Carpetas: `Conga`, `HighConga`, `LowConga`, `MutedConga`, `MutedLowConga`, `Bongos`, `Maracas`, `Claves`, `CajonFlamenco`, `Castanets`, `Darbuka`, `EggShaker`, `HandClap`, `Tambourine`.
- **Kit GM canal 10** → WebAudioFont `128<nota>_0_FluidR3_GM_sf2_file.js` para notas 35–81 (kit `0` = Standard), o kit `16` Power / `21` TR-808 / `22` Jazz según el tema. Son **47 requests**; cacheá con `Cache-Control: max-age=600` de GitHub Pages (header verificado).
- **Caja vallenata y guacharaca: NO EXISTE ningún pack libre verificado.** Busqué en GitHub (API de repos y código), archive.org (`guacharaca`, `caja vallenata`, `vallenato samples` → sólo devuelve *álbumes de música*, ningún sample pack), Freesound (requiere OAuth/API token para descarga original; muchas licencias NC) y FreePats. **Conclusión honesta: hay que grabarlas, licenciarlas o aproximarlas.** Aproximaciones disponibles: `CajonFlamenco` (FreePats) para la caja, `EggShaker`/`Maracas`/`Cabasa` para la guacharaca, y las notas de conga/bongos del kit GM.

### 6) Piano
- **`0000_GeneralUserGS_sf2_file.js`** — 934 KB, 25 zonas, nombres `Grand_Piano_*`. Mejor equilibrio.
- **`0000_FluidR3_GM_sf2_file.js`** — 1 209 KB, 20 zonas (`P200_Piano_*`), con `_R_` de release.
- Más liviano: `0000_Aspirin_sf2_file.js` (710 KB) o `0000_Chaos_sf2_file.js` (184 KB).
- Alternativa con carácter (piano vertical, CC0, con capas de velocidad): **VSCO-2-CE `Keys/Upright Piano/…`** y `Keys/Upright Nr1/…` (~1 MB por muestra).

---

## D. Riesgos y limitaciones

**Licencias**
- **CC0 (sin obligaciones)** — lo más limpio: VSCO-2-CE (`LICENSE` = "CC0 1.0 Universal"), FreePats button-accordion-HN y world-percussion (`license.spdx_id = CC0-1.0` vía API de GitHub).
- **CC-BY 3.0 (requiere atribución visible)** — samples de tonejs-instruments. El código es MIT, pero **los samples no**. Origen declarado en `sample-source-info.txt`: VSCO 2 (`VSO2`), Karoryfer Samples, University of Iowa, Freesound. **Karoryfer y las muestras de Freesound pueden arrastrar sus propias condiciones** — revisar antes de uso comercial.
- **Sonatina SSO = Creative Commons Sampling Plus 1.0** (licencia antigua y retirada por Creative Commons; lectura jurídica ambigua para uso comercial). Riesgo medio.
- **WebAudioFont**: el repo es **MIT (Copyright 2017 Srgy Surkv)**, pero cubre el *empaquetado de datos*, no los samples. Los `*_GeneralUserGS_*` derivan de **GeneralUser GS (S. Christian Collins)** y los `*_FluidR3_GM_*` de **FluidR3 (MuseScore)**; el README de `webaudiofontdata` enlaza ambas licencias. Es correcto atribuir a ambos.
- **SGM-V2.01 y Timbres of Heaven: licencia no verificada en esta ronda.** No los uses comercialmente sin revisarla.
- **Nada de Freesound es directamente consumible** desde una app web: la descarga original exige API token/OAuth, y abundan licencias **CC-BY-NC** (prohibido uso comercial).

**CORS (header literal obtenido)**
- ✅ **Sí envían `Access-Control-Allow-Origin: *`**: `surikov.github.io`, `nbrosowsky.github.io`, `raw.githubusercontent.com`, `cdn.jsdelivr.net`, `huggingface.co`.
- ❌ **NO envían CORS**: descargas de *releases* de GitHub (`objects.githubusercontent.com`, `ACAO` vacío), `archive.org/download/...` (`ACAO` vacío), `freepats.zenvoid.org` (`ACAO` vacío). ⇒ **GeneralUser GS, Timbres of Heaven, FreePatsGM y los 7z de FreePats NO se pueden bajar desde el navegador**; requieren descarga manual y auto-hospedaje.
- ❌ `musical-artifacts.com` → **403 Cloudflare**; inutilizable programáticamente.
- Mitigación: **auto-hospedar** los archivos que necesites (los pones en `public/` de Vite y el CORS deja de importar). Es la vía recomendada para GeneralUser GS / FreePats 7z.

**Peso**
- Piano WebAudioFont 934 KB–1.2 MB; cuerdas FluidR3 1.6 MB; guitarras hasta 3.7 MB (`0300_LesPaul_sf2`).
- tonejs-instruments ≈ **152 MB por formato** (455.8 MB con mp3+ogg+wav). Un piano completo son ~85 notas × 234 KB ≈ **20 MB**. Hay que submuestrear (`SampleLibrary.load` ya lo hace: cada 2/4/6 samples si >16/32/48).
- VSCO-2-CE ≈ **1 MB por muestra**; con capas de velocidad ×3 y round-robins ×2 el coste se multiplica.
- SGM 528 MB y FreePatsGM 227 MB quedan descartados en la práctica para web.

**Formato que habría que parsear**
- **WebAudioFont**: es **JavaScript**, no JSON. Estructura real verificada:
  ```js
  console.log('load _tone_0022_Aspirin_sf2_file');
  var _tone_0022_Aspirin_sf2_file={
    zones:[
      { midi:2, originalPitch:3600, keyRangeLow:0, keyRangeHigh:47,
        loopStart:67619, loopEnd:69331, coarseTune:0, fineTune:0,
        sampleRate:25000, ahdsr:true,
        file:'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU3LjcyLjEwMQAA…' }
    ]
  };
  ```
  - Se carga con un `<script>` (no requiere CORS) o con `fetch` + `new Function` (el CORS `*` lo permite).
  - `file` es **base64 de un MP3 con tag ID3** (`SUQz` = `ID3\x04`), **no WAV**: hay que `atob` → `Uint8Array` → `decodeAudioData` → `AudioBuffer`.
  - `zones[]` se indexa por `keyRangeLow ≤ nota ≤ keyRangeHigh`; hay que aplicar `coarseTune`/`fineTune` (en cents) y re-muestrear si `sampleRate ≠ context.sampleRate`.
  - `loopStart`/`loopEnd` son **índices de muestra** → loop nativo para notas sostenidas (ideal para acordeón, cuerdas, sax).
  - El campo `midi` es el **número de programa GM**, constante en todo el archivo (21 en el acordeón) — **no** es velocidad.
- **SF2**: requiere un parser RIFF/`sfbk` completo (generadores, moduladores, presets, banks). No alimentable a `Tone.Sampler` sin parsear. Descartado salvo que quieras invertir en un parser.
- **`.7z` / `.tar.xz`**: el navegador no los descomprime sin una librería WASM. Descartados para carga directa.
- **`.sfz`**: es texto plano y sí es parseable en JS (VSCO-2-CE, Sonatina, FreePats), pero tienes que implementar el mapeo `lokey/hikey/pitch_keycenter/lovel/hivel/seq` tú mismo. Alternativa: leer el `.sfz` en build-time y generar un manifiesto JSON de `Tone.Sampler`.

**Otras limitaciones reales**
- **WebAudioFont no tiene capas de velocidad** (0 campos `velocity`/`velRange` en los archivos). La dinámica se logra sólo por ganancia + envolvente AHDSR ⇒ un *forte* no cambia de timbre. La única fuente verificada con **capas de velocidad y round-robin reales** es **VSCO-2-CE** (`_v1/_v2/_v3`, `_rr1/_rr2`).
- **MP3 base64 = compresión con pérdida y delay de encoder**: los `loopStart/loopEnd` pueden producir clicks o desfase; puede requerir micro-fade en los extremos del loop.
- **tonejs-instruments no tiene acordeón, ni armónica, ni percusión latina, ni batería**: sus 20 instrumentos son bass-electric, bassoon, cello, clarinet, contrabass, flute, french-horn, guitar-acoustic, guitar-electric, guitar-nylon, harmonium, harp, organ, piano, saxophone, trombone, trumpet, tuba, violin, xylophone. (Sí tiene `harmonium`, que es un órgano-reed, **no** un acordeón.)
- **Los kits de batería de WebAudioFont requieren 47 archivos por kit**; el índice HTML oficial **no los lista**, hay que construirlos con la fórmula `12800 + nota`.
- **Ningún soundfont GM tiene caja vallenata ni guacharaca**, y no hay programas GM de congas/bongos/timbales (sólo notas de batería).

---

## Evidencia cruda (respuestas literales)

```
HEAD https://surikov.github.io/webaudiofontdata/sound/0021_GeneralUserGS_sf2_file.js
  status=200
  Access-Control-Allow-Origin: *
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: max-age=600
  Last-Modified: Thu, 07 Mar 2019 13:48:59 GMT
  ETag: W/"5c81214b-c123e"
GET  -> RawContentLength = 791094 bytes (772.6 KB)   <-- es un PIANO, no un acordeón

HEAD .../sound/0021_0_FluidR3_GM_sf2_file.js  -> 404 Not Found
HEAD .../sound/0021_1_JCLive_sf2_file.js     -> 404 Not Found
HEAD .../sound/0021_2_GeneralUserGS_sf2_file.js -> 404 Not Found
HEAD .../sound/0021_3_Arachno_sf2_file.js    -> 404 Not Found

GET https://surikov.github.io/webaudiofontdata/sound/  -> 200, 120272 bytes, ACAO=*, 1477 <a href>

GET  .../sound/0022_Aspirin_sf2_file.js -> 200, 194569 bytes (190.0 KB), 6 zonas, 6 loopStart, 6 file:
GET  .../sound/0210_GeneralUserGS_sf2_file.js -> 200, 12 zonas (midi=21, sr=44100, ahdsr=true)
      "velocity" -> 0 | "velRange" -> 0 | "vel:" -> 0

GET  https://raw.githubusercontent.com/freepats/button-accordion-HN/main/Button%20Accordion%20HN%20A4.flac
  -> 200, 189 KB, Access-Control-Allow-Origin: *, Content-Type: audio/flac

HEAD https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Brass/Trumpet/harmonM-sus/Sum_SHTrumpet_harmonM-sus_C3_v1_rr1.wav
  -> 200, 1132648 bytes, Access-Control-Allow-Origin: *

HEAD https://raw.githubusercontent.com/peastman/sso/master/Sonatina%20Symphonic%20Orchestra/Samples-looped/Alto%20Flute/alto_flute-a%233.wav
  -> 200, 134 KB, Access-Control-Allow-Origin: *

GET  https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/C3.mp3
  -> 200, 331812 bytes (324 KB), ACAO=*, Content-Type: audio/mp3
GET  https://nbrosowsky.github.io/tonejs-instruments/samples/piano/C4.mp3      -> 200, 239164 B
GET  https://nbrosowsky.github.io/tonejs-instruments/samples/saxophone/C4.mp3  -> 200, 150272 B
GET  https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples/guitar-acoustic/C3.mp3 -> 200, 331812 B, ACAO=*
GET  https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/guitar-acoustic/C3.mp3 -> 200, 331812 B, ACAO=*

HEAD https://huggingface.co/spaces/asigalov61/Allegro-Music-Transformer/resolve/main/SGM-v2.01-YamahaGrand-Guit-Bass-v2.7.sf2
  -> 200, 528.3 MB, Access-Control-Allow-Origin: *

HEAD https://archive.org/download/general-user-gs/GeneralUser-GS.zip        -> 200, 55.7 MB, ACAO=''
HEAD https://archive.org/download/timbres-of-heaven-xgm-4.00-g.-7z/Timbres%20of%20Heaven%20(XGM)%204.00(G).7z -> 200, 285.3 MB, ACAO=''
HEAD https://freepats.zenvoid.org/SoundSets/FreePats-GeneralMIDI/FreePatsGM-SF2-20221026.7z -> 200, 226.8 MB, ACAO=''
HEAD https://freepats.zenvoid.org/SoundSets/GM-PercussionSet/FreePatsGM-Percussion-SF2-20200822.tar.xz -> 200, 14.9 MB, ACAO=''
HEAD https://github.com/freepats/button-accordion-HN/releases/download/2024-03-29/ButtonAccordionHN-SFZ+WAV-20240329.7z -> 200, 5.7 MB, ACAO=''
HEAD https://github.com/freepats/world-percussion/releases/download/2020-09-05/WorldPercussion-SF2-20200905.7z -> 200, 4.9 MB, ACAO=''

GET  https://surikov.github.io/webaudiofontdata/sound/12835_0_FluidR3_GM_sf2_file.js -> 200, 7 KB, 1 zona, keyRangeLow:35
GET  https://surikov.github.io/webaudiofontdata/sound/12852_0_FluidR3_GM_sf2_file.js -> 200, 71 KB, 1 zona, keyRangeLow:52
GET  https://surikov.github.io/webaudiofontdata/sound/12852_0_GeneralUserGS_sf2_file.js -> 404 Not Found

GET  https://musical-artifacts.com/artifacts?tags=accordion&formats=sf2 -> 403 Forbidden (Cloudflare)
GET  https://schristiancollins.com/generaluser.php -> 200, 3872 bytes, 0 href a .sf2  (app JS)
GET  https://www.arachnosoft.com/main/download.php?id=arachno -> 200, 87452 bytes, 0 href a .sf2/.zip
```

### Licencias (texto verificado)
```
webaudiofontdata/LICENSE  -> "MIT License / Copyright (c) 2017 Srgy Surkv"
nbrosowsky LICENSE.md     -> "MIT License / Copyright (c) 2018 Nicholaus P. Brosowsky"
nbrosowsky README         -> "Code: MIT License (see LICENSE.md) / Samples: CC-by 3.0"
sgossner/VSCO-2-CE LICENSE-> "CC0 1.0 Universal"
peastman/sso README       -> "License | Creative Commons Sampling Plus 1.0 license"
freepats/button-accordion-HN -> license.spdx_id = CC0-1.0 (API GitHub, default_branch=main)
freepats/world-percussion    -> license.spdx_id = CC0-1.0 (API GitHub, default_branch=main)
```

### Archivos de trabajo generados en el repo
- [`informe-samples-instrumentos-reales.md`](informe-samples-instrumentos-reales.md) — este informe
- [`waf_tree.json`](waf_tree.json) — árbol completo del repo `surikov/webaudiofontdata` (6741 entradas)
- [`waf_index.csv`](waf_index.csv) — índice id/tamaño de los 5226 `.js`
- [`waf_index_sections.txt`](waf_index_sections.txt) — índice oficial parseado por instrumento (129 secciones)
- [`waf_targets.txt`](waf_targets.txt) y [`waf_targets2.txt`](waf_targets2.txt) — variantes por instrumento con tamaños
- [`tji_tree.json`](tji_tree.json) — árbol de `nbrosowsky/tonejs-instruments`
- [`vsco_tree.json`](vsco_tree.json) — árbol de `sgossner/VSCO-2-CE`
- [`sso_tree.json`](sso_tree.json) — árbol de `peastman/sso`
- [`button-accordion-HN_tree.json`](button-accordion-HN_tree.json) y [`world-percussion_tree.json`](world-percussion_tree.json) — árboles de FreePats
