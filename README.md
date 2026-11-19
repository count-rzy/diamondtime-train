# Last Train — Local Edition

## Windows portable edition (v0.3)

For use without installing Python or Node.js, download
`LastTrain-v0.3.0-Windows-x64.zip`, extract it, and double-click
**Start Last Train.exe**. Use **Stop Last Train.exe** to stop the local server.
The portable edition stores data in `%LOCALAPPDATA%\LastTrain\data`, so replacing
the program folder preserves journeys and notes. See the included `README.txt`
for migration from an older source installation and
[portable build instructions](docs/PORTABLE-WINDOWS.md).

The requirements and `setup.bat` instructions below apply to the source edition.

Last Train is a quiet pixel-art carriage for focused journeys, diary notes and offline music. The landscape changes as your journey progresses. Your trips, notes and preferences stay on your computer.

## Requirements

- Windows 10 or 11, Python **3.12–3.14**, Node.js **22+** (22 or 24 LTS recommended), and a modern browser.
- Install Python with **Add Python to PATH** enabled. Node.js includes npm.
- Internet is needed for the initial dependency installation. Normal use is offline.
- No account, cloud database, administrator rights, Electron or Tauri required.

## Installation

1. Download the repository ZIP from GitHub (select `feature/full-implementation` while this work is on that branch), or clone it.
2. Extract it into a writable folder. Do not run inside the ZIP.
3. Double-click **setup.bat**. It creates an isolated Python environment, installs dependencies, builds the interface and safely initializes SQLite.
4. When setup reports success, double-click **start.bat**.

The browser opens automatically, normally at `http://127.0.0.1:8765/`. The launcher chooses another port if needed. Create a journey directly from the carriage; there is no sign-in. One local server handles everything.

Running setup again preserves data. It may need internet again to check/install dependencies.

## Starting and stopping

- **start.bat** checks the database, migrations and graphics, waits for the actual server response, then opens your browser. Running it twice reuses the same server.
- **stop.bat** stops only the Last Train process owned by this launcher.
- Closing the browser does not stop the server. Closing or stopping the app does not erase progress.
- **doctor.bat** checks the local installation and prints the data location.

Active journey time continues while the app is closed or the computer sleeps. Pause a journey to suspend its timer. System clock changes affect the scheduled arrival; see the [time rules](docs/LOCAL-EDITION.md#time-semantics).

## Where your data lives

```text
data/
  lasttrain.sqlite3    journeys, diary, preferences and local profile
  user-files/         imported audio
  backups/            portable backup ZIPs
  server.log          launcher/server errors
```

This directory is ignored by Git. Settings shows its full location. For an external folder, set the Windows environment variable `LASTTRAIN_DATA_DIR` to an absolute path before setup and use the same value for every launch. `.env` files are examples only; they are not loaded automatically.

Existing `back/db.sqlite3` is copied safely during the first standard setup and left untouched. If it contains several profiles, Settings → **Stored profiles** opens their preserved records without passwords. No accounts are deleted or merged.

## Backups, export and restore

- Click **Create backup** in Settings or run **backup.bat**. Each ZIP contains a consistent SQLite snapshot plus imported audio.
- Copy important backups outside the project folder.
- **Export journeys & diary** in Settings downloads readable JSON for the selected profile. It is an export, not a full restore archive.
- To restore: run **stop.bat**, run **restore.bat**, enter the full backup ZIP path and type **RESTORE**. A safety backup of the current data is saved first. Then run **start.bat**.

**Deleting or replacing the entire project directory can also delete your data/ folder. Keep an external backup.**

## Music and preferences

The cabin radio has locally synthesized ambient tracks. Expand it to select a playlist or import your own WAV, MP3, Ogg or FLAC files (up to 100 MB each). Imported files are copied into the local application folder and remain available after restart. Browser codec support varies; invalid or missing audio displays an error. Only import music you have permission to use.

New installations open in Russian. **Настройки → Язык / Settings → Language** switches Russian and English immediately and saves the choice in SQLite. Your own titles, stations, notes and imported track names are never translated. Cyrillic fonts are bundled locally.

Train ambience is separate from the three original radio tracks: locomotive rumble, wheels, vibration, wind, occasional horn and optional rain are synthesized locally. Settings provides independent train/radio volumes, ambience mute, horn and weather controls. Movement quietens on pause and slows near arrival. Audio starts after a permitted interaction; the sound button offers an explicit retry if the browser blocks it. Hidden tabs suspend sound and animation; returning resumes previously enabled playback. Closing the page releases audio resources.

Settings also saves your display name, reduced motion, particles, weather, animation intensity, pixel rendering and preferred atmosphere.

## Updating from GitHub

1. Make an external backup and run **stop.bat**.
2. With a Git clone, review/preserve your local source changes before pulling updates.
3. With ZIP downloads, extract the new version to a different folder. Copy your `data/` folder into it while Last Train is stopped, or use the same external `LASTTRAIN_DATA_DIR`.
4. Run the new **setup.bat**, then **start.bat**. Keep the old folder until your data is verified.

Do not copy a live SQLite file by itself. Use the backup workflow, or copy the complete data folder only after stopping the app. The portable ZIP is a separate build artifact; no GitHub Release is published automatically.

## Troubleshooting

- **Python or npm missing:** install the prerequisites, reopen the setup window and try again.
- **Dependency download failed:** installation needs internet and access to PyPI/npm. Rerun setup once the connection is available.
- **Build or migrations missing:** run setup again. It makes a pre-migration backup.
- **Browser did not open:** use the exact URL printed by start.bat.
- **Server will not start:** run doctor.bat and inspect `data/server.log`. Avoid running from a read-only folder.
- **Port occupied:** the launcher tries neighboring ports; optionally set `LASTTRAIN_PORT`.
- **Maintenance says the app is running:** run stop.bat before setup or restore.
- **Old simultaneous journeys block migration:** no records were removed. Resolve the listed unfinished journeys in the old application, then retry. Expired journeys are completed automatically using their saved arrival time.

## Developer workflow

Production use runs Waitress through start.bat. For development, stop the launcher and use two terminals:

```powershell
# Terminal 1, repository root
.\back\.venv\Scripts\python.exe back/manage.py runserver 127.0.0.1:8000

# Terminal 2
cd front
npm run dev
```

Open the Vite address. Requests use relative `/api/` paths with a same-origin development proxy. Production always binds to `127.0.0.1`; it is not intended for LAN or public hosting.

See [architecture, migration and test instructions](docs/LOCAL-EDITION.md), and [the existing pixel-art pipeline](front/art/ART_DIRECTION.md). No original raster assets are replaced by this migration.
