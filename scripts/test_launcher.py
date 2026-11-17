"""Windows integration checks using an isolated directory, never personal data."""
import json
import os
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / ".local-qa"
QA.mkdir(exist_ok=True)


def main():
    with tempfile.TemporaryDirectory(prefix="launcher-", dir=QA) as temporary:
        data = Path(temporary)
        env = {**os.environ, "LASTTRAIN_DATA_DIR": str(data), "LASTTRAIN_NONINTERACTIVE": "1"}
        def batch(name, *args, input=None):
            result = subprocess.run(["cmd.exe", "/d", "/c", str(ROOT / f"{name}.bat"), *args], cwd=ROOT, env=env, input=input, text=True, capture_output=True)
            if result.returncode:
                log = (data / 'server.log').read_text() if (data / 'server.log').exists() else ''
                raise RuntimeError(result.stdout + result.stderr + log)
            return result.stdout
        def init():
            return subprocess.run([sys.executable, str(ROOT / "back/launcher.py"), "init"], env=env, text=True, check=True, capture_output=True).stdout
        init()
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            env["LASTTRAIN_PORT"] = str(port)
            try:
                print(batch("start", "--no-browser"))
                state = json.loads((data / "server.json").read_text())
                assert state["port"] != port, "Launcher reused occupied port"
                first_pid = state["pid"]
                batch("start", "--no-browser")
                assert json.loads((data / "server.json").read_text())["pid"] == first_pid
                print(batch("doctor"))
                print(batch("backup"))
            finally:
                print(batch("stop"))
        backup = sorted((data / "backups").glob("*.zip"))[-1]
        before = (data / "lasttrain.sqlite3").read_bytes()
        batch("restore", "--file", str(backup), input="CANCEL\n")
        assert before == (data / "lasttrain.sqlite3").read_bytes(), "Cancel changed the database"
        print(batch("restore", "--file", str(backup), input="RESTORE\n"))
        # A stale state pointing at THIS unrelated test runner must never kill it.
        current = psutil.Process()
        (data / "server.json").write_text(json.dumps({"pid": current.pid, "created": current.create_time(), "instance": "not-our-server", "port": port}))
        print(batch("stop"))
        assert current.is_running()
        assert not (data / "server.json").exists()
        # Second initialization must keep the local profile and records.
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(data / "lasttrain.sqlite3")) as db:
            db.execute("UPDATE auth_user SET first_name='Keep me'")
            db.commit()
        init()
        with closing(sqlite3.connect(data / "lasttrain.sqlite3")) as db:
            assert db.execute("SELECT first_name FROM auth_user").fetchone()[0] == "Keep me"
    print("PASS: batch launch/readiness, port conflict, duplicate launch, doctor, backup, confirmed/cancelled restore, stale PID, idempotent initialization")


if __name__ == "__main__":
    main()
