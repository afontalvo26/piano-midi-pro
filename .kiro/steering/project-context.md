---
inclusion: always
---

# Piano MIDI Pro — Contexto del proyecto

## Stack
- React 19 + TypeScript estricto + Vite 8 (rolldown)
- Tone.js 15 para audio + sampler Salamander
- @tonejs/midi para parsing MIDI
- opensheetmusicdisplay (OSMD) para partituras MusicXML — **lazy loaded**
- Rive para personajes interactivos
- GSAP para animaciones avanzadas
- ESLint 10 + typescript-eslint + react-hooks plugin
- `verbatimModuleSyntax: true` en tsconfig.app.json (usar `import type` y `export type`)

## Estructura clave

```
app/src/
├─ App.tsx               5168 líneas — orquestador grande con stateRef pattern
├─ main.tsx              providers: Settings → Audio → Profile → Score
├─ contexts/             4 providers wrapping los hooks
├─ hooks/                useAudioEngine, useTransport, useKeyboardRange, useMidiInput, useProfile, useScoreReader
├─ services/             6 servicios sin React (storage, audio, game, profile, score, transport)
├─ components/
│  ├─ common/            Button, Modal, Slider, Toast, Tabs, IconButton, Spinner, Icons
│  ├─ game/              GameHUD, GameResultsModal
│  ├─ gamification/      ProfilePanel, NeonRunnerAvatar, PianoPet, PianoPetRive
│  ├─ score/             ScoreViewer (lazy), ScoreInfoBar, PartMixer, ImportPanel, scoreCache
│  └─ studio/            InstrumentControls, KeyFxPanel
├─ game/                 modular: types/timing/chart/scoring/starPower/renderer + engine.ts (barrel)
├─ utils/                audioMidiUtils, instrumentMapping, midiFileParser, profile, achievements, songRatings, settings
└─ constants/            piano, ui, audio, game, demoSongs
```

## Comandos importantes

```bash
cd app && npm run dev          # vite dev server en http://localhost:5173/
cd app && npm run build        # tsc -b && vite build (debe pasar exit 0)
cd app && npm run lint         # eslint, debe ser 0 errores 0 warnings
cd app && npx tsc --noEmit     # type-check estricto, debe pasar exit 0
```

## Reglas del proyecto

1. **Nunca crees archivos `.md` salvo que el usuario pida documentación explícita** (los específicos del spec ya están).
2. **Mantén el patrón `stateRef`** en App.tsx — el componente lee 30+ valores de un ref para evitar invalidar callbacks. No reemplaces sin un plan completo.
3. **No introduzcas Zustand/Redux** — contexts + hooks son suficientes.
4. **Siempre verifica `npm run build` + `npm run lint`** después de cualquier cambio significativo.
5. **Comentarios `eslint-disable-next-line react-hooks/exhaustive-deps`** son intencionales en App.tsx — son necesarios por el patrón stateRef.
6. **OSMD es lazy** — `ScoreViewer` se importa con `lazy()` y se envuelve con `<Suspense>`. Si tocás imports de score, mantené la separación entre `scoreCache.ts` (sync) y `ScoreViewer.tsx` (lazy).
7. **Demos MIDI** se cargan secuencialmente con `scheduler.yield()` para no bloquear el main thread.

## Pendiente importante

- **App.tsx → ≤ 800 líneas**: requiere extraer `scheduleSongOnTransport` (~170L), canvas useEffect (~400L), `handleMidiMessage` (~134L). Todos acoplados a refs internos. Plan en `.kiro/specs/refactor-and-improve/design.md`.
- **Migrar consumidores a contexts**: providers están montados pero App.tsx aún declara `useState`/`useLocalStorageState` directamente.
- **Canvas idle**: el rAF loop corre sin canción cargada. Pendiente pausar cuando vacío o pestaña en background.
- **Tipografía**: "Métricas del Sistema" usa monospace que choca con `Outfit`. Unificar.
- **Mobile**: sidebar nav debería ir al bottom; tap targets a 44×44px mínimo.

## Comandos útiles para audit

```js
// FPS + long tasks dentro de page.evaluate
const longTasks = [];
new PerformanceObserver(l => l.getEntries().forEach(e => longTasks.push(e.duration)))
  .observe({ type: 'longtask', buffered: true });

// Frame timing
const frameTimes = [];
let last = performance.now();
await new Promise(r => {
  const tick = () => {
    const now = performance.now();
    frameTimes.push(now - last); last = now;
    if (now - performance.timing.navigationStart < 3000) requestAnimationFrame(tick);
    else r();
  };
  requestAnimationFrame(tick);
});
```
