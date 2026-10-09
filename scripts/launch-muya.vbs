Option Explicit

Dim fileSystem, shell, scriptsDirectory, projectRoot, powerShellScript, command
Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptsDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fileSystem.GetParentFolderName(scriptsDirectory)
powerShellScript = fileSystem.BuildPath(scriptsDirectory, "muya-launcher.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File " & Chr(34) & powerShellScript & Chr(34)

shell.Run command, 0, False
