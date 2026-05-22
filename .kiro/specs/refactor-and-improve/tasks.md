# Tasks - Refactor & Improve Piano MIDI Pro

- [ ] 1. Modularize game engine (AGENT-1)
  - Split `game/engine.ts` into `timing.ts`, `scoring.ts`, `chart.ts`, `difficulty.ts`, `starPower.ts`
  - Keep `game/engine.ts` as a barrel re-exporting everything for back-compat
  - Add `game/index.ts` barrel
  - Verify TypeScript compiles
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 2. Create custom hooks layer (AGENT-2)
- [ ] 2.1 useAudioEngine hook
  - Encapsulate Tone.Sampler init, effects (reverb/chorus/compressor), master volume, metronome
  - Export refs and state
  - _Requirements: 1.2_

- [ ] 2.2 useTransport hook
  - Encapsulate Tone.Transport play/pause/stop/seek
  - Track currentTime + playbackRate
  - _Requirements: 1.5_

- [ ] 2.3 useKeyboardRange hook
  - rangeStart with `snapToC`, shift handlers, persistence
  - _Requirements: 1.1_

- [ ] 2.4 useMidiInput hook
  - WebMIDI access, device list, message handling, velocity curves, pitch bend, sustain
  - _Requirements: 1.6_

- [ ] 2.5 useGameState hook
  - Chart building, stats, status, countdown, hit/miss handlers, auto-shift
  - _Requirements: 1.3_

- [ ] 2.6 useProfile hook
  - Profile load/save, XP, level-up, achievements
  - _Requirements: 1.4_

- [ ] 2.7 useScoreReader hook
  - MusicXML/MIDI import, analysis, parts mixer state
  - _Requirements: 1.7_

- [ ] 3. Create services layer (AGENT-3)
- [ ] 3.1 storageService
  - Tipado, manejo de QuotaExceeded, fallback in-memory
  - _Requirements: 2.6_

- [ ] 3.2 audioService
  - init/dispose/playNote/stopNote/setMasterVolume/setReverb/setChorus
  - _Requirements: 2.1_

- [ ] 3.3 gameService
  - Re-exporta de `game/*` con interfaz unificada
  - _Requirements: 2.2_

- [ ] 3.4 profileService
  - Wrapper sobre `utils/profile.ts` y `utils/achievements.ts`
  - _Requirements: 2.3_

- [ ] 3.5 scoreService
  - Wrapper sobre `parsers/MusicXMLParser.ts` y `analysis/MusicAnalyzer.ts`
  - _Requirements: 2.4_

- [ ] 3.6 transportService
  - Wrapper sobre Tone.Transport
  - _Requirements: 2.5_

- [ ] 4. Create base components + reorganize folders (AGENT-4)
- [ ] 4.1 common/Button, Modal, Slider, Toast, Tabs, IconButton
  - Tipados, accesibles, reutilizables
  - _Requirements: 4.3_

- [ ] 4.2 Move existing components into subfolders
  - GameHUD, GameResultsModal → game/
  - ProfilePanel, NeonRunnerAvatar, PianoPet, PianoPetRive → gamification/
  - ScoreViewer, ScoreInfoBar, PartMixer, ImportPanel → score/
  - InstrumentControls, KeyFxPanel → studio/
  - Use `smartRelocate` to update all imports
  - _Requirements: 4.1, 4.2_

- [ ] 5. Create contexts layer (AGENT-5)
  - AudioContext, GameContext, ProfileContext, SettingsContext
  - Cada uno envuelve su hook correspondiente
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Repo hygiene (AGENT-6)
- [ ] 6.1 Update .gitignore
  - Ignorar *.exe, *.riv, *.log sueltos en raíz, screenshots/, .playwright-mcp/, *.png en raíz, *.js de fix en raíz
  - _Requirements: 7.2_

- [ ] 6.2 Move demo MIDIs
  - Mover `.mid` de raíz a `app/public/demo/` si no están ya allí
  - _Requirements: 7.4_

- [ ] 6.3 Delete heavy binaries from working tree
  - `Trae-Setup-x64.exe`, `TRAE_SOLO-Setup-x64.exe`, `Verdent-2.2.2-Windows-x64.exe`
  - _Requirements: 7.3_

- [ ] 6.4 First commit
  - `git add -A && git commit -m "chore: initial commit"` (después del refactor completo)
  - _Requirements: 7.1_

- [ ] 7. Integrate everything in App.tsx (AGENT-INTEGRATE)
  - Reemplazar bloques de estado/refs/efectos por hooks
  - Envolver App con providers de contexts
  - Reducir App.tsx a ≤ 800 líneas
  - Mantener funcionalidad idéntica
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Verification & quality gates
  - `npm run build` desde `app/` sin errores
  - `npm run lint` desde `app/` sin errores nuevos
  - Smoke test manual: cargar demo, reproducir, conectar MIDI
  - _Requirements: 8.1, 8.2, 8.3_
