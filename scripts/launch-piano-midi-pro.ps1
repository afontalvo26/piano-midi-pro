#
# Piano MIDI Pro launcher
#
# Boots the Vite dev server in the background (no visible window),
# waits for the port to become reachable, and opens the user's
# default browser at http://localhost:5173/.
#
# If the dev server is already running on that port, it just opens
# the browser without spawning a new instance.
#

$ErrorActionPreference = "Stop"

# Load WinForms once for any MessageBox calls below.
try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue } catch {}

# Resolve the project root (this script lives in <root>/scripts/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$appDir = Join-Path $projectRoot "app"
$port = 5173
$url = "http://localhost:$port/"
$logFile = Join-Path $env:TEMP "piano-midi-pro-launcher.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$timestamp] $Message" -Encoding UTF8
}

# Robust check using a TCP connect to localhost. Uses Dns to resolve all
# addresses (so IPv4-only or IPv6-only servers both work). Falls back to
# trying any returned address until one succeeds.
function Test-PortReachable {
    param([int]$Port, [int]$TimeoutMs = 500)
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses("localhost")
    } catch {
        $addresses = @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)
    }
    foreach ($ip in $addresses) {
        try {
            $family = $ip.AddressFamily
            $sock = New-Object System.Net.Sockets.Socket $family, ([System.Net.Sockets.SocketType]::Stream), ([System.Net.Sockets.ProtocolType]::Tcp)
            $endpoint = New-Object System.Net.IPEndPoint $ip, $Port
            $async = $sock.BeginConnect($endpoint, $null, $null)
            $waited = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
            if ($waited -and $sock.Connected) {
                $sock.EndConnect($async)
                $sock.Close()
                return $true
            }
            $sock.Close()
        } catch {
            # try next address
        }
    }
    return $false
}

Write-Log "Launcher started"
Write-Log "Project root: $projectRoot"

if (-not (Test-Path $appDir)) {
    try {
        [System.Windows.Forms.MessageBox]::Show(
            "No se encontro el directorio app/ en:`n$projectRoot",
            "Piano MIDI Pro - Error",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {}
    Write-Log "ERROR: app dir not found"
    exit 1
}

# If already reachable, just open the browser and exit.
if (Test-PortReachable -Port $port -TimeoutMs 250) {
    Write-Log "Server already running on port $port; opening browser"
    Start-Process $url
    exit 0
}

Write-Log "Server not running; spawning npm run dev in background"

# Start the dev server fully detached. Use cmd.exe with output redirected to
# log files so npm doesn't block on a full pipe buffer when nobody is reading
# its stdout. The "start" command + /b makes cmd return immediately.
$serverLog = Join-Path $env:TEMP "piano-midi-pro-server.log"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c npm run dev > `"$serverLog`" 2>&1"
$psi.WorkingDirectory = $appDir
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = "Hidden"

$proc = [System.Diagnostics.Process]::Start($psi)
Write-Log "Spawned npm run dev (pid=$($proc.Id))"

# Persist the pid so a future "stop" script could find it
$pidFile = Join-Path $env:TEMP "piano-midi-pro-launcher.pid"
Set-Content -Path $pidFile -Value $proc.Id

# Wait up to 90 seconds for the port to become reachable.
$maxWaitMs = 90000
$startMs = [Environment]::TickCount
while (-not (Test-PortReachable -Port $port -TimeoutMs 300)) {
    if (([Environment]::TickCount - $startMs) -gt $maxWaitMs) {
        Write-Log "Timed out waiting for server (server log: $serverLog)"
        try {
            [System.Windows.Forms.MessageBox]::Show(
                "El servidor no respondio en 90 s.`nLog launcher: $logFile`nLog server: $serverLog",
                "Piano MIDI Pro",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
        } catch {}
        exit 1
    }
    Start-Sleep -Milliseconds 500
}

Write-Log "Server reachable; opening browser at $url"
Start-Process $url

Write-Log "Launcher finished successfully"
