# Score Reader — Sistema de Lectura de Partituras

## Descripción General

El Score Reader es el subsistema que convierte archivos de notación musical externos en el modelo interno `ScoreDocument`. Soporta MusicXML (`.xml`, `.mxl`) y MIDI (`.mid`, `.midi`).

---

## Formatos Soportados

| Formato | Extensión | Software de origen |
|---------|-----------|-------------------|
| MusicXML | `.xml` | MuseScore, Finale, Sibelius, Noteflight, Dorico |
| Compressed MusicXML | `.mxl` | Todos los anteriores (formato ZIP) |
| Standard MIDI | `.mid`, `.midi` | Cualquier DAW, Garage Band, Logic, FL Studio |

### Por qué MusicXML es el formato primario

MusicXML es el estándar abierto de intercambio para notación musical. A diferencia de MIDI, contiene:
- Información de notación completa (armaduras, figuras, silencios, ligaduras)
- Expresión: dinámicas escritas, crescendos, articulaciones
- Estructura formal: repeticiones, casillas, signos de ensayo
- Información de instrumento y transposición
- Texto: títulos, compositor, marcaciones de tempo verbales

MIDI solo contiene: notas MIDI, velocidades, tiempos, cambios de programa. No tiene concepto de "negra con punto" vs "corchea + semicorchea" — todo es tiempo absoluto.

---

## Flujo de Parseo MusicXML

### Paso 1 — Descompresión (solo .mxl)

Los archivos `.mxl` son ZIP que contienen:
```
score.mxl/
├── META-INF/container.xml   ← indica qué archivo es el rootfile
└── score.xml                ← el MusicXML real
```

```typescript
// JSZip descomprime y localiza el rootfile
const zip = await JSZip.loadAsync(arrayBuffer);
const containerFile = zip.file('META-INF/container.xml');
const rootfilePath = containerDoc.querySelector('rootfile')
  ?.getAttribute('full-path');
xmlText = await zip.file(rootfilePath).async('string');
```

### Paso 2 — Parseo XML

```typescript
const doc = parser.parseFromString(xmlText, 'text/xml');
// Detectar error de parseo nativo del browser
const parseError = doc.querySelector('parsererror');
```

### Paso 3 — Extracción de Part-List

```xml
<part-list>
  <score-part id="P1">
    <part-name>Piano</part-name>
    <midi-instrument>
      <midi-channel>1</midi-channel>
      <midi-program>1</midi-program>   <!-- 1-based: programa GM 0 = Grand Piano -->
    </midi-instrument>
  </score-part>
  <score-part id="P2">
    <part-name>Trumpet in Bb</part-name>
    <transpose><chromatic>-2</chromatic></transpose>
  </score-part>
</part-list>
```

El parser extrae para cada `score-part`:
- `id` — identificador para relacionar con los elementos `<part>`
- `name` / `part-abbreviation`
- `midi-channel` / `midi-program` (ambos 1-based en XML, se convierte a 0-based)
- `transpose/chromatic` — corrección de semitonos para instrumentos transpositores

### Paso 4 — Iteración por Part y Measure

Para cada `<part id="Px">`:
- Se mantiene `absoluteTime` acumulativo (segundos desde inicio de la pieza)
- Para cada `<measure>`:
  - Se procesa en orden secuencial los hijos del measure
  - `voiceTime[voice]` rastrea posición actual dentro del compás por voz (1-4)
  - Al finalizar el compás, `absoluteTime += measDuration`

### Paso 5 — Procesamiento de Nodos por Tipo

#### `<attributes>` — Cambios de armadura, métrica, clave

```xml
<attributes>
  <divisions>4</divisions>          <!-- ticks por negra -->
  <key><fifths>-1</fifths><mode>minor</mode></key>
  <time><beats>6</beats><beat-type>8</beat-type></time>
  <clef><sign>F</sign><line>4</line></clef>
  <transpose><chromatic>-2</chromatic></transpose>
</attributes>
```

- `divisions` define la escala de ticks. Duración en segundos = `(ticks / divisions) * (60 / bpm)`
- `fifths` de -7 (7 bemoles) a +7 (7 sostenidos) → función `fifthsToKey()`
- La clave determina `ClefType` para visualización

#### `<note>` — Notas y silencios

```xml
<note>
  <pitch><step>G</step><alter>-1</alter><octave>4</octave></pitch>
  <duration>4</duration>
  <type>quarter</type>
  <dot/>
  <voice>1</voice>
  <staff>1</staff>
  <notations>
    <articulations><staccato/></articulations>
    <dynamics><mf/></dynamics>
    <slur type="start" number="1"/>
    <ornaments><trill-mark/></ornaments>
  </notations>
</note>

<!-- Nota en acorde (misma posición temporal) -->
<note>
  <chord/>
  <pitch><step>E</step><octave>4</octave></pitch>
  <duration>4</duration>
</note>

<!-- Silencio -->
<note>
  <rest/>
  <duration>4</duration>
  <type>quarter</type>
</note>
```

**Cálculo de MIDI**:
```typescript
midiNum = (octave + 1) * 12 + NOTE_TO_MIDI_STEP[step] + Math.round(alter)
// alter: 1=sostenido, -1=bemol, 2=doble sostenido, etc.
// + transposeChromatic del instrumento
```

**Posición temporal**:
- Nota normal: `noteTime = voiceTime[voice]`, luego `voiceTime[voice] += durSeconds`
- Nota en acorde (`<chord/>`): `noteTime = voiceTime[voice] - durSeconds` (retrocede al mismo tiempo que la nota anterior)
- Nota de adorno (`<grace/>`): `isGrace = true`, duración = 0.05s, no avanza `voiceTime`

#### `<direction>` — Tempo, dinámicas, cuñas, pedal

```xml
<!-- Marcación de tempo -->
<direction>
  <direction-type>
    <words>Allegro moderato</words>
    <metronome><beat-unit>quarter</beat-unit><per-minute>132</per-minute></metronome>
  </direction-type>
  <sound tempo="132"/>
</direction>

<!-- Dinámica -->
<direction>
  <direction-type><dynamics><ff/></dynamics></direction-type>
</direction>

<!-- Crescendo -->
<direction>
  <direction-type><wedge type="crescendo"/></direction-type>
</direction>

<!-- Pedal piano -->
<direction>
  <direction-type><pedal type="start"/></direction-type>
</direction>
```

#### `<barline>` — Repeticiones y casillas

```xml
<barline location="left">
  <repeat direction="forward"/>
</barline>

<barline location="right">
  <ending number="1" type="start"/>
  <repeat direction="backward" times="2"/>
</barline>
```

---

## Elementos Musicales Reconocidos

### Notas
| Elemento | XML | Capturado en |
|----------|-----|-------------|
| Pitch (nota + octava) | `<pitch>` | `ScoreNote.midi`, `pitchName`, `octave` |
| Alteración | `<alter>` | `ScoreNote.accidental` |
| Duración escrita | `<type>` | `ScoreNote.notatedDuration` |
| Puntillos | `<dot/>` | `ScoreNote.dots` |
| Silencio | `<rest/>` | `ScoreNote.isRest = true` |
| Acorde | `<chord/>` | `ScoreNote.isChordNote = true` |
| Ligadura de valor | `<tie type="stop">` | `ScoreNote.isTied = true` |
| Nota de adorno | `<grace/>` | `ScoreNote.isGrace = true` |
| Tresillo/tuplet | `<tuplet>` | `ScoreNote.tupletId` |
| Voz | `<voice>` | `ScoreNote.voice` |
| Pentagrama | `<staff>` | `ScoreNote.staffNumber` |

### Dinámicas
| Símbolo | Velocity (0-1) |
|---------|---------------|
| ppp | 0.10 |
| pp | 0.20 |
| p | 0.30 |
| mp | 0.45 |
| mf | 0.60 |
| f | 0.75 |
| ff | 0.88 |
| fff | 1.00 |
| sfz | 0.90 |
| fp | 0.70 |
| sf | 0.85 |

### Articulaciones
| XML | Tipo |
|-----|------|
| `<staccato/>` | staccato |
| `<staccatissimo/>` | staccatissimo |
| `<tenuto/>` | tenuto |
| `<accent/>` | accent |
| `<strong-accent/>` | marcato |
| `<fermata/>` | fermata |
| `<detached-legato/>` | portato |
| `<stress/>` | stress |
| `<unstress/>` | unstress |

### Ornamentos
| XML | Tipo |
|-----|------|
| `<trill-mark/>` | trill |
| `<mordent/>` | mordent |
| `<inverted-mordent/>` | inverted-mordent |
| `<turn/>` | turn |
| `<inverted-turn/>` | inverted-turn |
| `<tremolo>N</tremolo>` | tremolo (N = número de barras) |

### Técnicas de instrumento
| XML | Efecto |
|-----|--------|
| `<pizzicato/>` en `<technical>` | Pizzicato (cuerdas) |
| `<harmonic/>` en `<technical>` | Armónico (cuerdas/guitarra) |
| `<snap-pizzicato/>` | Snap pizzicato Bartók |

### Estructura formal
| Elemento | Capturado |
|----------|-----------|
| Repetición `||:` | `Measure.repeat.type = 'start'` |
| Repetición `:||` | `Measure.repeat.type = 'end'` |
| 1ra/2da casilla | `Measure.ending.number` |
| Anacrusis | `Measure.isPickup = true` |
| Signos de ensayo | `Measure.rehearsalMark` |
| Texto de tempo | `Measure.text` |

### Cambios estructurales
| Cambio | Dónde |
|--------|-------|
| Armadura | `Measure.keySignature` (solo cuando cambia) |
| Métrica | `Measure.timeSignature` (solo cuando cambia) |
| Cambio de clave | `Measure.clefChange` |
| Cambio de tempo | `Measure.tempoChanges[]` |

---

## Inferencia de Instrumento

Cuando el nombre de la parte o el programa MIDI no son claros, `inferInstrumentName()` usa heurísticas de nombre:

```typescript
if (lower.includes('piano'))   return 'Acoustic Grand Piano';
if (lower.includes('trumpet')) return 'Trumpet';
if (lower.includes('violin'))  return 'Violin';
// ... 20+ reglas de matching
// Fallback: mapeo GM program → nombre
```

Instrumentos transpositores reconocidos automáticamente por el campo `<transpose>` del XML:
- Clarinete en Bb (−2 semitonos)
- Trompeta en Bb (−2 semitonos)
- Saxofón Alto en Eb (−9 semitonos)
- Corno Francés en F (−7 semitonos)
- Saxofón Tenor en Bb (−14 semitonos)

---

## Conversión a SongData (Compatibilidad Legacy)

`scoreToParts(score: ScoreDocument)` convierte el ScoreDocument al formato que usa el sistema de reproducción original:

```typescript
// Output
{
  notes: FlatNote[],   // todas las notas de todas las partes
  tracks: [{
    index, name, instrument, noteCount, color,
    midiProgram, midiChannel, partId
  }],
  bpm: number,
  duration: number,
  title: string
}
```

Los `FlatNote` tienen `id` que apunta al `ScoreNote` original. Esto permite que el scheduler de reproducción encuentre la nota completa con todas sus anotaciones cuando necesita el engine avanzado de Piano/Trumpet.

---

## Caché de XML Original

```typescript
// Al importar, se guarda el XML en sessionStorage
cacheScoreXML(score.id, xmlText);

// OSMD lo recupera para renderizar fielmente el XML original
// sin reconstruirlo desde el modelo de datos
const cached = getCachedScoreXML(score.id);
```

La reconstrucción de XML desde el modelo (cuando no hay caché) es un fallback simplificado que no preserva todos los detalles de notación visual. El XML original siempre es superior para OSMD.

---

## Limitaciones Conocidas

| Limitación | Impacto | Workaround |
|------------|---------|-----------|
| Glissandos explícitos no capturados | Solo se marcan como nota normal | Future: `SlideEffect` en ScoreNote |
| Tablatura de guitarra ignorada | Nota MIDI se calcula del pitch | Válido para reproducción |
| Lyrics no extraídas | No se muestran | Future: `ScoreNote.lyric` |
| Acordes de jazz (chord symbols) | No se extraen | Detectados por MusicAnalyzer |
| Multiple ending complejas (3ras, 4tas casillas) | Solo 1ra y 2da | Future: `Ending.number` ya existe |
| Ritardando/accelerando graduales | Solo cambios instantáneos de tempo | Future: interpolación en tempoMap |
