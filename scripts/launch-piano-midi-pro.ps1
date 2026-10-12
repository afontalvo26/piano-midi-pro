#
# Piano MIDI Pro — launcher
#
# Boots the Vite dev server in the background (no visible window), waits for
# the app to actually answer HTTP 200, then opens it.
#
# If the server is already running it just opens the app — no duplicate
# instance. Run by launch-piano-midi-pro.vbs so no console window flashes.
#
# Compatible with Windows PowerShell 5.1 (what the .vbs invokes).
#
#   -AppWindow   open a chromeless app window (Chrome/Edge) instead of a tab
#   -NoBrowser   start/verify the server only (used by scripts and tests)
#   -Quiet       never show a MessageBox; report errors on stdout/log only
#   -Port <n>    override the port (default 1234, must match vite.config.ts)
#

[CmdletBinding()]
param(
    [switch]$AppWindow,
    [switch]$NoBrowser,
    [switch]$Quiet,
    [int]$Port = 1234
)

$ErrorActionPreference = "Stop"

try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue } catch {}

# ── Paths ────────────────────────────────────────────────────────────────────
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$appDir      = Join-Path $projectRoot "app"
$url         = "http://localhost:$Port/"
$logFile     = Join-Path $env:TEMP "piano-midi-pro-launcher.log"
$serverLog   = Join-Path $env:TEMP "piano-midi-pro-server.log"
$serverErrLog = Join-Path $env:TEMP "piano-midi-pro-server.err.log"
$pidFile     = Join-Path $env:TEMP "piano-midi-pro-launcher.pid"
$startTimeoutSec = 120

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -Path $logFile -Value "[$timestamp] $Message" -Encoding UTF8 } catch {}
}

function Show-Error {
    param([string]$Message, [string]$Title = "Piano MIDI Pro")
    Write-Log "ERROR: $Message"
    Write-Host $Message -ForegroundColor Red
    # A modal dialog blocks until dismissed, so only show one when a human can
    # actually see and click it. -Quiet and non-interactive hosts log instead.
    if ($Quiet -or -not [Environment]::UserInteractive) { return }
    try {
        [System.Windows.Forms.MessageBox]::Show(
            $Message, $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
        # No GUI available (headless) — the log is enough.
    }
}

# Raw TCP probe: is anything listening on the port at all?
function Test-PortOpen {
    param([int]$Port, [int]$TimeoutMs = 400)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async  = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok     = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($ok -and $client.Connected) { $client.Close(); return $true }
        $client.Close()
    } catch {}
    return $false
}

# Does OUR app answer? A bare open port is not enough — another dev server
# squatting on 1234 would otherwise send the browser to the wrong page.
function Test-AppServing {
    param([string]$Url, [int]$TimeoutSec = 3)
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
        if ($resp.StatusCode -ne 200) { return $false }
        return ($resp.Content -match "Piano MIDI Pro")
    } catch {
        return $false
    }
}

# Which process owns the port (for a useful conflict message)?
function Get-PortOwner {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
                Select-Object -First 1
        if ($conn) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) { return "$($proc.ProcessName) (PID $($proc.Id))" }
            return "PID $($conn.OwningProcess)"
        }
    } catch {}
    return $null
}

function Open-App {
    param([string]$Url, [switch]$AppWindow)

    if ($AppWindow) {
        $candidates = @(
            (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
            (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
            (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
            (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
            (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
        )
        foreach ($exe in $candidates) {
            if ($exe -and (Test-Path $exe)) {
                Write-Log "Opening app window via $exe"
                Start-Process -FilePath $exe -ArgumentList "--app=$Url"
                return
            }
        }
        Write-Log "No Chrome/Edge found for app window; falling back to default browser"
    }

    Write-Log "Opening default browser at $Url"
    Start-Process $Url
}

Write-Log "──────── Launcher started (port $Port, appWindow=$AppWindow) ────────"
Write-Log "Project root: $projectRoot"

# ── Preflight ────────────────────────────────────────────────────────────────
if (-not (Test-Path $appDir)) {
    Show-Error "No se encontró el directorio app\ en:`n$projectRoot"
    exit 1
}

# ── Already running? ─────────────────────────────────────────────────────────
if (Test-AppServing -Url $url) {
    Write-Log "App already serving on $Port — opening it (no new server)"
    if (-not $NoBrowser) { Open-App -Url $url -AppWindow:$AppWindow }
    exit 0
}

# ── Port taken by something else? ────────────────────────────────────────────
if (Test-PortOpen -Port $Port) {
    $owner = Get-PortOwner -Port $Port
    Show-Error ("El puerto $Port está ocupado por otro proceso" +
        $(if ($owner) { ": $owner" } else { "" }) +
        ".`n`nCerrá ese proceso o cambiá el puerto en app\vite.config.ts.")
    exit 1
}

# ── Node / npm available? ────────────────────────────────────────────────────
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
    Show-Error "No se encontró npm en el PATH.`nInstalá Node.js desde https://nodejs.org y reintentá."
    exit 1
}
Write-Log "Using npm: $($npmCmd.Source)"

# Dependencies installed?
if (-not (Test-Path (Join-Path $appDir "node_modules\vite"))) {
    Show-Error "Faltan las dependencias del proyecto.`n`nEjecutá una vez:`n  cd `"$appDir`"`n  npm install"
    exit 1
}

# ── Start the dev server, detached ───────────────────────────────────────────
Write-Log "Starting dev server in background (log: $serverLog)"
foreach ($f in @($serverLog, $serverErrLog)) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

# Start-Process with -RedirectStandardOutput/-RedirectStandardError (rather
# than ProcessStartInfo with UseShellExecute=false) is deliberate: it opens
# fresh file handles for the child instead of letting cmd.exe and node inherit
# ours. Without this the long-lived server keeps the caller's stdout pipe open,
# so running this script from a terminal makes that terminal hang until the
# server exits.
try {
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev" `
        -WorkingDirectory $appDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverLog `
        -RedirectStandardError $serverErrLog `
        -PassThru
} catch {
    Show-Error "No se pudo iniciar el servidor:`n$_"
    exit 1
}

Write-Log "Spawned npm run dev (pid=$($proc.Id))"
try { Set-Content -Path $pidFile -Value $proc.Id -Encoding ASCII } catch {}

# ── Wait for the app to actually serve ───────────────────────────────────────
$deadline = (Get-Date).AddSeconds($startTimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if (Test-AppServing -Url $url -TimeoutSec 2) { $ready = $true; break }
    if ($proc.HasExited) {
        Write-Log "Server process exited early with code $($proc.ExitCode)"
        break
    }
    Start-Sleep -Milliseconds 400
}

if (-not $ready) {
    $tail = ""
    try {
        $chunks = @()
        foreach ($f in @($serverLog, $serverErrLog)) {
            if (Test-Path $f) {
                $chunks += (Get-Content $f -Tail 15 -ErrorAction SilentlyContinue)
            }
        }
        $tail = ($chunks | Where-Object { $_ }) -join "`n"
    } catch {}
    Show-Error ("El servidor no respondió en $startTimeoutSec s.`n`n" +
        "Log del servidor: $serverLog`n`n$tail")
    exit 1
}

Write-Log "App is serving at $url"
if (-not $NoBrowser) { Open-App -Url $url -AppWindow:$AppWindow }
Write-Log "Launcher finished successfully"
exit 0
