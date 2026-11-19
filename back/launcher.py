"""One local Waitress server; private data stays outside source files."""
import argparse
import contextlib
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
import webbrowser
from pathlib import Path

ROOT = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("LASTTRAIN_DATA_DIR", ROOT / "data")).resolve()
DATA.mkdir(parents=True, exist_ok=True)
STATE = DATA / "server.json"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


@contextlib.contextmanager
def lock(name):
    import msvcrt
    with (DATA / name).open("a+b") as stream:
        stream.seek(0)
        if not stream.read(1):
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("Last Train is running or maintenance is in progress. Run stop.bat first.")
        try:
            yield
        finally:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


def django_ready():
    import django
    django.setup()


def initialize():
    from local_data import create_backup, integrity, snapshot
    target = DATA / "lasttrain.sqlite3"
    legacy = ROOT / "back" / "db.sqlite3"
    if (not target.exists() or target.stat().st_size == 0) and legacy.exists() and not os.environ.get("LASTTRAIN_DATA_DIR"):
        staging = DATA / (uuid.uuid4().hex + ".sqlite3")
        snapshot(legacy, staging)
        staging.replace(target)
        print("Copied existing back/db.sqlite3 safely. Original retained.")
    if target.exists():
        integrity(target)
        print("Pre-migration backup:", create_backup(DATA))
    django_ready()
    from django.core.management import call_command
    call_command("migrate", interactive=False)
    from journeys.local import local_context
    from django.contrib.auth import get_user_model
    context = local_context()
    print("Local profile:", context.owner_id)
    if get_user_model().objects.count() > 1:
        print("Multiple legacy profiles preserved. Choose their records in Settings > Stored profiles.")
    integrity(target)
    (DATA / "user-files").mkdir(exist_ok=True)


def validate():
    from local_data import integrity
    if not (DATA / "lasttrain.sqlite3").is_file():
        raise RuntimeError("Database missing. Run setup.bat first.")
    integrity(DATA / "lasttrain.sqlite3")
    dist = ROOT / "front" / "dist"
    if not (dist / "index.html").is_file() or not list((dist / "assets").glob("*.js")):
        raise RuntimeError("Frontend build missing. Run setup.bat.")
    required_art = "carriage carriage-detail architecture-lights distant-birds firefly-strip foreground-ground glass-rain glass lamp-light mid-pines near-pines panel-texture paper-texture rain-0 rain-1 rain-2 rain-3 valley-afternoon valley-dawn valley-fog valley-morning valley-night valley-sunset valley-twilight water-shimmer window-mask".split()
    for name in required_art:
        if not (dist / "art" / (name + ".png")).is_file():
            raise RuntimeError(f"Missing artwork: {name}. Run setup.bat.")
    import re
    for reference in re.findall(r'(?:src|href)="(/assets/[^"]+)"', (dist / "index.html").read_text(encoding="utf-8")):
        asset = (dist / reference.lstrip("/")).resolve()
        if not asset.is_relative_to(dist.resolve()) or not asset.is_file():
            raise RuntimeError("A referenced frontend bundle is missing. Run setup.bat.")
    django_ready()
    from django.core.management import call_command
    call_command("check", verbosity=0)
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    executor = MigrationExecutor(connection)
    if executor.migration_plan(executor.loader.graph.leaf_nodes()):
        raise RuntimeError("Database migrations pending. Run setup.bat.")


def owned_process(state):
    import psutil
    try:
        process = psutil.Process(state["pid"])
        command = process.cmdline()
        if abs(process.create_time() - state["created"]) > .01:
            return None
        executable = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
        if getattr(sys, "frozen", False) and executable.name.lower() == "stop last train.exe":
            executable = executable.with_name("Start Last Train.exe")
        if (getattr(sys, "frozen", False) and Path(process.exe()).resolve() != executable
                or not getattr(sys, "frozen", False) and str(executable) not in command
                or state["instance"] not in command or "_serve" not in command):
            return None
        return process
    except (psutil.Error, KeyError, ValueError):
        return None


def read_state():
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return None


def ready(state):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://127.0.0.1:{state["port"]}/api/health/', timeout=1) as response:
            return json.load(response).get("instance") == state["instance"]
    except (OSError, ValueError, http.client.HTTPException):
        return False


def start(no_browser=False):
    state = read_state()
    existing = bool(state and owned_process(state))
    if existing:
        if not ready(state):
            raise RuntimeError("Owned server exists but is not ready. Inspect data/server.log or run stop.bat.")
    else:
        validate()
        # Reserve a candidate; Waitress handles the final bind. Readiness verifies identity.
        requested = int(os.environ.get("LASTTRAIN_PORT", "8765"))
        port = None
        for candidate in range(requested, min(requested + 30, 65536)):
            with socket.socket() as probe:
                try:
                    probe.bind(("127.0.0.1", candidate))
                    port = candidate
                    break
                except OSError:
                    continue
        if port is None:
            raise RuntimeError("No free local port. Set LASTTRAIN_PORT to another port.")
        token = uuid.uuid4().hex
        command = ([sys.executable] if getattr(sys, "frozen", False)
                   else [sys.executable, str(Path(__file__).resolve())])
        with (DATA / "server.log").open("a", encoding="utf-8") as log:
            process = subprocess.Popen([*command, "_serve", "--port", str(port), "--instance", token],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW)
        import psutil
        state = {"pid": process.pid, "created": psutil.Process(process.pid).create_time(), "port": port, "instance": token}
        STATE.write_text(json.dumps(state), encoding="utf-8")
        deadline = time.monotonic() + 30
        while not ready(state):
            if process.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError("Server did not become ready. Read data/server.log; run stop.bat before retrying.")
            time.sleep(.2)
    url = f'http://127.0.0.1:{state["port"]}/'
    print("Last Train ready:", url)
    print("Data:", DATA)
    if not no_browser and (not existing or not os.environ.get("LASTTRAIN_PORTABLE")):
        if not webbrowser.open(url):
            print("Browser did not open automatically. Open the URL above manually.")
    return url


def stop():
    state = read_state()
    process = owned_process(state) if state else None
    if process:
        if getattr(sys, "frozen", False):
            (DATA / "stop.request").write_text(state["instance"], encoding="ascii")
        else:
            process.terminate()
        process.wait(timeout=25)
        print("Stopped the owned Last Train server.")
    else:
        print("No owned Last Train server running; stale state ignored.")
    STATE.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init", "start", "stop", "doctor", "backup", "restore", "_serve"])
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int)
    parser.add_argument("--instance")
    parser.add_argument("--file")
    args = parser.parse_args()
    if args.command == "_serve":
        with lock("server.lock"):
            os.environ["LASTTRAIN_INSTANCE"] = args.instance
            from config.wsgi import application
            if getattr(sys, "frozen", False):
                from waitress import create_server
                from threading import Thread
                server = create_server(application, host="127.0.0.1", port=args.port,
                                       threads=4, max_request_body_size=101*1024*1024)
                worker = Thread(target=server.run, daemon=True)
                worker.start()
                request = DATA / "stop.request"
                try:
                    while worker.is_alive():
                        if request.is_file() and request.read_text(encoding="ascii") == args.instance:
                            break
                        time.sleep(.2)
                finally:
                    server.close()
                    server.task_dispatcher.shutdown()
                    worker.join(timeout=10)
                    request.unlink(missing_ok=True)
            else:
                from waitress import serve
                serve(application, host="127.0.0.1", port=args.port, threads=4,
                      max_request_body_size=101*1024*1024)
        return
    with lock("launcher.lock"):
        if args.command == "start":
            start(args.no_browser)
        elif args.command == "stop":
            stop()
        elif args.command == "backup":
            from local_data import create_backup
            print("Backup:", create_backup(DATA))
        elif args.command == "doctor":
            validate()
            print("Database, migrations and built assets OK. Data:", DATA)
        else:
            with lock("server.lock"):
                if args.command == "init":
                    initialize()
                else:
                    django_ready()
                    source = args.file or input("Full path to backup ZIP: ").strip().strip('"')
                    print("Restore replaces the current database. A safety backup will be kept.")
                    if input("Type RESTORE to confirm: ") != "RESTORE":
                        print("Restore cancelled.")
                        return
                    from local_data import restore_backup
                    print("Safety backup:", restore_backup(DATA, source))
                    initialize()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Last Train: {exc}", file=sys.stderr)
        sys.exit(1)
