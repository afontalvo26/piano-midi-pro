# Arranca el piano como proceso independiente en http://localhost:1234.
# No depende de ningún agente ni de esta terminal: sobrevive a todo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Start-DevServer([string]$nombre, [string]$dir, [int]$puerto, [string]$archivo) {
  $vivo = $null
  try { $vivo = Invoke-WebRequest -Uri "http://localhost:$puerto/" -TimeoutSec 3 -UseBasicParsing } catch {}
  if ($vivo) { Write-Host "[$nombre] ya responde en $puerto (HTTP $($vivo.StatusCode))"; return }

  $log = Join-Path $root ".logs\server-$nombre.log"
  New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
  # -WindowStyle Hidden + proceso propio: no muere cuando cierra la terminal que lo lanzó.
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npx vite $archivo > `"$log`" 2>&1" `
    -WorkingDirectory (Join-Path $root $dir) `
    -WindowStyle Hidden | Out-Null
  Write-Host "[$nombre] arrancando en $puerto (log: .logs\server-$nombre.log)"
}

Start-DevServer "piano" "app" 1234 ""
