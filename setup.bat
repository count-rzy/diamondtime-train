@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
set "result=%errorlevel%"
if not defined LASTTRAIN_NONINTERACTIVE pause
exit /b %result%
