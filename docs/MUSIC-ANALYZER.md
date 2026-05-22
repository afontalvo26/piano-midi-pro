# Music Analyzer — Análisis Musical

## Archivo: `src/analysis/MusicAnalyzer.ts`

---

## Descripción

El analizador extrae información musical de alto nivel de un `ScoreDocument`. Opera sobre el array `flatNotes` post-parseo y produce un `AnalysisResult` con:
- Tonalidad detectada (key detection)
- Eventos de acorde (chord events)
- Estadísticas de la pieza
- Nivel de dificultad

El análisis se ejecuta **una sola vez** al importar la partitura, no en tiempo real. Los resultados se almacenan en `scoreDocument.metadata` y se pasan a `ScoreInfoBar` para visualización.

---

## Resultado del Análisis

```typescript
interface AnalysisResult {
  detectedKey: string      // "C Major", "A Minor", "Bb Major"
  chords: ChordEvent[]     // Array de acordes detectados
  stats: ScoreStats        // Estadísticas de la pieza
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
}
```

---

## Detección de Tonalidad

### Algoritmo: Krumhansl-Schmuckler

El algoritmo más usado en Music Information Retrieval para detección de tonalidad. Funciona por correlación entre la distribución de pitch classes de la pieza y perfiles tonales predefinidos.

**Paso 1: Distribución de pitch classes**

Para cada nota en `flatNotes`, se acumula la duración (en segundos) en el pitch class correspondiente (0=C, 1=C#, ..., 11=B):

```typescript
const pcCounts = new Array(12).fill(0);
for (const note of notes) {
  pcCounts[note.midi % 12] += note.duration;  // ponderado por duración
}
```

Usar duración (no conteo) es más robusto — una redonda de Do pesa 4x más que una corchea de Do.

**Paso 2: Perfiles de Krumhansl**

Los perfiles representan la "importancia perceptual" de cada grado en una tonalidad mayor o menor, basados en experimentos psicoacústicos:

```typescript
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
```

Índice 0 = tónica. El Do (I) es el más importante, seguido del Sol (V), Mi (III), etc.

**Paso 3: Correlación de Pearson con las 24 tonalidades**

Para cada una de las 12 tonalidades mayores y 12 menores:
1. Rotar el perfil según la tónica (C Mayor usa perfil sin rotar, G Mayor rota 7 posiciones, etc.)
2. Calcular correlación de Pearson entre `pcCounts` y el perfil rotado
3. La tonalidad con mayor correlación es la detectada

```typescript
for (let tonic = 0; tonic < 12; tonic++) {
  const majCorr = correlate(pcCounts, rotateProfile(MAJOR_PROFILE, tonic));
  const minCorr = correlate(pcCounts, rotateProfile(MINOR_PROFILE, tonic));
  // keep best
}
```

**Precisión**: 70-85% en repertorio tonal clásico y popular. Falla en música modal, atonal, o con muchos cambios de tonalidad.

---

## Detección de Acordes

### Agrupación temporal

Las notas se agrupan en "clusters de acorde" con tolerancia de 80ms:

```typescript
function groupNotesByTime(notes: FlatNote[], tolerance = 0.08): FlatNote[][] {
  // Notas que inician dentro de 80ms entre sí se consideran simultáneas
}
```

80ms es suficiente para capturar arpegios lentos y acordes con ligero offset (como en piano), sin confundir con notas melódicas separadas.

### Detección por `tonal.js`

Para cada grupo con 2+ notas simultáneas:

```typescript
// Intento 1: notas con octava
const noteNames = midiNotes.map(m => midiToFullNote(m)); // "C4", "E4", "G4"
const chords = Chord.detect(noteNames);

// Fallback: solo pitch classes (sin octava)
const pitchClasses = [...new Set(midiNotes.map(m => midiToNoteName(m)))];
const chords = Chord.detect(pitchClasses);
```

`Chord.detect()` de tonal.js retorna el chord name más probable. El resultado se mapea a `ChordEvent.quality` del tipo union de la app.

### Detección de slash chords

Si la nota más grave del acorde difiere de la fundamental del acorde detectado, se agrega el bajo como slash chord:

```typescript
const bass = midiToNoteName(Math.min(...midiNotes));
const hasBassNote = bass !== root;
if (hasBassNote) label = `${chordLabel}/${bass}`;  // "Cmaj7/E"
```

### Limitaciones de la detección de acordes

- Solo analiza los primeros 120 segundos para performance
- Los acordes deben tener ≥ 2 notas simultáneas (dentro de 80ms)
- No detecta acordes de una sola nota con tensiones implícitas
- Las notas de paso (passing tones) pueden producir falsos acordes
- No detecta progresiones de acordes quebrados (arpegios extendidos)

---

## Análisis de Dificultad

El sistema de puntuación pondera varios factores:

| Factor | Criterio | Puntos |
|--------|----------|--------|
| Densidad de notas | > 8 notas/segundo | +30 |
| Densidad de notas | 4-8 notas/segundo | +20 |
| Densidad de notas | 2-4 notas/segundo | +10 |
| Rango de tessitura | > 4 octavas | +20 |
| Rango de tessitura | 3-4 octavas | +10 |
| Rango de tessitura | 2-3 octavas | +5 |
| Número de partes | > 4 instrumentos | +15 |
| Número de partes | 3-4 instrumentos | +8 |
| Número de partes | 2 instrumentos | +3 |
| Tempo | > 160 BPM | +15 |
| Tempo | 120-160 BPM | +8 |
| Tempo | 80-120 BPM | +3 |
| Armadura | Por cada accidental (|fifths|) | +2 cada uno |
| Ornamentos | > 20 ornamentos | +15 |
| Ornamentos | 5-20 ornamentos | +8 |

**Clasificación final**:
| Puntuación | Nivel |
|------------|-------|
| ≥ 70 | Experto |
| 45-69 | Avanzado |
| 20-44 | Intermedio |
| < 20 | Principiante |

---

## Estadísticas

```typescript
interface ScoreStats {
  totalNotes: number           // Total de notas (sin silencios)
  totalMeasures: number
  duration: number             // Segundos totales
  averageDensity: number       // Notas por segundo
  pitchRange: {
    min: number                // MIDI mínimo (nota más grave)
    max: number                // MIDI máximo (nota más aguda)
    span: number               // Rango en semitonos
  }
  dynamicRange: {
    min: string                // Dinámica más suave utilizada
    max: string                // Dinámica más fuerte utilizada
  }
  tempoChanges: number         // Número de cambios de tempo
  uniquePitches: number        // Número de pitch classes únicos (≤12)
  chordDensity: number         // Acordes detectados por compás
  partStats: {
    partId: string
    name: string
    noteCount: number
    averagePitch: number       // MIDI promedio de la parte
    tessituraMin: number       // Nota más grave de esta parte
    tessituraMax: number       // Nota más aguda de esta parte
  }[]
}
```

---

## Funciones de Tiempo Real

Estas funciones se llaman durante la reproducción para mostrar información en `ScoreInfoBar`:

### `getChordAtTime(chords, time)`

Busca el acorde activo en el tiempo actual:

```typescript
export function getChordAtTime(chords: ChordEvent[], time: number): ChordEvent | null {
  let best: ChordEvent | null = null;
  for (const chord of chords) {
    if (chord.time <= time && chord.time + chord.duration >= time) {
      best = chord;
    }
  }
  return best;
}
```

### `getActiveNotesAtTime(flatNotes, time, windowMs)`

Retorna los MIDI numbers de las notas que están sonando en `time` (±windowMs):

```typescript
export function getActiveNotesAtTime(
  flatNotes: FlatNote[],
  time: number,
  windowMs: number = 0.03
): number[] {
  return flatNotes
    .filter(n =>
      !n.isRest &&
      n.time <= time + windowMs &&
      n.time + n.duration >= time - windowMs
    )
    .map(n => n.midi);
}
```

Útil para resaltar notas en el piano virtual y detectar qué acorde está sonando exactamente.

---

## Integración con ScoreInfoBar

`ScoreInfoBar` usa el análisis para mostrar en tiempo real:

```typescript
// Tonalidad (detectada vs escrita)
const key = analysis.detectedKey ?? score.metadata.keySignature.name;

// Acorde actual
const chord = getChordAtTime(analysis.chords, currentTime);

// Posición en compás
const { measure, beat } = getCurrentMeasureAndBeat(score, currentTime);

// Dinámica activa
const dynamic = getCurrentDynamic(score, currentTime);

// Tempo actual (considerando cambios)
const tempo = getCurrentTempo(score, currentTime);
```

---

## Uso del API

```typescript
import { analyzeScore, getChordAtTime } from './analysis/MusicAnalyzer';

// Al importar una partitura
const analysis = analyzeScore(scoreDocument);
// analysis.detectedKey = "D Minor"
// analysis.difficulty = "advanced"
// analysis.stats.averageDensity = 6.2

// Durante reproducción
const currentChord = getChordAtTime(analysis.chords, playbackTime);
// currentChord.label = "Dm7/F"
```
