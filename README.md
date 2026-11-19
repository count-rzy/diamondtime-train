# Last Train

> **In the end… it matters how far the train has traveled.**

Last Train turns focused work into a railway journey. Set a timer, settle into a pixel-art carriage, and let time pass as the train travels through changing scenery. Your journeys, diary and preferences stay in a local profile on your computer.

## Last Train v1.0 EXP — Experimental Pre-release

This is an experimental build. Some features and workflows may still contain bugs. Back up your data before major updates.

## Features

- Configure journeys with work and rest periods, then review completed trips in your history and diary.
- Watch an animated pixel-art railway compartment and scenery that changes along the route.
- Explore the interactive Railway Atlas and view productivity statistics.
- Listen to the built-in radio, imported music, and locally generated train ambience.
- Use the interface in Russian or English and adjust sound, display and atmosphere preferences.
- Keep your profile locally, create ZIP backups and export journeys and diary entries.

## Windows portable edition

1. Download the Windows x64 portable ZIP from the project’s GitHub release page when it is published.
2. Extract the **entire** archive to a writable folder.
3. Double-click **Start Last Train.exe**. The app opens in your browser and runs locally.
4. To stop the local server, double-click **Stop Last Train.exe**.

The packaged edition does not require Python, Node.js or VS Code. Keep both EXE files beside the `_internal` folder and the other files from the archive; do not move an EXE out of the extracted bundle. Closing the browser tab does not necessarily stop the local server.

The portable profile is stored under `%LOCALAPPDATA%\LastTrain` (including its `data` folder). Application updates preserve that separate profile. Create a backup in Settings before major updates and keep important backups somewhere safe. In-app restore is not currently available. The source project retains its offline `restore.bat` tool; portable in-app restore needs a later release.

## Technology

The interface uses React, Vite and JavaScript. Django and Django REST Framework provide the local API; Waitress serves the packaged application. User data is stored in SQLite. The Windows x64 edition is packaged as a PyInstaller onedir bundle.

## Run from source

For Windows development, install Python 3.12–3.14 and Node.js 22 or 24 LTS. From the repository root, run `setup.bat` once, then `start.bat`; use `stop.bat` to stop the source server. Initial setup installs dependencies and therefore needs internet access. Normal local use does not. See [portable build and data notes](docs/PORTABLE-WINDOWS.md) and [local edition engineering notes](docs/LOCAL-EDITION.md).

## Credits

Created by **COUnT (count-rzy)**.
