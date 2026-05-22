# Arquitectura del Sistema — Piano MIDI Pro

## Visión General

Piano MIDI Pro es una Single Page Application (SPA) construida en React 19 + TypeScript. El sistema integra múltiples capas especializadas: parseo de partituras, síntesis de audio profesional, análisis musical y renderizado de notación.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                  │
│  Click en tecla / Controlador MIDI / Importar archivo           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                    App.tsx (React)                               │
│  Estado global: song, score, tracks, pedals, effects            │
│  Routing: Studio / Songs / Tracks / MIDI / Settings / Score     │
└──────┬────────────────┬────────────────┬────────────────┬───────┘
       │                │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐  ┌────▼──────┐
│  Parsers    │  │  Engine     │  │  Analysis  │  │Components │
│  Layer      │  │  Layer      │  │  Layer     │  │  Layer    │
└──────┬──────┘  └──────┬──────┘  └─────┬──────┘  └────┬──────┘
       │                │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐  ┌────▼──────┐
│ ScoreDoc    │  │ Tone.js     │  │ tonal.js   │  │   OSMD    │
│ Data Model  │  │ Web Audio   │  │ Algorithms │  │   MIDI    │
└─────────────┘  └─────────────┘  └────────────┘  └───────────┘
```

## Capas del Sistema

### 1. Capa de Parseo (`src/parsers/`)

**Responsabilidad**: Convertir archivos externos al modelo interno `ScoreDocument`.

```
Archivo (.xml / .mxl / .mid)
         │
         ▼
  MusicXMLParser.ts
  ├── JSZip → descomprime .mxl
  ├── DOMParser → árbol XML
  ├── Iteración part-by-part
  │   ├── measure-by-measure
  │   │   ├── note / rest / chord
  │   │   ├── dynamics / wedges / pedals
  │   │   ├── tempo / key / time sig
  │   │   ├── barlines / repeats
  │   │   └── articulations / ornaments
  │   └── absoluteTime acumulativo
  └── ScoreDocument output
```

**Flujo de tiempo**: El parser mantiene `absoluteTime` (segundos desde el inicio) que se va acumulando medida a medida. Dentro de cada medida, `voiceTime[voice]` rastrea el tiempo relativo por voz, soportando múltiples voces simultáneas y polifonía.

**Transposición**: Instrumentos transpositores (clarinete en Bb = -2 semitonos, saxo alto en Eb = -9) se corrigen automáticamente en el atributo `<transpose><chromatic>` del XML, sumando el offset al `midiNum` de cada nota.

### 2. Modelo de Datos (`src/types/score.ts`)

Jerarquía principal:

```
ScoreDocument
├── metadata: ScoreMetadata
│   ├── title, composer, copyright
│   ├── bpm, timeSignature, keySignature
│   ├── duration (seconds), totalMeasures
│   └── detectedKey, detectedChords, difficulty
├── parts: ScorePart[]
│   └── measures: Measure[]
│       └── notes: ScoreNote[]
│           ├── midi, time, duration
│           ├── articulations[], ornaments[]
│           ├── dynamic, velocity
│           └── staffNumber, voice
├── tempoMap: TempoMarking[]
├── flatNotes: FlatNote[]        ← optimizado para piano roll / playback
└── globalDynamics / globalWedges / globalPedals
```

`FlatNote` es la versión simplificada de `ScoreNote` compatible con el formato `SongNote` legacy del sistema original. Permite que el sistema de falling notes y el scheduler de Tone.js funcionen sin cambios estructurales.

### 3. Capa de Engine (`src/engine/InstrumentEngine.ts`)

**Responsabilidad**: Síntesis de audio a nivel profesional por instrumento.

```
InstrumentEngineRegistry
├── getPiano(trackId) → PianoEngine
│   ├── Tone.PolySynth (fallback)
│   ├── Tone.Sampler (Salamander, cuando carga)
│   ├── Tone.Reverb (decay=1.8s, wet=15%)
│   └── Tone.Volume (una corda control)
│
└── getTrumpet(trackId) → TrumpetEngine
    ├── Tone.PolySynth (sawtooth, timbre trompeta)
    ├── Tone.Distortion (flutter tongue / growl)
    ├── Tone.Filter (mute character, LPF/BPF)
    ├── Tone.Tremolo (flutter tongue amplitud)
    ├── Tone.Vibrato (pitch LFO)
    └── Tone.Reverb (decay=0.8s, wet=12%)
```

**Cadena de señal Trompeta**:
```
PolySynth → Distortion → Filter → Tremolo → Vibrato → Reverb → Volume → Master
```

El registry crea engines bajo demanda por `trackId` (string). Esto permite que una partitura con 2 pianos tenga engines independientes cada uno con su propio estado de pedales.

### 4. Capa de Análisis (`src/analysis/MusicAnalyzer.ts`)

**Responsabilidad**: Extraer información musical de alto nivel del `ScoreDocument`.

Algoritmos:
- **Key Detection**: Perfil Krumhansl-Schmuckler — correlación entre distribución de pitch classes y 24 perfiles (12 mayor + 12 menor)
- **Chord Detection**: `Chord.detect()` de tonal.js sobre grupos de notas simultáneas (ventana de 80ms)
- **Difficulty**: Score ponderado de densidad de notas + rango de tessitura + tempo + accidentales + ornamentos

### 5. Capa de Componentes (`src/components/`)

| Componente | Función principal |
|------------|------------------|
| `ScoreViewer` | Wrapper de OSMD — carga XML, renderiza SVG, mueve cursor |
| `PartMixer` | Controles volume/pan/mute/solo/color por parte |
| `ImportPanel` | Drop zone + file input + feedback de importación |
| `ScoreInfoBar` | Muestra tonalidad/acorde/compás/dinámica en tiempo real |
| `InstrumentControls` | Pedales piano + sordinas/lengua/vibrato trompeta |

### 6. App.tsx — Orquestador Central

`App.tsx` (~4400 líneas) es el componente raíz que coordina todo el estado. Sus responsabilidades:

**Estado de Score Reader** (nuevo):
```typescript
scoreDocument: ScoreDocument | null
scoreAnalysis: AnalysisResult | null
scoreParts: ScorePart[]
scoreImportLoading / Error / LastImported
scoreViewMode: 'roll' | 'sheet'
```

**Estado Piano** (nuevo):
```typescript
pianoPedalSustain / Sostenuto / UnaCorda: boolean
pianoHalfPedal: number (0-1)
```

**Estado Trompeta** (nuevo):
```typescript
trumpetMute: BrassMuteType
trumpetTonguing: TrumpetTonguing
trumpetVibratoDepth / Rate / Delay: number
trumpetFall / Doit / Shake: boolean
```

**Flujo de Importación**:
```
handleScoreImport(file)
    ├── .mid/.midi → parseMidiFile() (legacy)
    │   └── setSong(newSong) → screen='studio'
    └── .xml/.mxl → parseMusicXML(file)
        ├── analyzeScore(sc) → analysis
        ├── scoreToParts(sc) → SongData compatible
        ├── setSong + setScoreDocument + setScoreParts
        └── screen='score'
```

**Flujo de Playback con Instrumentos Avanzados**:
```
scheduleSongOnTransport()
    ├── Por cada nota en song.notes:
    │   ├── registry.getType(instrument) === 'piano'?
    │   │   ├── buscar ScoreNote por id en scoreDocument
    │   │   └── pianoEngine.triggerNote(inferPianoParams(scoreNote, pedalState))
    │   ├── registry.getType(instrument) === 'trumpet'?
    │   │   ├── buscar ScoreNote por id en scoreDocument
    │   │   └── trumpetEngine.triggerNote(inferTrumpetParams + trumpetState)
    │   └── else → triggerAttack() (engine genérico legacy)
    └── Tone.Transport.schedule() con audio time exacto
```

## Flujo de Datos Completo

```
Archivo externo
      │
      ▼ parseMusicXML()
ScoreDocument ──────────────────────────────────────────────────────┐
      │                                                              │
      │ scoreToParts()           analyzeScore()                     │
      ▼                                ▼                            │
   SongData                      AnalysisResult                     │
(notas flat)                   (key, chords,                        │
      │                         difficulty, stats)                  │
      │                                │                            │
      │                                ▼                            │
      │                         ScoreInfoBar                        │
      │                         (tiempo real)                       │
      │                                                             │
      ▼                                                             ▼
Tone.Transport ←── scheduleSongOnTransport()            OSMD (ScoreViewer)
      │                    │                            (partitura visual)
      │                    ▼
      │           InstrumentEngineRegistry
      │              ├── PianoEngine.triggerNote()
      │              └── TrumpetEngine.triggerNote()
      │
      ▼
 Web Audio API → Altavoces
```

## Compatibilidad con Sistema Legacy

El sistema original de Piano MIDI Pro usaba `SongData` con `SongNote[]` flat. El Score Reader mantiene compatibilidad total:

1. `FlatNote` extiende `SongNote` con campos adicionales (`partId`, `measureNumber`, `beat`, etc.)
2. `scoreToParts()` convierte `ScoreDocument → SongData` para el scheduler legacy
3. El scheduler detecta si tiene `ScoreDocument` y usa el engine avanzado; si no, usa `triggerAttack()` genérico
4. Las pantallas `Tracks` y `Studio` siguen funcionando para MIDI sin `ScoreDocument`

## Gestión de Memoria

- Los engines de instrumento se inicializan lazy en el registry (`getPiano(id)` al primer uso)
- `disposeAll()` libera todos los nodos de Tone.js al limpiar
- El XML original se cachea en `sessionStorage` por `scoreId` para que OSMD pueda re-renderizar sin re-parsear
- Las canciones demo se crean en memoria al iniciar; las importadas se mantienen en `songsList` state

## Threading Model

Todo el audio corre en el Audio Worklet thread (Web Audio API). El scheduling de eventos usa `Tone.Transport` que opera en el audio clock de alta precisión, no en el JavaScript main thread. Los callbacks de `Tone.Transport.schedule()` reciben `audioTime` en segundos de audio (no `Date.now()`), garantizando sincronización perfecta independiente de jank del main thread.


---

## 7. Sistema de Gamificación (`src/types/gamification.ts`, `src/utils/`)

**Responsabilidad**: Sistema completo de progresión del jugador estilo Guitar Hero con XP, niveles, logros y ratings.

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    GAMIFICATION LAYER                            │
│  XP • Levels • Achievements • Song Ratings • Star Power          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│   Profile    │ │ Achievements│ │Song Ratings│
│   System     │ │   System    │ │   System   │
└───────┬──────┘ └──────┬──────┘ └─────┬──────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                ┌───────▼────────┐
                │  localStorage  │
                │   Persistence  │
                └────────────────┘
```

### Componentes del Sistema

#### 7.1 Enhanced Game Engine (`src/game/engine.ts`)

**Mejoras al sistema de puntuación original:**

```typescript
// Multiplicadores de Combo Agresivos
0-9 notas:    x1
10-24 notas:  x2
25-49 notas:  x4
50-99 notas:  x8
100-249 notas: x16
250+ notas:   x32 (máximo)

// Star Power / Piano Fury System
Acumulación:
  - Perfect+ hit: +5%
  - Perfect hit:  +3%
  - Great hit:    +1%
  - Miss:         -10%

Activación:
  - Requiere: ≥50% acumulado
  - Efecto: 2x multiplicador de score
  - Duración: 10 segundos
  - Se consume al activar

// Perfect Streak Bonuses
  - Activo después de 10 hits perfectos consecutivos
  - Bonus: +50 puntos por cada nota perfecta adicional
  - Se resetea con cualquier hit no-perfecto
```

**Funciones principales:**
- `initStarPower()` - Inicializar estado de star power
- `addStarPower()` - Acumular star power por hits
- `activateStarPower()` - Activar modo fury
- `updateStarPower()` - Actualizar duración activa
- `getComboMultiplier()` - Obtener multiplicador de combo
- `calculateScoreMultiplier()` - Multiplicador total (combo × star power)
- `applyEnhancedGameHit()` - Aplicar hit con sistema mejorado
- `applyEnhancedGameMiss()` - Aplicar miss con penalizaciones
- `calculateStars()` - Calcular estrellas (1-5) desde score
- `calculateMaxScore()` - Calcular score máximo teórico

#### 7.2 Profile System (`src/utils/profile.ts`)

**Gestión de perfiles de jugador:**

```typescript
PlayerProfile {
  id: string
  username: string
  avatar: string (emoji)
  level: number (1-100)
  xp: number
  stats: PlayerStats {
    totalScore: number
    gamesPlayed: number
    totalPlaytime: number (segundos)
    bestCombo: number
    averageAccuracy: number
    totalStars: number
    songsCompleted: number
    achievementsUnlocked: number
    perfectHits: number
    greatHits: number
    goodHits: number
    missedNotes: number
  }
  settings: {
    showXPNotifications: boolean
    showAchievementToasts: boolean
    showLevelUpModal: boolean
  }
  createdAt: string (ISO)
  lastPlayed: string (ISO)
}
```

**Sistema de XP y Niveles:**

```typescript
// Fórmula de progresión exponencial
XP_para_nivel_N = 1000 × (N ^ 1.5)

Ejemplos:
  Nivel 1:  0 XP
  Nivel 2:  2,828 XP
  Nivel 5:  11,180 XP
  Nivel 10: 31,623 XP
  Nivel 25: 125,000 XP
  Nivel 50: 353,553 XP
  Nivel 100: 1,000,000 XP

// Cálculo de XP ganado por partida
Base XP = score / 100
Accuracy Bonus = accuracy × 500
Combo Bonus = maxCombo × 10
Perfect Streak Bonus = (streak - 9) × 50 (si streak ≥ 10)

Multiplicadores por Dificultad:
  - Easy:   x1.0
  - Normal: x1.5
  - Hard:   x2.0
  - Expert: x3.0

Total XP = (Base + Bonuses) × Difficulty Multiplier
```

**Funciones principales:**
- `createProfile()` - Crear perfil inicial
- `getOrCreateProfile()` - Obtener o crear perfil
- `calculateLevel()` - Calcular nivel desde XP total
- `getLevelProgress()` - Progreso dentro del nivel (0-1)
- `calculateXPReward()` - Calcular XP ganado con breakdown
- `addXP()` - Agregar XP y manejar level ups
- `updateStats()` - Actualizar estadísticas globales
- `saveProfile()` / `loadProfile()` - Persistencia localStorage
- `getRankTitle()` - Obtener título por nivel (Novice, Expert, Master, etc.)

#### 7.3 Achievement System (`src/utils/achievements.ts`)

**20 Logros en 5 Categorías:**

```typescript
Achievement {
  id: string
  name: string
  description: string
  icon: string (emoji)
  category: 'first_steps' | 'combo_master' | 'accuracy_expert' | 
            'score_hunter' | 'dedication'
  xpReward: number
  titleReward?: string
  unlocked: boolean
  unlockedAt?: string (ISO)
  progress: number (0-1)
}

Categorías:
  1. First Steps (5 logros)
     - First Note, First Performance, Perfect Timing, 
       Combo Starter, Three Star Debut
  
  2. Combo Master (5 logros)
     - Combo Apprentice (25x), Combo Expert (50x),
       Combo Master (100x), Combo Legend (250x),
       Unstoppable (500x)
  
  3. Accuracy Expert (5 logros)
     - Consistent Player (80%), Precision Player (90%),
       Near Perfect (95%), Almost Flawless (98%),
       Perfection (100%)
  
  4. Score Hunter (3 logros)
     - Score Chaser (100k), Score Hunter (500k),
       Millionaire (1M)
  
  5. Dedication (2 logros)
     - Getting Started (10 songs), 
       Dedicated Musician (50 songs)
```

**Funciones principales:**
- `getAchievementDefinitions()` - Obtener todas las definiciones
- `checkAchievements()` - Verificar logros desbloqueables
- `unlockAchievement()` - Desbloquear logro específico
- `getAchievementProgress()` - Obtener progreso de logro
- `getUnlockedAchievements()` / `getLockedAchievements()` - Filtros
- `getAchievementsByCategory()` - Filtrar por categoría
- `getTotalAchievementXP()` - XP total de logros
- `getAchievementCompletion()` - Porcentaje de completitud

#### 7.4 Song Rating System (`src/utils/songRatings.ts`)

**Sistema de Estrellas 1-5:**

```typescript
SongRating {
  songId: string
  difficulty: 'easy' | 'normal' | 'hard' | 'expert'
  stars: number (1-5)
  score: number
  maxScore: number
  accuracy: number
  maxCombo: number
  perfectHits: number
  date: string (ISO)
}

// Cálculo de estrellas
scorePercentage = (score / maxScore) × 100

1 Estrella:  60-69%
2 Estrellas: 70-79%
3 Estrellas: 80-89%
4 Estrellas: 90-94%
5 Estrellas: 95-100%
```

**Funciones principales:**
- `calculateStars()` - Calcular estrellas desde score
- `createSongRating()` - Crear rating desde game stats
- `saveSongRating()` - Guardar rating (solo si es mejor)
- `getSongRating()` - Obtener rating específico
- `getAllRatings()` - Obtener todos los ratings
- `getSongProgress()` - Progreso por canción (todas dificultades)
- `getTotalStars()` - Total de estrellas ganadas
- `getCompletedSongsCount()` - Cantidad de canciones completadas
- `getBestScores()` - Top N scores
- `getPerfectSongs()` - Canciones con 5 estrellas
- `getDifficultyStats()` - Estadísticas por dificultad

#### 7.5 Profile Panel Component (`src/components/ProfilePanel.tsx`)

**UI completa del perfil del jugador:**

```typescript
ProfilePanel {
  props: {
    profile: PlayerProfile
    onProfileUpdate: (profile: PlayerProfile) => void
    onClose: () => void
  }
  
  sections: {
    Header:
      - Avatar picker (10 emojis)
      - Username editable
      - Rank title
      - Level badge
      - XP progress bar
    
    Tabs:
      1. Statistics:
         - 8 stat cards (games, score, combo, accuracy, etc.)
         - Hit distribution chart
      
      2. Achievements:
         - Grid de logros desbloqueados (color)
         - Grid de logros bloqueados (grayscale)
         - Progress bars
      
      3. Songs:
         - Lista de canciones completadas
         - Estrellas por dificultad
         - Best scores
  }
}
```

### Integración con App.tsx

**Estado agregado:**

```typescript
// Gamification state
const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => 
  getOrCreateProfile()
);
const [showProfilePanel, setShowProfilePanel] = useState(false);
const [xpNotification, setXpNotification] = useState<{
  amount: number;
  show: boolean;
}>({ amount: 0, show: false });
const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
const [achievementToasts, setAchievementToasts] = useState<Array<{
  id: string;
  name: string;
  icon: string;
  description: string;
}>>([]);
const [starsEarned, setStarsEarned] = useState<number>(0);
```

**Flujo de Gamificación al Finalizar Partida:**

```
finishGameRound()
    │
    ├── Calcular score máximo teórico
    │   └── calculateMaxScore(song.notes, difficulty)
    │
    ├── Calcular estrellas ganadas (1-5)
    │   └── calculateStars(finalScore, maxScore)
    │
    ├── Calcular XP reward con breakdown
    │   └── calculateXPReward(finalScore, accuracy, maxCombo, 
    │                          perfectStreak, difficulty)
    │
    ├── Agregar XP al perfil
    │   ├── addXP(profile, xpReward)
    │   └── Detectar level ups → setLevelUpEvent()
    │
    ├── Actualizar estadísticas globales
    │   └── updateStats(profile, gameStats)
    │
    ├── Verificar y desbloquear achievements
    │   ├── checkAchievements(profile, gameStats)
    │   └── Para cada logro desbloqueado:
    │       ├── unlockAchievement(profile, achievementId)
    │       └── Agregar a achievementToasts
    │
    ├── Guardar rating de la canción
    │   └── saveSongRating(songId, difficulty, rating)
    │
    ├── Persistir perfil en localStorage
    │   └── saveProfile(profile)
    │
    └── Activar notificaciones UI
        ├── setXpNotification({ amount: xp, show: true })
        ├── setStarsEarned(stars)
        └── Mostrar toasts de achievements
```

### Persistencia de Datos

**localStorage Keys:**

```typescript
STORAGE_KEYS = {
  PLAYER_PROFILE: 'piano-midi-pro:player-profile',
  ACHIEVEMENT_PROGRESS: 'piano-midi-pro:achievement-progress',
  SONG_RATINGS: 'piano-midi-pro:song-ratings'
}
```

**Estructura de datos:**

```json
// piano-midi-pro:player-profile
{
  "id": "uuid",
  "username": "Player",
  "avatar": "🎹",
  "level": 5,
  "xp": 12500,
  "stats": { ... },
  "settings": { ... },
  "createdAt": "2026-05-21T...",
  "lastPlayed": "2026-05-21T..."
}

// piano-midi-pro:achievement-progress
{
  "first-note": {
    "id": "first-note",
    "unlocked": true,
    "unlockedAt": "2026-05-21T...",
    "progress": 1
  },
  ...
}

// piano-midi-pro:song-ratings
{
  "fur_elise:easy": {
    "songId": "fur_elise",
    "difficulty": "easy",
    "stars": 4,
    "score": 45000,
    "maxScore": 50000,
    "accuracy": 0.92,
    "date": "2026-05-21T..."
  },
  ...
}
```

### Preparación para Fase 2 (Backend)

El sistema está diseñado para migración fácil a Supabase:

```typescript
// Tipos preparados para PostgreSQL
LeaderboardEntry {
  rank: number
  username: string
  score: number
  accuracy: number
  combo: number
  stars: number
  difficulty: string
  songId: string
  date: string
}

Challenge {
  id: string
  type: 'daily' | 'weekly' | 'special'
  name: string
  description: string
  target: number
  reward: { xp: number; title?: string }
  progress: number
  completed: boolean
  expiresAt: string
}
```

**Migración planeada:**
1. Crear tablas en Supabase (profiles, achievements, ratings, leaderboards)
2. Implementar sync bidireccional localStorage ↔ Supabase
3. Agregar autenticación (Supabase Auth)
4. Implementar leaderboards globales en tiempo real
5. Sistema de challenges diarios/semanales
6. Multiplayer competitivo

### Performance y Optimización

- **Cálculos de XP**: O(1) - fórmulas matemáticas simples
- **Achievement checking**: O(n) donde n = 20 logros
- **Song ratings**: O(1) lookup en Map
- **localStorage**: Debounce implícito, escrituras solo al finalizar partida
- **Profile Panel**: React.memo + useMemo para evitar re-renders
- **Animations**: CSS transforms (GPU-accelerated)

### Testing

```bash
# Verificar sistema completo
cd app
npm run build  # ✅ Compila sin errores
npm run dev    # ✅ Funciona correctamente

# Verificar en DevTools
localStorage.getItem('piano-midi-pro:player-profile')
localStorage.getItem('piano-midi-pro:achievement-progress')
localStorage.getItem('piano-midi-pro:song-ratings')
```

---

El renderizado visual (Canvas falling notes) usa `requestAnimationFrame` y lee `Tone.Transport.ticks` para sincronizarse con el audio clock.
