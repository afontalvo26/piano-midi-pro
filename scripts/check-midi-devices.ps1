$ErrorActionPreference = 'Stop'

Write-Output 'Dispositivos MIDI/audio presentes en Windows:'
$devices = Get-PnpDevice -PresentOnly | Where-Object {
    $_.FriendlyName -match '(?i)SMK|MIDI|USB Audio|Loopback|Virtual Cable'
}
if (-not $devices) {
    Write-Output 'Ningún nombre coincide. Un controlador MIDI genérico puede aparecer con otro nombre.'
} else {
    $devices | Format-Table -Property Class, FriendlyName, Status -AutoSize | Out-String | Write-Output
}
