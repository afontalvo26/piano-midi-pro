# Valida el checkout local sin modificar proyectos ni tomas personales.
# Usage: pwsh -NoProfile -File scripts/validate-studio.ps1 [-Full]
param([switch]$Full)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$runner = Join-Path $repo "scripts/run-bounded.ps1"

if (-not (Test-Path $runner)) { throw "Falta scripts/run-bounded.ps1" }
if (-not (Test-Path "node_modules")) { throw "Faltan dependencias raíz: npm ci" }
if (-not (Test-Path "app/node_modules")) { throw "Faltan dependencias app: npm ci --prefix app" }

$checks = @(
  @{ Label = "req113"; Command = "node scripts/audit-beatmaker-requirements.mjs"; Limit = 20; App = $false },
  @{ Label = "midi-fixtures"; Command = "node --test tests/unit/smk37-capture.test.mjs"; Limit = 20; App = $false },
  @{ Label = "studio-tsc"; Command = "npx tsc -b"; Limit = 180; App = $true },
  @{ Label = "studio-lint"; Command = "npx eslint src/audio/projectAudioSink.ts src/audio/renderProjectBusPcm.ts src/audio/renderProjectPcm.ts src/components/tracks/ProjectMixer.tsx src/components/tracks/ProjectBusResamplePanel.tsx src/project/busResampleRouting.ts src/project/mixRouting.ts"; Limit = 120; App = $true },
  @{ Label = "studio-build"; Command = "npx vite build"; Limit = 300; App = $true },
  @{ Label = "studio-dist"; Command = "node scripts/audit-studio-dist.mjs"; Limit = 20; App = $false },
  @{ Label = "studio-focal"; Command = "npx playwright test tests/e2e/project-bus-routing-preflight.spec.ts tests/e2e/project-bus-resample.spec.ts tests/e2e/project-studio-bus-resample.spec.ts tests/e2e/project-mixer-sends.spec.ts tests/e2e/project-four-bar-flow.spec.ts tests/e2e/project-bundle-preview.spec.ts tests/e2e/audio-live-voice.spec.ts --workers=1 --retries=0"; Limit = 540; App = $false }
)
if ($Full) {
  $checks += @{ Label = "studio-suite"; Command = "npx playwright test --workers=1 --retries=0"; Limit = 600; App = $false }
}

$results = @()
foreach ($check in $checks) {
  Write-Host ">>> $($check.Label): $($check.Command)"
  $arguments = @("-NoProfile", "-File", $runner, "-Command", $check.Command,
                 "-TimeoutSec", [string]$check.Limit, "-Label", $check.Label)
  if ($check.App) { $arguments += @("-Cwd", "app") }
  & pwsh @arguments
  $code = $LASTEXITCODE
  $results += [pscustomobject]@{ Test = $check.Label; ExitCode = $code }
}

Write-Host ""
Write-Host "=== RESULTADOS STUDIO ==="
$results | Format-Table -AutoSize | Out-Host
$failures = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($failures.Count -gt 0) {
  Write-Error "$($failures.Count) chequeos no aprobaron; revisar .logs. Hardware SMK-37 no certificado."
  exit 1
}
Write-Host "Software focal aprobado en esta corrida. Hardware SMK-37 y licencias externas: requieren aceptación aparte."
exit 0
