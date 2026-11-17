$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
function Run-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Executable $($Arguments -join ' ')" }
}
try {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { throw 'Install Python 3.12 or newer from python.org and enable Add Python to PATH. Then reopen setup.bat.' }
    Run-Checked $pythonCommand.Source @('-c', 'import sys; sys.exit(0 if (3,12) <= sys.version_info < (3,15) else 1)')
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or 24 LTS from nodejs.org, then reopen setup.bat.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm is missing. Reinstall Node.js with npm included.' }
    Run-Checked 'node.exe' @('-e', 'if (Number(process.versions.node.slice(0,2)) < 22) process.exit(1)')
    $venvPython = Join-Path $projectRoot 'back\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Run-Checked $pythonCommand.Source @('-m', 'venv', (Join-Path $projectRoot 'back\.venv'))
    }
    # Stop only a launcher-owned server before replacing its code or dependencies.
    $localData = if ($env:LASTTRAIN_DATA_DIR) { $env:LASTTRAIN_DATA_DIR } else { Join-Path $projectRoot 'data' }
    if (Test-Path -LiteralPath (Join-Path $localData 'server.json')) {
        Run-Checked $venvPython @('back/launcher.py', 'stop')
    }
    Run-Checked $venvPython @('-m', 'pip', 'install', '-r', 'back/requirements.txt')
    Push-Location -LiteralPath (Join-Path $projectRoot 'front')
    try {
        # npm install keeps an existing development process's native binaries in
        # place; npm ci deletes node_modules and fails on Windows file locks.
        Run-Checked 'npm.cmd' @('install', '--no-audit', '--no-fund')
        Run-Checked 'npm.cmd' @('run', 'build')
    } finally { Pop-Location }
    Run-Checked $venvPython @('back/launcher.py', 'init')
    Run-Checked $venvPython @('back/launcher.py', 'doctor')
    Write-Host 'Setup complete. Double-click start.bat. Normal use needs no internet.' -ForegroundColor Green
} catch {
    Write-Host "Setup failed: $_" -ForegroundColor Red
    Write-Host 'Check your internet connection for installation, install the prerequisites, then run setup.bat again. Existing data is preserved.'
    exit 1
}
