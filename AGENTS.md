# AGENTS.md — Piano MIDI Pro

Este archivo es la puerta de entrada para agentes. Leé también
[`.kiro/steering/agent-execution-rules.md`](.kiro/steering/agent-execution-rules.md)
antes de ejecutar comandos.

## Producto vigente

La app tiene sólo **Studio**, **Pistas de grabaciones MIDI propias** y
**Configuración**. Música, Canciones, reproductor de canciones, letras/karaoke,
Juego, Partitura y la app independiente `player/` se retiraron. El contrato
verificable está en [`.kiro/specs/piano-only/requirements.md`](.kiro/specs/piano-only/requirements.md).
No reintroduzcas imports, rutas, assets o controles de transporte de esas
funciones.

Studio debe seguir tocando 37 teclas simultáneas y soltarlas todas, incluso
con sustain y dos acordes seguidos. Conserva expresión MIDI (CC1/7/11,
pedales CC64/66/67, pitch bend y presión), pads, metrónomo, MIDI Learn,
grabación y un solo dueño de audio entre pestañas. El SMK-37 Elite/Pro es la
prioridad, con entrada genérica opcional. Los botones internos del dispositivo
no tienen un mapa MIDI universal: sólo marca un control como verificado tras
observar sus bytes reales.

Pistas usa IndexedDB local (`midi/recordingLibrary.ts`). Cada toma guarda
metadatos y bytes `.mid` juntos. No importa ni reproduce canciones. Las
grabaciones ya existentes del navegador no se deben borrar al limpiar
localStorage o cambiar el service worker.

## Ejecución obligatoria

**Nada que pueda durar más de 20 segundos corre en primer plano.** Usa:

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "<comando>" -TimeoutSec <segundos> [-Cwd app] [-Label nombre]
```

Topes por defecto: `npx tsc -b` 180 s; `npx vite build` 300 s;
`npx eslint <archivo>` 60 s; `npx playwright test <un archivo>` 180 s;
suite completa 600 s sólo al cerrar una tanda transversal. El runner deja
la salida en `.logs/`. Nunca lances `npm run dev` o `vite preview` en
primer plano. Antes de abrir un servidor, comprueba si el puerto 1234
ya tiene uno y reutilízalo. No uses pipes `comando-largo | Select-Object`,
bucles de sondeo ni reescrituras `Get-Content -Raw` + `-replace` +
`Set-Content`; usa edición literal.

## Arquitectura activa

- `app/src/main.tsx` monta `PianoApp.tsx` sin providers de canciones.
- `app/src/audio/liveStudioEngine.ts` maneja piano, pedales, expresión,
  pads y metrónomo. `studioAudioLock.ts` coordina una sola pestaña.
- `app/src/midi/` parsea, diagnostica, aprende controles, graba y guarda
  tomas. `components/tracks/RecordedTracks.tsx` muestra Pistas.
- `app/src/state/pianoKeyboardStore.ts` agrupa repintados de teclas por
  frame. Evita `setState` del App por cada nota de un acorde.
- `app/public/audio/salamander/core/` contiene las siete muestras locales
  críticas. Los pads y muestras no núcleo pueden necesitar red.
- `app/public/sw.js` cachea sólo shell, assets de la app y piano núcleo;
  al actualizar limpia sólo cachés `pmp-*` antiguas.

El código y activos retirados se conservaron fuera del repositorio en un
resguardo hermano `piano-midi-pro-retired-20261031`, con manifiestos SHA-256.
No lo uses como catálogo activo. Antes de mover/borrar cualquier ruta, verifica
el límite absoluto de origen y destino y preserva cambios ajenos.

## Verificación

En cada tanda de código: `tsc -b`, ESLint de archivos tocados, build de Vite
y pruebas focales con runner. Las pruebas activas cubren motor live, 37 notas,
pedal/lock entre pestañas, MIDI simulado, persistencia y service worker.
Comprueba también que `app/dist` no contenga `demo/`, `covers/`,
`samples/` ni `player/`; debe mantener las siete OGG núcleo. Una prueba
en Chromium simulado no demuestra por sí sola la calidad de la salida física
del SMK-37.
