---
inclusion: always
---

# Piano MIDI Pro — contexto vigente

Lee primero `AGENTS.md` y `agent-execution-rules.md`. Ningún comando que
pueda tardar más de 20 segundos corre en primer plano; usa
`scripts/run-bounded.ps1`.

## Alcance

Piano en vivo con tres pantallas: **Studio**, **Pistas de grabaciones propias**
y **Configuración**. El contrato está en
`.kiro/specs/piano-only/requirements.md`. La biblioteca de canciones,
reproductor, karaoke, Juego, Partitura y la app `player/` ya no forman
parte del producto.

## Stack y rutas

- React 19, TypeScript estricto, Vite 8, Tone.js 15, ESLint 10.
- `app/src/main.tsx` → `PianoApp.tsx`.
- `app/src/audio/liveStudioEngine.ts` → voces Salamander, expresión,
  pedales, pads y metrónomo sin transporte de canciones.
- `app/src/audio/studioAudioLock.ts` → un dueño de audio entre pestañas.
- `app/src/midi/` → Web MIDI, diagnóstico físico, MIDI Learn, grabador SMF
  y biblioteca IndexedDB de tomas.
- `app/src/components/studio/PianoKeyboard.tsx` y
  `app/src/state/pianoKeyboardStore.ts` → teclado y repintado acotado.
- `app/public/audio/salamander/core/` → siete OGG locales de piano.

El servidor de la app escucha en 1234. Reutiliza el servidor si ya está vivo.
No inicies un segundo ni ejecutes servidores en primer plano.

## Comandos de cierre

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "npx tsc -b" -Cwd app -TimeoutSec 180 -Label tsc
pwsh -File scripts/run-bounded.ps1 -Command "npx vite build" -Cwd app -TimeoutSec 300 -Label build
pwsh -File scripts/run-bounded.ps1 -Command "npx eslint ." -Cwd app -TimeoutSec 180 -Label lint
pwsh -File scripts/run-bounded.ps1 -Command "npx playwright test <archivo>" -TimeoutSec 180 -Label e2e-focal
```

Verifica que `app/dist` sólo distribuya shell, JS/CSS, iconos, service
worker y piano núcleo. Revisa el código y activos retirados en el resguardo
hermano `piano-midi-pro-retired-20261031` si hace falta recuperar contexto.
La prueba con MIDI simulado no acredita por sí sola el comportamiento audible
del controlador físico.
