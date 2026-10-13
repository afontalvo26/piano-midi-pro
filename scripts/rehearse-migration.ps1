# =============================================================================
#  rehearse-migration.ps1 — ensaya la migración a `packages/` en un sandbox
# =============================================================================
#
#  POR QUÉ EXISTE
#  --------------
#  Las fases 2 y 3 mueven 96 archivos y reescriben ~390 imports. Si algo sale
#  mal, se sale mal sobre el árbol de trabajo, donde además hay otros agentes
#  editando. Este script hace el movimiento ENTERO en una copia descartable
#  (`.logs/rehearsal`, que está gitignoreada) y corre `tsc -b` ahí adentro.
#
#  Resultado: se sabe si la migración compila ANTES de tocar el repo de verdad.
#  El árbol real no se toca en ningún momento — ni un archivo.
#
#  CÓMO
#  ----
#   1. Pide la tabla de movimientos al codemod (`--print-moves`), para no
#      duplicarla acá: una tabla copiada en dos lugares se desincroniza y el
#      ensayo terminaría validando algo distinto de lo que se aplica.
#   2. Copia `app/`, `player/`, `packages/` y el codemod al sandbox. NO copia
#      `node_modules`: lo enlaza con una junction, igual que hace `player/`.
#      Sin eso habría que instalar Tone y React dos veces, y dos copias de Tone
#      son dos AudioContext.
#   3. Mueve los archivos según la tabla.
#   4. Corre el codemod con `--apply`, apuntando al sandbox.
#   5. `npx tsc -b` en las dos apps del sandbox.
#
#  USO
#  ---
#    pwsh -File scripts/rehearse-migration.ps1 -Stage 2
#    pwsh -File scripts/rehearse-migration.ps1 -Stage 3 -Keep
#
#  NO reemplaza la verificación real (audio, HTTP, e2e, paridad visual): eso
#  sólo se puede medir sobre las apps corriendo. Acá se verifica que COMPILE.
# =============================================================================

[CmdletBinding()]
param(
    # Fase cuya tabla de movimientos se ensaya (2 o 3).
    [int]$Stage = 2,

    # Sandbox, relativo a la raíz del repo.
    [string]$Sandbox = ".logs/rehearsal",

    # No borrar el sandbox al terminar (para inspeccionarlo).
    [switch]$Keep
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repoRoot $Sandbox

function Paso($texto) { Write-Host "`n[ensayo] $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "  OK  $texto" -ForegroundColor Green }
function Mal($texto) { Write-Host "  MAL $texto" -ForegroundColor Red }

# ── 1. la tabla de movimientos, del propio codemod ──────────────────────────
Paso "Pidiendo la tabla de movimientos al codemod (--stage=$Stage)"
$json = & node (Join-Path $repoRoot "scripts/migrate-to-shared.mjs") --print-moves "--stage=$Stage" --no-color
if ($LASTEXITCODE -ne 0) { Mal "el codemod no devolvió la tabla"; exit 1 }
$moves = $json | ConvertFrom-Json
Ok "$($moves.Count) movimiento(s)"

# ── 2. sandbox limpio ───────────────────────────────────────────────────────
Paso "Armando el sandbox en $Sandbox"
if (Test-Path $root) { Remove-Item $root -Recurse -Force }
New-Item -ItemType Directory -Path $root -Force | Out-Null

# `node_modules` y los artefactos de build se excluyen: node_modules se enlaza.
$excluir = @("node_modules", "dist", "test-results", ".tmp", ".tsbuild")

foreach ($par in @(@("app", "app"), @("player", "player"), @("packages", "packages"))) {
    $src = Join-Path $repoRoot $par[0]
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $root $par[1]
    $null = robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP /XD @excluir
    # robocopy: 0-7 son éxito (8+ es error real). Es una convención horrible.
    if ($LASTEXITCODE -ge 8) { Mal "robocopy falló copiando $($par[0]) (exit $LASTEXITCODE)"; exit 1 }
}
New-Item -ItemType Directory -Path (Join-Path $root "scripts") -Force | Out-Null
Copy-Item (Join-Path $repoRoot "scripts/migrate-to-shared.mjs") (Join-Path $root "scripts") -Force
Ok "copiado"

# ── 3. node_modules por junction (una sola copia de Tone y de React) ────────
#
# `packages/` necesita su PROPIA junction y esto no es cosmético: Node y
# TypeScript resuelven los paquetes caminando HACIA ARRIBA desde el archivo que
# importa. Un archivo en `packages/engine/` busca `tone` en
# `packages/engine/node_modules`, después `packages/node_modules`, después
# `<raíz>/node_modules` (donde sólo está Playwright) y ahí se queda: NUNCA mira
# `app/node_modules`. Sin esta junction, mover el motor a `packages/` rompe con
# "Cannot find module 'tone'" — y encima con errores en cascada (`Parameter
# 'err' implicitly has an 'any' type`) que parecen otra cosa.
#
# Es una junction y no una copia a propósito: los tres caminos apuntan a los
# MISMOS archivos (mismo File ID), así que Tone se instancia UNA vez. Dos copias
# serían dos AudioContext, o sea dos grafos de audio que no se ven entre sí.
$nmReal = Join-Path $repoRoot "app/node_modules"
if (-not (Test-Path $nmReal)) { Mal "no existe app/node_modules"; exit 1 }
foreach ($app in @("app", "player", "packages")) {
    $link = Join-Path $root "$app/node_modules"
    if (-not (Test-Path $link)) {
        New-Item -ItemType Junction -Path $link -Target $nmReal | Out-Null
    }
}
Ok "junctions creadas (app, player, packages -> app/node_modules)"

# Los `tsconfig` escriben el tsbuildinfo en `./node_modules/.tmp/...`, que ahora
# es la junction: sin este parche, el ensayo y el repo REAL compartirían el mismo
# archivo de build incremental y se pisarían el estado. Se redirige adentro del
# sandbox. Es lo único que se toca de la config copiada, y no cambia semántica.
foreach ($cfg in @("app/tsconfig.app.json", "app/tsconfig.node.json",
                   "player/tsconfig.app.json", "player/tsconfig.node.json")) {
    $p = Join-Path $root $cfg
    if (-not (Test-Path $p)) { continue }
    $texto = [System.IO.File]::ReadAllText($p)
    $texto = $texto.Replace("./node_modules/.tmp/", "./.tsbuild/")
    [System.IO.File]::WriteAllText($p, $texto)
}
Ok "tsbuildinfo redirigido al sandbox"

# ── 4. mover según la tabla ─────────────────────────────────────────────────
Paso "Moviendo $($moves.Count) subárbol(es)"
$movidos = 0
foreach ($m in $moves) {
    $from = Join-Path $root $m.from
    $to = Join-Path $root $m.to
    if (-not (Test-Path $from)) { Mal "no existe el origen: $($m.from)"; exit 1 }

    $padre = Split-Path -Parent $to
    if (-not (Test-Path $padre)) { New-Item -ItemType Directory -Path $padre -Force | Out-Null }

    if ($m.kind -eq "file") {
        Move-Item $from $to -Force
        $movidos++
        continue
    }

    if (-not (Test-Path $to)) { New-Item -ItemType Directory -Path $to -Force | Out-Null }
    Get-ChildItem $from -Force | ForEach-Object {
        Move-Item $_.FullName (Join-Path $to $_.Name) -Force
        $movidos++
    }
    Remove-Item $from -Recurse -Force -ErrorAction SilentlyContinue
}
Ok "$movidos entrada(s) movida(s)"

# ── 5. el codemod, sobre el sandbox ─────────────────────────────────────────
Paso "Aplicando el codemod en el sandbox (--apply --stage=$Stage)"
& node (Join-Path $root "scripts/migrate-to-shared.mjs") --apply "--stage=$Stage" --no-color 2>&1 |
    Select-Object -Last 30
$codemodExit = $LASTEXITCODE
if ($codemodExit -ne 0) { Mal "el codemod reportó destinos inexistentes (exit $codemodExit)" }

# ── 6. ¿compila? ────────────────────────────────────────────────────────────
#
# Se corre DOS veces: en el sandbox migrado y en el repo real (que es el control
# sin migrar, porque la migración todavía no se aplicó ahí). La comparación es
# lo que hace útil el ensayo cuando hay otros agentes editando: si el árbol real
# YA falla en un archivo, ese error no es de la migración. Sin el control, un
# archivo a medio editar por otro agente se leería como "la migración rompió".
Paso "npx tsc -b — sandbox migrado vs. repo real (control sin migrar)"

# Huella del árbol REAL antes y después. El sandbox es una foto del momento de
# la copia, pero el control corre unos segundos más tarde: si otro agente guarda
# un archivo en el medio, el control mide una versión distinta y la comparación
# inventa "errores nuevos" que en realidad son de él. Con la huella, eso se
# detecta y se avisa en vez de reportarse como un fallo de la migración.
function Huella([string]$dir) {
    $archivos = Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules' }
    $max = ($archivos | Measure-Object -Property LastWriteTime -Maximum).Maximum
    return "$($archivos.Count) archivos, último cambio $($max.ToString('HH:mm:ss'))"
}
$huellaAntes = Huella (Join-Path $repoRoot "app/src")
$huellaAntesJugador = Huella (Join-Path $repoRoot "player/src")

function Correr-Tsc([string]$dir, [string]$log) {
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/d", "/s", "/c", "npx tsc -b > `"$log`" 2>&1" `
        -WorkingDirectory $dir -NoNewWindow -PassThru
    if (-not $proc.WaitForExit(240000)) { & taskkill.exe /PID $proc.Id /T /F *> $null; return 124 }
    return $proc.ExitCode
}

function Errores([string]$log) {
    if (-not (Test-Path $log)) { return @() }
    return @(Get-Content $log | Where-Object { $_ -match 'error TS\d+' } | ForEach-Object { $_.Trim() })
}

$resultado = @{}
foreach ($app in @("app", "player")) {
    $logSandbox = Join-Path $root "$app-tsc-sandbox.log"
    $logReal = Join-Path $root "$app-tsc-real.log"
    $codeSandbox = Correr-Tsc (Join-Path $root $app) $logSandbox
    $codeReal = Correr-Tsc (Join-Path $repoRoot $app) $logReal
    $resultado[$app] = @{
        Sandbox = $codeSandbox
        Real    = $codeReal
        ErrSandbox = Errores $logSandbox
        ErrReal    = Errores $logReal
    }
}

$todoOk = $true
$huboNuevos = $false
foreach ($app in @("app", "player")) {
    $r = $resultado[$app]
    # El prefijo cambia entre los dos (`../packages/...` en el sandbox) pero el
    # archivo y el error no. Se compara por "archivo(linea): error TSxxxx".
    $clave = { param($l) ($l -replace '^.*?([^/\\()]+\.tsx?)\(', '$1(') }
    $setSandbox = @($r.ErrSandbox | ForEach-Object { & $clave $_ })
    $setReal = @($r.ErrReal | ForEach-Object { & $clave $_ })
    $nuevos = @($setSandbox | Where-Object { $setReal -notcontains $_ })
    $arreglados = @($setReal | Where-Object { $setSandbox -notcontains $_ })

    Write-Host ""
    if ($r.Sandbox -eq 0) {
        Ok "$app/ tsc -b LIMPIO en el sandbox migrado (exit 0)"
    } elseif ($r.Sandbox -eq 124) {
        $todoOk = $false
        Mal "$app/ tsc -b se colgó (>240 s)"
    } else {
        Ok "$app/ sandbox: exit $($r.Sandbox) con $($setSandbox.Count) error(es); real (control): exit $($r.Real) con $($setReal.Count)"
        if ($nuevos.Count -gt 0) {
            $todoOk = $false
            $huboNuevos = $true
            Mal "$($nuevos.Count) error(es) NUEVO(S) que sólo aparecen con la migración:"
            $nuevos | ForEach-Object { Write-Host "        $_" -ForegroundColor Red }
        } else {
            Ok "0 errores nuevos: los $($setSandbox.Count) del sandbox YA existen en el árbol real (no los causa la migración)"
        }
        if ($arreglados.Count -gt 0) {
            Write-Host "  nota: $($arreglados.Count) error(es) del árbol real no aparecen en el sandbox (otro agente editando entre las dos corridas)" -ForegroundColor DarkYellow
        }
    }
}

# ── ¿el árbol se movió durante el ensayo? ───────────────────────────────────
$huellaDespues = Huella (Join-Path $repoRoot "app/src")
$huellaDespuesJugador = Huella (Join-Path $repoRoot "player/src")
if ($huellaAntes -ne $huellaDespues -or $huellaAntesJugador -ne $huellaDespuesJugador) {
    Write-Host ""
    Write-Host "[ensayo] AVISO: otro proceso editó el árbol real DURANTE el ensayo." -ForegroundColor Yellow
    Write-Host "         app/src    antes: $huellaAntes" -ForegroundColor DarkYellow
    Write-Host "         app/src    ahora: $huellaDespues" -ForegroundColor DarkYellow
    Write-Host "         player/src antes: $huellaAntesJugador" -ForegroundColor DarkYellow
    Write-Host "         player/src ahora: $huellaDespuesJugador" -ForegroundColor DarkYellow
    Write-Host "         Los 'errores nuevos' pueden ser de esa edición, no de la migración:" -ForegroundColor DarkYellow
    Write-Host "         volver a correr el ensayo con el árbol quieto antes de darlo por fallado." -ForegroundColor DarkYellow
    $todoOk = $false
    $huboEdicion = $true
} else {
    $huboEdicion = $false
}

# ── 7. veredicto ────────────────────────────────────────────────────────────
#
# Tres estados, no dos. "No concluyente" es distinto de "no está lista": si el
# único problema son errores nuevos Y el árbol se estuvo editando durante el
# ensayo, no se puede saber si son de la migración o del otro agente. Decir
# "falló" ahí manda a buscar un bug que no existe.
Write-Host ""
$veredictoOk = $todoOk -and $codemodExit -eq 0
if ($veredictoOk) {
    Write-Host "[ensayo] VEREDICTO: la fase $Stage COMPILA en las dos apps." -ForegroundColor Green
} elseif ($huboNuevos -and $huboEdicion) {
    Write-Host "[ensayo] VEREDICTO: NO CONCLUYENTE en la fase $Stage." -ForegroundColor Yellow
    Write-Host "         El árbol se editó durante el ensayo, así que los 'errores nuevos' pueden" -ForegroundColor DarkYellow
    Write-Host "         ser de esa edición. Repetir con el árbol quieto antes de conclusiones." -ForegroundColor DarkYellow
} else {
    Write-Host "[ensayo] VEREDICTO: la fase $Stage NO está lista. Ver arriba." -ForegroundColor Red
}

if (-not $Keep) {
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[ensayo] sandbox borrado (usar -Keep para conservarlo)" -ForegroundColor DarkGray
} else {
    Write-Host "[ensayo] sandbox conservado en $root" -ForegroundColor DarkGray
}

if ($veredictoOk) { exit 0 } else { exit 1 }
