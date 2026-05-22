# Design - Refactor & Improve Piano MIDI Pro

## Overview

Refactor incremental con subagentes paralelos. La estrategia es:
1. **Fase A (paralela, sin tocar App.tsx):** crear archivos nuevos en `hooks/`, `services/`, `contexts/`, `components/<dominio>/`, `game/<modulos>` + higiene de repo.
2. **Fase B (secuencial):** integrar en App.tsx reemplazando bloques de estado por hooks/contextos hasta llevarlo a ≤ 800 líneas.
3. **Fase C (verificación):** build + lint + commit.

## Architecture

```
app/src/
├─ App.tsx                       (orquestador, ≤ 800 líneas)
├─ main.tsx
│
├─ contexts/                     (NUEVO)
│  ├─ AudioContext.tsx
│  ├─ GameContext.tsx
│  ├─ ProfileContext.tsx
│  ├─ SettingsContext.tsx
│  └─ index.ts
│
├─ hooks/                        (NUEVO)
│  ├─ useAudioEngine.ts          (Tone.Sampler, effects, master)
│  ├─ useGameState.ts            (chart, stats, status)
│  ├─ useProfile.ts              (XP, achievements, level)
│  ├─ useTransport.ts            (play/pause/seek)
│  ├─ useMidiInput.ts            (devices, velocity, pitch bend)
│  ├─ useScoreReader.ts          (parse, analyze, parts)
│  ├─ useKeyboardRange.ts        (rangeStart, snapToC, shifts)
│  └─ index.ts
│
├─ services/                     (NUEVO)
│  ├─ audioService.ts
│  ├─ gameService.ts             (delega a game/*)
│  ├─ profileService.ts          (delega a utils/profile)
│  ├─ scoreService.ts            (delega a parsers/, analysis/)
│  ├─ transportService.ts
│  ├─ storageService.ts
│  └─ index.ts
│
├─ components/
│  ├─ common/                    (NUEVO)
│  │  ├─ Button.tsx
│  │  ├─ Modal.tsx
│  │  ├─ Slider.tsx
│  │  ├─ Toast.tsx
│  │  ├─ Tabs.tsx
│  │  ├─ IconButton.tsx
│  │  └─ index.ts
│  ├─ game/                      (mover GameHUD, GameResultsModal)
│  ├─ gamification/              (mover ProfilePanel, NeonRunnerAvatar)
│  ├─ score/                     (mover ScoreViewer, PartMixer, ScoreInfoBar, ImportPanel)
│  ├─ studio/                    (KeyFxPanel, InstrumentControls)
│  └─ layout/
│     └─ AppShell.tsx
│
├─ game/
│  ├─ engine.ts                  (mantener barrel para no romper imports)
│  ├─ timing.ts                  (NUEVO)
│  ├─ scoring.ts                 (NUEVO)
│  ├─ chart.ts                   (NUEVO)
│  ├─ difficulty.ts              (NUEVO)
│  ├─ starPower.ts               (NUEVO)
│  └─ index.ts
│
├─ constants/                    (ya existe — solo asegurar barrel)
├─ analysis/  parsers/  engine/  types/  utils/   (sin cambios)
```

## Components and Interfaces

### Hooks

```typescript
// hooks/useAudioEngine.ts
export interface AudioEngineState {
  isAudioReady: boolean;
  isSamplerActive: boolean;
  isAudioLoading: boolean;
  audioStatusMessage: string;
}

export interface AudioEngineRefs {
  samplerRef: React.MutableRefObject<Tone.Sampler | null>;
  fallbackSynthsRef: React.MutableRefObject<Record<number, Tone.PolySynth> | null>;
  reverbRef: React.MutableRefObject<Tone.Reverb | null>;
  chorusRef: React.MutableRefObject<Tone.Chorus | null>;
  volNodeRef: React.MutableRefObject<Tone.Volume | null>;
  compressorRef: React.MutableRefObject<Tone.Compressor | null>;
  metronomeRef: React.MutableRefObject<Tone.MetalSynth | null>;
}

export function useAudioEngine(opts: {
  reverbDecay: number;
  chorusDepth: number;
  masterVolume: number;
  latencyMode: "ultra" | "balanced";
  sustainTime: number;
}): AudioEngineState & AudioEngineRefs & {
  initAudio: () => Promise<void>;
  disposeAudio: () => void;
};
```

```typescript
// hooks/useGameState.ts
export function useGameState(opts: {
  song: SongData;
  rangeStart: number;
  difficulty: GameDifficulty;
  mode: GameMode;
}) {
  // returns chart, stats, status, countdown, handlers
}
```

```typescript
// hooks/useMidiInput.ts
export function useMidiInput(opts: {
  selectedInputId: string;
  velocityCurve: VelocityCurve;
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onPitchBend: (value: number) => void;
  onSustain: (down: boolean) => void;
}) {
  // returns devices, permission, lastVelocity, calibrating
}
```

### Services

```typescript
// services/storageService.ts
export const storage = {
  get<T>(key: string, defaultValue: T): T,
  set<T>(key: string, value: T): void,
  remove(key: string): void,
};
```

```typescript
// services/audioService.ts
export const audioService = {
  init(opts): Promise<AudioEngineHandles>,
  playNote(handles, midi, velocity, instrument): void,
  stopNote(handles, midi): void,
  setMasterVolume(handles, db: number): void,
  // ...
};
```

### Game Modules

```typescript
// game/timing.ts
export type TimingWindows = { perfectPlus: number; perfect: number; great: number; good: number };
export const TIMING_WINDOWS_BY_DIFFICULTY: Record<GameDifficulty, TimingWindows>;
export function getTimingWindows(d: GameDifficulty): TimingWindows;
export function classifyHit(deltaMs: number, windows: TimingWindows): HitGrade | null;
```

```typescript
// game/scoring.ts
export const COMBO_TIERS: ComboMultiplier[];
export function getComboMultiplier(combo: number): number;
export function applyEnhancedGameHit(stats, grade, deltaMs, opts): EnhancedGameStats;
export function applyEnhancedGameMiss(stats, opts): EnhancedGameStats;
export function calculateMaxScore(noteCount: number, difficulty: GameDifficulty): number;
```

```typescript
// game/chart.ts
export function buildGameChart(song: SongData, opts): GameChartNote[];
export function computeAutoShiftTarget(notes: GameChartNote[], cursor: number, currentRange: number): number;
```

## Data Models

Sin cambios en los modelos existentes (`SongData`, `ScoreDocument`, `EnhancedGameStats`, `PlayerProfile`). Solo se reorganiza dónde viven y cómo se accede.

## Error Handling

- Cada hook captura errores en sus efectos y los expone en el estado (`error: string | null`).
- `services/storageService` maneja `QuotaExceededError` con un fallback a in-memory map.
- `audioService.init` falla suave: si Salamander no carga, fallback synths siempre disponibles.

## Testing Strategy

- Verificación manual end-to-end después de cada fase: cargar canción demo, reproducir, conectar MIDI, jugar.
- `npm run build` + `npm run lint` después de cada fase.
- No se introducen tests automatizados en este refactor (queda para una fase posterior).

## Plan de Subagentes (paralelización)

| Subagente | Tarea | Alcance | Conflicto con otros |
|---|---|---|---|
| **AGENT-1** | Modularizar `game/engine.ts` | Crea `timing.ts`, `scoring.ts`, `chart.ts`, `difficulty.ts`, `starPower.ts`, mantiene `engine.ts` como barrel | Ninguno |
| **AGENT-2** | Crear hooks (sin tocar App.tsx) | `useAudioEngine`, `useTransport`, `useKeyboardRange`, `useMidiInput`, `useGameState`, `useProfile`, `useScoreReader` | Ninguno |
| **AGENT-3** | Crear services + storage | `audioService`, `gameService`, `profileService`, `scoreService`, `transportService`, `storageService` | Ninguno |
| **AGENT-4** | Crear componentes comunes + reorganizar carpetas | `common/Button`, `common/Modal`, `common/Slider`, `common/Toast`, `common/Tabs`, `common/IconButton` + mover existentes a subcarpetas con `smartRelocate` | Modifica imports en App.tsx → debe ejecutarse antes que AGENT-INTEGRATE |
| **AGENT-5** | Crear contexts | `AudioContext`, `GameContext`, `ProfileContext`, `SettingsContext` | Ninguno |
| **AGENT-6** | Higiene de repo | `.gitignore`, mover demos a `app/public/demo/`, eliminar binarios pesados de raíz, primer commit | Ninguno |
| **AGENT-INTEGRATE** | Integrar en App.tsx | Reemplazar bloques de estado por hooks/contexts, reducir a ≤ 800 líneas | Secuencial, después de A1-A6 |

## Decisions

1. **Mantener `game/engine.ts` como barrel** — evita romper imports existentes mientras se hace la migración.
2. **`smartRelocate` para mover componentes** — actualiza imports automáticamente.
3. **Hooks expuestos vía contexts** — los contexts envuelven los hooks para que App.tsx solo necesite providers.
4. **No introducir Zustand/Redux** — el plan actual usa contexts + hooks, suficiente para el alcance.
5. **No tocar `analysis/`, `parsers/`, `engine/` (Tone.js)** — ya están modularizados.
6. **No introducir tests automatizados** — fuera del alcance de este refactor.
