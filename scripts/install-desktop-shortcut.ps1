# Creates a Piano MIDI Pro shortcut on the user's desktop.
# Double-clicking the shortcut runs the silent launcher (VBS), which
# starts the dev server (if not already running) and opens the browser.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$launcherVbs = Join-Path $scriptDir "launch-piano-midi-pro.vbs"
$iconPath = Join-Path $projectRoot "app\public\piano-midi-pro.ico"

if (-not (Test-Path $launcherVbs)) {
    Write-Host "[ERROR] No se encontro $launcherVbs" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $iconPath)) {
    Write-Host "[ERROR] No se encontro el icono $iconPath" -ForegroundColor Red
    Write-Host "Ejecuta primero: powershell -ExecutionPolicy Bypass -File scripts\generate-icon.ps1"
    exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Piano MIDI Pro.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

# wscript.exe runs .vbs with no console window flash
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = """$launcherVbs"""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath, 0"
$shortcut.Description = "Piano MIDI Pro - Lanza el servidor y abre el navegador"
$shortcut.WindowStyle = 7   # Minimized
$shortcut.Save()

Write-Host ""
Write-Host "[OK] Acceso directo creado en:" -ForegroundColor Green
Write-Host "     $shortcutPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Doble click en el icono del escritorio para abrir Piano MIDI Pro." -ForegroundColor Yellow
