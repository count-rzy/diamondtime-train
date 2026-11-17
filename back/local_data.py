"""SQLite snapshots and portable backups; never overwrite a legacy database."""
import json
from contextlib import closing
import re
import sqlite3
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def integrity(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite integrity check failed. Restore a known good backup.")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("SQLite foreign key check failed.")


def snapshot(source, target):
    # SQLite's online backup API includes committed WAL pages.
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
        with closing(sqlite3.connect(target)) as dst:
            src.backup(dst)
    integrity(target)


def create_backup(data_dir):
    data_dir = Path(data_dir)
    backup_dir = data_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    name = datetime.now(timezone.utc).strftime("lasttrain-%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8] + ".zip"
    target = backup_dir / name
    with tempfile.TemporaryDirectory(dir=data_dir) as temporary:
        db = Path(temporary) / "lasttrain.sqlite3"
        snapshot(data_dir / "lasttrain.sqlite3", db)
        with closing(sqlite3.connect(db)) as conn:
            exists = conn.execute("SELECT 1 FROM sqlite_master WHERE name='journeys_audiotrack'").fetchone()
            files = [row[0] for row in conn.execute("SELECT filename FROM journeys_audiotrack")] if exists else []
        try:
            with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps({"format": "last-train-backup-v1"}))
                archive.write(db, "lasttrain.sqlite3")
                for name in files:
                    if not re.fullmatch(r"[a-f0-9]{32}\.(wav|ogg|flac|mp3)", name):
                        raise RuntimeError("Invalid managed audio filename.")
                    archive.write(data_dir / "user-files" / name, "user-files/" + name)
        except Exception:
            target.unlink(missing_ok=True)
            raise
    return target


def restore_backup(data_dir, source):
    """Caller must hold the server lock and obtain explicit confirmation."""
    data_dir, source = Path(data_dir), Path(source)
    with tempfile.TemporaryDirectory(dir=data_dir) as temporary:
        staging = Path(temporary)
        with zipfile.ZipFile(source) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or sum(i.file_size for i in archive.infolist()) > 10 * 1024**3:
                raise ValueError("Duplicate files or backup larger than 10 GB.")
            for info in archive.infolist():
                if info.filename not in ("manifest.json", "lasttrain.sqlite3") and not re.fullmatch(r"user-files/[a-f0-9]{32}\.(wav|ogg|flac|mp3)", info.filename):
                    raise ValueError("Unsafe backup path.")
                if info.file_size > 1024**3:
                    raise ValueError("Backup member too large.")
            if json.loads(archive.read("manifest.json"))["format"] != "last-train-backup-v1":
                raise ValueError("Unsupported backup format.")
            archive.extractall(staging)  # Every member was allowlisted above.
        db = staging / "lasttrain.sqlite3"
        integrity(db)
        with closing(sqlite3.connect(db)) as conn:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"journeys_journey", "journeys_diaryentry", "auth_user", "django_migrations"} <= tables:
                raise ValueError("This is not a Last Train database.")
            migrations = conn.execute("SELECT app,name FROM django_migrations").fetchall()
            from django.db import connection
            from django.db.migrations.loader import MigrationLoader
            available = MigrationLoader(connection, load=False)
            available.load_disk()
            if any(tuple(row) not in available.disk_migrations for row in migrations):
                raise ValueError("Backup uses newer migrations; update Last Train first.")
            files = list(conn.execute("SELECT filename FROM journeys_audiotrack")) if "journeys_audiotrack" in tables else []
            for (name,) in files:
                if not re.fullmatch(r"[a-f0-9]{32}\.(wav|ogg|flac|mp3)", name) or not (staging / "user-files" / name).is_file():
                    raise ValueError("Backup is missing managed audio.")
        previous = create_backup(data_dir)
        media = data_dir / "user-files"
        media.mkdir(exist_ok=True)
        # Imported files are immutable UUIDs. Keep old files for recovery.
        for item in (staging / "user-files").glob("*"):
            target = media / item.name
            if target.exists() and target.read_bytes() != item.read_bytes():
                raise ValueError("Conflicting audio file; restore into a separate data directory.")
            if not target.exists():
                item.replace(target)
        from django.db import connections
        connections.close_all()
        db.replace(data_dir / "lasttrain.sqlite3")
        return previous
