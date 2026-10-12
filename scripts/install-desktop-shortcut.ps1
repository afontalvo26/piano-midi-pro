#
# Creates (or refreshes) the "Piano MIDI Pro" shortcut on the user's desktop.
#
# Double-clicking the shortcut runs the silent launcher (VBS), which starts
# the dev server if it is not already running and opens the app.
#
#   -AppWindow   bake in a chromeless app window (Chrome/Edge) instead of a tab
#   -Remove      delete the shortcut instead of creating it
#
# Re-running is safe: an existing shortcut is overwritten.
#

[CmdletBinding()]
param(
    [switch]$AppWindow,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$launcherVbs = Join-Path $scriptDir "launch-piano-midi-pro.vbs"
$iconPath    = Join-Path $projectRoot "app\public\piano-midi-pro.ico"
$shortcutName = "Piano MIDI Pro.lnk"

$desktop = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrWhiteSpace($desktop)) {
    Write-Host "[ERROR] No se pudo localizar el Escritorio del usuario." -ForegroundColor Red
    exit 1
}
$shortcutPath = Join-Path $desktop $shortcutName

# ── Remove mode ──────────────────────────────────────────────────────────────
if ($Remove) {
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force
        Write-Host "[OK] Acceso directo eliminado: $shortcutPath" -ForegroundColor Green
    } else {
        Write-Host "[--] No existía: $shortcutPath" -ForegroundColor Yellow
    }
    exit 0
}

# ── Validate what the shortcut will point at ─────────────────────────────────
if (-not (Test-Path $launcherVbs)) {
    Write-Host "[ERROR] No se encontró el lanzador:" -ForegroundColor Red
    Write-Host "        $launcherVbs" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $iconPath)) {
    Write-Host "[ERROR] No se encontró el icono:" -ForegroundColor Red
    Write-Host "        $iconPath" -ForegroundColor Red
    Write-Host "        Generálo con: powershell -ExecutionPolicy Bypass -File scripts\generate-icon.ps1" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path (Join-Path $projectRoot "app\package.json"))) {
    Write-Host "[ERROR] No parece un checkout de Piano MIDI Pro: falta app\package.json" -ForegroundColor Red
    exit 1
}

# ── Build the shortcut ───────────────────────────────────────────────────────
$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

# wscript.exe runs the .vbs with no console window flash.
$shortcut.TargetPath       = "wscript.exe"
$shortcut.Arguments        = "`"$launcherVbs`"" + $(if ($AppWindow) { " -AppWindow" } else { "" })
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation     = "$iconPath, 0"
$shortcut.Description      = "Piano MIDI Pro — inicia el servidor y abre la app"
$shortcut.WindowStyle      = 7   # Minimized
$shortcut.Save()

# ── Verify it landed ─────────────────────────────────────────────────────────
if (-not (Test-Path $shortcutPath)) {
    Write-Host "[ERROR] El acceso directo no se pudo crear." -ForegroundColor Red
    exit 1
}

$check = $shell.CreateShortcut($shortcutPath)
Write-Host ""
Write-Host "[OK] Acceso directo creado en el Escritorio:" -ForegroundColor Green
Write-Host "     $shortcutPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "     Destino : $($check.TargetPath) $($check.Arguments)" -ForegroundColor DarkGray
Write-Host "     Icono   : $($check.IconLocation)" -ForegroundColor DarkGray
if ($AppWindow) {
    Write-Host "     Modo    : ventana de app (Chrome/Edge)" -ForegroundColor DarkGray
} else {
    Write-Host "     Modo    : navegador por defecto" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Doble clic en el icono del Escritorio para abrir Piano MIDI Pro." -ForegroundColor Yellow
Write-Host "Si ya está corriendo, solo abre la app (no levanta otro servidor)." -ForegroundColor DarkGray
Write-Host ""
