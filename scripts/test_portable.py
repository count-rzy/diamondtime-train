"""Exercise the extracted EXE with an empty, isolated Windows profile."""
import argparse
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
import psutil

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / ".local-qa"
QA.mkdir(exist_ok=True)


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    print("PASS:", description, flush=True)


def run_exe(exe, env, *args):
    result = subprocess.run([str(exe), *args], cwd=exe.parent.parent,
                            env=env, capture_output=True, text=True, timeout=120)
    if result.returncode:
        log = Path(env["LOCALAPPDATA"]) / "LastTrain" / "logs" / "startup.log"
        server = Path(env["LOCALAPPDATA"]) / "LastTrain" / "data" / "server.log"
        raise RuntimeError(f"{exe.name}: {result.returncode}\n{result.stdout}{result.stderr}\n"
                           + (log.read_text(errors="replace") if log.exists() else "")
                           + (server.read_text(errors="replace") if server.exists() else ""))
    return result


def request(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=10) as response:
        return response.status, response.headers.get_content_type(), response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default=str(ROOT / "dist" / "LastTrain-v1.0.0-exp.1-Windows-x64.zip"))
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--replacement-zip")
    parser.add_argument("--allow-older-browser-log", action="store_true")
    parser.add_argument("--no-default-browser", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="Portable Spaces Кириллица Հայերեն & ", dir=QA,
                                     ignore_cleanup_errors=True) as temporary:
        temporary = Path(temporary)
        extracted = temporary / "extract"
        with zipfile.ZipFile(args.zip) as archive:
            check(all(not Path(name).is_absolute() and ".." not in Path(name).parts
                      for name in archive.namelist()), "ZIP paths are relative and safe")
            archive.extractall(extracted)
        app = extracted / "LastTrain-Windows-x64"
        start = app / "Start Last Train.exe"
        stop = app / "Stop Last Train.exe"
        profile = temporary / "empty profile"
        profile.mkdir()
        data = profile / "LastTrain" / "data"
        env = os.environ.copy()
        env.pop("LASTTRAIN_DATA_DIR", None)
        env.pop("DJANGO_SETTINGS_MODULE", None)
        env.pop("DJANGO_SECRET_KEY", None)
        env.pop("PYTHONPATH", None)
        env.pop("PYTHONHOME", None)
        env.pop("VIRTUAL_ENV", None)
        env.pop("NODE_PATH", None)
        env["LOCALAPPDATA"] = str(profile)
        env["LASTTRAIN_NONINTERACTIVE"] = "1"
        env["PATH"] = os.pathsep.join([str(Path(os.environ["SystemRoot"]) / "System32"),
                                        os.environ["SystemRoot"]])
        check(start.is_file() and stop.is_file() and not (app / "data").exists()
              and not any(app.rglob("node_modules")) and not any(app.rglob(".venv")),
              "fresh extraction has executables and no developer state")
        occupied = None
        for candidate in range(8875, 8910, 2):
            probe = socket.socket()
            try:
                probe.bind(("127.0.0.1", candidate))
                with socket.socket() as neighbor:
                    neighbor.bind(("127.0.0.1", candidate + 1))
                probe.listen()
                occupied = probe
                break
            except OSError:
                probe.close()
        if occupied is None:
            raise RuntimeError("No isolated test port pair is available.")
        blocked_port = occupied.getsockname()[1]
        env["LASTTRAIN_PORT"] = str(blocked_port)
        state = None
        try:
            run_exe(start, env, *(("--no-browser",) if args.no_default_browser else ()))
            state = json.loads((data / "server.json").read_text())
            check(state["port"] != blocked_port, "occupied port is skipped without terminating its owner")
            base = f'http://127.0.0.1:{state["port"]}'
            startup_log = (profile / "LastTrain" / "logs" / "startup.log").read_text()
            if not args.allow_older_browser_log and not args.no_default_browser:
                check("Default-browser launch request accepted=True" in startup_log,
                      "default browser accepted the local URL")
            check((data / "lasttrain.sqlite3").is_file(), "SQLite created on first launch")
            check(request(base + "/api/health/")[0] == 200, "Waitress responds on loopback")
            for path, mime in (("/", "text/html"), ("/dashboard", "text/html"),
                               ("/atlas", "text/html"), ("/favicon-16.png", "image/png"),
                               ("/favicon-32.png", "image/png"),
                               ("/art/carriage.png", "image/png")):
                status, kind, payload = request(base + path)
                check(status == 200 and kind == mime and payload, f"{path} serves {mime}")
            html = request(base + "/")[2].decode("utf-8")
            for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', html):
                status, kind, payload = request(base + asset)
                check(status == 200 and payload and kind in
                      ("text/css", "text/javascript", "application/javascript", "font/woff", "font/woff2"),
                      f"bundle {asset} serves correct MIME")
            stylesheet = next(asset for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)
                              if asset.endswith(".css"))
            css = request(base + stylesheet)[2].decode("utf-8")
            font = re.search(r'/assets/[^)"\s]+\.woff2', css)
            if font:
                status, kind, payload = request(base + font.group())
                check(status == 200 and kind == "font/woff2" and payload, "bundled font serves")
            run_exe(start, env, "--no-browser")
            check(json.loads((data / "server.json").read_text())["pid"] == state["pid"],
                  "repeated launch reuses the server")
            # Cross-build confirmation and refusal cases are exercised by
            # test_portable_handoff.py through the real native dialog.
            if args.browser:
                browser_env = os.environ.copy()
                browser_env.pop("LASTTRAIN_VERIFY_RESTART", None)
                browser_env["LASTTRAIN_TEST_URL"] = base
                command = ROOT / "front" / "node_modules" / ".bin" / "playwright.cmd"
                subprocess.run([str(command), "test", "e2e/portable.spec.js"],
                               cwd=ROOT / "front", env=browser_env, check=True, timeout=240)
            idle = http.client.HTTPConnection("127.0.0.1", state["port"], timeout=5)
            idle.request("GET", "/api/health/")
            check(idle.getresponse().status == 200, "idle browser-style connection established")
            stopped_at = time.monotonic()
            try:
                run_exe(stop, env)
            finally:
                idle.close()
            elapsed = time.monotonic() - stopped_at
            print(f"Stop EXE with idle HTTP connection: {elapsed:.2f}s", flush=True)
            check(elapsed < 10, "Stop EXE exits promptly with an idle connection")
            check(request_is_down(base), "Stop EXE shuts down Waitress")
            check(not psutil.pid_exists(state["pid"]), "stop leaves no server process")
            replacement = temporary / "replacement"
            with zipfile.ZipFile(args.replacement_zip or args.zip) as archive:
                archive.extractall(replacement)
            shutil.copytree(replacement / "LastTrain-Windows-x64", app, dirs_exist_ok=True)
            run_exe(start, env, *(("--no-browser",) if args.no_default_browser else ()))
            if not args.no_default_browser:
                startup_log = (profile / "LastTrain" / "logs" / "startup.log").read_text()
                check("Default-browser launch request accepted=True" in startup_log,
                      "new binary requests the local URL in the default browser")
            check((data / "lasttrain.sqlite3").is_file(), "database survives binary replacement")
            if args.browser:
                browser_env["LASTTRAIN_VERIFY_RESTART"] = "1"
                subprocess.run([str(command), "test", "e2e/portable.spec.js"],
                               cwd=ROOT / "front", env=browser_env, check=True, timeout=120)
                status, _, payload = request(base + "/api/diary/")
                check(status == 200 and b"Portable diary QA" in payload,
                      "diary survives restart and binary replacement")
                status, _, payload = request(base + "/api/journeys/")
                check(status == 200 and b"Portable journey QA" in payload,
                      "journey survives restart and binary replacement")
                # Simulate an older source database on a disposable copy, then
                # apply its pending schema migration in a fresh portable profile.
                run_exe(stop, env)
                source_data = temporary / "old source data"
                shutil.copytree(data, source_data)
                source_env = os.environ.copy()
                source_env["LASTTRAIN_DATA_DIR"] = str(source_data)
                source_env["PYTHONIOENCODING"] = "utf-8"
                for command_args, limit in (([str(ROOT / "back" / "launcher.py"), "backup"], 30),
                                            ([str(ROOT / "back" / "manage.py"),
                                              "migrate", "journeys", "0007", "--noinput"], 60)):
                    result = subprocess.run([sys.executable, *command_args], cwd=ROOT,
                                            env=source_env, capture_output=True, text=True,
                                            encoding="utf-8", timeout=limit)
                    if result.returncode:
                        raise RuntimeError(result.stdout + result.stderr)
                upgrade = temporary / "upgrade profile"
                upgrade_data = upgrade / "LastTrain" / "data"
                upgrade_data.parent.mkdir(parents=True)
                shutil.copytree(source_data, upgrade_data)
                upgrade_env = {**env, "LOCALAPPDATA": str(upgrade)}
                backup_count = len(list(upgrade_data.joinpath("backups").glob("*.zip")))
                try:
                    run_exe(start, upgrade_env, "--no-browser")
                    upgrade_state = json.loads((upgrade_data / "server.json").read_text())
                    upgrade_base = f'http://127.0.0.1:{upgrade_state["port"]}'
                    check(len(list(upgrade_data.joinpath("backups").glob("*.zip"))) > backup_count,
                          "pending migration creates a new recovery backup")
                    check(b"Portable journey QA" in request(upgrade_base + "/api/journeys/")[2]
                          and b"Portable diary QA" in request(upgrade_base + "/api/diary/")[2],
                          "older source schema migrates with journey and diary intact")
                finally:
                    if (upgrade_data / "server.json").exists():
                        run_exe(stop, upgrade_env)
        finally:
            occupied.close()
            if (data / "server.json").exists():
                run_exe(stop, env)
    print("PASS: clean extracted distribution and isolated profile")


def request_is_down(base):
    try:
        request(base + "/api/health/")
        return False
    except OSError:
        return True


if __name__ == "__main__":
    main()
