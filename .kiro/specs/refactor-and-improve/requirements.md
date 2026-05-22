# Requirements - Refactor & Improve Piano MIDI Pro

## Introducción

Refactorización completa de Piano MIDI Pro para reducir App.tsx (~5,773 líneas) a un orquestador delgado, modularizar el motor de juego, organizar componentes UI y dejar el repositorio listo para escalar (gamificación + personajes interactivos). El trabajo se ejecuta en paralelo con subagentes especializados.

## Requirements

### Requirement 1 — Custom Hooks Layer

**User Story:** Como desarrollador, quiero la lógica de estado encapsulada en custom hooks reutilizables para que App.tsx solo orqueste y los hooks puedan testearse aisladamente.

#### Acceptance Criteria
1. WHEN se ejecuta `npm run build` THEN el proyecto compila sin errores TypeScript con los nuevos hooks integrados.
2. WHEN se invoca `useAudioEngine()` THEN devuelve sampler/synth/effects/state listos para usar.
3. WHEN se invoca `useGameState()` THEN devuelve el chart, stats, status, countdown y handlers (start/pause/stop/finish).
4. WHEN se invoca `useProfile()` THEN devuelve perfil, XP, achievements y handlers (addXP, levelUp, unlock).
5. WHEN se invoca `useTransport()` THEN devuelve play/pause/stop/seek/currentTime/playbackRate.
6. WHEN se invoca `useMidiInput()` THEN devuelve devices/permission/lastVelocity/pitchBend y subscribe handlers.
7. WHEN se invoca `useScoreReader()` THEN devuelve scoreDocument/parts/import/loading/error.
8. WHERE App.tsx use estos hooks SHALL eliminar el estado duplicado correspondiente.

### Requirement 2 — Services Layer

**User Story:** Como desarrollador, quiero servicios sin dependencia de React para que la lógica de negocio sea reutilizable y testeable.

#### Acceptance Criteria
1. WHEN se importa `audioService` THEN expone init/dispose/playNote/stopNote/setMasterVolume/setReverb/setChorus.
2. WHEN se importa `gameService` THEN expone buildChart/classifyHit/computeAutoShift/applyHit/applyMiss.
3. WHEN se importa `profileService` THEN expone get/save/addXP/unlockAchievement/calculateXPReward.
4. WHEN se importa `scoreService` THEN expone parseMusicXML/parseMIDI/scoreToParts/analyze.
5. WHEN se importa `transportService` THEN expone schedule/cancel/seek y trabaja con Tone.Transport.
6. WHEN se importa `storageService` THEN abstrae localStorage con get/set/remove tipados.

### Requirement 3 — Game Engine Modularization

**User Story:** Como desarrollador, quiero el motor de juego dividido en módulos pequeños para aislar timing, scoring, chart y dificultad.

#### Acceptance Criteria
1. WHEN se importa `game/timing.ts` THEN expone `getTimingWindows`, `classifyHit`, `TIMING_WINDOWS_BY_DIFFICULTY`.
2. WHEN se importa `game/scoring.ts` THEN expone `applyEnhancedGameHit`, `applyEnhancedGameMiss`, `calculateMaxScore`, `getComboMultiplier`.
3. WHEN se importa `game/chart.ts` THEN expone `buildGameChart`, `computeAutoShiftTarget`, `RhythmSourceNote`.
4. WHEN se importa `game/difficulty.ts` THEN expone `GameDifficulty`, `GameMode`, `GameStatus` y helpers de dificultad.
5. WHEN se importa `game/starPower.ts` THEN expone `activateStarPower`, `updateStarPower`.
6. WHEN se importa `game/index.ts` (barrel) THEN re-exporta todo manteniendo compatibilidad con `./game/engine` original.

### Requirement 4 — Component Folder Structure

**User Story:** Como desarrollador, quiero los componentes agrupados por dominio para localizarlos rápido.

#### Acceptance Criteria
1. WHEN se inspecciona `components/` THEN existen subcarpetas: `common/`, `game/`, `gamification/`, `score/`, `studio/`, `settings/`, `library/`, `layout/`.
2. WHEN se mueve un componente THEN sus imports en App.tsx y otros archivos se actualizan automáticamente.
3. WHEN se importa un componente común THEN existe `Button`, `Modal`, `Slider`, `Toast`, `Tabs`, `IconButton` con tipado y accesibilidad.

### Requirement 5 — Contexts Layer

**User Story:** Como desarrollador, quiero contextos React para evitar prop drilling y compartir estado global.

#### Acceptance Criteria
1. WHEN se monta `<AudioProvider>` THEN children acceden vía `useAudio()`.
2. WHEN se monta `<GameProvider>` THEN children acceden vía `useGame()`.
3. WHEN se monta `<ProfileProvider>` THEN children acceden vía `useProfile()`.
4. WHEN se monta `<SettingsProvider>` THEN children acceden vía `useSettings()`.
5. WHERE el componente raíz envuelve los providers SHALL exponerlos en el orden correcto.

### Requirement 6 — App.tsx Slim Orchestrator

**User Story:** Como desarrollador, quiero App.tsx ≤ 800 líneas que solo orqueste hooks/contextos/screens.

#### Acceptance Criteria
1. WHEN se cuentan líneas en App.tsx THEN es ≤ 800.
2. WHEN se ejecuta `npm run build` THEN compila sin errores.
3. WHEN se ejecuta la app THEN funciona idénticamente a la versión pre-refactor (game, score, audio, MIDI).
4. WHEN se carga una canción demo THEN suena con el sampler Salamander y se ven falling notes.
5. WHEN se conecta un controlador MIDI físico THEN responde a notas, velocity, pitch bend, sustain.

### Requirement 7 — Repo Hygiene

**User Story:** Como desarrollador, quiero el repo limpio con primer commit y archivos sueltos organizados.

#### Acceptance Criteria
1. WHEN se ejecuta `git log` THEN existe al menos un commit inicial.
2. WHEN se inspecciona `.gitignore` THEN ignora `*.exe`, `*.png` (sueltos en raíz), `*.mid`, `*.riv`, `*.log`, `dist/`, `node_modules/`, `.playwright-mcp/`, `screenshots/`.
3. WHEN se inspecciona la raíz THEN binarios pesados (`*.exe` >50MB) están eliminados o ignorados.
4. WHEN se inspecciona `app/public/demo/` THEN contiene los `.mid` de demo (movidos desde la raíz si aplica).

### Requirement 8 — Build & Quality Gates

**User Story:** Como desarrollador, quiero que cada cambio pase build + lint para garantizar estabilidad.

#### Acceptance Criteria
1. WHEN se ejecuta `npm run build` desde `app/` THEN finaliza sin errores.
2. WHEN se ejecuta `npm run lint` desde `app/` THEN no produce errores nuevos.
3. WHEN se ejecutan los hooks pre-existentes en `.github/hooks/rtk-rewrite.json` THEN no bloquean el flujo.
