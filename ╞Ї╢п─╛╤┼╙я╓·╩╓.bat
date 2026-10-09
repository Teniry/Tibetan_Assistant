@echo off
setlocal
cd /d "%~dp0"
wscript.exe "%~dp0scripts\launch-muya.vbs"
endlocal
