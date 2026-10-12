# Auditoría de realismo — pipeline de samples

**Alcance:** `app/src/engine/*` y `app/src/utils/*` del reproductor MIDI web
(Vite + React + Tone.js **15.1.22**).

**Líneas de base del informe:** commit `fa81ad7`
(*"fix(audio): sin clics y sin notas cortadas — buffers procesados al cargar"*).
Los números de línea de este documento corresponden a ese commit, que es el
estado que describe el pedido ("acabamos de eliminar todo sintetizador y de
nivelar los samples").

> **Nota de concurrencia.** Mientras corría esta auditoría, el árbol de trabajo
> recibió cambios en `instrumentSources.ts`, `vscoSampler.ts` y `DrumKitEngine.ts`
> (más el archivo nuevo `instrumentPanning.ts`) que ya atacan tres de los
> hallazgos de acá: round-robin melódico, paneo y humanización de ganancia. La
> sección final **§ Estado del árbol de trabajo** dice exactamente qué quedó
> cubierto y qué no, para no proponer trabajo ya hecho.

**Método.** Cada afirmación cuantitativa sale de contar el manifiesto real o de
medir el archivo real (HEAD request / `Content-Length` / cabecera FLAC
`STREAMINFO`). Los scripts usados fueron temporales y se borraron; los conteos
quedan citados en el texto.

---

## 1. Round-robin melódico — **NO se usa**: se descarta la variante 2

### Hallazgo

El código **siempre toma la variante `[0]`** de cada capa. La rotación de tomas
existe para la percusión, no para los instrumentos melódicos.

### Evidencia

`app/src/engine/vscoSampler.ts:156-159` (HEAD) — el comentario *afirma* que rota,
pero el índice está fijo en `0`:

```ts
// Por cada capa (v1, v2, …) se arma su mapa de notas. La variante
// round-robin se rota por nota, que es como lo haría un sampler real.
const sample = instrument.layers[note]?.[layerIndex]?.[0];
//                                                            ^^^ siempre rr1
```

(el `[0]` está en la línea **171** del HEAD; en el árbol de trabajo el mismo
patrón quedó en `vscoSampler.ts:205-206`, ya con rotación.)

Conteo sobre `app/src/engine/vscoManifest.ts` (23 instrumentos, 260 claves de
nota, 618 entradas `<vel, rr, url>`):

| Métrica | Valor |
|---|---|
| Entradas `rr: 1` | 521 |
| Entradas `rr: 2` | **97 → 15,70 %** |
| Entradas con `rr > 2` | 0 |
| Notas donde **alguna capa** tiene 2 variantes distintas | **43 / 260 → 16,54 %** |

Y esas 43 notas están concentradas en cuatro instrumentos:

| Instrumento | Notas con rr alternable | Notas totales |
|---|---|---|
| Drum Kit | 30 | 33 |
| Acoustic Grand Piano (Upright Nr1) | 7 | 7 |
| Timpani | 5 | 5 |
| Cello | **1** (nota 40, sólo capa 1) | 13 |

→ **0 de las 249 notas de los otros 19 instrumentos melódicos** (trompeta,
trombón, corno, tuba, flauta, clarinete, oboe, fagot, piccolo, violín, viola,
contrabajo, ensamble de cuerdas, arpa, piano vertical, glockenspiel, marimba,
xilófono, campanas tubulares) tiene una segunda toma: en el manifiesto están
todas con `rr: 1`.

Peor: la única nota con rr2 "melódica" fuera de la percusión y del piano es
`susvib_E1_v1_1.wav` / `_2.wav` del Cello (`vscoManifest.ts:1183-1184`), y el
piano de VSCO **nunca se toca** (ver § 8, "piano VSCO inalcanzable").

### Impacto

**Medio.** Es un desperdicio real (97 WAV ya verificados con CORS quedan
sin bajar) y en una escala rápida de cuerda o metal la nota repetida es
literalmente la misma grabación, sample por sample. Pero limitado: sólo 16,5 %
de las notas del banco tienen rr2, así que activarlo no arregla el banco entero.

### Mejora concreta

Rotar el índice de variante por nota en `LayeredSampler.triggerAttack`
(`(this.nextVariant[layer]++ % variants.length)`) **y** regenerar el manifiesto
con `rr2` para las familias que hoy tienen una sola toma (cuerdas y maderas son
las que más lo necesitan), porque sin muestras rr2 el rotador no tiene qué rotar.

---

## 2. Samples de release — **existen, están en el manifiesto del repo, y no se usan**

### Hallazgo

Los 17 samples de release del acordeón de botones están publicados en el repositorio
de FreePats, el código **los menciona en un comentario** y **nunca los carga**.
Además, ningún `Tone.Sampler` melódico declara `release`, así que todos usan el
default de Tone (**0,1 s**) — un corte seco en cada note-off.

### Evidencia

**a) El comentario ya sabe que existen** — `app/src/engine/freePatsAccordion.ts:9`:

```
 * 17 notas grabadas (B3…G6) más samples de release. `Tone.Sampler` repitchea
 * las que faltan: la distancia máxima entre notas grabadas es 2 semitonos.
```

**b) El cargador sólo arma el mapa de sustain** — `freePatsAccordion.ts:47-53`
y `:70-73`:

```ts
export const BUTTON_ACCORDION_URLS: Record<string, string> =
  Object.fromEntries(
    BUTTON_ACCORDION_NOTES.map((note) => [
      note,
      `${BASE}/${encodeURIComponent(`Button Accordion HN ${note}.flac`)}`,
    ]),
  );
...
    const sampler = new Tone.Sampler({
      urls: BUTTON_ACCORDION_URLS,
      onload: () => { … },
```

No hay `release:` ni carpeta `rel/` en ninguna parte del archivo.

**c) Los archivos que NO se están usando** (árbol real del repo
`freepats/button-accordion-HN@main`, vía API de GitHub), 17 archivos en `rel/`:

| Archivo | Duración medida (cabecera FLAC `STREAMINFO`) |
|---|---|
| `rel/Button Accordion HN B3_rel.flac` | 0,265 s |
| `rel/Button Accordion HN D4_rel.flac` | 0,560 s |
| `rel/Button Accordion HN F#4_rel.flac` | 0,395 s |
| `rel/Button Accordion HN G4_rel.flac` | 0,573 s |
| `rel/Button Accordion HN A4_rel.flac` | 0,321 s |
| `rel/Button Accordion HN B4_rel.flac` | 0,545 s |
| `rel/Button Accordion HN C5_rel.flac` | 0,544 s |
| `rel/Button Accordion HN D5_rel.flac` | 0,434 s |
| `rel/Button Accordion HN E5_rel.flac` | 0,377 s |
| `rel/Button Accordion HN F#5_rel.flac` | 0,319 s |
| `rel/Button Accordion HN G5_rel.flac` | 0,376 s |
| `rel/Button Accordion HN A5_rel.flac` | 0,309 s |
| `rel/Button Accordion HN B5_rel.flac` | 0,529 s |
| `rel/Button Accordion HN C6_rel.flac` | 0,529 s |
| `rel/Button Accordion HN D6_rel.flac` | 0,274 s |
| `rel/Button Accordion HN E6_rel.flac` | 0,313 s |
| `rel/Button Accordion HN G6_rel.flac` | 0,274 s |

**0,265 s – 0,573 s** cada uno: es el ruido mecánico de válvulas y fuelle al
cerrar la nota. Todos los sustains correspondientes también se midieron:
**1,35 s – 2,47 s** (el mapa `BUTTON_ACCORDION_NOTES` cubre exactamente las 17
notas del repo, así que la lista está completa — ese punto ya está bien).

**d) El default de release de Tone es 0,1 s** —
`app/node_modules/tone/build/esm/instrument/Sampler.js`, `getDefaults()`:

```js
attack: 0,
release: 0.1,
```

y ningún sampler melódico lo sobrescribe: `freePatsAccordion.ts:70`,
`vscoSampler.ts:273` (HEAD), `GMSamplerEngine.ts:462`, `WebAudioFont.ts:196`,
`instrumentSources.ts:311` (HEAD) → todos sin `release`. El **piano** sí lo
configura con `sustainTime` (1,2 s por defecto: `App.tsx:1026`,
`App.tsx:1390`).

**e) VSCO y tonejs no tienen release.** Verificado contra el repo: en el branch
`master` de `sgossner/VSCO-2-CE` las carpetas de articulación son
`Brass/Trumpet/{harmonM-sus,stac,straightM-sus,sus,susvib}`,
`Woodwinds/Flute/{expvib,stac,susNV,susvib}` — **no hay carpeta `rel`**. Y
`tonejs-instruments` es una toma por nota (`tonejsManifest.ts:5-7`). Así que el
único release real disponible y gratis en el stack actual **es el del acordeón**.

### Impacto

**Alto.** El acordeón es la voz cantante del vallenato, y el "clic" mecánico de
la válvula al soltar la tecla es *el* sonido que lo identifica como acordeón y no
como un órgano de fuelle genérico. Hoy, encima, se corta a 0,1 s de fade lineal:
un instrumento de fuelle real tarda cientos de milisegundos en apagarse.

### Mejora concreta

Cargar los 17 `rel/*.flac` y dispararlos en `triggerRelease` como un
`Tone.ToneBufferSource` a `−6 dB` (o `−12 dB` por debajo del sustain), con el
mismo repitcheo por nota más cercana; y subir el `release` del sampler del
acordeón a ~0,25 s para que el sustain no se corte antes que entre el release.

---

## 3. Imagen estéreo — **todo al centro: no hay ningún paneo en el grafo**

### Hallazgo

Todos los samplers melódicos y la batería se conectan **directamente al mismo
`Tone.Volume` maestro**, sin `Panner` ni `PanVol` en el camino. Existe un control
de paneo en la UI del mezclador de partituras **que no toca el audio**.

### Evidencia

**Punto exacto del grafo donde se conectan los samplers** — `App.tsx:1003-1006`:

```ts
      // Percusión real (canal 10): sólo samples grabados, sin respaldo
      // sintetizado.
      drumKitRef.current = new DrumKitEngine(vol);

      // GM sampler destination — all non-piano real samples route through here
      gmDestRef.current = vol;
```

y `vol` es el `Tone.Volume` maestro — `App.tsx:946-964`:

```ts
      // Create effects chain: vol -> chorus -> reverb -> compressor -> limiter -> out
      const limiter = new Tone.Limiter(-2).toDestination();
      ...
      const vol = new Tone.Volume(stateRef.current.masterVolume).connect(
        chorus,
      );
```

El piano va al mismo nodo: `App.tsx:1063` → `}).connect(vol);`.

**No hay un solo `Panner`/`PanVol` en `app/src/`:**

```
grep -rn "Panner|PanVol|\.pan\b|pan:" app/src
→ 10 coincidencias, 0 en el camino de audio:
  App.tsx:2921        handlePartPanChange  (sólo setScoreParts)
  constants/audio.ts:120  panToStereo()   (definida, nunca llamada)
  types/score.ts:196  pan: number
  components/score/PartMixer.tsx:141,146  slider + etiqueta "C/L40/R40"
  parsers/MusicXMLParser.ts:1015  pan: 0
```

La función que sí panea **no se usa**:

```ts
// constants/audio.ts:120
export function panToStereo(pan: number): [number, number] {
  // Equal power panning
```

El handler del mezclador sólo guarda el número en el estado de React —
`App.tsx:2921-2925`:

```ts
  const handlePartPanChange = useCallback((partId: string, pan: number) => {
    setScoreParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, pan } : p)),
    );
  }, []);
```

Tampoco hay paneo por **pista**: no existe un nodo de audio por pista en ningún
lado (ver § 8.1). El único nodo por instrumento es el `Tone.Volume` interno de
cada motor sintetizado (`InstrumentEngine.ts:280, 396, 735, 975, 1148`), todos a
0 dB.

### Impacto

**Medio-alto.** Un mix 100 % mono colapsado al centro es, junto con la falta de
release, lo que más "suena a maqueta": una banda real ocupa un escenario. Con
auriculares se nota inmediatamente; en un parlante Bluetooth mono no.

### Mejora concreta

Meter un `Tone.Panner` por instrumento (o mejor, por **pista**) en
`gmDestRef`/`DrumKitEngine` con paneo determinista por programa GM —y usar el
valor de `ScorePart.pan` cuando la partitura lo traiga— en lugar de conectar
directo a `vol`.

---

## 4. Reverb / EQ — **uno solo, global, sin EQ y con los graves adentro**

### Hallazgo

Hay **un único** `Tone.Reverb` global con `wet` fijo de 0,18, colocado
*después* del fader maestro y *antes* del compresor. No hay ningún filtro en
**ningún** punto del camino de audio: los graves (bombo, bajo, contrabajo) entran
al reverb tal cual y lo ensucian, y no hay EQ en el master. Tampoco hay send por
familia de instrumento.

### Evidencia

Grafo completo — `App.tsx:946-964`:

```ts
      // Create effects chain: vol -> chorus -> reverb -> compressor -> limiter -> out
      const limiter = new Tone.Limiter(-2).toDestination();
      const compressor = new Tone.Compressor({
        threshold: -18, // start compressing at -18dB
        ratio: 5, // 5:1 ratio
        attack: 0.003, // 3ms attack — catches transients fast
        release: 0.1, // 100ms release
        knee: 6, // soft knee, transparent
      }).connect(limiter);
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.18 }).connect(
        compressor,
      );
      await reverb.generate();
      const chorus = new Tone.Chorus(4, 2.5, 0.5).connect(reverb);
      chorus.wet.value = 0.0;
      chorus.start();
      const vol = new Tone.Volume(stateRef.current.masterVolume).connect(
        chorus,
      );
```

Cadena resultante: **samplers → `vol` → chorus (wet 0) → reverb (wet 0,18) →
compressor → limiter → destino**.

- **Un reverb global, no uno por familia**: no hay ninguna otra búsqueda de
  `Tone.Reverb` en `app/src/` fuera de `BrassSamplerEngine.ts:106` (motor de
  osciladores que ya no se rutea, ver `playbackRouting.ts:50-55`) y
  `hooks/useAudioEngine.ts:129` (motor muerto: `useAudioContext()` no lo consume
  nadie, ver `useAudioEngine.ts:110-112`).
- **Sin filtro**: `grep "Tone\.Filter" app/src` → sólo
  `BrassSamplerEngine.ts:111`. En el camino vivo, **cero** `Tone.Filter`, cero
  `Tone.EQ3`.
- **El fader maestro está ANTES del reverb** (`vol` → `chorus` → `reverb`): bajar
  el volumen no baja la proporción de reverb, así que la mezcla se va poniendo
  más "bañada" a medida que el usuario baja el volumen.

### Impacto

**Medio.** El reverb de 1,5 s / 18 % no es excesivo, y tener compresor + limitador
(-2 dB) ya es mejor que el promedio. El problema es de *calidad*, no de cantidad:
un reverb sin high-pass recibe el bombo y el bajo y devuelve un "lodo" en los
graves; y el mismo send para una maraca y para un contrabajo no es una decisión
de mezcla, es un default.

### Mejora concreta

Pasar de reverb en serie a **send**: `Tone.Filter` high-pass a ~200 Hz (12 dB/oct)
en la entrada del reverb y un send por familia (cuerdas/pads ~0,3 · metales/maderas
~0,2 · percusión ~0,05 · bombo/bajo 0), dejando el master 100 % seco.

---

## 5. Velocity — **curva correcta en el piano, doble aplicación en la batería y capas elegidas por umbral equivocado**

### Hallazgo

Hay **dos** traducciones distintas de velocity conviviendo:

1. **Percusión**: `velocityToGain` existe y **se aplica dos veces** sobre la
   misma señal (una en `App.tsx`, otra en `DrumKitEngine.trigger`).
2. **Melódicos**: no hay ninguna traducción propia; la velocity llega cruda a
   `Tone.Sampler.triggerAttack`, que la usa como **ganancia lineal**
   (`source.start(..., velocity)`), y a `LayeredSampler.layerFor`, que reparte
   las capas por **división lineal**, no por umbrales de dinámica.

### Evidencia

**a) La función, con curva** — `DrumKitEngine.ts:49-57` (HEAD):

```ts
/**
 * Curva de velocity: la percusión golpeada fuerte no sólo suena más fuerte,
 * cambia de timbre. Con samples de una sola capa, al menos que la dinámica sea
 * marcada en vez de lineal.
 */
function velocityToGain(velocity: number): number {
  const v = Math.max(0.02, Math.min(1, velocity));
  return Math.pow(v, 1.35);
}
```

**b) Se aplica dos veces** — `App.tsx:1657-1662`:

```ts
        if (percussive) {
          const drum = drumKitRef.current;
          const hitVelocity = Math.max(0.05, Math.min(1, note.velocity * trackVol));
          if (drum && !drum.trigger(note.midi, hitVelocity, audioTime)) {
```

y otra vez dentro — `DrumKitEngine.ts:194-196` (HEAD):

```ts
    const pieceDb = this.pieceGain.get(note) ?? -6;
    const gain = velocityToGain(velocity) * Math.pow(10, pieceDb / 20);
```

→ el exponente efectivo para la batería es **1,35² = 1,82**. Con
`note.velocity = 0,5` (un mezzo-forte cualquiera) eso da **0,283 en vez de 0,392
(−2,8 dB)**; con un golpe suave de 0,3, **−10,4 dB en vez de −6,3 dB**. Para un
acompañamiento rítmico en 16avos eso es un gate: los golpes flojos desaparecen.

**c) Melódicos: sin curva propia, ganancia lineal** —
`app/node_modules/tone/build/esm/instrument/Sampler.js`:

```js
source.start(time, 0, buffer.duration / playbackRate, velocity);
```

El cuarto argumento de `AudioBufferSourceNode.start()` es ganancia **lineal**.
Tone 15 no le aplica ninguna curva. O sea: velocity 0,5 ⇒ −6,0 dB; 0,25 ⇒ −12 dB.

**d) La curva del piano sí se aplica, pero sólo al piano.** El único camino que
pasa por la pipeline de curvas es el de entrada MIDI en vivo —
`App.tsx:3564-3566`:

```ts
      // Apply velocity curve through the calibrated pipeline:
      //   raw → calibration remap → curve → audibility floor
      const velocity = midiVelocityToGain(rawVelocity, vc, stateRef.current.velocityCalibration);
```

La curva (`utils/velocity.ts:205-232`: `linear` / `soft = v^0.5` / `hard = v²` /
`piano = v³` / `fixed`) **no se aplica** en el camino de reproducción de canción:
`App.tsx:1696` pasa `note.velocity * trackVol` tal cual.

**e) `trackVol` no es ganancia, es velocity.** El fader del mezclador multiplica
la velocity (`App.tsx:1643-1646`, `:1696`) en vez de atenuar un nodo:

```ts
        const trackVol =
          liveVolumes[note.trackIndex] !== undefined
            ? liveVolumes[note.trackIndex]
            : 0.8;
...
          triggerAttack(
            note.midi,
            note.velocity * trackVol,
```

Consecuencia: bajar una pista **cambia el timbre** (elige capas más suaves) en vez
de sólo bajarla. Y con el default 0,8, todas las pistas arrancan al 80 % de la
velocity escrita en el archivo.

**f) ¿Se usa la velocity para elegir capa de VSCO? Sí, pero con el umbral
equivocado** — `vscoSampler.ts:88-95` (HEAD):

```ts
  private layerFor(velocity: number): number {
    if (this.layers.length === 1) return 0;
    const v = Math.max(0, Math.min(1, velocity));
    const index = Math.floor(v * this.layers.length);
    return Math.max(0, Math.min(this.layers.length - 1, index));
  }
```

Con 2 capas el corte cae en **v = 0,5**, y con 3 capas en 0,333 / 0,667. En
términos de velocity MIDI (que es lo que viene en `note.velocity`):

| Capas | v1 (suave) | v2 (media) | v3 (fuerte) |
|---|---|---|---|
| 2 | MIDI 0–63 | MIDI 64–127 | — |
| 3 | MIDI 0–42 | MIDI 43–85 | MIDI 86–127 |

O sea: la capa *fortissimo* se dispara desde **MIDI 64 (mf)** en los instrumentos
de 2 capas — 12 de los 20 instrumentos melódicos de VSCO (`capas=[2]` en
Trumpet, Oboe, Violin, Viola, Cello, Contrabass, String Ensemble 1) —. Un pasaje
`mf` de un violín ya suena con la toma `_f`, que es exactamente el error de
"timbre que no corresponde a la dinámica escrita".

### Impacto

**Alto.** Es el punto donde el reproductor decide *cuánto* y *cómo* suena cada
nota, y las tres piezas (doble curva en batería, linealidad en melódicos,
umbral de capa) están mal calibradas.

### Mejora concreta

Una sola función compartida `velocityToGain` con exponente ~1,35 en **ambos**
caminos (quitando la doble aplicación de la batería) y elegir la capa de VSCO por
**umbrales de dinámica** (pp/p ≤ 0,35 · mp/mf ≤ 0,7 · f/ff > 0,7) en vez de por
`Math.floor(v × n)`.

---

## 6. Humanización — **ninguna**: cada nota igual suena exactamente igual

### Hallazgo

No hay ninguna variación por nota. `Tone.Transport.schedule` calcula el tick con
`Math.round` determinista, sin offset, y no hay micro-desafinación en ningún lado.

### Evidencia

**a) El scheduling es determinista** — `App.tsx:1604-1611`:

```ts
    scheduledNotes.forEach(({ note, percussive }) => {
      const duration = Math.max(0.04, note.duration);
      const tickStart = Math.round(
        (note.time / 60) * song.bpm * Tone.Transport.PPQ,
      );
```

**b) No existe micro-desafinación en el camino de samples.** El único `detune` de
`app/src` es de un motor sintetizado que ya no se rutea —
`InstrumentEngine.ts:503-506`:

```ts
      this.synth.set({ detune: -80 });
      ...
      this.synth.set({ detune: 0 });
```

**c) Nada de jitter/randomización** — `grep -rni "humaniz|jitter|swing|microTiming|randomOffset" app/src` (HEAD) → sólo `music/ids.ts:83 humanizeRef` (nombres de archivo) y `components/gamification/PianoPet.ts:198` (animación). Cero en audio.

**d) La única variación real que existe es para la percusión, y es de *toma*, no
de nota** — `DrumKitEngine.ts:189-192` (HEAD):

```ts
    const index = (this.nextVariant.get(note) ?? 0) % list.length;
    this.nextVariant.set(note, index + 1);
```

Eso rota los 6 golpes de FreePats (`MAX_VARIANTS = 6`,
`DrumKitEngine.ts:38`) en ciclo estricto. Está bien y es lo que evita el efecto
ametralladora — pero es determinista (nunca repite un golpe dos veces seguidas ni
al azar) y no aporta variación de *intensidad* ni de *timing*.

### Impacto

**Alto.** Junto con el release de 0,1 s y el centro mono, es lo que el oído
identifica como "robótico": una escala de 16 notas iguales es 16 veces exactamente
el mismo evento, con el mismo nivel y el mismo instante relativo a la rejilla.

### Mejora concreta

En el wrapper de voz (donde ya se puede envolver sin tocar el sampler), añadir
**micro-timing de ±3–8 ms** al `audioTime` de cada nota, **micro-desafinación de
±3–6 cents** y variación de ganancia de ±0,5 dB, todo determinista por
`hash(instrumento, nota, tick)` para que el playback sea reproducible.

---

## 7. Loop / extensión (`sampleProcessing.ts`) — la heurística no mira periodicidad

Esta sección es crítica y hay que separar dos cosas que el archivo mezcla.

### Hallazgo A — cuándo se dispara (y por qué importa menos de lo que parece, y más de lo que parece)

`extendSustainedBuffer` sólo actúa si `duration < minSeconds = 3,6 s` —
`sampleProcessing.ts:111-116`:

```ts
export function extendSustainedBuffer(
  buffer: AudioBuffer,
  options: { minSeconds?: number; targetSeconds?: number; crossfadeMs?: number } = {},
): AudioBuffer {
  const { minSeconds = 3.6, targetSeconds = 14, crossfadeMs = 45 } = options;
  if (buffer.duration >= minSeconds) return buffer;
```

Medí la duración real de 89 samples de VSCO (HEAD request + `Content-Length`):
**7,10 s – 84,35 s** (p. ej. `Sum_SHTrumpet_sus_C3_v1_rr1.wav` = 2.677.040 B;
`Oboe_Sus_A#2_v1_Main.wav` = 4.783.096 B). Sólo **2 de 89** bajan de 3,6 s. Es
decir: **VSCO casi nunca se loopea** — suena su propia grabación de 7 a 84
segundos, que es lo correcto. Eso ya está bien y no hay que tocarlo.

Los que **sí** se loopean son las otras fuentes:

| Fuente | Duración real medida | ¿Entra al loop? |
|---|---|---|
| VSCO | 7,10 – 84,35 s | casi nunca (2/89) |
| tonejs-instruments (mp3) | 5,0 – 28,2 s | rara vez |
| soundfont GM (gleitz, ogg) | **~1,9 – 2,1 s** por zona | **siempre**, si `isSustainedInstrument` |
| WebAudioFont | zonas cortas de soundfont | **siempre**, si sostenido |
| **Acordeón FreePats** | **1,35 – 2,47 s** | **nunca** — no pasa por `prepareSampleBuffer` |

Ese último renglón es el hallazgo importante: `loadButtonAccordion`
(`freePatsAccordion.ts:70-83`) construye el `Tone.Sampler` **desde URLs**, sin
pasar por `prepareSampleBuffer`, así que el acordeón no recibe ni la extensión ni
los micro-fades; con samples de 1,35 s, cualquier blanca o redonda **se muere
sola** y encima el release de 0,1 s la corta.

### Hallazgo B — la heurística de loop no detecta vibrato ni trémolo

Es el defecto de diseño del archivo. La elección del punto de loop es
exclusivamente por **RMS plano** — `sampleProcessing.ts:119-148`:

```ts
  const data = buffer.getChannelData(0);
  const total = data.length;

  // Candidatos de loop en la segunda mitad, evitando el ataque y el final.
  const windowLength = Math.min(Math.floor(sr * 0.9), Math.floor(total * 0.3));
  if (windowLength < sr * 0.08) return buffer; // demasiado corto para loopear
  ...
  // Zona estable = RMS más cercano a la mediana de los candidatos.
  const rmsList = candidates.map((start) => windowRms(data, start, windowLength));
  const sorted = [...rmsList].sort((a, b) => a - b);
  const medianRms = sorted[Math.floor(sorted.length / 2)];
  // Un sample que ya está decayendo (cola mucho más baja que el medio) no se
  // puede loopear sin que se note el empalme.
  if (medianRms < 0.004) return buffer;
```

y el cosido es un crossfade lineal a ciegas — `sampleProcessing.ts:169-186`:

```ts
    let write = total;
    while (write < targetSamples) {
      const block = Math.min(windowLength, targetSamples - write);
      const srcStart = bestStart;
      for (let i = 0; i < block; i++) {
        const value = src[srcStart + i] ?? 0;
        // Crossfade con la cola ya escrita, para que el empalme no tenga escalón.
        if (i < fadeLength) {
          const t = i / fadeLength;
```

Concretamente, **qué sale mal** en cada caso:

1. **Sustain con vibrato o trémolo (el caso grave).** La ventana de loop es de
   hasta **0,9 s** y el crossfade de **45 ms**. En un `susvib` de cuerda (5–6 Hz)
   o en el batido de un acordeón (musette, 4–7 Hz), el período de modulación es de
   **~150–250 ms**. La ventana elegida **no es un múltiplo entero del período** y
   el crossfade de 45 ms cae **en mitad de un ciclo**. Resultado: al repetir, la
   envolvente de amplitud salta de fase en cada empalme y aparece un **pulso
   periódico** —un "wow-wow" a la frecuencia del loop— que no estaba en la
   grabación. Es el artefacto más audible de todo el pipeline y es
   matemáticamente inevitable: el código no tiene ni una línea que mida
   periodicidad (ni autocorrelación, ni detección de pitch, ni de AM). El único
   guardarraíl es `medianRms < 0.004`, que descarta *decaimiento*, no
   *modulación* — un trémolo perfectamente estable pasa el filtro sin problemas.
   Es exactamente el caso que el banco usa: `Flute/susvib`, `Viola Section/susvib`,
   `Cello Section/susvib`, `Violin Section/susVib` y el `accordion` de GM.
2. **Samples muy cortos.** Tres salidas distintas, las tres malas:
   `windowLength < sr*0.08` (80 ms) → **devuelve el original** sin loop, la nota
   se corta y sólo se le aplica un fade de salida de 40 ms
   (`sampleProcessing.ts:124`); `candidates.length === 0` (segunda mitad vacía) →
   ídem (`:130`); o el loop se arma igual y el corte llega a 3,15 s.
3. **El fade de salida de 40 ms es fijo para TODO** —
   `sampleProcessing.ts:60-64` y `:196-204`:

   ```ts
   export function withAntiClickFades(
     buffer: AudioBuffer,
     fadeInMs = 3,
     fadeOutMs = 40,
   ): AudioBuffer {
   ...
   export function prepareSampleBuffer(
     buffer: AudioBuffer,
     instrument: string,
   ): AudioBuffer {
     const extended = isSustainedInstrument(instrument)
       ? extendSustainedBuffer(buffer)
       : buffer;
     return withAntiClickFades(extended);
   }
   ```

   En un sample de 0,20 s (un `Triangle3-Hit` de VSCO mide 1,03–1,51 s; una nota
   de glockenspiel `glock_medium_C7.wav` mide 2,79 s), **40 ms son el 20 % de la
   señal**: se come la cola del ataque. En samples percusivos con cola larga
   (marimba `Marimba_hit_Outrigger_F1_loud_01.wav` = 5,51 s) recorta la
   resonancia que define el instrumento.
4. **Percusión.** `isSustainedInstrument` filtra por nombre
   (`sampleProcessing.ts:46-52`) y excluye `piano|guitar|marimba|xylophone|glocken|
   celesta|vibraphone|bell|dulcimer|banjo|koto|kalimba|music box`. Quedan **dentro**
   del camino de loop la batería y los timbales de VSCO
   (`Drum Kit`, `Timpani`), que no son sostenidos: la heurística de "zona estable
   en la segunda mitad" busca una meseta que **no existe** en un instrumento que
   decae; termina eligiendo una ventana arbitraria, o sale por `medianRms < 0.004`
   (`:138`). El resultado no es catastrófico porque la mayoría de esos samples ya
   superan 3,6 s (`Timpani1_Hit` mide 3,08–3,17 s, justo en el borde), pero el
   `Timpani` es el caso donde el loop puede entrar y sonar mal.
5. **Bug de canales.** `sampleProcessing.ts:165`:

   ```ts
   const src = buffer.numberOfChannels === 1 ? data : buffer.getChannelData(c);
   ```

   `data` es siempre `getChannelData(0)` (`:119`). Funciona de casualidad (con 1
   canal el canal 0 *es* el único), pero significa que **para estéreo el punto de
   loop se decide mirando sólo el canal izquierdo**: un sample con paneo o
   contenido distinto por canal puede recibir un loop óptimo para L y malo para R.
6. **Costo.** `targetSeconds = 14` con techo de 60 s (`:154-158`) crea un buffer
   nuevo por nota; en una pista de 20 notas eso es memoria y trabajo de main
   thread proporcionales al número de notas, no al número de samples.

### Impacto

**Alto** en las fuentes cortas (soundfont GM, WebAudioFont, acordeón), **bajo** en
VSCO. El riesgo de "wow" en sostenidos con modulación es **alto** y es
precisamente el caso que el archivo dice resolver.

### Mejora concreta

Reemplazar la heurística de RMS por **loop points derivados de la periodicidad**:
estimar el período del pitch (autocorrelación) y el de la modulación de amplitud
(detección de AM) y elegir un largo de loop que sea **múltiplo entero del período
mayor**, con crossfade de al menos un período completo (≥150 ms) — o, mucho más
simple y honesto: **no loopear** los samples sostenidos de VSCO/GM y en cambio
extender sólo el *release* con un fade largo, porque los samples de VSCO ya duran
7–84 s y no necesitan loop.

---

## 8. Puntos ciegos

### 8.1 No existe ganancia por pista: el fader es velocity

`App.tsx:1643-1646` + `:1696` (ya citado en § 5e). Todo el reproductor mezcla en
**un solo `Tone.Volume`** (`App.tsx:962`). "Bajar el bajo" no lo baja: lo toca
más suave, y con `layers` de VSCO eso además cambia la toma elegida. Es la
diferencia entre un mezclador y un control de dinámica.
**Mejora:** un `Tone.Volume` por pista en `gmDestRef`, con el fader moviendo ese
nodo y la velocity quedando intacta.

### 8.2 Sustain pedal (CC64) ignorado en todo lo que no sea piano — **alto**

El handler de CC64 en `App.tsx:3524-3539` sólo decide si el note-off se posterga
para la entrada **en vivo**:

```ts
      // Sustain CC pedal
      if (command === 0xb0 && data1 === 64) {
        const isDown = data2 >= 64;
        setSustainDown(isDown);

        if (!isDown) {
          const held = stateRef.current.midiNotes;
          sustainedNotesRef.current.forEach((midi) => {
            if (!held.has(midi)) {
              triggerRelease(midi);
            }
          });
          sustainedNotesRef.current.clear();
        }
        return;
      }
```

`grep -rn "0xb0" app/src` → sólo `App.tsx:3511` (mod wheel) y `:3525`. El pedal
del propio motor de piano (`pianoPedalSustain`) va por
`PianoEngine.triggerNote({ sustainPedal })` (`App.tsx:1680-1686`), exclusivo del
piano. **Un `.mid` con CC64 en la pista de cuerdas, órgano o acordeón no recibe
ese pedal**: las notas mueren a su duración escrita. Y `midiFileParser.ts` no
extrae CC del archivo (`grep "controlChange|cc" utils/midiFileParser.ts` → 0),
así que ni siquiera llega al reproductor.
**Mejora:** parsear CC64/CC66 del archivo y aplicarlo al `triggerRelease` de los
instrumentos sostenidos (o sumarlo al `release` del sampler).

### 8.3 `Tone.Sampler` `release` default = 0,1 s en todos los melódicos — **alto**

Ya cubierto en § 2d. En un acordeón, una trompeta o un violín, apagar la nota en
100 ms de rampa lineal es un corte que ningún instrumento acústico hace, y sin
release samples queda un hueco audible.
**Mejora:** `release` por familia (viento ~0,15 s · cuerda frotada ~0,25 s ·
acordeón ~0,25 s · pizzicato ~0,08 s) en vez del default.

### 8.4 Pitch bend ignorado en reproducción de canción — **medio**

`App.tsx:1100-1101`:

```ts
      const bendOffset = trackIndex === -1 ? (pb / 100) * pbr : 0;
      const transposeOffset = trackIndex === -1 ? 0 : transp;
```

Sólo la entrada en vivo recibe bend. Un `.mid` con pitch bend en el requinto o en
las cuerdas pierde toda esa expresión.
**Mejora:** leer los eventos de pitch bend del archivo y aplicarlos como
`playbackRate`/`detune` de la voz en curso.

### 8.5 La velocity se puede colapsar a un solo valor — **medio**

`App.tsx:2736` (y el mismo patrón en `utils/midiFileParser.ts:68`):

```ts
            velocity: note.velocity || 0.75,
```

Cualquier nota con velocity 0 (o ausente) cae a 0,75. En archivos tipo `.kar`
donde todas las notas vienen a un valor fijo, **todas las 260 notas de VSCO con
capa se resuelven en la misma capa**: se paga el peso de las 3 capas y se usa una.
**Mejora:** derivar una velocity por nota cuando el archivo no la trae (p. ej. por
posición métrica y por dirección del contorno melódico) en vez de una constante.

### 8.6 El piso de audibilidad aplana el rango dinámico — **medio**

`utils/velocity.ts:249-252`:

```ts
export function applyAudibilityFloor(gain: number, floor: number): number {
  const f = Math.max(0, Math.min(0.2, floor));
  return f + (1 - f) * g;
}
```

Con `floor = 0,2`, velocity 1 (f = 0) da 0,2 y no 0. El rango dinámico de la
entrada en vivo queda comprimido: la nota más suave nunca llega a *ppp* real, que
es justo lo que la UI promete (`App.tsx:5724`).
**Mejora:** bajar el piso por defecto a 0 para el piano (que ya tiene 16 capas de
velocity en Salamander) y dejar el piso sólo para instrumentos de una sola toma.

### 8.7 Micro-desafinación al repitchear: hasta ±1,5 semitonos en un formante — **medio**

`instrumentSources.ts:162-188` (HEAD) elige una grilla de **3 semitonos**:

```ts
 * Es lo que permite bajar 20 samples en vez de 85: `Tone.Sampler` repitchea la
 * muestra más cercana, así que con un salto de 3 semitonos el error máximo es
 * ±1,5 semitonos — indistinguible — y la descarga baja a un tercio.
 */
export function pickSamplesFor(
  needed: number[],
  available: number[],
  maxGap = 3,
): number[] {
```

`vscoSampler.ts:55-84` usa el mismo criterio (`step = 3`). Para el **piano** eso es
correcto (Salamander ya trae cada 3 semitonos y el repitcheo es el estándar del
banco). Para una **trompeta o una voz**, +1,5 semitonos de repitcheo mueve los
formantes y suena a "chipmunk": el comentario asume que es inaudible y no lo es
en instrumentos con formante fijo.
**Mejora:** `maxGap = 1` para instrumentos de viento/voz (los samples de VSCO ya
pesan 7–84 s: se bajan pocos y largos) y mantener 3 para piano/cuerdas.

### 8.8 El fade de 40 ms se aplica también a la percusión — **bajo-medio**

`withAntiClickFades` corre para **todo** lo que pasa por `prepareSampleBuffer`,
incluida la percusión de VSCO (`DrumKitEngine` no lo usa, pero el `Drum Kit` de
VSCO sí entra por `loadVscoInstrument`). En un `Claves1_Hit` (1,03 s) o un
`Triangle3-Hit` (1,51 s) recortar 40 ms de cola es audible como un "chapuceo".
**Mejora:** hacer el fade de salida proporcional (p. ej. `min(40 ms, 2 % de la
duración)`) y saltarlo en `family` percusiva.

### 8.9 Dos motores de piano cargando samples: VSCO programa 0 es inalcanzable — **bajo (desperdicio)**

`instrumentSources.ts:131-133` (HEAD) mete VSCO primero si cubre el programa, y
`vscoManifest.ts:1617` declara `name: "Acoustic Grand Piano", program: 0`. Pero
`playbackRouting.ts:65-67` desvía cualquier instrumento con "piano" a Salamander
**antes** de consultar el estado del sampler:

```ts
  // 1. Piano acústico / entrada en vivo → Salamander (grabación real).
  if (trackIndex === -1 || usesSalamanderPiano(instrument)) {
    return isPianoSamplerActive ? "piano-sampler" : "wait";
  }
```

→ el piano de VSCO (7 notas × 3 capas × 2 rr = 42 WAV largos) se descarga y nunca
se dispara; y sus 21 entradas `rr2` son las que inflan el 15,7 % de rr2 del banco
sin aportar nada.
**Mejora:** sacar el programa 0 de `VSCO_INSTRUMENTS` (o de `candidatesFor`)
mientras el piano siga siendo Salamander.

---

## Tabla priorizada de las 8 mejoras

Ordenada por **impacto / esfuerzo**. "Esf." es 1 = una tarde, 5 = varios días.

| # | Mejora | Impacto | Esf. | Punto |
|---|---|---|---|---|
| 1 | **Release por familia + samples de release del acordeón**: subir `release` del sampler a 0,15–0,3 s según familia y disparar los 17 `rel/*.flac` de FreePats en el note-off a −6 dB | Alto | 2 | § 2, § 8.3 |
| 2 | **Curva de velocity única en ambos caminos**: extraer `velocityToGain` a `sampleLevels.ts`, exponente 1,35, quitando la doble aplicación de la batería (`App.tsx:1659` + `DrumKitEngine.ts:196`) | Alto | 1 | § 5 |
| 3 | **Humanización completa**: micro-timing ±3–8 ms, micro-desafinación ±3–6 cents, ganancia ±0,5 dB, determinista por `hash(instrumento, nota, tick)` | Alto | 2 | § 6 |
| 4 | **Reverb como send con EQ**: `Tone.Filter` high-pass 200 Hz en la entrada del reverb + send por familia; sacar el reverb del camino serie post-fader | Alto | 2 | § 4 |
| 5 | **Umbrales de capa por dinámica** en `LayeredSampler.layerFor` (pp/p ≤ 0,35 · mp/mf ≤ 0,7 · f/ff > 0,7) en vez de `Math.floor(v × n)` | Alto | 1 | § 5f |
| 6 | **Ganancia por pista**: un `Tone.Volume` por pista; el fader mueve ese nodo y deja de multiplicar la velocity | Alto | 3 | § 5e, § 8.1 |
| 7 | **Loop por periodicidad**: loop points múltiplos del período medido (pitch + AM) con crossfade ≥1 período; o no loopear lo que ya dura >3,6 s | Medio | 4 | § 7 |
| 8 | **Round-robin melódico activo + manifiesto con rr2** en cuerdas y maderas (hoy 0 de 249 notas melódicas tienen segunda toma) | Medio | 3 | § 1 |

**Fuera de la tabla pero de alto impacto y esfuerzo bajo**, porque no son "de
realismo" sino de señal faltante: parsear CC64 del archivo (§ 8.2), pitch bend en
reproducción (§ 8.4) y `maxGap = 1` para vientos y voz (§ 8.7).

---

## Lo que ya está bien (no tocar)

1. **Cero sintetizadores en el camino de audio.** La política está de verdad
   implementada, no sólo documentada: `playbackRouting.ts:58-81` nunca devuelve
   `synth`, `App.tsx:1072-1079` dejó los `PolySynth` fuera y `DrumKitEngine`
   prefiere silencio antes que el `PercussionEngine` sintetizado
   (`DrumKitEngine.ts:215-222`).
2. **Nivelación por medición, no por tablas.** `sampleLevels.ts:55-69` mide el RMS
   del propio audio y `trimDb` (`:101-108`) limita la compensación a ±18 dB para no
   amplificar ruido de fondo. El diseño de tres objetivos separados (melódico
   −27 dB, lead −24 dB, percusión −30 dB, `:27-52`) y el ajuste fino por pieza
   (`gmDrums.ts:114-133`) es mejor que el de la mayoría de los reproductores web.
3. **Round-robin de percusión.** 6 golpes distintos por pieza en rotación
   (`DrumKitEngine.ts:38, 189-192`) sobre FreePats World Percussion: es la razón
   por la que un bolero suena a percusionista y no a ametralladora. Correcto.
4. **Los samples de VSCO duran 7–84 s cada uno.** No hay loop, no hay repitcheo
   agresivo en el sostenido, no hay corte: la nota suena la grabación completa.
   Esto resuelve por material lo que la heurística de loop no resuelve por código.
5. **Crossfade para evitar clics al inicio/final de cada buffer**
   (`sampleProcessing.ts:60-89`) y resolución del final truncado de los soundfonts
   GM a 3,15 s. Es la mitad correcta del archivo de procesamiento.
6. **Una sola definición de la ventana de scheduling del `AudioContext`**
   (`configureAudioTiming()` en `App.tsx:942`, con la explicación del bug de
   "ultra" a 0 ms). Los clics por notas apiladas en el mismo quantum no vuelven.
7. **`activeNoteInstrumentsRef` para el release** (`App.tsx:1216-1225`): liberar
   con el instrumento con el que se atacó, no con el que la canción tiene ahora.
   Es un detalle que la mayoría de los reproductores tiene mal y acá está bien.
8. **Los 17 samples de sustain del acordeón cubren exactamente las 17 notas del
   repo** (`freePatsAccordion.ts:26-44` contra el árbol real de GitHub): el mapa
   está completo, no falta ninguna nota. El problema del acordeón es el
   *comportamiento* (release, loop), no la cobertura.

---

## Estado del árbol de trabajo (cambios concurrentes)

Durante la auditoría, el árbol de trabajo recibió cambios que **ya cubren** parte
de lo de arriba. Lo dejo asentado para que no se proponga trabajo hecho:

| Hallazgo | Estado en el árbol de trabajo | Archivo |
|---|---|---|
| § 1 round-robin melódico | **Cubierto**: `groups[capa][variante]` + rotación `variant[layer]++` | `vscoSampler.ts:86-131` |
| § 3 paneo | **Cubierto**: `Tone.Panner(panForInstrument(...))` por instrumento y `panForDrumPiece` por pieza | `instrumentSources.ts:388-391`, `DrumKitEngine.ts:81-87`, `instrumentPanning.ts` (nuevo) |
| § 6 humanización | **Parcial**: `HumanizedVoice` aplica ±0,5 dB de ganancia | `instrumentSources.ts:219-254` |
| § 5 (doble curva) | **Pendiente** | — |
| § 2 release / § 8.3 | **Pendiente** | — |
| § 4 reverb + EQ | **Pendiente** | — |
| § 7 loop | **Pendiente** | — |
| § 8.1 ganancia por pista | **Pendiente** | — |

Tres observaciones sobre esos cambios, con evidencia, para la revisión de quien
los escribió:

1. **La humanización no va a sonar.** `HumanizedVoice.triggerAttack` escala la
   **velocity** (`1 + (hash01(...) − 0.5) × 0.12` → ±6 % ≈ ±0,5 dB,
   `instrumentSources.ts:239-240`), pero el `Tone.Sampler` de abajo convierte esa
   velocity en la **ganancia lineal** del `BufferSource`
   (`Sampler.js: source.start(..., velocity)`). El efecto sobre el nivel es el
   correcto; lo que no existe es micro-**timing** ni micro-**desafinación**, que es
   lo que el oído lee como "humano". Además el piano (Salamander, el instrumento
   más usado) **no pasa por `HumanizedVoice`**: se dispara directo en
   `App.tsx:1173`.
2. **El round-robin nuevo puede descargar lo mismo varias veces.** El fallback
   `variants[Math.min(variantIndex, variants.length - 1)]`
   (`vscoSampler.ts:205-206`) hace que, para las 216 notas sin `rr2`, la variante 1
   apunte a la **misma URL** que la variante 0; el bucle de fase 2
   (`vscoSampler.ts:240-257`) igual crea un `Tone.Sampler` por combinación. En
   Trumpet (2 capas × 1 variante) y las cuerdas (2 capas) eso es **2× la descarga
   y 2× el decode** de ~2,7 MB por muestra para cero variación audible.
3. **`LayeredSampler` desalinea capas si una intermedia está vacía**
   (`vscoSampler.ts:100`, `this.groups = groups.filter((g) => g.length > 0)`):
   `layerFor` reparte `[0..groups.length−1]` equiespaciado sobre el arreglo
   **filtrado**, así que si la capa 2 falló y quedan `[v1, v3]`, la velocity media
   elige `v3`. Mejor filtrar sin reindexar (mantener el índice original y saltar
   los huecos).

---

### Archivos leídos

`app/src/engine/`: `instrumentSources.ts`, `vscoSampler.ts`, `vscoManifest.ts`,
`tonejsManifest.ts`, `wafManifest.ts`, `DrumKitEngine.ts`, `sampleLevels.ts`,
`sampleProcessing.ts`, `WebAudioFont.ts`, `GMSamplerEngine.ts`,
`freePatsAccordion.ts`, `percussionSamples.ts`, `VelocityPiano.ts`,
`InstrumentEngine.ts`, `instrumentPanning.ts` (nuevo).
`app/src/utils/`: `playbackRouting.ts`, `gmDrums.ts`, `velocity.ts`,
`midiFileParser.ts`. Más `app/src/App.tsx`, `app/src/hooks/useAudioEngine.ts`,
`app/src/services/audioService.ts`, `app/src/constants/audio.ts`,
`app/src/components/score/PartMixer.tsx` y `app/node_modules/tone` (15.1.22).

Fuentes externas verificadas: árbol de `freepats/button-accordion-HN@main`,
árbol y muestras de `sgossner/VSCO-2-CE@master`, `nbrosowsky/tonejs-instruments`,
`gleitz/midi-js-soundfonts`.
