' Piano MIDI Pro silent launcher.
' Runs the PowerShell launcher with no visible console window.

Option Explicit

Dim shell, fso, scriptDir, psScript, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Resolve the directory of this VBS file
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = fso.BuildPath(scriptDir, "launch-piano-midi-pro.ps1")

If Not fso.FileExists(psScript) Then
    MsgBox "No se encontro launch-piano-midi-pro.ps1 en " & scriptDir, vbCritical, "Piano MIDI Pro"
    WScript.Quit 1
End If

' 0 = hidden window, True = wait for completion (so the .ps1 itself
' decides when to exit; it stays alive only while waiting for the
' server to be reachable).
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & psScript & """"
shell.Run command, 0, False
