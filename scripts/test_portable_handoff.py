"""Real Windows EXE handoff with native dialog automation and disposable data."""
import ctypes
from ctypes import wintypes
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

import psutil

ROOT = Path(__file__).resolve().parent.parent
OLD_ZIP = ROOT / "dist" / "LastTrain-v0.3.1-Windows-x64.zip"
NEW_ZIP = ROOT / "dist" / "LastTrain-v1.0.0-exp.1-Windows-x64.zip"
QA = ROOT / ".local-qa"


def check(value, label):
    if not value:
        raise AssertionError(label)
    print("PASS:", label, flush=True)


def state(data):
    return json.loads((data / "server.json").read_text(encoding="utf-8"))


def base(value):
    return f'http://127.0.0.1:{value["port"]}'


def api(opener, url, path, payload=None, method=None):
    headers = {}
    if payload is not None:
        token = api(opener, url, "/api/auth/csrf/")["csrf_token"]
        headers = {"Content-Type": "application/json", "X-CSRFToken": token,
                   "Origin": url}
    request = urllib.request.Request(url + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers, method=method)
    with opener.open(request, timeout=15) as response:
        return json.load(response)


def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}),
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def run(executable, env, *args, timeout=120):
    result = subprocess.run([str(executable), *args], env=env, cwd=executable.parent,
                            timeout=timeout, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"{executable}: exit {result.returncode}\n{result.stdout}{result.stderr}")


def click_dialog(process, expected, before_click=None):
    user32 = ctypes.windll.user32
    enum_callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = (enum_callback, wintypes.LPARAM)
    user32.EnumChildWindows.argtypes = (wintypes.HWND, enum_callback, wintypes.LPARAM)
    user32.GetWindowThreadProcessId.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.DWORD))
    user32.GetWindowTextW.argtypes = (wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)

    def title(handle):
        text = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(handle, text, len(text))
        return text.value.replace("&", "")

    deadline = time.monotonic() + 45
    seen = []
    while time.monotonic() < deadline:
        matches = []
        pids = {process.pid}
        try:
            pids.update(child.pid for child in psutil.Process(process.pid).children(recursive=True))
        except psutil.Error:
            pass
        def top(handle, unused):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(handle, ctypes.byref(pid))
            if pid.value in pids:
                seen.append((pid.value, title(handle)))
            if pid.value in pids and title(handle) == "Last Train":
                matches.append(handle)
            return True
        user32.EnumWindows(enum_callback(top), 0)
        for window in matches:
            children = []
            def child(handle, unused):
                children.append((handle, title(handle)))
                return True
            user32.EnumChildWindows(window, enum_callback(child), 0)
            seen.extend(children)
            button = next((handle for handle, label in children if label in expected), None)
            if button:
                if before_click:
                    before_click()
                user32.SendMessageW(button, 0x00F5, 0, 0)  # BM_CLICK
                return
        if process.poll() is not None:
            raise RuntimeError(f"Launcher exited before dialog: {process.returncode}")
        time.sleep(.1)
    raise RuntimeError(f"Native confirmation dialog did not appear; windows={seen[-20:]}")


def launch_with_dialog(executable, env, button, *args, before_click=None):
    process = subprocess.Popen([str(executable), *args], env=env, cwd=executable.parent)
    try:
        click_dialog(process, button, before_click=before_click)
    except Exception:
        if process.poll() is None:
            process.terminate()  # This exact launcher was created by this test.
            process.wait(timeout=10)
        log = Path(env["LOCALAPPDATA"]) / "LastTrain" / "logs" / "startup.log"
        if log.exists():
            print(log.read_text(encoding="utf-8")[-2000:], file=sys.stderr)
        raise
    return process


def main():
    check(OLD_ZIP.is_file() and NEW_ZIP.is_file(),
          "two real onedir builds exist")
    with tempfile.TemporaryDirectory(prefix="handoff-", dir=QA, ignore_cleanup_errors=True) as temporary:
        temporary = Path(temporary)
        profile = temporary / "profile"
        profile.mkdir()
        data = profile / "LastTrain" / "data"
        env = os.environ.copy()
        for name in ("LASTTRAIN_DATA_DIR", "DJANGO_SETTINGS_MODULE", "PYTHONPATH",
                     "PYTHONHOME", "VIRTUAL_ENV", "LASTTRAIN_NONINTERACTIVE"):
            env.pop(name, None)
        env["LOCALAPPDATA"] = str(profile)
        env["LASTTRAIN_PORT"] = "8924"
        quiet = {**env, "LASTTRAIN_NONINTERACTIVE": "1"}
        extracted_a = temporary / "old version" / "LastTrain-Windows-x64"
        with zipfile.ZipFile(OLD_ZIP) as archive:
            check(all(not Path(name).is_absolute() and ".." not in Path(name).parts
                      for name in archive.namelist()), "old ZIP has safe relative paths")
            archive.extractall(temporary / "old version")
        extracted_b = temporary / "new version"
        with zipfile.ZipFile(NEW_ZIP) as archive:
            check(all(not Path(name).is_absolute() and ".." not in Path(name).parts
                      for name in archive.namelist()), "new ZIP has safe relative paths")
            archive.extractall(extracted_b)
        new_app = extracted_b / "LastTrain-Windows-x64"
        old = extracted_a / "Start Last Train.exe"
        old_stop = extracted_a / "Stop Last Train.exe"
        new = new_app / "Start Last Train.exe"
        stopped = new_app / "Stop Last Train.exe"
        old_state = None
        new_state = None
        source_data = temporary / "source profile"
        source_env = {**os.environ, "LASTTRAIN_DATA_DIR": str(source_data),
                      "LASTTRAIN_PORT": env["LASTTRAIN_PORT"]}
        launcher = ROOT / "back" / "launcher.py"
        try:
            run(Path(sys.executable), source_env, str(launcher), "init")
            run(Path(sys.executable), source_env, str(launcher), "start", "--no-browser")
            source_state = state(source_data)
            source_attempt = subprocess.run([str(new), "--no-browser"],
                env={**quiet, "LASTTRAIN_DATA_DIR": str(source_data)}, cwd=new_app, timeout=30)
            check(source_attempt.returncode != 0 and psutil.pid_exists(source_state["pid"]),
                  "source owner is not mistaken for a portable EXE")
            launches = [subprocess.Popen([str(old), "--no-browser"], env=quiet, cwd=extracted_a)
                        for _ in range(2)]
            check(all(process.wait(timeout=120) == 0 for process in launches),
                  "concurrent portable launchers serialize")
            old_state = state(data)
            check(old_state["port"] != source_state["port"] and
                  psutil.pid_exists(source_state["pid"]),
                  "portable skips a port owned by source Last Train")
            run(Path(sys.executable), source_env, str(launcher), "stop")
            check(api(opener(), base(old_state), "/api/health/")["instance"] == old_state["instance"],
                  "build A starts and owns the health endpoint")
            run(old, quiet, "--no-browser")
            check(state(data)["pid"] == old_state["pid"], "same build reuses its instance")
            session = opener()
            journey = api(session, base(old_state), "/api/journeys/", {
                "title": "Handoff journey QA", "description": "Preserve across builds",
                "starting_station": "Home", "destination_station": "Next", "duration_minutes": 60})
            api(session, base(old_state), "/api/diary/", {
                "journey": journey["id"], "title": "Handoff diary QA", "content": "Still here"})
            api(session, base(old_state), "/api/settings/", {"reduced_motion": True}, method="PATCH")
            backup = api(session, base(old_state), "/api/local/backup/", {})
            archive = Path(backup["directory"]) / backup["filename"]
            archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
            imported = profile / "LastTrain" / "imports" / "keep.wav"
            imported.write_bytes(b"imported media must survive")
            check("Handoff diary QA" in json.dumps(api(session, base(old_state), "/api/diary/")),
                  "journey and diary were created through build A")
            different_stop = subprocess.run([str(stopped)], env=quiet, cwd=new_app, timeout=30)
            check(different_stop.returncode != 0 and psutil.pid_exists(old_state["pid"]),
                  "Stop EXE from B cannot stop A")

            cancel = launch_with_dialog(new, env, ("Отмена", "Cancel"), "--no-browser")
            check(cancel.wait(timeout=15) == 0 and state(data)["pid"] == old_state["pid"]
                  and psutil.pid_exists(old_state["pid"]), "cancel keeps A running")

            damaged = {**old_state, "created": old_state["created"] + 100}
            (data / "server.json").write_text(json.dumps(damaged), encoding="utf-8")
            rejected = subprocess.run([str(new), "--no-browser"], env=quiet,
                                      cwd=new_app, timeout=30)
            (data / "server.json").write_text(json.dumps(old_state), encoding="utf-8")
            check(rejected.returncode != 0 and psutil.pid_exists(old_state["pid"]),
                  "unverified identity cannot stop A")

            owner = psutil.Process(old_state["pid"])
            try:
                failed = launch_with_dialog(new, env, ("Закрыть и продолжить", "Close and continue"),
                                            "--no-browser", before_click=owner.suspend)
                click_dialog(failed, ("ОК", "OK"))
                check(failed.wait(timeout=40) != 0 and owner.is_running(),
                      "failed handoff re-verification does not start B")
            finally:
                if owner.is_running():
                    owner.resume()
            check(api(opener(), base(old_state), "/api/health/")["instance"] == old_state["instance"],
                  "A remains healthy after failed handoff")

            moved = extracted_a.with_name("old version moved")
            try:
                extracted_a.rename(moved)
            except OSError:
                print("SKIP: Windows kept the running old folder locked", flush=True)
            else:
                old_stop = moved / "Stop Last Train.exe"
                check(api(opener(), base(old_state), "/api/health/")["instance"] == old_state["instance"],
                      "old process survives folder move")

            handoff_at = time.monotonic()
            confirmed = launch_with_dialog(new, env, ("Закрыть и продолжить", "Close and continue"))
            check(confirmed.wait(timeout=120) == 0, "confirmed handoff completes")
            print(f"Confirmed cross-build handoff: {time.monotonic() - handoff_at:.2f}s", flush=True)
            new_state = state(data)
            check(new_state["pid"] != old_state["pid"] and not psutil.pid_exists(old_state["pid"])
                  and psutil.pid_exists(new_state["pid"]), "A exits before B owns the profile")
            check(new_state["build"] != old_state["build"] and
                  api(opener(), base(new_state), "/api/health/")["instance"] == new_state["instance"],
                  "B serves its own authenticated instance")
            check("Handoff journey QA" in json.dumps(api(opener(), base(new_state), "/api/journeys/"))
                  and "Handoff diary QA" in json.dumps(api(opener(), base(new_state), "/api/diary/")),
                  "journey and diary remain available in B")
            check(api(opener(), base(new_state), "/api/settings/")["reduced_motion"] is True
                  and archive.is_file() and hashlib.sha256(archive.read_bytes()).hexdigest() == archive_hash
                  and imported.read_bytes() == b"imported media must survive",
                  "settings, backup archive and imported file survive handoff")
            log = (profile / "LastTrain" / "logs" / "startup.log").read_text(encoding="utf-8")
            check(f"Last Train ready at {base(new_state)}/" in log and
                  "Default-browser launch request accepted=True" in log,
                  "browser launch requested the new instance URL")
            run(new, quiet)
            repeated_log = (profile / "LastTrain" / "logs" / "startup.log").read_text(encoding="utf-8")
            check(state(data)["pid"] == new_state["pid"] and
                  repeated_log.count("Default-browser launch request accepted=True") >
                  log.count("Default-browser launch request accepted=True"),
                  "repeated B launch opens the existing instance")
            run(stopped, quiet)
            check(not psutil.pid_exists(new_state["pid"]), "B stops without an orphan")
            run(new, quiet, "--no-browser")
            restarted = state(data)
            check(restarted["pid"] != new_state["pid"] and
                  "Handoff diary QA" in json.dumps(api(opener(), base(restarted), "/api/diary/")),
                  "B restarts with preserved records")
        finally:
            if (data / "server.json").exists():
                try:
                    run(stopped, quiet)
                except Exception:
                    if old_state and psutil.pid_exists(old_state["pid"]):
                        run(old_stop, quiet)
                    else:
                        raise
            if (source_data / "server.json").exists():
                run(Path(sys.executable), source_env, str(launcher), "stop")
    print("PASS: packaged cross-build handoff", flush=True)


if __name__ == "__main__":
    main()
