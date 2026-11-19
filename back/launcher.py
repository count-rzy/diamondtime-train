"""One local Waitress server; private data stays outside source files."""
import argparse
import contextlib
import hashlib
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
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = (wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.ReleaseMutex.argtypes = (wintypes.HANDLE,)
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    identity = hashlib.sha256(str(DATA).lower().encode("utf-8")).hexdigest()[:24]
    handle = kernel.CreateMutexW(None, False, f"Local\\LastTrain-{identity}-{name}")
    if not handle:
        raise OSError(ctypes.get_last_error(), "Cannot create Last Train instance mutex")
    acquired = False
    try:
        result = kernel.WaitForSingleObject(handle, 120000 if name == "launcher.lock" else 0)
        if result not in (0, 0x80):
            raise RuntimeError("Last Train is running or maintenance is in progress. Close the other instance first.")
        acquired = True
        yield
    finally:
        if acquired:
            kernel.ReleaseMutex(handle)
        kernel.CloseHandle(handle)


def build_identity():
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        if executable.name.lower() == "stop last train.exe":
            executable = executable.with_name("Start Last Train.exe")
        digest = hashlib.sha256(executable.read_bytes())
        frontend = ROOT / "front" / "dist"
        for asset in sorted(path for path in frontend.rglob("*") if path.is_file()):
            digest.update(asset.relative_to(frontend).as_posix().encode("utf-8"))
            digest.update(asset.read_bytes())
        return digest.hexdigest()
    return "source:" + str(Path(__file__).resolve()).lower()


def compatible_state(state):
    if state.get("build"):
        return state["build"] == build_identity()
    # Historical state had no build marker. Only the exact running executable
    # can be reused or stopped; another extracted version remains incompatible.
    process = owned_process(state)
    if not process:
        return False
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        if executable.name.lower() == "stop last train.exe":
            executable = executable.with_name("Start Last Train.exe")
        return Path(process.exe()).resolve() == executable
    return str(Path(__file__).resolve()) in process.cmdline()


def django_ready():
    import django
    django.setup()


def check_migration_compatibility():
    from django.db import connection, connections
    from django.db.migrations.loader import MigrationLoader
    try:
        loader = MigrationLoader(connection)
        if any(tuple(row) not in loader.disk_migrations for row in loader.applied_migrations):
            raise RuntimeError("Database was created by a newer Last Train version. Update the application; the data was not changed.")
    finally:
        connections.close_all()


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
    # Django can otherwise ignore migration rows belonging to a newer build.
    check_migration_compatibility()
    from django.core.management import call_command
    call_command("migrate", interactive=False)
    from journeys.local import local_context
    from django.contrib.auth import get_user_model
    context = local_context()
    print("Local profile:", context.owner_id)
    if get_user_model().objects.count() > 1:
        print("Multiple legacy profiles preserved. Choose their records in Settings > Stored profiles.")
    integrity(target)
    from django.db import connections
    connections.close_all()
    (DATA / "user-files").mkdir(exist_ok=True)


def validate():
    from local_data import integrity
    if not (DATA / "lasttrain.sqlite3").is_file():
        raise RuntimeError("Database missing. Run setup.bat first.")
    integrity(DATA / "lasttrain.sqlite3")
    dist = ROOT / "front" / "dist"
    if not (dist / "index.html").is_file() or not list((dist / "assets").glob("*.js")):
        raise RuntimeError("Frontend build missing. Run setup.bat.")
    required_art = "carriage carriage-detail architecture-lights distant-birds firefly-strip foreground-ground glass-rain glass lamp-light mid-pines near-pines panel-texture paper-texture rain-0 rain-1 rain-2 rain-3 rail-tunnel-v3 valley-afternoon valley-dawn valley-fog valley-morning valley-night valley-sunset valley-twilight water-shimmer window-mask".split()
    for name in required_art:
        if not (dist / "art" / (name + ".png")).is_file():
            raise RuntimeError(f"Missing artwork: {name}. Run setup.bat.")
    import re
    for reference in re.findall(r'(?:src|href)="(/assets/[^"]+)"', (dist / "index.html").read_text(encoding="utf-8")):
        asset = (dist / reference.lstrip("/")).resolve()
        if not asset.is_relative_to(dist.resolve()) or not asset.is_file():
            raise RuntimeError("A referenced frontend bundle is missing. Run setup.bat.")
    django_ready()
    check_migration_compatibility()
    from django.core.management import call_command
    call_command("check", verbosity=0)
    from django.db import connection, connections
    from django.db.migrations.executor import MigrationExecutor
    try:
        executor = MigrationExecutor(connection)
        pending = bool(executor.migration_plan(executor.loader.graph.leaf_nodes()))
    finally:
        connections.close_all()
    if pending:
        raise RuntimeError("Database migrations pending. Run setup.bat.")


def owned_process(state):
    import psutil
    try:
        process = psutil.Process(state["pid"])
        command = process.cmdline()
        if abs(process.create_time() - state["created"]) > .01:
            return None
        historical_source = next((arg for arg in command if arg.lower().endswith("launcher.py")), None)
        executable = Path(state.get("executable") or historical_source or process.exe()).resolve()
        if ((executable.suffix.lower() == ".py" and str(executable) not in command)
                or (executable.suffix.lower() != ".py" and Path(process.exe()).resolve() != executable)
                or state["instance"] not in command or "_serve" not in command):
            return None
        return process
    except (psutil.Error, KeyError, ValueError):
        return None


def portable_owner(state):
    """Recognize old packaged builds without requiring their files to exist."""
    import psutil
    process = owned_process(state)
    if not process or not state.get("build"):
        return None
    try:
        executable = Path(state["executable"])
        if executable.name.lower() != "start last train.exe":
            return None
        if Path(process.exe()).name.lower() != executable.name.lower():
            return None
        if not all(arg in process.cmdline() for arg in ("_serve", state["instance"])):
            return None
        return process
    except (OSError, KeyError, ValueError, psutil.Error):
        return None


def handoff(state):
    """Called under launcher.lock, before any database access or migration."""
    process = portable_owner(state)
    if not process or not ready(state):
        raise RuntimeError("Cannot verify the previous portable instance. It was left running; see startup.log.")
    (DATA / "stop.request").write_text(state["instance"], encoding="ascii")
    try:
        process.wait(timeout=25)
    except Exception as exc:
        request = DATA / "stop.request"
        if request.is_file() and request.read_text(encoding="ascii") == state["instance"]:
            request.unlink(missing_ok=True)
        raise RuntimeError("The previous Last Train version did not shut down. The new version was not started; try again after closing it normally.") from exc
    # Process exit alone does not prove the endpoint and ownership mutex are free.
    with lock("server.lock"):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", state["port"]))
            except OSError as exc:
                raise RuntimeError("The previous Last Train port is still occupied. The new version was not started.") from exc
    if read_state() == state:
        STATE.unlink(missing_ok=True)


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
        if not compatible_state(state):
            raise RuntimeError("Another Last Train build is running with this data profile. Close it using its own Stop Last Train.exe before starting this version.")
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
        state = {"pid": process.pid, "created": psutil.Process(process.pid).create_time(), "port": port, "instance": token,
                 "executable": str(Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()),
                 "build": build_identity()}
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
    if process and not compatible_state(state):
        raise RuntimeError("This Stop Last Train belongs to a different build. Use the Stop EXE beside the running Start EXE.")
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
                    worker.join()
                    from django.db import connections
                    connections.close_all()
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
