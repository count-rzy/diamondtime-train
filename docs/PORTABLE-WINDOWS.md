# Windows portable build

The v0.3 delivery is a PyInstaller `onedir` bundle. `Start Last Train.exe`
starts the bundled Python/Django/Waitress server on `127.0.0.1`, waits for
`/api/health/`, then opens the selected local URL. The same runtime is copied
as `Stop Last Train.exe` and stops only the process recorded in this profile's
`server.json`. The compiled Vite files live under `_internal/front/dist`.

## Build on Windows x64

Use Python 3.14.5 (or a compatible Python 3.12–3.14 version) and Node.js 22+
on the build machine. The target computer needs neither runtime.

```powershell
python -m venv back\.venv
back\.venv\Scripts\python.exe -m pip install -r packaging\requirements-build.txt
cd front
npm ci
cd ..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging\build.ps1
```

The finished bundle is `dist/LastTrain-Windows-x64/`; the deliverable is
`dist/LastTrain-v0.3.0-Windows-x64.zip`. The build script replaces only those
generated artifacts, not `data/`, source files, or personal profiles. It does
not include a database, `node_modules`, the virtual environment, Git metadata,
or `.env` files. Source-based `setup.bat`, `start.bat`, and `stop.bat` remain
available.

## User data and upgrade

Normal portable storage is `%LOCALAPPDATA%\LastTrain\data`. An absolute
`LASTTRAIN_DATA_DIR` override is supported for isolated tests or explicit
advanced setups. Startup creates the directory and SQLite database on first
launch. On later launches, it checks integrity and applies pending migrations
only when necessary. The existing `initialize()` routine creates a consistent
pre-migration backup before changing an existing database. Backups and
imported audio remain in the data directory when application binaries change.

Source installations can have `data/lasttrain.sqlite3` beside their checkout.
Migration into the portable profile is deliberately explicit:

1. Stop the source server with `stop.bat`.
2. Run `backup.bat` in the old checkout and copy its backup ZIP to a safe place.
3. If `%LOCALAPPDATA%\LastTrain\data\lasttrain.sqlite3` already exists, stop.
   Do not overwrite it or merge two SQLite files by hand.
4. If the destination database does not exist, copy the *entire* old `data/`
   directory to `%LOCALAPPDATA%\LastTrain\data`, including `user-files/`.
5. Start the portable EXE. It checks and migrates the copied database, creating
   another backup before any schema change. Check saved journeys, diary notes,
   imported music, and profiles. Keep the old directory and backup ZIP until
   verification is complete.

If an old database is adjacent to the extracted EXE while the portable profile
is empty, startup stops with an explanatory message rather than silently
creating a separate profile. For existing portable profiles, use the app's
backup and export features; automatic database merging is unsupported.

## Verification

```powershell
back\.venv\Scripts\python.exe scripts\test_portable.py --browser
```

This extracts the ZIP into a disposable path with spaces, Cyrillic, Armenian,
and `&`; supplies an empty `LOCALAPPDATA`; removes Python and Node from the
packaged process's `PATH`; exercises the actual EXE, SQLite initialization,
HTTP assets, browser flows, stop/restart, and binary replacement. The test
uses local Playwright/Chrome only for browser automation. It is not a clean
Windows VM test. Real speaker output and Windows 10 compatibility still need
separate machine checks.

Startup errors appear in `%LOCALAPPDATA%\LastTrain\logs\startup.log` and
server errors in `data\server.log`. Closing the browser leaves the local server
running; double-click `Stop Last Train.exe` to shut it down.
