# Data Model — ScoreDocument

## Archivo: `src/types/score.ts`

El modelo de datos es el contrato central que conecta el parser, el engine de síntesis, el analizador musical y los componentes visuales.

---

## Jerarquía Completa

```
ScoreDocument
│
├── id: string                         UUID único por partitura cargada
├── metadata: ScoreMetadata            Información global de la pieza
│   ├── title, composer, lyricist, arranger, copyright
│   ├── source: string                 "MusicXML" | "MIDI" | "Built-in"
│   ├── sourceFormat                   'musicxml' | 'midi' | 'abc' | 'builtin'
│   ├── bpm: number                    Tempo principal
│   ├── timeSignature: TimeSignature   Métrica global
│   ├── keySignature: KeySignature     Tonalidad global
│   ├── totalMeasures: number
│   ├── duration: number               Segundos totales
│   ├── detectedKey?: string           Rellenado por MusicAnalyzer
│   ├── detectedChords?: ChordEvent[]  Rellenado por MusicAnalyzer
│   └── difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert'
│
├── parts: ScorePart[]                 Un elemento por instrumento
│   └── (ver ScorePart abajo)
│
├── tempoMap: TempoMarking[]           Todos los cambios de tempo en orden cronológico
├── timeSignatureMap: { measureNumber, sig }[]
├── keySignatureMap: { measureNumber, key }[]
├── globalDynamics: Dynamic[]          Todas las marcas dinámicas de todos los instrumentos
├── globalWedges: Wedge[]              Todos los crescendos/diminuendos
├── globalPedals: Pedal[]              Todas las indicaciones de pedal
├── rehearsalMarks: { measureNumber, label }[]
└── flatNotes: FlatNote[]              Optimizado para piano roll / playback scheduler
```

---

## ScorePart

Representa un instrumento completo (piano, trompeta, violín, etc.).

```typescript
interface ScorePart {
  id: string                 // "P1", "P2", etc. — del XML
  name: string               // "Piano", "Trumpet in Bb", "Violin I"
  shortName?: string         // "Pno.", "Tpt.", "Vln. I"
  instrument: string         // Nombre de instrumento GM: "Acoustic Grand Piano"
  midiProgram: number        // 0-127 (GM program, 0-based)
  midiChannel: number        // 0-15

  // Transposición (instrumentos que leen en tono distinto al concert pitch)
  transposeChromatic: number // Semitonos de corrección
  transposeDiatonic: number  // Grados diatónicos de corrección

  // Visualización
  clef: ClefType             // 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion'
  staffCount: number         // 1 para la mayoría, 2 para piano (gran pentagrama)
  color: string              // Color HEX para el piano roll

  // Estado del mixer (mutable en tiempo real)
  volume: number             // 0-1
  pan: number                // -1 (izquierda) a 1 (derecha)
  muted: boolean
  solo: boolean
  visible: boolean           // Visibilidad en el score visual (OSMD)

  // Contenido
  measures: Measure[]
  noteCount: number          // Total de notas (sin silencios, sin gracias)
}
```

### Transposición

Los instrumentos transpositores escriben en una tonalidad diferente a como suenan:

| Instrumento | `transposeChromatic` | Ejemplo: escrito C4 suena... |
|-------------|---------------------|------------------------------|
| Clarinete en Bb | -2 | Bb3 |
| Trompeta en Bb | -2 | Bb3 |
| Corno en F | -7 | F3 |
| Saxofón Alto en Eb | -9 | Eb3 |
| Saxofón Tenor en Bb | -14 | Bb2 |
| Flauta, Oboe, Piano | 0 | C4 (concert pitch) |

El parser aplica `transposeChromatic` automáticamente al calcular el `midi` de cada `ScoreNote`, por lo que el `midi` en el modelo siempre es concert pitch.

---

## Measure

Un compás completo de una parte.

```typescript
interface Measure {
  number: number             // 1-based
  startTime: number          // Segundos desde el inicio (absolute)
  duration: number           // Duración en segundos

  notes: ScoreNote[]         // Todas las notas de este compás (incluye silencios)

  // Solo presentes cuando cambian (no en cada compás)
  timeSignature?: TimeSignature
  keySignature?: KeySignature
  clefChange?: ClefType

  // Expresión
  tempoChanges: TempoMarking[]   // Cambios de tempo dentro del compás
  dynamics: Dynamic[]            // Marcas de dinámica (mf, ff, etc.)
  wedges: Wedge[]                // Crescendos/diminuendos
  pedals: Pedal[]                // Indicaciones de pedal

  // Anotaciones
  articulations: Articulation[]  // Articulaciones a nivel de compás
  ornaments: Ornament[]          // Ornamentos a nivel de compás
  slurs: SlurTie[]               // Ligaduras de expresión que empiezan/terminan aquí
  tuplets: Tuplet[]              // Tresillos y otros agrupamientos irregulares

  // Estructura formal
  repeat?: RepeatInfo            // Barras de repetición
  ending?: Ending                // Casillas (1ra vez, 2da vez)

  // Metadata
  rehearsalMark?: string         // "A", "B", "Verse", "Chorus"
  text?: string                  // Texto de tempo: "Allegro", "Andante"
  isPickup: boolean              // Compás de anacrusa (incompleto al inicio)
}
```

---

## ScoreNote

La unidad fundamental — una nota individual o silencio.

```typescript
interface ScoreNote {
  id: string                 // Identificador único: "n-P1-5-60-12.500"
                             // Formato: n-{partId}-{measureNum}-{midi}-{time}

  // Pitch
  midi: number               // 0-127, siempre concert pitch (ya transpuesto)
  isRest: boolean            // true = silencio, midi = 0
  pitchName: NoteName | null // 'C', 'D#', 'Eb', etc.
  octave: number | null      // 0-8
  accidental: Accidental     // 'sharp' | 'flat' | 'natural' | 'double-sharp' | null

  // Timing (siempre en segundos absolutos desde el inicio de la pieza)
  time: number               // Onset — cuando empieza la nota
  duration: number           // Duración sonante en segundos
  notatedDuration: DurationType  // 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | ...
  dots: number               // 0, 1 o 2 puntillos de aumentación

  // Expresión
  velocity: number           // 0-1 (inferido del contexto dinámico: mf=0.6, ff=0.88)
  dynamic?: DynamicType      // La dinámica activa: 'mf', 'ff', 'sfz', etc.

  // Posición en la partitura
  measureNumber: number      // 1-based
  beat: number               // 1-based float: 1.0, 1.5, 2.0, etc.
  staffNumber: number        // 1 = treble/arriba, 2 = bass/abajo (piano)
  voice: number              // 1-4, voz dentro del pentagrama

  // Anotaciones
  articulations: ArticulationType[]  // ['staccato', 'accent', ...]
  ornaments: OrnamentType[]          // ['trill', 'mordent', ...]
  isTied: boolean            // Ligadura de valor: esta nota es continuación, no re-atacar
  isGrace: boolean           // Nota de adorno (acciaccatura/appoggiatura)
  isChordNote: boolean       // Parte de un acorde (mismo tiempo que nota anterior)

  // Agrupamiento
  tupletId?: string          // ID del tuplet al que pertenece
  tupletRatio?: string       // "3:2" para tresillo, "5:4" para quintillo

  // Efectos de instrumento (opcionales, según el instrumento)
  pizzicato?: boolean        // Cuerdas: pizzicato
  arco?: boolean             // Cuerdas: arco (volver al arco)
  muted?: boolean            // Metales: con sordina
  harmonic?: boolean         // Cuerdas/guitarra: armónico
  tremolo?: number           // Número de barras de tremolo (1-4)
}
```

### El campo `id`

El `id` de cada `ScoreNote` es fundamental para la integración con el playback engine. Formato: `n-{partId}-{measureNumber}-{midi}-{time.toFixed(3)}`

Ejemplo: `n-P1-12-64-24.375` = parte P1, compás 12, Mi4 (MIDI 64), en el segundo 24.375

El scheduler de Tone.js busca el `ScoreNote` por este `id` para obtener todas las anotaciones y enviarlas al `PianoEngine` o `TrumpetEngine`:

```typescript
const scoreNote = part?.measures
  .flatMap(m => m.notes)
  .find(n => n.id === flatNote.id);
```

---

## FlatNote

Versión simplificada de `ScoreNote` para el piano roll y el scheduler. Compatible con `SongNote` del sistema legacy.

```typescript
interface FlatNote {
  id: string          // Mismo id que el ScoreNote correspondiente
  midi: number
  time: number
  duration: number
  velocity: number
  trackIndex: number  // Índice en parts[] (0-based)
  partId: string      // ID de la parte: "P1", "P2"

  // Campos adicionales respecto a SongNote legacy
  measureNumber: number
  beat: number
  isRest: boolean
  dynamic?: DynamicType
  articulations: ArticulationType[]
  isTied: boolean
  isGrace: boolean
}
```

`ScoreDocument.flatNotes` contiene TODAS las `FlatNote` de TODAS las partes, ordenadas por tiempo. Es el array que usa directamente el piano roll y el scheduler.

---

## Tipos de Duración

```typescript
type DurationType =
  | 'whole'    // Redonda      = 4 negras
  | 'half'     // Blanca       = 2 negras
  | 'quarter'  // Negra        = 1 negra
  | 'eighth'   // Corchea      = 1/2 negra
  | '16th'     // Semicorchea  = 1/4 negra
  | '32nd'     // Fusa         = 1/8 negra
  | '64th'     // Semifusa     = 1/16 negra
  | '128th'    // Garrapatea   = 1/32 negra
```

Conversión a segundos: `duración = quarters * (60 / bpm)` donde `quarters` es el equivalente en negras.

---

## KeySignature

```typescript
interface KeySignature {
  fifths: number    // -7 a +7: -7=7 bemoles (Cb Mayor), 0=Do Mayor, +7=7 sostenidos (C# Mayor)
  mode: KeyMode     // 'major' | 'minor'
  root: NoteName    // 'C', 'G', 'Db', etc. — la tónica
  name: string      // "C Major", "A Minor", "F# Major", etc.
}
```

Tabla de armaduras:
| fifths | Mayor | Menor |
|--------|-------|-------|
| -7 | Cb | Ab |
| -6 | Gb | Eb |
| -5 | Db | Bb |
| -4 | Ab | F |
| -3 | Eb | C |
| -2 | Bb | G |
| -1 | F | D |
| 0 | C | A |
| +1 | G | E |
| +2 | D | B |
| +3 | A | F# |
| +4 | E | C# |
| +5 | B | G# |
| +6 | F# | D# |
| +7 | C# | A# |

---

## ChordEvent

Generado por `MusicAnalyzer`, adjuntado al `ScoreMetadata`:

```typescript
interface ChordEvent {
  time: number           // Segundos de onset
  duration: number       // Duración aproximada del acorde
  root: NoteName         // Nota fundamental: 'C', 'G', 'Bb', etc.
  quality: ChordQuality  // 'major' | 'minor' | 'dominant7' | 'major7' | ...
  extensions: string[]   // ["9", "#11", "13"] — tensiones
  bass?: NoteName        // Si es slash chord: C/E tiene bass='E'
  label: string          // "Cmaj7", "Dm7/F", "G7", "Am" — etiqueta completa
  measureNumber: number
  beat: number
  midiNotes: number[]    // Las notas MIDI que forman el acorde
}

type ChordQuality =
  | 'major' | 'minor' | 'diminished' | 'augmented'
  | 'dominant7' | 'major7' | 'minor7' | 'diminished7'
  | 'half-diminished' | 'sus2' | 'sus4' | 'add9' | 'power'
```

---

## TempoMarking

```typescript
interface TempoMarking {
  bpm: number              // Pulsaciones por minuto
  beatUnit: DurationType   // Unidad de pulso ('quarter' para negra = N BPM)
  text?: string            // "Allegro", "Andante ma non troppo", etc.
  measureNumber: number
  time: number             // Segundos desde el inicio
}
```

El `tempoMap` del `ScoreDocument` contiene todos los cambios de tempo en orden cronológico. Para obtener el BPM en cualquier punto:

```typescript
function getBpmAtTime(tempoMap: TempoMarking[], time: number): number {
  let bpm = tempoMap[0]?.bpm ?? 120;
  for (const t of tempoMap) {
    if (t.time <= time) bpm = t.bpm;
    else break;
  }
  return bpm;
}
```

---

## Pedal

```typescript
interface Pedal {
  type: 'sustain' | 'sostenuto' | 'una-corda'
  action: 'press' | 'release'
  measureNumber: number
  beat: number
  time: number
}
```

Los pedales del `ScoreDocument.globalPedals` se pueden usar para reproducción automática de pedal cuando se importa desde MusicXML (el compositor puede haber anotado pedales explícitamente).

---

## ParseResult

```typescript
interface ParseResult {
  success: boolean
  score?: ScoreDocument     // Solo si success=true
  errors: string[]          // Errores fatales
  warnings: string[]        // Advertencias no fatales
  format: 'musicxml' | 'midi' | 'abc' | 'unknown'
}
```

---

## Relaciones entre Tipos

```
ScoreDocument.parts[0].measures[5].notes[3]
        = ScoreNote con id "n-P1-6-67-11.250"

ScoreDocument.flatNotes.find(n => n.id === "n-P1-6-67-11.250")
        = FlatNote correspondiente

ScoreDocument.metadata.detectedChords.find(c => c.time <= 11.25 && c.time + c.duration > 11.25)
        = ChordEvent activo en ese momento
```
