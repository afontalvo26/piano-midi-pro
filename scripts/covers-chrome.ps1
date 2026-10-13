# ============================================================
# covers-chrome.ps1 — launch a real Chromium with the DevTools protocol open,
# so scripts/covers-discover.mjs can drive it.
#
#   pwsh -File scripts/covers-chrome.ps1            # headless (default)
#   pwsh -File scripts/covers-chrome.ps1 -Headful   # watch it work
#
# Writes the endpoint to $env:TEMP\pm-cdp.txt and prints it. The browser keeps
# running after this script exits, which is the point: the sweep takes ~25
# minutes and later runs reuse the same session.
#
# Chromium's IPC needs named pipes, which a confined sandbox blocks, so this has
# to run unsandboxed.
# ============================================================

param(
  [int]$Port = 9222,
  [string]$Profile = "$env:TEMP\pm-spotify-profile",
  [switch]$Headful
)

$ErrorActionPreference = "Stop"

# Newest full Chromium (not the headless shell — that one always runs in
# headless mode and cannot be reused headful).
$chrome = Get-ChildItem "$env:LOCALAPPDATA\ms-playwright" -Directory -Filter "chromium-*" |
  Where-Object { $_.Name -notmatch "headless" } |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "chrome-win64\chrome.exe" } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1

if (-not $chrome) { throw "No bundled Chromium found under $env:LOCALAPPDATA\ms-playwright." }
if (-not (Test-Path $Profile)) { New-Item -ItemType Directory -Force -Path $Profile | Out-Null }

$chromeArgs = @(
  "--remote-debugging-port=$Port"
  "--user-data-dir=$Profile"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-extensions"
  "--disable-background-networking"
  "--disable-sync"
  "--disable-breakpad"
  "--no-sandbox"
  "--lang=es-CO"
  "--window-size=1280,900"
)
if (-not $Headful) { $chromeArgs += "--headless=new" }

$errLog = Join-Path $env:TEMP "pm-chrome-$Port.err.txt"
$outLog = Join-Path $env:TEMP "pm-chrome-$Port.out.txt"
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -PassThru `
  -RedirectStandardError $errLog -RedirectStandardOutput $outLog

# Poll the DevTools endpoint (bounded: 40 x 500 ms = 20 s).
$endpoint = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) { break }
  try {
    $version = Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 3
    if ($version.webSocketDebuggerUrl) { $endpoint = $version.webSocketDebuggerUrl; break }
  } catch { }
}

if (-not $endpoint) {
  Write-Host "CHROMIUM FAILED (exited=$($proc.HasExited))"
  Get-Content $errLog -ErrorAction SilentlyContinue | Select-Object -First 12
  exit 1
}

# Playwright accepts either shape; the plain HTTP endpoint is steadier across
# browser restarts, so that is what gets written for the scripts to reuse.
$httpEndpoint = "http://127.0.0.1:$Port"
$httpEndpoint | Set-Content (Join-Path $env:TEMP "pm-cdp.txt") -NoNewline

Write-Host "PID     = $($proc.Id)"
Write-Host "CHROME  = $chrome"
Write-Host "CDP     = $httpEndpoint"
Write-Host ""
Write-Host 'Next:  $env:SPOTIFY_CDP = (Get-Content $env:TEMP\pm-cdp.txt -Raw).Trim()'
Write-Host "       node scripts/covers-discover.mjs"
