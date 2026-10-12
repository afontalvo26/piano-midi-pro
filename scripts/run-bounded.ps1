# =============================================================================
#  run-bounded.ps1 — EL ÚNICO MODO SANCIONADO DE EJECUTAR COMANDOS LARGOS
# =============================================================================
#
#  POR QUÉ EXISTE
#  --------------
#  Un comando sin tope de tiempo bloquea la consola y a quien lo esté
#  esperando. En este proyecto eso ya pasó varias veces y siempre por las
#  mismas cuatro causas:
#
#    1. La suite e2e completa: 7 archivos × 45 s de timeout × reintentos
#       ≈ 6-7 minutos con la terminal tomada.
#    2. Un servidor (`vite preview`, `npm run dev`): NUNCA termina. En primer
#       plano cuelga para siempre.
#    3. Playwright esperando un selector que no aparece: 30 s muertos por
#       click, 180 s por test.
#    4. `comando | Select-Object -Last N`: PowerShell no puede emitir nada
#       hasta que el proceso CIERRA, así que no hay salida incremental —
#       o termina, o no ves absolutamente nada.
#
#  QUÉ HACE ESTE SCRIPT
#  --------------------
#  Corre el comando con un tope duro de segundos, escribe TODA la salida a un
#  archivo de log (sin pipes, así que nada se bufferiza ni se pierde), mata el
#  árbol de procesos si se pasa del tope, e imprime un resumen corto.
#
#  USO
#  ---
#    pwsh -File scripts/run-bounded.ps1 -Command "npx playwright test 03-playback" -TimeoutSec 120
#    pwsh -File scripts/run-bounded.ps1 -Command "npm run build" -Cwd app -TimeoutSec 300 -Label build
#    pwsh -File scripts/run-bounded.ps1 -Command "npx tsc -b" -Cwd app -TimeoutSec 90
#
#  CÓDIGOS DE SALIDA
#  -----------------
#    0..n   el código real del comando
#    124    se agotó el tiempo (el comando fue terminado) — igual que `timeout(1)`
#    125    uso incorrecto / timeout inválido
#
#  REGLA PARA AGENTES: si un comando puede tardar más de ~20 segundos, va por
#  acá. Nunca en primer plano. Ver .kiro/steering/agent-execution-rules.md.
# =============================================================================

[CmdletBinding()]
param(
    # Comando a ejecutar (se pasa tal cual a cmd /c).
    [Parameter(Mandatory = $true)]
    [string]$Command,

    # Tope duro en segundos. Al agotarse, el proceso se termina.
    [int]$TimeoutSec = 120,

    # Directorio de trabajo, relativo a la raíz del repo (o absoluto).
    [string]$Cwd = ".",

    # Nombre del log. Por defecto se deriva del comando.
    [string]$Label = "",

    # Cuántas líneas finales mostrar por pantalla.
    [int]$Tail = 30
)

$ErrorActionPreference = "Stop"

if ($TimeoutSec -lt 1) {
    Write-Host "[run-bounded] -TimeoutSec debe ser >= 1 (recibido: $TimeoutSec)" -ForegroundColor Red
    exit 125
}

# ── rutas ────────────────────────────────────────────────────────────────────
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot "app"))) {
    # El script puede vivir en otro lado; caer al directorio actual.
    $repoRoot = (Get-Location).Path
}

$workDir = if ([System.IO.Path]::IsPathRooted($Cwd)) {
    $Cwd
} else {
    Join-Path $repoRoot $Cwd
}

if (-not (Test-Path $workDir)) {
    Write-Host "[run-bounded] el directorio de trabajo no existe: $workDir" -ForegroundColor Red
    exit 125
}

if ([string]::IsNullOrWhiteSpace($Label)) {
    $slug = ($Command -replace '[^A-Za-z0-9]+', '-').Trim('-')
    if ($slug.Length -gt 40) { $slug = $slug.Substring(0, 40) }
    $Label = $slug
}

$logDir = Join-Path $repoRoot ".logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "$stamp-$Label.log"

# ── ejecución ────────────────────────────────────────────────────────────────
# La salida va DIRECTO al archivo vía cmd, nunca por un pipe de PowerShell:
# los pipes bufferizan y son la razón por la que un comando largo "no muestra
# nada" hasta que termina.
Write-Host "[run-bounded] comando : $Command"
Write-Host "[run-bounded] en      : $workDir"
Write-Host "[run-bounded] tope    : ${TimeoutSec}s"
Write-Host "[run-bounded] log     : $logFile"
Write-Host "[run-bounded] corriendo..." -ForegroundColor DarkGray

$proc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/d", "/s", "/c", "$Command > `"$logFile`" 2>&1" `
    -WorkingDirectory $workDir `
    -NoNewWindow `
    -PassThru

$timedOut = $false
try {
    # `Wait-Process -Timeout` lanza excepción al agotarse: así nunca esperamos
    # indefinidamente, ni siquiera si el proceso ignora señales.
    Wait-Process -Id $proc.Id -Timeout $TimeoutSec -ErrorAction Stop
} catch {
    $timedOut = $true
}

if ($timedOut -and -not $proc.HasExited) {
    # /T mata el árbol completo (vite deja hijos: esbuild, workers…).
    & taskkill.exe /PID $proc.Id /T /F *> $null
    Start-Sleep -Milliseconds 300
}

# ── resultado ────────────────────────────────────────────────────────────────
$exitCode = if ($timedOut) { 124 } else { $proc.ExitCode }
if ($null -eq $exitCode) { $exitCode = 0 }

$lines = @()
if (Test-Path $logFile) {
    $lines = Get-Content $logFile -ErrorAction SilentlyContinue
}
$total = ($lines | Measure-Object).Count

Write-Host ""
if ($timedOut) {
    Write-Host "[run-bounded] AGOTADO el tope de ${TimeoutSec}s — proceso terminado." -ForegroundColor Yellow
} elseif ($exitCode -eq 0) {
    Write-Host "[run-bounded] OK (exit 0) — $total líneas de salida." -ForegroundColor Green
} else {
    Write-Host "[run-bounded] FALLÓ (exit $exitCode) — $total líneas de salida." -ForegroundColor Red
}

if ($total -gt 0) {
    $skip = [Math]::Max(0, $total - $Tail)
    Write-Host "[run-bounded] últimas $([Math]::Min($Tail, $total)) líneas:" -ForegroundColor DarkGray
    $lines | Select-Object -Skip $skip | ForEach-Object { Write-Host "  $_" }
    if ($total -gt $Tail) {
        Write-Host ""
        Write-Host "[run-bounded] salida completa: $logFile" -ForegroundColor DarkGray
    }
}

exit $exitCode
