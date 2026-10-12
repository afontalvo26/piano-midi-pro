' Piano MIDI Pro - silent launcher.
'
' Runs launch-piano-midi-pro.ps1 with no visible console window.
' Any arguments given to this .vbs are forwarded to the PowerShell script,
' so a shortcut can pass e.g.  -AppWindow  to open a chromeless app window.
'
' Exit behaviour: the PowerShell script stays alive while it waits for the
' server, so we launch it hidden and return immediately.

Option Explicit

Dim shell, fso, scriptDir, psScript, command, args, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Resolve the directory of this .vbs (it lives next to the .ps1)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = fso.BuildPath(scriptDir, "launch-piano-midi-pro.ps1")

If Not fso.FileExists(psScript) Then
    MsgBox "No se encontro launch-piano-midi-pro.ps1 en " & scriptDir, vbCritical, "Piano MIDI Pro"
    WScript.Quit 1
End If

' Forward any extra arguments verbatim
args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " " & WScript.Arguments(i)
Next

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & psScript & """" & args

' 0 = hidden window, False = do not wait (the .ps1 keeps running on its own)
shell.Run command, 0, False
