# Arranca los dos servidores de desarrollo como procesos INDEPENDIENTES.
# No dependen de ningún agente ni de esta terminal: sobreviven a todo.
#   Piano      -> http://localhost:1234   (app/)
#   Reproductor-> http://localhost:1235   (player/)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# `player/` y `packages/` viven fuera de `app/`, que es donde está el único
# node_modules real. Node y TypeScript buscan los paquetes caminando HACIA
# ARRIBA desde el archivo que importa, así que un archivo en `packages/engine/`
# busca `tone` en `packages/node_modules` y después en la raíz (donde sólo está
# Playwright): nunca mira `app/node_modules`. Sin estos enlaces las dos apps
# fallan con "Cannot find module 'tone'" (y con errores en cascada que parecen
# otra cosa). Son JUNCTIONS, no copias: los tres caminos apuntan a los mismos
# archivos, así que Tone se instancia UNA vez. Dos copias serían dos
# AudioContext, o sea dos grafos de audio que no se ven entre sí.
function Ensure-NodeModulesLink([string]$dir) {
  $ruta = Join-Path $root $dir
  if (-not (Test-Path $ruta)) { return }
  $link = Join-Path $ruta "node_modules"
  if (Test-Path $link) { return }
  New-Item -ItemType Junction -Path $link -Target (Join-Path $root "app\node_modules") | Out-Null
  Write-Host "[enlace] $dir/node_modules -> app/node_modules"
}
Ensure-NodeModulesLink "player"
Ensure-NodeModulesLink "packages"

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
Start-DevServer "reproductor" "player" 1235 "--port 1235"

Write-Host ""
Write-Host "Esperando a que respondan..."
foreach ($p in 1234, 1235) {
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 700
    try { $r = Invoke-WebRequest -Uri "http://localhost:$p/" -TimeoutSec 3 -UseBasicParsing; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}
  }
  if ($ok) { Write-Host "  OK  http://localhost:$p" } else { Write-Host "  FALLA  http://localhost:$p (mirá el log)" }
}
