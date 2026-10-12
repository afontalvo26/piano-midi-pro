# AGENTS.md — Reglas obligatorias para agentes

Este archivo es la puerta de entrada. Si sos un agente trabajando en este repo,
leelo **antes de ejecutar nada**.

La regla completa y razonada vive en
[`.kiro/steering/agent-execution-rules.md`](.kiro/steering/agent-execution-rules.md).
Esto es el resumen operativo.

---

## ⛔ La regla principal

**Nada se ejecuta en primer plano si puede tardar más de 20 segundos.**

Todo lo demás va por el runner acotado:

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "<comando>" -TimeoutSec <segundos> [-Cwd app] [-Label nombre]
```

Aplica un tope duro, escribe toda la salida a `.logs/<fecha>-<label>.log` (sin
pipes, nada se bufferiza), mata el árbol de procesos al agotarse, e imprime un
resumen corto.

**Códigos de salida:** `0..n` el código real · `124` se agotó el tiempo · `125` uso incorrecto.

---

## Topes por defecto

| Tarea | Tope |
|---|---|
| `npx tsc -b` | 180 s |
| `npx vite build` | 300 s |
| `npx eslint <archivo>` | 60 s |
| `npx playwright test <un archivo>` | 180 s |
| `npx playwright test` (suite completa) | 600 s |

---

## Prohibiciones explícitas

1. ❌ **Comandos largos sin tope.** Siempre `-TimeoutSec` o `timeoutMs`.
2. ❌ **Servidores en primer plano.** `npm run dev` / `vite preview` nunca
   terminan: van como job en segundo plano.
3. ❌ **`comando-largo | Select-Object -Last N`.** PowerShell no emite nada
   hasta que el proceso cierra → no ves salida incremental. Redirigí a archivo.
4. ❌ **La suite e2e completa mientras se itera.** Corré por archivo
   (`npx playwright test 03-playback`); la completa solo al cerrar una tanda.
5. ❌ **Bucles de sondeo** (`while` / `sleep`) esperando un job. Para eso está la
   notificación de fin de job.
6. ❌ **Reescribir código con `Get-Content -Raw` + `-replace` + `Set-Content`.**
   Un `Set-Content` mal armado colapsa el archivo a una sola línea — ya destruyó
   `app/src/App.tsx`. Editá con la herramienta de edición, literal.

---

## Puertos y servidores

- El dev server es **1234** (`app/vite.config.ts`, `strictPort: true`), no 5173.
- Si ya hay uno levantado, **se reutiliza**. Nunca lances un segundo.
- Los scripts de prueba propios deben bajar el techo de espera:

```js
page.setDefaultTimeout(20000);
await page.waitForSelector(".selector", { timeout: 15000 });
```

---

## Checklist de preflight

- [ ] ¿Hay dev server en 1234? Si no, levantarlo como job en segundo plano.
- [ ] ¿Algún comando puede tardar más de 20 s? Va por `run-bounded.ps1`.
- [ ] ¿Voy a correr tests? Por archivo, con tope.
- [ ] ¿Voy a editar código? Con la herramienta de edición, nunca `Set-Content` masivo.
