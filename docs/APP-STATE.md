# App State — Estado Global de App.tsx

## Descripción

`App.tsx` es el componente raíz que gestiona todo el estado de la aplicación (~4400 líneas). Esta documentación describe cada grupo de estado, sus relaciones y los handlers asociados.

---

## Grupos de Estado

### Navegación

```typescript
screen: NavScreen
// 'studio' | 'songs' | 'tracks' | 'midi' | 'settings' | 'score'
```

### Canción activa (legacy SongData)

```typescript
song: SongData              // Canción actualmente cargada
songsList: SongData[]       // Biblioteca de canciones (demo + importadas)
searchQuery: string         // Filtro de búsqueda en biblioteca
```

`SongData` es el formato de canción original. Cuando se importa un MusicXML, se convierte a `SongData` via `scoreToParts()` para compatibilidad con el sistema de reproducción legacy.

### Rango del teclado

```typescript
rangeStart: number          // MIDI de la primera tecla visible (siempre múltiplo de 12)
// Siempre es un Do (C): 24=C1, 36=C2, 48=C3, etc.
// Rango: PIANO_MIN_MIDI(21) a PIANO_MAX_MIDI(108) - RANGE_KEY_COUNT(37) + 1
```

`snapToC(n)` asegura que `rangeStart` siempre apunte a un Do, manteniendo el patrón correcto de teclas blancas/negras en el visor.

### Reproducción

```typescript
playbackRate: number        // Multiplicador de tempo (0.5 = mitad, 2 = doble)
currentTime: number         // Posición actual en segundos
isPlaying: boolean
isAudioReady: boolean       // true después del primer gesto de usuario + Tone.start()
isSamplerActive: boolean    // true cuando Salamander Piano terminó de cargar
isAudioLoading: boolean     // true mientras se inicializa el audio
audioStatusMessage: string  // "Cargando piano real...", "Piano realista activo", etc.
```

### Notas activas

```typescript
activePlaybackNotes: Set<number>  // MIDIs del scheduler de reproducción
activeMidiNotes: Set<number>      // MIDIs del controlador MIDI físico
```

La unión de ambas sets controla qué teclas se iluminan en el piano virtual y en el canvas de falling notes.

```typescript
// En el render del piano
const activeNotes = new Set([...activePlaybackNotes, ...activeMidiNotes]);
```

### Tracks (sistema legacy, sincronizado con ScoreParts)

```typescript
trackMuted: Record<number, boolean>     // index → muted
trackSolo: Record<number, boolean>      // index → solo
trackVolumes: Record<number, number>    // index → 0-1
trackInstruments: Record<number, string> // index → nombre GM
trackColors: Record<number, string>     // index → color HEX
```

Cuando se carga un `ScoreDocument`, `scoreParts` y `trackMuted/Solo/etc.` se mantienen sincronizados via handlers:

```typescript
handlePartMuteToggle(partId) → setScoreParts(...) + setTrackMuted(...)
handlePartSoloToggle(partId) → setScoreParts(...) + setTrackSolo(...)
handlePartVolumeChange(partId, vol) → setScoreParts(...) + setTrackVolumes(...)
handlePartInstrumentChange(partId, inst) → setScoreParts(...) + setTrackInstruments(...)
handlePartColorChange(partId, color) → setScoreParts(...) + setTrackColors(...)
```

### MIDI Hardware

```typescript
midiPermission: string          // 'unknown' | 'granted' | 'denied' | 'prompt'
midiStatus: string              // Mensaje de estado
midiError: string               // Mensaje de error
midiInputs: MidiInputDevice[]   // Lista de dispositivos detectados
isMidiScanning: boolean
lastPhysicalMidi: number | null // Última nota recibida (para calibración)
calibrating: boolean            // En proceso de calibración
selectedInputId: string         // '__all__' o ID específico
midiMode: 'anchor' | 'shift'   // Modo de mapeo de notas
midiPhysicalBase: number        // Nota base del controlador (C3 = 48)
```

**Modo shift**: El rango visible del teclado virtual corresponde 1:1 con el teclado físico. Si el rango visual está en C3-C6, el Do del controlador físico suena como C3.

**Modo anchor**: La primera nota presionada define el mapeo dinámicamente.

### Expresión MIDI avanzada

```typescript
pitchBend: number               // -1.0 a 1.0 (del pitch wheel)
pitchBendRange: number          // Semitonos (default 2)
lastVelocity: number            // Última velocidad recibida (0-127)
velocityCurve: 'linear' | 'logarithmic' | 'exponential'
mouseVelocity: number           // Velocidad para notas tocadas con mouse (0-1)
sustainDown: boolean            // CC64 (sustain pedal del controlador MIDI)
```

### Configuración de sonido

```typescript
scrollSensitivity: number       // Sensibilidad del scroll para cambiar octava
showNoteNames: 'none' | 'name' | 'binding' // Etiquetas en teclas
pitchPractice: boolean          // Modo práctica de lectura de notas
reverbDecay: number             // Segundos de reverb (0.3-5.0)
chorusDepth: number             // 0-1 (profundidad del chorus)
showParticles: boolean          // Partículas visuales al tocar
sustainTime: number             // Release time del synth (0.2-5s)
latencyMode: 'ultra' | 'balanced'  // ultra=0ms lookAhead, balanced=40ms
```

### Controles maestros

```typescript
masterVolume: number            // dB (-40 a 0)
transpose: number               // Semitonos (-12 a +12)
metronomeOn: boolean
metronomeVolume: number         // 0-1
```

### Score Reader (nuevo)

```typescript
scoreDocument: ScoreDocument | null
scoreAnalysis: AnalysisResult | null
scoreImportLoading: boolean
scoreImportError: string | null
scoreLastImported: string | null    // Título de la última partitura importada
scoreViewMode: 'roll' | 'sheet'     // Piano Roll vs Partitura visual
scoreParts: ScorePart[]             // Copia mutable del scoreDocument.parts
```

`scoreParts` es una copia de `scoreDocument.parts` que se puede modificar via el mixer sin afectar el `scoreDocument` original. Los cambios en el mixer (volume, mute, etc.) se propagan a `scoreParts` y también a `trackMuted/trackVolumes/etc.` para compatibilidad.

### Piano avanzado (nuevo)

```typescript
pianoPedalSustain: boolean      // Pedal derecho (físico)
pianoPedalSostenuto: boolean    // Pedal central
pianoPedalUnaCorda: boolean     // Pedal izquierdo
pianoHalfPedal: number          // 0-1 (posición del pedal)
```

Estos estados se leen en `scheduleSongOnTransport()` al construir `PianoNoteParams`.

### Trompeta avanzada (nuevo)

```typescript
trumpetMute: BrassMuteType          // 'none' | 'straight' | 'cup' | 'harmon' | ...
trumpetTonguing: TrumpetTonguing    // 'single' | 'double' | 'flutter' | ...
trumpetVibratoDepth: number         // cents (0-100)
trumpetVibratoRate: number          // Hz (4-9)
trumpetVibratoDelay: number         // segundos (0-0.5)
trumpetFall: boolean
trumpetDoit: boolean
trumpetShake: boolean
```

---

## Refs Clave

```typescript
// Audio
samplerRef         Tone.Sampler       // Salamander Piano
fallbackSynthsRef  Record<n, PolySynth> // Synths por track index
reverbRef          Tone.Reverb
chorusRef          Tone.Chorus
volNodeRef         Tone.Volume        // Volumen maestro
compressorRef      Tone.Compressor
metronomeRef       Tone.MetalSynth

// Score Engine (nuevo)
engineRegistryRef  InstrumentEngineRegistry  // Piano + Trumpet engines

// Canvas
canvasRef          HTMLCanvasElement   // Piano roll / falling notes
rafRef             number              // requestAnimationFrame ID

// MIDI
midiAccessRef      MIDIAccess
physicalAnchorRef  number | null       // Nota base para modo anchor

// Notas activas (sync fuera del ciclo React para evitar re-renders)
activePlaybackNotesRef  Set<number>
activeVoicesRef    { key, midi, trackIndex, freq }[]
sustainedNotesRef  Set<number>         // Notas sostenidas por pedal

// Minimapa
minimapDragRef     { startX, startRange } | null
```

Los refs de notas activas evitan re-renders durante la reproducción. Las notas se agregan/eliminan en callbacks de `Tone.Transport.schedule()` sin setState. Solo una vez por frame (60fps) se hace `setActivePlaybackNotes(new Set(activePlaybackNotesRef.current))`.

---

## Handlers Principales

### Audio

| Handler | Descripción |
|---------|-------------|
| `initializeAudio()` | Inicia Tone.js, crea cadena de señal, carga Salamander |
| `triggerAttack(midi, vel, track, inst)` | Ataca una nota (sampler o synth) |
| `triggerRelease(midi, track)` | Libera una nota |
| `getOrCreateSynthForTrack(index, inst)` | Crea/recupera PolySynth para track |

### Reproducción

| Handler | Descripción |
|---------|-------------|
| `startPlayback()` | Inicia/reanuda reproducción |
| `pausePlayback()` | Pausa sin resetear posición |
| `stopPlayback()` | Para y vuelve al inicio |
| `seekTo(time)` | Salta a posición específica |
| `scheduleSongOnTransport()` | Programa todas las notas en Tone.Transport |
| `syncTransportClock()` | RAF loop que actualiza currentTime desde Transport |

### Importación

| Handler | Descripción |
|---------|-------------|
| `parseMidiFile(file)` | Parsea MIDI via @tonejs/midi |
| `handleScoreImport(file)` | Router: .mid → parseMidiFile, .xml/.mxl → parseMusicXML |
| `handleFileUpload(e)` | Wrapper legacy para input[type=file] |

### Partes (Score Mixer)

| Handler | Descripción |
|---------|-------------|
| `handlePartVolumeChange(id, vol)` | Volumen de parte + sync trackVolumes |
| `handlePartPanChange(id, pan)` | Pan de parte |
| `handlePartMuteToggle(id)` | Mute toggle + sync trackMuted |
| `handlePartSoloToggle(id)` | Solo toggle + sync trackSolo |
| `handlePartVisibilityToggle(id)` | Visibilidad en OSMD |
| `handlePartInstrumentChange(id, inst)` | Instrumento + sync trackInstruments |
| `handlePartColorChange(id, color)` | Color + sync trackColors |

### MIDI Hardware

| Handler | Descripción |
|---------|-------------|
| `requestMidiAccess()` | Solicita permiso Web MIDI API |
| `connectMidiInputs(access)` | Conecta eventos a todos los inputs |
| `refreshMidiDevices()` | Actualiza lista de dispositivos |
| `handleMidiMessage(msg)` | Procesa mensajes MIDI (note on/off, CC, pitch bend) |
| `handleGlobalMouseUp()` | Libera notas del mouse al soltar fuera del teclado |

---

## Flujo de inicialización

```
1. App mount
   ├── useState inicializa con canciones demo (createLlorarasSong, etc.)
   ├── rangeStart se lee de localStorage
   └── selectedInputId se lee de localStorage

2. Primer gesto de usuario (click en Reproducir, tecla del piano, etc.)
   └── initializeAudio()
       ├── Tone.start() → desbloquea AudioContext
       ├── Crea cadena: Vol → Chorus → Reverb → Compressor → Limiter
       ├── Crea PolySynths (fallback inmediato)
       ├── engineRegistryRef = new InstrumentEngineRegistry(vol)
       ├── isAudioReady = true → usuario oye algo inmediatamente
       └── async: carga Salamander (~5s)
           └── isSamplerActive = true → timbre real de piano

3. Importar MusicXML
   └── handleScoreImport(file)
       ├── parseMusicXML(file) → ParseResult
       ├── analyzeScore(score) → AnalysisResult
       ├── scoreToParts(score) → SongData (compatible con legacy)
       ├── setSong(newSong)
       ├── setScoreDocument(score)
       ├── setScoreParts(score.parts)
       └── screen = 'score'

4. Reproducción con Score
   └── startPlayback()
       ├── initializeAudio() si es necesario
       ├── scheduleSongOnTransport()
       │   └── Por cada FlatNote:
       │       ├── Si piano + ScoreDocument → PianoEngine.triggerNote()
       │       ├── Si trompeta + ScoreDocument → TrumpetEngine.triggerNote()
       │       └── else → triggerAttack() (legacy)
       └── syncTransportClock() → 60fps loop actualiza currentTime
```
