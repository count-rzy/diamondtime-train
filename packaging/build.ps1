$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$python = Join-Path $root 'back\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run setup.bat first to create back\.venv.' }
& npm.cmd --prefix front run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& $python -m PyInstaller --noconfirm --clean packaging/lasttrain.spec
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed.' }
$dist = Join-Path $root 'dist\LastTrain-Windows-x64'
Copy-Item -LiteralPath (Join-Path $dist 'Start Last Train.exe') -Destination (Join-Path $dist 'Stop Last Train.exe')
Copy-Item -LiteralPath (Join-Path $root 'packaging\README.txt') -Destination (Join-Path $dist 'README.txt')
& $python packaging/make_zip.py
if ($LASTEXITCODE -ne 0) { throw 'ZIP creation failed.' }
