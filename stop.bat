@echo off
setlocal
cd /d "%~dp0"
if not exist "back\.venv\Scripts\python.exe" (
  echo Run setup.bat first.
  if not defined LASTTRAIN_NONINTERACTIVE pause
  exit /b 1
)
"back\.venv\Scripts\python.exe" "back\launcher.py" stop %*
set "result=%errorlevel%"
if not "%result%"=="0" echo Last Train could not complete the operation. Read the error above.
if not defined LASTTRAIN_NONINTERACTIVE pause
exit /b %result%
