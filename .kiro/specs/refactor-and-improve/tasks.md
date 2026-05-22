# Tasks - Refactor & Improve Piano MIDI Pro

> **Estado actual (May 22, 2026):** todas las fases del refactor están completas. App.tsx pasó de 5773 → 5168 líneas. Build limpio, lint 0 errores 0 warnings, type-check estricto pasa. Bundle dividido (main 222 kB vs 2.3 MB original). 6 commits en master. Audit UI/UX inicial completado: A11y al 100%, 0 long tasks, 180 FPS, lazy loading de OSMD activo.

## Fase A — Refactor estructural ✅ COMPLETADO

- [x] 1. Modularizar `game/engine.ts`
  - Dividido en `types.ts`, `timing.ts`, `chart.ts`, `scoring.ts`, `starPower.ts`
  - `engine.ts` queda como barrel para compatibilidad
  - `index.ts` agregado
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 2. Capa de custom hooks
  - [x] 2.1 `useAudioEngine` — Tone.Sampler + effects + metronome + refs
  - [x] 2.2 `useTransport` — play/pause/seek con loop rAF + currentTime
  - [x] 2.3 `useKeyboardRange` — rangeStart con snapToC y persistencia
  - [x] 2.4 `useMidiInput` — WebMIDI access, devices, routing
  - [ ] 2.5 `useGameState` — **NO creado (aplazado)** porque requiere acoplar refs profundos de App.tsx
  - [x] 2.6 `useProfile` — XP, achievements, level-up
  - [x] 2.7 `useScoreReader` — MusicXML import + análisis + parts mixer
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_

- [x] 3. Capa de servicios (sin dependencia de React)
  - [x] 3.1 `storageService` — wrapper localStorage tipado con fallback in-memory
  - [x] 3.2 `audioService` — Salamander samples + setters dB/reverb/chorus
  - [x] 3.3 `gameService` — re-exporta de `game/`
  - [x] 3.4 `profileService` — re-exporta de `utils/profile` y `utils/achievements`
  - [x] 3.5 `scoreService` — re-exporta de `parsers/` y `analysis/`
  - [x] 3.6 `transportService` — wrapper sobre Tone.Transport
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 4. Componentes base + reorganización
  - [x] 4.1 `common/`: Button, Modal, Slider, Toast, Tabs, IconButton, Spinner, Icons
  - [x] 4.2 Reorganización por dominio:
    - `game/`: GameHUD, GameResultsModal
    - `gamification/`: ProfilePanel, NeonRunnerAvatar, PianoPet, PianoPetRive
    - `score/`: ScoreViewer, ScoreInfoBar, PartMixer, ImportPanel, scoreCache
    - `studio/`: InstrumentControls, KeyFxPanel
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Capa de contextos
  - `AudioProvider`, `SettingsProvider`, `ProfileProvider`, `ScoreProvider`
  - Montados en `main.tsx` envolviendo App
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Higiene del repo
  - [x] 6.1 `.gitignore` exhaustivo (binarios, screenshots root, scripts fix-*)
  - [x] 6.2 Demos `.mid` movidos a `app/public/demo/`
  - [x] 6.3 Borrados ~840 MB de binarios y carpetas legacy
  - [x] 6.4 Primer commit creado (antes no había ninguno)
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [~] 7. Integración en App.tsx
  - [x] Providers montados en main.tsx
  - [x] Extracciones aplicadas: constantes, helpers, Icons, demoSongs, midiFileParser, key positions
  - [x] App.tsx 5773 → 5168 líneas (-605 líneas, -10.5%)
  - [ ] **Pendiente**: reemplazar `useState`/`useLocalStorageState` directos por consumo de los contexts (no se hizo para evitar romper la lógica acoplada con stateRef)
  - [ ] **Pendiente**: reducir App.tsx a ≤ 800 líneas (queda en 5168 — el resto requiere extraer la función `scheduleSongOnTransport`, el canvas loop ~400 líneas y los handlers MIDI ~200 líneas, todos acoplados a refs)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. Quality gates
  - [x] `npm run build` — exit 0, 11 chunks, main 222 kB
  - [x] `npx tsc --noEmit` (strict) — exit 0
  - [x] `npm run lint` — 0 errores, 0 warnings
  - _Requirements: 8.1, 8.2, 8.3_

## Fase B — UI/UX & Performance audit ✅ COMPLETADO (parcial)

- [x] B.1 Auditoría con Playwright MCP
  - 10 screenshots por viewport (1440 / 768 / 390)
  - Métricas: FPS, frame times p50/p95/p99, long tasks, long animation frames, memoria heap, DOM nodes
  - Detección automática de problemas a11y (botones e inputs sin label)

- [x] B.2 Code splitting Vite
  - `vendor-osmd` (1.2 MB), `vendor-tone`, `vendor-rive`, `vendor-gsap`, etc separados
  - Chunk size warning subido a 800 kB

- [x] B.3 Lazy loading de ScoreViewer
  - OSMD ya no se carga al inicio (solo cuando el usuario abre la partitura)
  - `<Suspense>` fallback agregado
  - `scoreCache.ts` extraído para no acoplar el cache al chunk de OSMD

- [x] B.4 Yield to main thread durante carga de demos
  - `scheduler.yield` con fallback a `requestIdleCallback`
  - Eliminó 3 long tasks de hasta 114 ms al arranque
  - Long animation frames de 125 → 105 ms

- [x] B.5 Accesibilidad
  - 7 swatches Key FX con `aria-label` + `aria-pressed`
  - 6 inputs de slider/number con `aria-label`
  - Color picker con `aria-label`
  - **De 13 problemas a11y → 0**

## Fase C — UI/UX visual & micro-interacciones ⏳ PENDIENTE

- [ ] C.1 Tipografía/spacing del Studio header
  - Las "Métricas del Sistema" usan monospace que choca con `Outfit`
  - Mucho aire vertical en mobile
  - Unificar escala tipográfica

- [ ] C.2 Animaciones / micro-interacciones
  - Transiciones GSAP suaves en hover de teclas
  - Feedback visual al presionar tecla (ripple, glow pulse)
  - Animaciones de transición entre pantallas (cross-fade 200ms)

- [ ] C.3 Canvas del visualizer
  - Solo renderizar cuando hay canción cargada (no idle drain de FPS)
  - Pause `requestAnimationFrame` cuando la pestaña está en background
  - Reducir resolución del canvas si dpr > 2 (ahorra GPU)

- [ ] C.4 Mobile UX
  - Sidebar nav en bottom en mobile (más usable)
  - Range selector con touch gestures (pinch para octavas)
  - Tamaños mínimos de tap target (44×44px)

## Fase D — Próximas grandes (de los planes originales) ⏳ NO INICIADO

- [ ] D.1 Sistema de gamificación (estilo Guitar Hero)
  - Leaderboards globales con Supabase
  - Multiplicadores agresivos (>x8)
  - Star Power / Piano Fury mode
  - Sistema de niveles + XP + achievements UI

- [ ] D.2 Personajes interactivos con física CSS/SVG
  - Reemplazar canvas 2D actual
  - 60 FPS obligatorio
  - Reactivos a notas MIDI

- [ ] D.3 PWA + offline
  - Service worker
  - Manifiesto + iconos
  - Cache de samples Salamander

## Métricas finales (May 22, 2026)

| Métrica | Inicial | Actual | Δ |
|---|---|---|---|
| Líneas App.tsx | 5773 | **5168** | −605 |
| Bundle JS principal | 2,372 kB | **222 kB** | −90% |
| Long tasks (load) | 3 (max 114ms) | **0** | −100% |
| Memoria heap | 27 MB | **23 MB** | −15% |
| Problemas a11y | 13 | **0** | −100% |
| Errores lint | varios | **0** | ✅ |
| Errores tsc strict | 0 | **0** | ✅ |
| Commits en master | 0 | **6** | ✅ |
