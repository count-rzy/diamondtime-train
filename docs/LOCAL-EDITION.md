# Local edition engineering notes

## Architecture and ownership

Waitress binds to `127.0.0.1`. Django serves the production Vite build, raster artwork, managed audio and the relative `/api/` routes. Only known React routes receive the index fallback; unknown API and asset paths return 404. Vite remains a development tool.

The Django User table and old migrations remain for data compatibility. `LocalContext` selects one local owner, with no password, JWT or browser session required. Fresh installations create one traveler. Existing users, journeys, diary entries and settings keep their IDs and foreign keys. With multiple old accounts, the carriage displays a notice and Settings offers **Stored profiles**, including record counts. Switching the selected profile does not merge or delete records. This is a personal local application, not an access boundary between people using the same Windows account.

The first normal setup snapshots `back/db.sqlite3` into `data/lasttrain.sqlite3` using SQLite's backup API, only if the target is absent or empty. It never replaces a populated target or changes the old database. A pre-migration ZIP is created on each subsequent initialization. Migration 0002 now reconciles expired active journeys before adding its uniqueness constraint. If an older database contains multiple genuinely unfinished journeys per user, initialization stops without dropping records and reports the conflicting owners; resolve these in the older application before retrying. Already-applied migrations are not replayed.

## Time semantics

UTC timestamps are authoritative. Time while the browser is closed, the process is stopped, or the computer sleeps counts toward an active journey. Paused time does not count. Reopening or reading the API reconciles an overdue journey at its scheduled arrival, not at the later read time. The browser interpolates snapshots using a monotonic clock and refreshes them every 30 seconds and on visibility changes. Moving the system clock forward can finish a journey; moving it backward can delay arrival. Elapsed time and pause adjustments are clamped to zero. There is no external time server.

## Local security

Host validation, loopback address validation, same-origin checks and Fetch Metadata checks reject external origins. DRF local authentication explicitly enforces Django CSRF on writes, including the anonymous local workflow. The client gets a token from `/api/auth/csrf/`. There is no wildcard CORS. CSP disallows external scripts, fonts, media and connections. API responses are not cached. No shell commands are exposed through HTTP.

Uploads are limited to 100 MB and WAV/MP3/Ogg/FLAC signatures. Files receive random managed names; the browser never supplies a filesystem path. The browser decoder remains the final codec validator and displays an error for unsupported or corrupt content. Audio streams support byte-range seeking. Synthesized ambient sound is generated locally; no third-party songs are bundled.

DM Sans, Noto Sans (Cyrillic) and Press Start 2P are bundled by Vite from Fontsource packages. Their SIL Open Font Licenses are retained in `docs/licenses/`; no Google Fonts connection is needed. Font files remain separate same-origin assets to satisfy CSP.

## Language and audio

`src/locales/en.json`, `ru.json` and `extra.js` contain matching translation keys. `i18n.js` handles interpolation, Russian plurals and locale formatting. SQLite stores the language; localStorage only caches it for startup. Migrations 0005–0006 add language and independent audio preferences without changing journey or diary content.

`TrainAudioEngine` owns one lazily created Web Audio context, a shared four-second noise buffer, bounded scheduled voices and a master compressor. The radio retains its own independent context and original three tracks. Gain ramps avoid abrupt volume changes; paused/approaching/completed journey states change the soundscape. Hidden-page handlers suspend contexts and timers; teardown closes contexts and disconnects nodes. Failed journey refresh suspends ambience and signals the radio to stop when the local server becomes unavailable. Playback is not promised before a permitted interaction.

## Process and data safety

Windows file locks serialize launcher operations and prevent two servers using the same data directory. State records contain PID, creation time, launcher path and a random instance token. Readiness checks verify that token. Stop additionally verifies the process command line and creation time before terminating it; stale state never authorizes killing a different process. SQLite transactions recover interrupted writes. Port conflicts are tried over a 30-port range starting at 8765.

Backups use SQLite's online backup API and include only managed audio referenced by the snapshot. ZIPs have unique names. Restore is offline, requires typing RESTORE, validates the member allowlist, size limits, database integrity, foreign keys, migration compatibility and audio presence, and creates a safety backup before replacement. Old audio is retained for recovery. Backup and exported JSON contain personal data and should be stored privately.

## Verification commands

From the repository root, after setup:

```powershell
.\back\.venv\Scripts\python.exe back/manage.py test journeys
.\back\.venv\Scripts\python.exe back/manage.py makemigrations --check --dry-run
.\back\.venv\Scripts\python.exe -m pip check
.\back\.venv\Scripts\python.exe scripts/test_launcher.py
.\back\.venv\Scripts\python.exe scripts/test_setup.py
cd front
npm test
npm run build
npx prettier --check src index.html vite.config.js
npx playwright test
node scripts/audio-soak.mjs
```

The Playwright scenarios require installed Chrome. They create a separate `.local-qa/run-*` database, block external browser requests, test Russian/English UI flows, restart, backup/restore and six viewports, then stop the owned server and delete the disposable database. Screenshots and failure traces are written under `.local-qa/`, excluded from Git. They never use the personal data directory. `audio-soak.mjs` measures two minutes of continuous travel and repeated radio switching in its own disposable database. `test_setup.py` installs into a disposable project copy with fresh dependencies and needs installation network access; it uses the already installed system Python and Node.

Manual checks still useful on another PC: clean-machine installation, physical speaker output, non-ASCII installation path, actual Windows sleep/resume, multi-hour sessions and codec behavior for the user's own audio files. Synthetic visibility events and short memory measurements do not establish those results.
