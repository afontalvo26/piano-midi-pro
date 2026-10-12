#
# Piano MIDI Pro - dev server expuesto en la red local (LAN)
#
# Pensado para probar la app desde el movil o la tablet: escucha en 0.0.0.0
# y muestra la IP que hay que abrir en el telefono.
#
# Para simplemente abrir la app en esta PC, usa el acceso directo del
# Escritorio ("Piano MIDI Pro") o scripts\launch-piano-midi-pro.ps1: arranca
# en localhost, espera a que la app responda y abre el navegador solo.
#
# NOTA: ambos usan el puerto 1234 (strictPort), asi que no pueden correr a la
# vez. Si ya hay uno levantado, este script lo avisa y no arranca otro.
#

$ErrorActionPreference = "Stop"

# Rutas relativas al propio script — sin rutas absolutas hardcodeadas
$appDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$port    = 1234
$url     = "http://localhost:$port/"
$logFile = Join-Path $env:TEMP "piano-midi-pro-server-lan.log"
$errFile = $logFile + ".err"

function Test-AppServing {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return ($r.StatusCode -eq 200 -and $r.Content -match "Piano MIDI Pro")
    } catch {
        return $false
    }
}

if (-not (Test-Path (Join-Path $appDir "node_modules\vite"))) {
    Write-Host "[ERROR] Faltan dependencias. Ejecuta primero:" -ForegroundColor Red
    Write-Host "        cd `"$appDir`"" -ForegroundColor Red
    Write-Host "        npm install" -ForegroundColor Red
    exit 1
}

# Already running (either flavour)? Don't fight over the port.
if (Test-AppServing) {
    Write-Host "[--] Ya hay un servidor sirviendo la app en el puerto $port." -ForegroundColor Yellow
    Write-Host "     No se arranca otro. Cerralo si quieres cambiar de modo." -ForegroundColor DarkGray
    exit 0
}

$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "[ERROR] El puerto $port esta ocupado por el PID $($busy[0].OwningProcess)." -ForegroundColor Red
    exit 1
}

Write-Host "Arrancando Vite en 0.0.0.0:$port  (log: $logFile)" -ForegroundColor Cyan

# RedirectStandard* keeps the child from inheriting (and holding open) this
# console's handles, so this script returns instead of hanging.
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npx vite --host 0.0.0.0 --port $port --strictPort" `
    -WorkingDirectory $appDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errFile

# Wait for it to actually serve before printing URLs
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-AppServing) { $ready = $true; break }
}

if (-not $ready) {
    Write-Host "[ERROR] El servidor no respondio. Ultimas lineas del log:" -ForegroundColor Red
    Get-Content $logFile -Tail 15 -ErrorAction SilentlyContinue
    Get-Content $errFile -Tail 15 -ErrorAction SilentlyContinue
    exit 1
}

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "[OK] Abri en el telefono (misma red WiFi):" -ForegroundColor Green
foreach ($ip in $ips) { Write-Host "     http://${ip}:$port/" -ForegroundColor Cyan }
Write-Host "     http://localhost:$port/   (en esta PC)" -ForegroundColor DarkGray
Write-Host ""
