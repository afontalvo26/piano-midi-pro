# Design — Refactor & Improve Piano MIDI Pro

> **Estado:** arquitectura implementada y verificada (May 22, 2026). Este documento describe el estado actual del código.

## Overview

Refactorización incremental de Piano MIDI Pro completada en 4 commits + 2 commits de afinado:

1. **Fase A (paralela):** crear archivos nuevos en `hooks/`, `services/`, `contexts/`, `components/<dominio>/`, `game/<modulos>` + higiene de repo.
2. **Fase B (visible):** integrar providers en `main.tsx`, extraer constantes/helpers/utilidades de App.tsx, code splitting Vite.
3. **Fase C (audit):** Playwright MCP audit, lazy loading OSMD, yield to main thread, a11y completa.

App.tsx queda como orquestador grande (5168 líneas) — la fase final de reducir a ≤ 800 líneas requiere reescribir el canvas loop y el scheduling de Tone.Transport, ambos profundamente acoplados a refs internos. Se aplazó como tarea futura para no introducir regresiones.

## Architecture (estado real)

```
app/src/
├─ App.tsx                         5168 líneas — orquestador con state local + refs
├─ main.tsx                        Providers montados (Settings → Audio → Profile → Score)
│
├─ contexts/                       ✅ creados, en uso vía main.tsx (consumo opcional)
│  ├─ AudioContext.tsx             wraps useAudioEngine + persistencia de masterVolume/reverb/chorus/sustain/latency
│  ├─ ProfileContext.tsx           wraps useProfile
│  ├─ ScoreContext.tsx             wraps useScoreReader
│  ├─ SettingsContext.tsx          UI/playback settings persistidos
│  └─ index.ts
│
├─ hooks/                          ✅ creados como capa pública
│  ├─ useAudioEngine.ts            Tone graph completo + lifecycle
│  ├─ useTransport.ts              play/pause/seek + rAF loop
│  ├─ useKeyboardRange.ts          rangeStart con snapToC + persistencia
│  ├─ useMidiInput.ts              WebMIDI + device routing + velocity curves
│  ├─ useProfile.ts                XP, achievements, level-up
│  ├─ useScoreReader.ts            MusicXML import + análisis + parts
│  └─ index.ts
│
├─ services/                       ✅ sin React
│  ├─ storageService.ts            localStorage + fallback in-memory
│  ├─ audioService.ts              salamanderSamples + setMasterVolume/reverb/chorus
│  ├─ gameService.ts               re-export de game/
│  ├─ profileService.ts            re-export de utils/profile + utils/achievements
│  ├─ scoreService.ts              re-export de parsers + analysis
│  ├─ transportService.ts          wrapper de Tone.Transport
│  └─ index.ts
│
├─ components/
│  ├─ common/                      ✅ 8 componentes accesibles auto-contenidos
│  │  ├─ Button, Modal, Slider, Toast, Tabs, IconButton, Spinner
│  │  ├─ Icons.tsx                 SVG inline reutilizables (extraídos de App.tsx)
│  │  └─ index.ts
│  ├─ game/                        ✅ GameHUD, GameResultsModal
│  ├─ gamification/                ✅ ProfilePanel, NeonRunnerAvatar, PianoPet, PianoPetRive
│  ├─ score/                       ✅ ScoreViewer (lazy), ScoreInfoBar, PartMixer, ImportPanel, scoreCache
│  └─ studio/                      ✅ InstrumentControls, KeyFxPanel
│
├─ game/                           ✅ modular
│  ├─ engine.ts                    barrel de compatibilidad → re-exporta de index.ts
│  ├─ index.ts                     barrel principal
│  ├─ types.ts                     GameMode, GameDifficulty, GameStatus, HitGrade, etc.
│  ├─ timing.ts                    getTimingWindows, classifyHit
│  ├─ chart.ts                     buildGameChart, computeAutoShiftTarget
│  ├─ scoring.ts                   applyHit, applyMiss, calculateMaxScore, getComboMultiplier
│  ├─ starPower.ts                 init/add/activate/update star power
│  └─ renderer.ts                  computeKeyPositions (extraído de App.tsx)
│
├─ utils/
│  ├─ audioMidiUtils.ts            ✅ NUEVO: hexToRgba, lightenHex, midiToLabel, isBlackKey, clamp
│  ├─ instrumentMapping.ts         ✅ NUEVO: getInstrumentSynthSettings, gmProgramToInstrument
│  ├─ midiFileParser.ts            ✅ NUEVO: parseMidiFile (puro, sin side effects React)
│  ├─ profile.ts                   pre-existente
│  ├─ achievements.ts              pre-existente
│  ├─ songRatings.ts               pre-existente
│  └─ settings.ts                  useLocalStorageState
│
├─ constants/
│  ├─ piano.ts                     PIANO_MIN/MAX_MIDI, RANGE_KEY_COUNT, INSTRUMENT_FAMILIES
│  ├─ ui.ts                        TRACK_COLORS, hexToRgba, lightenHex, clamp
│  ├─ audio.ts
│  ├─ game.ts
│  ├─ demoSongs.ts                 ✅ NUEVO: catálogo de demos extraído de App.tsx
│  └─ index.ts
│
├─ types/
│  ├─ song.ts                      ✅ NUEVO: SongNote, SongTrack, SongData
│  ├─ score.ts                     ScoreDocument + tipos MusicXML completos
│  └─ gamification.ts              PlayerProfile, Achievement, etc.
│
├─ analysis/  parsers/  engine/    sin cambios (ya estaban modulares)
│
└─ vite.config.ts                  ✅ MEJORADO: code splitting manual de vendors
```

## Build & Bundle

```
dist/index.html                                  1.49 kB
dist/assets/index-*.js                         222 kB     (app code)
dist/assets/vendor-*.js                        431 kB     (deps misc)
dist/assets/vendor-tone-*.js                   156 kB     (Tone.js)
dist/assets/vendor-rive-*.js                   140 kB     (Rive)
dist/assets/vendor-zip-*.js                     96 kB
dist/assets/vendor-gsap-*.js                    70 kB
dist/assets/vendor-tonal-*.js                   25 kB
dist/assets/vendor-midi-*.js                    21 kB     (@tonejs/midi)
dist/assets/ScoreViewer-*.js                     5 kB     ← lazy
dist/assets/vendor-osmd-*.js                  1205 kB     ← lazy (solo se descarga en pantalla score)
```

## Deuda técnica conocida

1. **App.tsx aún en 5168 líneas** — la reducción a ≤ 800 requiere reescribir:
   - `scheduleSongOnTransport` (~170 líneas) — fuertemente acoplado a `engineRegistryRef`, `samplerRef`, `gmDestRef`, `triggerAttack/Release`, `scoreDocument`.
   - El `useEffect` del canvas visualizer (~400 líneas) — ciclo rAF que lee 30+ valores de `stateRef`.
   - `handleMidiMessage` (~134 líneas) — depende de `triggerAttack/Release`, `registerGameHit`, `initializeAudio`.
   - Estos bloques están listos para extraer a hooks especializados (`useScoreScheduler`, `useCanvasVisualizer`, `useMidiHandler`) cuando convenga.

2. **`useGameState` no se creó** — la lógica de juego usa refs profundos (`gameChartRef`, `gameStatsRef`, `prevGameTimeRef`, `updateGameRuntimeRef`, `finishGameRoundRef`) que requiere un diseño cuidadoso para no perder rendimiento.

3. **Contexts disponibles pero no consumidos** — los providers están montados en `main.tsx` pero App.tsx sigue declarando sus propios `useState`/`useLocalStorageState` para los mismos valores. Migrar a contexts es trivial pero hay que validar uno por uno que no se rompa el flujo.

4. **Canvas siempre activo** — el rAF loop corre incluso sin canción cargada. Pendiente: pausar cuando `song.notes.length === 0` y la pestaña está en background.

## Decisiones tomadas

1. **Mantener `engine.ts` como barrel** — evita romper imports `from "./game/engine"` existentes mientras se completa la migración.
2. **`smartRelocate` para mover componentes** — actualiza imports automáticamente.
3. **Hooks expuestos vía contexts** — permite consumo opcional sin obligar refactor masivo de App.tsx.
4. **No introducir Zustand/Redux** — contexts + hooks alcanzan para el alcance.
5. **Lazy load solo OSMD** — los demás vendors son necesarios desde el primer render. OSMD justifica lazy porque pesa 1.2 MB y solo se usa en una pantalla.
6. **`scheduler.yield` con fallback** — yield to main funciona en Chrome 129+ y degrada bien.
