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

$unitFiles = @(Get-ChildItem tests -Recurse -File |
  Where-Object { $_.Name -match '\.test\.(mjs|ts|js)$' } |
  ForEach-Object { $_.FullName.Substring($repo.Length + 1) })
$unitSuite = "node --test " + ($unitFiles -join ' ')

$checks = @(
  @{ Label = "req113"; Command = "node scripts/audit-beatmaker-requirements.mjs"; Limit = 20; App = $false },
  @{ Label = "sdd-evidence"; Command = "node scripts/verify-beatmaker-acceptance.mjs --check"; Limit = 20; App = $false },
  @{ Label = "midi-fixtures"; Command = "node --test tests/unit/smk37-capture.test.mjs"; Limit = 20; App = $false },
  @{ Label = "acceptance-unit"; Command = "node --test tests/unit/beatmaker-acceptance-gate.test.mjs"; Limit = 60; App = $false },
  @{ Label = "reference-unit"; Command = "node --test tests/unit/automation-edit.test.mjs tests/unit/automation-midi.test.mjs tests/unit/drum-pad-midi.test.mjs tests/unit/drum-rack-velocity.test.mjs tests/unit/arrangement-model.test.mjs tests/unit/instrument-catalog.test.ts tests/project-sample-voice.test.mjs"; Limit = 120; App = $false },
  @{ Label = "unit-suite"; Command = $unitSuite; Limit = 240; App = $false },
  @{ Label = "studio-tsc"; Command = "npx tsc -b"; Limit = 180; App = $true },
  @{ Label = "studio-lint"; Command = "npx eslint ."; Limit = 240; App = $true },
  @{ Label = "studio-build"; Command = "npx vite build"; Limit = 300; App = $true },
  @{ Label = "studio-dist"; Command = "node scripts/audit-studio-dist.mjs"; Limit = 20; App = $false },
  @{ Label = "studio-focal"; Command = "npx playwright test tests/e2e/project-bus-routing-preflight.spec.ts tests/e2e/project-bus-resample.spec.ts tests/e2e/project-studio-bus-resample.spec.ts tests/e2e/project-mixer-sends.spec.ts tests/e2e/project-four-bar-flow.spec.ts tests/e2e/project-bundle-preview.spec.ts tests/e2e/audio-live-voice.spec.ts --workers=1 --retries=0"; Limit = 540; App = $false },
  @{ Label = "reference-focal"; Command = "npx playwright test tests/e2e/studio-reference-ui.spec.ts tests/e2e/sequencer-transport.spec.ts tests/e2e/project-mixer-sends.spec.ts tests/e2e/project-mixer-effects-ui.spec.ts tests/e2e/project-sidechain.spec.ts tests/e2e/project-automation-audio.spec.ts tests/e2e/project-studio-automation-flow.spec.ts tests/e2e/mono-user-sample.spec.ts tests/e2e/project-studio-sample-voice.spec.ts tests/e2e/beatmaker-drum-rack.spec.ts tests/e2e/drum-rack-audio.spec.ts --workers=1 --retries=0"; Limit = 600; App = $false }
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
