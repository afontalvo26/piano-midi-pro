# 🔧 Plan de Refactorización y Modularización - Piano MIDI Pro

**Fecha:** Mayo 21, 2026  
**Objetivo:** Reorganizar el proyecto para hacerlo escalable, mantenible y fácil de trabajar tanto para IA como manualmente  
**Estado Actual:** App.tsx tiene ~5,853 líneas - necesita modularización urgente

---

## 📊 Análisis del Estado Actual

### Problemas Identificados

1. **App.tsx Monolítico** (~5,853 líneas)
   - Mezcla lógica de negocio, estado, UI y efectos
   - Difícil de mantener y testear
   - Alto acoplamiento entre funcionalidades
   - Múltiples responsabilidades en un solo archivo

2. **Falta de Separación de Concerns**
   - Estado global mezclado con lógica de UI
   - Handlers de eventos dispersos
   - Lógica de audio mezclada con lógica de juego
   - Sin capa de servicios clara

3. **Componentes UI Inline**
   - Mucho JSX inline en App.tsx
   - Componentes no reutilizables
   - Difícil de testear individualmente

4. **Gestión de Estado Compleja**
   - ~50+ variables de estado en App.tsx
   - Sin patrón claro de gestión de estado
   - Difícil seguir el flujo de datos

---

## 🎯 Objetivos de la Refactorización

### Principios SOLID
- **S**ingle Responsibility: Cada módulo una responsabilidad
- **O**pen/Closed: Abierto a extensión, cerrado a modificación
- **L**iskov Substitution: Interfaces consistentes
- **I**nterface Segregation: Interfaces específicas
- **D**ependency Inversion: Depender de abstracciones

### Metas Específicas
1. ✅ Reducir App.tsx a <500 líneas (orquestador principal)
2. ✅ Separar lógica de negocio de UI
3. ✅ Crear capa de servicios reutilizable
4. ✅ Implementar custom hooks para lógica compartida
5. ✅ Modularizar componentes UI complejos
6. ✅ Mejorar testabilidad (unit tests posibles)
7. ✅ Facilitar trabajo colaborativo (IA + humano)
8. ✅ Preparar para escalabilidad futura

---

## 📁 Nueva Estructura de Directorios

```
app/src/
├── main.tsx                          # Entry point (sin cambios)
├── App.tsx                           # Orquestador principal (~500 líneas)
├── App.css                           # Estilos globales
├── index.css                         # Reset CSS
│
├── analysis/                         # ✅ Ya modularizado
│   └── MusicAnalyzer.ts
│
├── assets/                           # ✅ Ya organizado
│   ├── hero.png
│   ├── react.svg
│   └── vite.svg
│
├── components/                       # UI Components
│   ├── common/                       # 🆕 Componentes reutilizables
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Slider.tsx
│   │   ├── Tabs.tsx
│   │   └── Toast.tsx
│   │
│   ├── game/                         # 🆕 Componentes de juego
│   │   ├── GameCanvas.tsx            # Canvas de falling notes
│   │   ├── GameHUD.tsx               # ✅ Ya existe
│   │   ├── GameResultsModal.tsx      # ✅ Ya existe
│   │   ├── GameControls.tsx          # 🆕 Controles de juego
│   │   └── PianoKeyboard.tsx         # 🆕 Teclado visual
│   │
│   ├── gamification/                 # 🆕 Componentes de gamificación
│   │   ├── ProfilePanel.tsx          # ✅ Ya existe
│   │   ├── ProfileButton.tsx         # 🆕 Botón de perfil
│   │   ├── XPNotification.tsx        # 🆕 Toast de XP
│   │   ├── LevelUpModal.tsx          # 🆕 Modal de level up
│   │   ├── AchievementToast.tsx      # 🆕 Toast de logro
│   │   ├── StarPowerBar.tsx          # 🆕 Barra de star power
│   │   └── StarsDisplay.tsx          # 🆕 Display de estrellas
│   │
│   ├── score/                        # 🆕 Componentes de partitura
│   │   ├── ScoreViewer.tsx           # ✅ Ya existe
│   │   ├── ScoreInfoBar.tsx          # ✅ Ya existe
│   │   ├── PartMixer.tsx             # ✅ Ya existe
│   │   └── ImportPanel.tsx           # ✅ Ya existe
│   │
│   ├── studio/                       # 🆕 Componentes de estudio
│   │   ├── TransportControls.tsx     # 🆕 Play/Pause/Stop
│   │   ├── TempoControl.tsx          # 🆕 Control de tempo
│   │   ├── VolumeControl.tsx         # 🆕 Control de volumen
│   │   └── EffectsPanel.tsx          # 🆕 Panel de efectos
│   │
│   ├── settings/                     # 🆕 Componentes de ajustes
│   │   ├── SettingsPanel.tsx         # 🆕 Panel principal
│   │   ├── AudioSettings.tsx         # 🆕 Ajustes de audio
│   │   ├── GameSettings.tsx          # 🆕 Ajustes de juego
│   │   └── DisplaySettings.tsx       # 🆕 Ajustes de display
│   │
│   ├── library/                      # 🆕 Componentes de biblioteca
│   │   ├── SongsList.tsx             # 🆕 Lista de canciones
│   │   ├── SongCard.tsx              # 🆕 Tarjeta de canción
│   │   └── SongFilters.tsx           # 🆕 Filtros de búsqueda
│   │
│   ├── InstrumentControls.tsx        # ✅ Ya existe
│   ├── KeyFxPanel.tsx                # ✅ Ya existe
│   ├── NeonRunnerAvatar.tsx          # ✅ Ya existe
│   ├── PianoPet.ts                   # ✅ Ya existe
│   └── PianoPetRive.tsx              # ✅ Ya existe
│
├── constants/                        # 🆕 Constantes del proyecto
│   ├── audio.ts                      # Constantes de audio
│   ├── game.ts                       # Constantes de juego
│   ├── piano.ts                      # Constantes de piano
│   └── ui.ts                         # Constantes de UI
│
├── contexts/                         # 🆕 React Contexts
│   ├── AudioContext.tsx              # Estado de audio global
│   ├── GameContext.tsx               # Estado de juego global
│   ├── ProfileContext.tsx            # Estado de perfil global
│   └── SettingsContext.tsx           # Estado de settings global
│
├── engine/                           # ✅ Ya modularizado
│   ├── BrassSamplerEngine.ts
│   ├── GMSamplerEngine.ts
│   └── InstrumentEngine.ts
│
├── game/                             # Motor de juego
│   ├── engine.ts                     # ✅ Ya existe
│   ├── chart.ts                      # 🆕 Lógica de chart building
│   ├── scoring.ts                    # 🆕 Sistema de puntuación
│   ├── timing.ts                     # 🆕 Sistema de timing
│   └── difficulty.ts                 # 🆕 Cálculo de dificultad
│
├── hooks/                            # 🆕 Custom React Hooks
│   ├── useAudioEngine.ts             # Hook para audio engine
│   ├── useGameState.ts               # Hook para estado de juego
│   ├── useKeyboardInput.ts           # Hook para input de teclado
│   ├── useMIDIInput.ts               # Hook para input MIDI
│   ├── useProfile.ts                 # Hook para perfil
│   ├── useSettings.ts                # Hook para settings
│   ├── useSongLibrary.ts             # Hook para biblioteca
│   └── useTransport.ts               # Hook para transport
│
├── parsers/                          # ✅ Ya modularizado
│   └── MusicXMLParser.ts
│
├── services/                         # 🆕 Capa de servicios
│   ├── audioService.ts               # Servicio de audio
│   ├── gameService.ts                # Servicio de juego
│   ├── midiService.ts                # Servicio MIDI
│   ├── scoreService.ts               # Servicio de partituras
│   ├── storageService.ts             # Servicio de localStorage
│   └── transportService.ts           # Servicio de transport
│
├── types/                            # ✅ Ya modularizado
│   ├── gamification.ts
│   ├── score.ts
│   ├── audio.ts                      # 🆕 Tipos de audio
│   ├── game.ts                       # 🆕 Tipos de juego
│   └── ui.ts                         # 🆕 Tipos de UI
│
└── utils/                            # Utilidades
    ├── achievements.ts               # ✅ Ya existe
    ├── profile.ts                    # ✅ Ya existe
    ├── settings.ts                   # ✅ Ya existe
    ├── songRatings.ts                # ✅ Ya existe
    ├── audio.ts                      # 🆕 Helpers de audio
    ├── format.ts                     # 🆕 Formateo de datos
    ├── midi.ts                       # 🆕 Helpers MIDI
    └── validation.ts                 # 🆕 Validaciones
```

---

## 🔄 Plan de Migración por Fases

### Fase 1: Extracción de Constantes (1-2 horas)
**Objetivo:** Mover todas las constantes a archivos dedicados

**Archivos a crear:**
1. `src/constants/piano.ts`
   ```typescript
   export const PIANO_MIN_MIDI = 21; // A0
   export const PIANO_MAX_MIDI = 108; // C8
   export const RANGE_KEY_COUNT = 37;
   export const INITIAL_RANGE_START = 48; // C3
   export const NOTE_NAMES = ["C", "C#", "D", ...];
   ```

2. `src/constants/game.ts`
   ```typescript
   export const GAME_DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];
   export const GAME_MODES = ['practice', 'performance', 'challenge'];
   export const DEFAULT_DIFFICULTY = 'normal';
   ```

3. `src/constants/audio.ts`
   ```typescript
   export const DEFAULT_VOLUME = 0.8;
   export const DEFAULT_REVERB_DECAY = 1.8;
   export const DEFAULT_SUSTAIN_TIME = 1.2;
   ```

4. `src/constants/ui.ts`
   ```typescript
   export const TRACK_COLORS = [...];
   export const ANIMATION_DURATIONS = {...};
   export const BREAKPOINTS = {...};
   ```

**Impacto:** Reduce App.tsx en ~100 líneas

---

### Fase 2: Creación de Custom Hooks (2-3 horas)
**Objetivo:** Extraer lógica de estado a hooks reutilizables

**Hooks a crear:**

1. **`useAudioEngine.ts`** (~150 líneas)
   ```typescript
   export function useAudioEngine() {
     const [volume, setVolume] = useState(0.8);
     const [reverbDecay, setReverbDecay] = useState(1.8);
     const [sustainTime, setSustainTime] = useState(1.2);
     // ... toda la lógica de audio
     
     return {
       volume,
       setVolume,
       reverbDecay,
       setReverbDecay,
       // ... métodos de audio
     };
   }
   ```

2. **`useGameState.ts`** (~200 líneas)
   ```typescript
   export function useGameState() {
     const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
     const [gameStats, setGameStats] = useState<EnhancedGameStats>(...);
     const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
     // ... toda la lógica de juego
     
     return {
       gameStatus,
       gameStats,
       difficulty,
       startGame,
       pauseGame,
       finishGame,
       // ... métodos de juego
     };
   }
   ```

3. **`useProfile.ts`** (~100 líneas)
   ```typescript
   export function useProfile() {
     const [profile, setProfile] = useState<PlayerProfile>(() => 
       getOrCreateProfile()
     );
     const [showProfilePanel, setShowProfilePanel] = useState(false);
     // ... lógica de perfil
     
     return {
       profile,
       updateProfile,
       showProfilePanel,
       toggleProfilePanel,
       // ... métodos de perfil
     };
   }
   ```

4. **`useKeyboardInput.ts`** (~80 líneas)
   ```typescript
   export function useKeyboardInput(onKeyPress: (key: string) => void) {
     useEffect(() => {
       const handleKeyDown = (e: KeyboardEvent) => {
         // ... lógica de teclado
       };
       
       window.addEventListener('keydown', handleKeyDown);
       return () => window.removeEventListener('keydown', handleKeyDown);
     }, [onKeyPress]);
   }
   ```

5. **`useMIDIInput.ts`** (~100 líneas)
   ```typescript
   export function useMIDIInput(onMIDIMessage: (msg: MIDIMessage) => void) {
     const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
     const [connectedDevices, setConnectedDevices] = useState<MIDIInput[]>([]);
     // ... lógica MIDI
     
     return {
       midiAccess,
       connectedDevices,
       connectMIDI,
       disconnectMIDI,
     };
   }
   ```

6. **`useTransport.ts`** (~120 líneas)
   ```typescript
   export function useTransport() {
     const [isPlaying, setIsPlaying] = useState(false);
     const [currentTime, setCurrentTime] = useState(0);
     const [tempo, setTempo] = useState(120);
     // ... lógica de transport
     
     return {
       isPlaying,
       currentTime,
       tempo,
       play,
       pause,
       stop,
       seek,
       // ... métodos de transport
     };
   }
   ```

**Impacto:** Reduce App.tsx en ~750 líneas

---

### Fase 3: Creación de Servicios (2-3 horas)
**Objetivo:** Separar lógica de negocio en servicios reutilizables

**Servicios a crear:**

1. **`audioService.ts`** (~200 líneas)
   ```typescript
   class AudioService {
     private static instance: AudioService;
     private context: Tone.Context;
     private masterVolume: Tone.Volume;
     private reverb: Tone.Reverb;
     
     static getInstance(): AudioService {
       if (!AudioService.instance) {
         AudioService.instance = new AudioService();
       }
       return AudioService.instance;
     }
     
     async initialize(): Promise<void> { ... }
     setVolume(volume: number): void { ... }
     setReverbDecay(decay: number): void { ... }
     dispose(): void { ... }
   }
   
   export const audioService = AudioService.getInstance();
   ```

2. **`gameService.ts`** (~250 líneas)
   ```typescript
   class GameService {
     startGame(song: SongData, difficulty: GameDifficulty): void { ... }
     pauseGame(): void { ... }
     resumeGame(): void { ... }
     finishGame(): GameResults { ... }
     processHit(note: GameChartNote, timing: number): HitResult { ... }
     processMiss(note: GameChartNote): void { ... }
     calculateScore(): number { ... }
   }
   
   export const gameService = new GameService();
   ```

3. **`midiService.ts`** (~150 líneas)
   ```typescript
   class MIDIService {
     async requestAccess(): Promise<MIDIAccess> { ... }
     connectDevice(device: MIDIInput): void { ... }
     disconnectDevice(device: MIDIInput): void { ... }
     onMessage(callback: (msg: MIDIMessage) => void): void { ... }
   }
   
   export const midiService = new MIDIService();
   ```

4. **`scoreService.ts`** (~180 líneas)
   ```typescript
   class ScoreService {
     async loadScore(file: File): Promise<ScoreDocument> { ... }
     parseScore(xml: string): ScoreDocument { ... }
     analyzeScore(score: ScoreDocument): AnalysisResult { ... }
     convertToSong(score: ScoreDocument): SongData { ... }
   }
   
   export const scoreService = new ScoreService();
   ```

5. **`storageService.ts`** (~100 líneas)
   ```typescript
   class StorageService {
     save<T>(key: string, data: T): void { ... }
     load<T>(key: string): T | null { ... }
     remove(key: string): void { ... }
     clear(): void { ... }
   }
   
   export const storageService = new StorageService();
   ```

6. **`transportService.ts`** (~200 líneas)
   ```typescript
   class TransportService {
     private transport: Tone.Transport;
     
     play(): void { ... }
     pause(): void { ... }
     stop(): void { ... }
     seek(time: number): void { ... }
     schedule(notes: SongNote[]): void { ... }
     clearSchedule(): void { ... }
   }
   
   export const transportService = new TransportService();
   ```

**Impacto:** Reduce App.tsx en ~1,000 líneas

---

### Fase 4: Modularización de Componentes UI (3-4 horas)
**Objetivo:** Extraer JSX inline a componentes dedicados

**Componentes a crear:**

1. **Componentes Comunes** (`components/common/`)
   - `Button.tsx` - Botón reutilizable con variantes
   - `Modal.tsx` - Modal genérico
   - `Slider.tsx` - Slider personalizado
   - `Tabs.tsx` - Sistema de tabs
   - `Toast.tsx` - Notificación toast

2. **Componentes de Juego** (`components/game/`)
   - `GameCanvas.tsx` - Canvas de falling notes (~300 líneas)
   - `GameControls.tsx` - Controles de juego (~150 líneas)
   - `PianoKeyboard.tsx` - Teclado visual (~200 líneas)

3. **Componentes de Gamificación** (`components/gamification/`)
   - `ProfileButton.tsx` - Botón de perfil (~50 líneas)
   - `XPNotification.tsx` - Toast de XP (~80 líneas)
   - `LevelUpModal.tsx` - Modal de level up (~120 líneas)
   - `AchievementToast.tsx` - Toast de logro (~100 líneas)
   - `StarPowerBar.tsx` - Barra de star power (~150 líneas)
   - `StarsDisplay.tsx` - Display de estrellas (~80 líneas)

4. **Componentes de Estudio** (`components/studio/`)
   - `TransportControls.tsx` - Play/Pause/Stop (~100 líneas)
   - `TempoControl.tsx` - Control de tempo (~80 líneas)
   - `VolumeControl.tsx` - Control de volumen (~80 líneas)
   - `EffectsPanel.tsx` - Panel de efectos (~150 líneas)

5. **Componentes de Ajustes** (`components/settings/`)
   - `SettingsPanel.tsx` - Panel principal (~200 líneas)
   - `AudioSettings.tsx` - Ajustes de audio (~150 líneas)
   - `GameSettings.tsx` - Ajustes de juego (~150 líneas)
   - `DisplaySettings.tsx` - Ajustes de display (~100 líneas)

6. **Componentes de Biblioteca** (`components/library/`)
   - `SongsList.tsx` - Lista de canciones (~200 líneas)
   - `SongCard.tsx` - Tarjeta de canción (~100 líneas)
   - `SongFilters.tsx` - Filtros de búsqueda (~120 líneas)

**Impacto:** Reduce App.tsx en ~2,500 líneas

---

### Fase 5: Implementación de Contexts (1-2 horas)
**Objetivo:** Gestión de estado global con React Context

**Contexts a crear:**

1. **`AudioContext.tsx`** (~100 líneas)
   ```typescript
   interface AudioContextValue {
     volume: number;
     setVolume: (v: number) => void;
     reverbDecay: number;
     setReverbDecay: (v: number) => void;
     // ... otros valores de audio
   }
   
   export const AudioContext = createContext<AudioContextValue | null>(null);
   
   export function AudioProvider({ children }: { children: ReactNode }) {
     const audio = useAudioEngine();
     return (
       <AudioContext.Provider value={audio}>
         {children}
       </AudioContext.Provider>
     );
   }
   
   export function useAudio() {
     const context = useContext(AudioContext);
     if (!context) throw new Error('useAudio must be used within AudioProvider');
     return context;
   }
   ```

2. **`GameContext.tsx`** (~120 líneas)
   ```typescript
   interface GameContextValue {
     gameStatus: GameStatus;
     gameStats: EnhancedGameStats;
     difficulty: GameDifficulty;
     startGame: () => void;
     pauseGame: () => void;
     finishGame: () => void;
     // ... otros valores de juego
   }
   
   export const GameContext = createContext<GameContextValue | null>(null);
   export function GameProvider({ children }: { children: ReactNode }) { ... }
   export function useGame() { ... }
   ```

3. **`ProfileContext.tsx`** (~80 líneas)
   ```typescript
   interface ProfileContextValue {
     profile: PlayerProfile;
     updateProfile: (p: PlayerProfile) => void;
     showProfilePanel: boolean;
     toggleProfilePanel: () => void;
   }
   
   export const ProfileContext = createContext<ProfileContextValue | null>(null);
   export function ProfileProvider({ children }: { children: ReactNode }) { ... }
   export function useProfile() { ... }
   ```

4. **`SettingsContext.tsx`** (~100 líneas)
   ```typescript
   interface SettingsContextValue {
     settings: AppSettings;
     updateSettings: (s: Partial<AppSettings>) => void;
     resetSettings: () => void;
   }
   
   export const SettingsContext = createContext<SettingsContextValue | null>(null);
   export function SettingsProvider({ children }: { children: ReactNode }) { ... }
   export function useSettings() { ... }
   ```

**Impacto:** Reduce App.tsx en ~400 líneas, mejora gestión de estado

---

### Fase 6: Refactorización de App.tsx (2-3 horas)
**Objetivo:** Convertir App.tsx en orquestador limpio

**Nuevo App.tsx** (~500 líneas):
```typescript
import { AudioProvider } from './contexts/AudioContext';
import { GameProvider } from './contexts/GameContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { MainLayout } from './components/layouts/MainLayout';

export default function App() {
  return (
    <SettingsProvider>
      <AudioProvider>
        <GameProvider>
          <ProfileProvider>
            <MainLayout />
          </ProfileProvider>
        </GameProvider>
      </AudioProvider>
    </SettingsProvider>
  );
}
```

**MainLayout.tsx** (~300 líneas):
```typescript
export function MainLayout() {
  const [screen, setScreen] = useState<Screen>('studio');
  
  return (
    <div className="app">
      <Header screen={screen} onScreenChange={setScreen} />
      <main className="main-content">
        {screen === 'studio' && <StudioScreen />}
        {screen === 'songs' && <SongsScreen />}
        {screen === 'tracks' && <TracksScreen />}
        {screen === 'midi' && <MIDIScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'score' && <ScoreScreen />}
      </main>
    </div>
  );
}
```

**Impacto:** App.tsx reducido de ~5,853 a ~500 líneas (91% reducción)

---

## 📋 Checklist de Implementación

### Fase 1: Constantes ✅
- [ ] Crear `src/constants/piano.ts`
- [ ] Crear `src/constants/game.ts`
- [ ] Crear `src/constants/audio.ts`
- [ ] Crear `src/constants/ui.ts`
- [ ] Actualizar imports en App.tsx
- [ ] Verificar compilación

### Fase 2: Custom Hooks ✅
- [ ] Crear `src/hooks/useAudioEngine.ts`
- [ ] Crear `src/hooks/useGameState.ts`
- [ ] Crear `src/hooks/useProfile.ts`
- [ ] Crear `src/hooks/useKeyboardInput.ts`
- [ ] Crear `src/hooks/useMIDIInput.ts`
- [ ] Crear `src/hooks/useTransport.ts`
- [ ] Crear `src/hooks/useSongLibrary.ts`
- [ ] Crear `src/hooks/useSettings.ts`
- [ ] Integrar hooks en App.tsx
- [ ] Verificar funcionalidad

### Fase 3: Servicios ✅
- [ ] Crear `src/services/audioService.ts`
- [ ] Crear `src/services/gameService.ts`
- [ ] Crear `src/services/midiService.ts`
- [ ] Crear `src/services/scoreService.ts`
- [ ] Crear `src/services/storageService.ts`
- [ ] Crear `src/services/transportService.ts`
- [ ] Integrar servicios en hooks
- [ ] Verificar funcionalidad

### Fase 4: Componentes UI ✅
- [ ] Crear componentes comunes (5 componentes)
- [ ] Crear componentes de juego (3 componentes)
- [ ] Crear componentes de gamificación (6 componentes)
- [ ] Crear componentes de estudio (4 componentes)
- [ ] Crear componentes de ajustes (4 componentes)
- [ ] Crear componentes de biblioteca (3 componentes)
- [ ] Integrar componentes en screens
- [ ] Verificar UI

### Fase 5: Contexts ✅
- [ ] Crear `src/contexts/AudioContext.tsx`
- [ ] Crear `src/contexts/GameContext.tsx`
- [ ] Crear `src/contexts/ProfileContext.tsx`
- [ ] Crear `src/contexts/SettingsContext.tsx`
- [ ] Integrar contexts en App.tsx
- [ ] Actualizar componentes para usar contexts
- [ ] Verificar flujo de datos

### Fase 6: Refactorización Final ✅
- [ ] Crear `src/components/layouts/MainLayout.tsx`
- [ ] Crear screens individuales (6 screens)
- [ ] Refactorizar App.tsx a orquestador
- [ ] Eliminar código duplicado
- [ ] Optimizar imports
- [ ] Verificar funcionalidad completa
- [ ] Testing manual exhaustivo

---

## 🧪 Testing y Validación

### Testing Manual
1. **Funcionalidad Core**
   - [ ] Importar archivo MIDI/MusicXML
   - [ ] Reproducir canción
   - [ ] Pausar/Reanudar
   - [ ] Cambiar tempo
   - [ ] Ajustar volumen
   - [ ] Cambiar dificultad

2. **Modo Juego**
   - [ ] Iniciar juego
   - [ ] Detectar hits/misses
   - [ ] Calcular score
   - [ ] Mostrar resultados
   - [ ] Ganar XP
   - [ ] Desbloquear logros

3. **Gamificación**
   - [ ] Ver perfil
   - [ ] Editar username
   - [ ] Ver logros
   - [ ] Ver ratings de canciones
   - [ ] Verificar persistencia

4. **MIDI Input**
   - [ ] Conectar dispositivo MIDI
   - [ ] Detectar notas
   - [ ] Desconectar dispositivo

5. **Ajustes**
   - [ ] Cambiar ajustes de audio
   - [ ] Cambiar ajustes de juego
   - [ ] Guardar ajustes
   - [ ] Resetear ajustes

### Testing Automatizado (Futuro)
```typescript
// Ejemplo de test unitario
describe('gameService', () => {
  it('should calculate score correctly', () => {
    const result = gameService.calculateScore(mockGameStats);
    expect(result).toBe(45000);
  });
  
  it('should process hit correctly', () => {
    const hit = gameService.processHit(mockNote, 15);
    expect(hit.grade).toBe('perfect');
  });
});
```

---

## 📈 Métricas de Éxito

### Antes de Refactorización
- **App.tsx:** ~5,853 líneas
- **Archivos totales:** ~25
- **Complejidad ciclomática:** Alta
- **Testabilidad:** Baja
- **Mantenibilidad:** Baja

### Después de Refactorización
- **App.tsx:** ~500 líneas (91% reducción)
- **Archivos totales:** ~80 (mejor organización)
- **Complejidad ciclomática:** Baja (funciones pequeñas)
- **Testabilidad:** Alta (unit tests posibles)
- **Mantenibilidad:** Alta (separación de concerns)

### KPIs
- ✅ Reducción de líneas en App.tsx: >90%
- ✅ Número de archivos: <100
- ✅ Líneas por archivo: <300 (promedio)
- ✅ Funciones por archivo: <20
- ✅ Profundidad de anidación: <4 niveles
- ✅ Imports por archivo: <15

---

## 🚀 Beneficios Esperados

### Para Desarrollo Manual
1. **Navegación más fácil** - Archivos pequeños y enfocados
2. **Debugging simplificado** - Lógica aislada
3. **Menos conflictos Git** - Cambios en archivos separados
4. **Onboarding rápido** - Estructura clara
5. **Reutilización de código** - Componentes y hooks compartidos

### Para Desarrollo con IA
1. **Contexto más claro** - Archivos específicos
2. **Menos tokens** - No necesita leer todo App.tsx
3. **Cambios precisos** - Modificar solo lo necesario
4. **Mejor comprensión** - Estructura lógica
5. **Sugerencias relevantes** - Basadas en contexto específico

### Para Escalabilidad
1. **Fácil agregar features** - Crear nuevos módulos
2. **Fácil modificar features** - Cambios aislados
3. **Fácil eliminar features** - Remover módulos completos
4. **Testing incremental** - Testear módulos individuales
5. **Optimización selectiva** - Optimizar partes específicas

---

## ⚠️ Riesgos y Mitigaciones

### Riesgo 1: Romper funcionalidad existente
**Mitigación:**
- Refactorizar fase por fase
- Testing manual después de cada fase
- Mantener backup del código original
- Usar Git branches para cada fase

### Riesgo 2: Introducir bugs nuevos
**Mitigación:**
- Code review cuidadoso
- Testing exhaustivo
- Mantener tipos TypeScript estrictos
- Usar linter y formatter

### Riesgo 3: Tiempo de desarrollo extendido
**Mitigación:**
- Plan detallado con estimaciones
- Priorizar fases críticas
- Permitir iteraciones
- Documentar decisiones

### Riesgo 4: Complejidad de gestión de estado
**Mitigación:**
- Usar React Context apropiadamente
- Evitar prop drilling
- Documentar flujo de datos
- Mantener estado local cuando sea posible

---

## 📚 Recursos y Referencias

### Patrones de Diseño
- **Service Layer Pattern** - Lógica de negocio en servicios
- **Custom Hooks Pattern** - Lógica reutilizable en hooks
- **Context Pattern** - Estado global con React Context
- **Component Composition** - Componentes pequeños y componibles

### Best Practices
- **SOLID Principles** - Diseño orientado a objetos
- **DRY (Don't Repeat Yourself)** - Evitar duplicación
- **KISS (Keep It Simple, Stupid)** - Mantener simplicidad
- **YAGNI (You Aren't Gonna Need It)** - No sobre-ingeniería

### Herramientas
- **TypeScript** - Type safety
- **ESLint** - Linting
- **Prettier** - Formatting
- **Vite** - Build tool

---

## 🎯 Conclusión

Esta refactorización transformará Piano MIDI Pro de un monolito difícil de mantener a una aplicación modular, escalable y fácil de trabajar. El plan está diseñado para ser ejecutado en fases incrementales, minimizando riesgos y permitiendo validación continua.

**Tiempo estimado total:** 12-18 horas  
**Beneficio esperado:** 10x mejora en mantenibilidad  
**ROI:** Alto - Inversión única con beneficios a largo plazo

---

**Próximo paso:** Comenzar con Fase 1 (Extracción de Constantes)
