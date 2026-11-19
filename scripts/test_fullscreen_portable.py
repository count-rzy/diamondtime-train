"""Verify fullscreen recovery in an extracted EXE with a disposable profile."""
import json
import os
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

import psutil


ROOT = Path(__file__).resolve().parent.parent
ZIP = ROOT / "dist" / "LastTrain-v0.3.0-Windows-x64.zip"
QA = ROOT / ".local-qa"
QA.mkdir(exist_ok=True)


def run_exe(executable, env):
    result = subprocess.run(
        [str(executable), "--no-browser"],
        cwd=executable.parent.parent,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode:
        raise RuntimeError(f"{executable.name}: {result.returncode}\n{result.stdout}{result.stderr}")


def main():
    with tempfile.TemporaryDirectory(prefix="fullscreen-portable-", dir=QA) as temporary:
        temporary = Path(temporary)
        extracted = temporary / "extract"
        with zipfile.ZipFile(ZIP) as archive:
            if any(Path(name).is_absolute() or ".." in Path(name).parts for name in archive.namelist()):
                raise RuntimeError("Unsafe ZIP path")
            archive.extractall(extracted)
        app = extracted / "LastTrain-Windows-x64"
        start = app / "Start Last Train.exe"
        stop = app / "Stop Last Train.exe"
        profile = temporary / "profile"
        profile.mkdir()
        data = profile / "LastTrain" / "data"
        env = os.environ.copy()
        for name in ("LASTTRAIN_DATA_DIR", "DJANGO_SETTINGS_MODULE", "DJANGO_SECRET_KEY",
                     "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "NODE_PATH"):
            env.pop(name, None)
        env["LOCALAPPDATA"] = str(profile)
        env["LASTTRAIN_NONINTERACTIVE"] = "1"
        env["LASTTRAIN_PORT"] = "8898"
        env["PATH"] = os.pathsep.join([str(Path(os.environ["SystemRoot"]) / "System32"),
                                       os.environ["SystemRoot"]])
        state = None
        try:
            run_exe(start, env)
            state = json.loads((data / "server.json").read_text())
            base = f'http://127.0.0.1:{state["port"]}'
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(base + "/api/health/", timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError("Packaged server is unhealthy")
            browser_env = os.environ.copy()
            browser_env["LASTTRAIN_TEST_URL"] = base
            command = ROOT / "front" / "node_modules" / ".bin" / "playwright.cmd"
            subprocess.run(
                [str(command), "test", "e2e/fullscreen-recovery.spec.js", "--grep", "Escape restores"],
                cwd=ROOT / "front",
                env=browser_env,
                check=True,
                timeout=240,
            )
            print("PASS: extracted EXE restores fullscreen layout across five viewports")
        finally:
            if (data / "server.json").exists():
                run_exe(stop, env)
            deadline = time.monotonic() + 5
            while state and psutil.pid_exists(state["pid"]) and time.monotonic() < deadline:
                time.sleep(0.1)
            if state and psutil.pid_exists(state["pid"]):
                raise RuntimeError("Packaged server remained after Stop EXE")
            if state:
                print("PASS: isolated packaged server stopped")


if __name__ == "__main__":
    main()
