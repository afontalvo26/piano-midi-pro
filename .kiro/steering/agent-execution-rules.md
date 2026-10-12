---
inclusion: always
---

# Ejecución de comandos — REGLAS OBLIGATORIAS

> **Esta regla no es una sugerencia.** Todo agente (o persona) que ejecute algo
> en este repo la cumple, sin excepciones. Nació de un problema real y repetido:
> comandos que dejaban la consola colgada, a la espera, sin devolver nada.

---

## La regla, en una línea

**Nada se ejecuta en primer plano si puede tardar más de 20 segundos.**
Todo lo demás va por `scripts/run-bounded.ps1` o como job en segundo plano.

---

## Las 4 causas que ya nos colgaron

Estas cuatro cosas pasaron de verdad en este proyecto. Cada una tiene su
contramedida obligatoria.

### 1. La suite e2e completa

7 archivos × 45 s de timeout × reintentos ≈ **6-7 minutos** con la terminal
tomada. Y si un test espera un selector que no aparece, se queda los 180 s
completos antes de fallar.

- **Obligatorio:** correr por archivo mientras se itera
  (`npx playwright test 03-playback`), nunca la suite entera.
- La suite completa **solo** al cerrar una tanda de trabajo, con tope explícito:

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "npx playwright test" -TimeoutSec 600 -Label e2e-completo
```

### 2. Servidores en primer plano

`vite preview`, `npm run dev`, `start-server.ps1`: **nunca terminan**. En primer
plano cuelgan para siempre.

- **Obligatorio:** los servidores van como **job en segundo plano**, siempre.
- Nunca lanzar un segundo servidor en el puerto 1234 (`strictPort: true`): si ya
  hay uno, se reutiliza.

### 3. Playwright esperando un selector que no existe

`click()` espera 30 s por defecto; `waitForSelector` sin `timeout` espera
hasta el tope global del test. Un selector mal escrito = minutos perdidos.

- **Obligatorio** en todo script de prueba propio:

```js
page.setDefaultTimeout(20000);                       // techo global bajo
await page.waitForSelector(".algo", { timeout: 15000 }); // tope por espera
```

### 4. Pipes de PowerShell sobre un proceso vivo

```powershell
comando-largo | Select-Object -Last 30    # ← PROHIBIDO
```

PowerShell **no emite nada** hasta que el proceso cierra. Si el comando tarda
5 minutos, no ves salida incremental: o termina, o no ves absolutamente nada.
Es la razón por la que un comando "se queda pegado sin leer la respuesta".

- **Obligatorio:** redirigir a archivo y leer el archivo.
  `run-bounded.ps1` ya lo hace: escribe la salida directo a `.logs/<fecha>-<label>.log`
  y después imprime las últimas líneas.

---

## Cómo ejecutar cada cosa

### Comando acotado (lo normal)

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "<comando>" -TimeoutSec <segundos> [-Cwd app] [-Label nombre]
```

Códigos de salida: `0..n` el código real · **`124`** se agotó el tiempo ·
`125` uso incorrecto.

### Comando que puede tardar mucho (build, suite completa, instalación)

Va como **job en segundo plano**. Devuelve un id al instante y se sigue
trabajando mientras corre:

```powershell
pwsh -File scripts/run-bounded.ps1 -Command "npx playwright test" -TimeoutSec 600 -Label e2e   # run_in_background
```

Después se lee con `job_output` — **nunca** con un bucle de espera ni con
`sleep` sondeando.

### Servidor de desarrollo

Job en segundo plano, sin tope, y se verifica la URL una sola vez.

---

## Topes por defecto

| Tarea | Tope |
|---|---|
| `npx tsc -b` (typecheck) | 180 s |
| `npx vite build` | 300 s |
| `npx eslint <archivo>` | 60 s |
| `npx playwright test <un archivo>` | 180 s |
| `npx playwright test` (suite completa) | 600 s |
| Verificación puntual de una URL | 10 s |

Si algo se pasa del tope, **no se sube el tope a ciegas**: primero se mira qué
estaba haciendo (el log lo dice) y se acota el alcance.

---

## Señales de alarma (si aparece alguna, cortar y reformular)

- Un comando lleva **más de 20 s** y no se pidió como job.
- Un comando no imprimió **nada** todavía.
- Hay un `| Select-Object` en un comando largo.
- Se lanzó un servidor en primer plano.
- Se está esperando un selector con timeout por defecto.
- Se está por correr la suite completa "para ver si algo más se rompió".

**Qué hacer:** matar el job (`job_kill`), y volver a lanzarlo acotado — por
archivo, con `-TimeoutSec`, y en segundo plano si corresponde.

---

## Prohibiciones explícitas

1. ❌ Comandos sin `timeoutMs`/`-TimeoutSec` si pueden tardar.
2. ❌ Servidores en primer plano.
3. ❌ `comando-largo | Select-Object -Last N` (bufferiza y no muestra nada).
4. ❌ Bucles de sondeo (`while`/`sleep`) esperando un job: para eso está la
   notificación de fin de job.
5. ❌ Subir un tope de tiempo sin antes mirar el log y entender qué pasaba.
6. ❌ Modificar archivos grandes con `Set-Content`/`Get-Content -Raw` +
   `-replace` (ver más abajo).

---

## Edición de archivos — regla aparte pero igual de obligatoria

**Nunca** reescribir un archivo de código con `Get-Content -Raw` + `-replace` +
`Set-Content`. Un `Set-Content` sin `-NoNewline` y con un array mal armado
**colapsa el archivo a una sola línea**. Eso ya destruyó `app/src/App.tsx`
(5900 líneas) en este proyecto.

- Para editar código: herramienta de edición con búsqueda literal.
- Para PowerShell: solo si el archivo es de datos, chico, y con backup previo.
- Antes de cualquier reescritura: `Copy-Item` a un `.bak` en el mismo directorio.

---

## Checklist de preflight

Al empezar a trabajar en este repo:

- [ ] ¿Hay un servidor de dev corriendo en el puerto 1234? Si no, levantarlo
      **como job en segundo plano**.
- [ ] ¿Los comandos que voy a usar pueden tardar más de 20 s? Entonces van por
      `scripts/run-bounded.ps1`.
- [ ] ¿Voy a correr tests? Por archivo, con `-TimeoutSec`, no la suite entera.
- [ ] ¿Voy a editar código? Con la herramienta de edición, nunca con
      `Set-Content` masivo.
- [ ] ¿Hay `.logs/` de la corrida anterior? Sirven para no repetir trabajo.

Al cerrar una tanda:

- [ ] `npx tsc -b` acotado.
- [ ] `npx eslint <archivos tocados>` acotado.
- [ ] Tests por archivo de lo que se tocó; la suite completa solo si el cambio
      es transversal.
