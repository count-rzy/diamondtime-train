# Changelog

This changelog follows the project's documented development milestones. The v0.1, v0.2 and v0.3 headings are organizational summaries, not claims about exact tagged releases or dates. Newest milestone first.

## v1.0.0-exp.1 — Last Train v1.0 EXP

### Added

- Experimental Windows x64 portable distribution using a PyInstaller onedir bundle.
- Settings actions for creating a full backup and exporting journeys and diary entries.

### Improved

- Portable startup, shutdown and instance handoff, including graceful Waitress shutdown that drains active connections.
- Recovery of the compartment layout after exiting fullscreen.
- Documentation for portable storage, backup-first source migration and the Windows package.

## v0.3 — Interface and Windows portable stabilization

### Added

- A Windows onedir packaging workflow and portable launch/stop support.
- Portable storage and backup-first migration guidance.

### Improved

- Compartment and scenery presentation, with the atlas and radio kept inside the carriage.
- Fullscreen layout recovery, production favicon serving and portable lifecycle reliability.

## v0.2 — Feature expansion and railway experience

### Added

- Scheduled station breaks, persistent railway routes and an interactive Railway Atlas.
- A living railway scene with synchronized landscapes, events and depot arrival.
- An immersive carriage and in-scene notebook.

### Improved

- Journey transitions, audio activation and train ambience playback.
- Diary search and browser lifecycle behavior for the railway scene.

## v0.1 — Initial foundation

### Added

- The initial offline local edition with a Django API, React/Vite interface and SQLite data storage.
- Russian and English interface support, journey and diary workflows, and local desktop setup.
- Locally generated train ambience and verification for setup and sustained audio behavior.
