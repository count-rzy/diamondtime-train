"""Exercise Waitress shutdown with an active request and idle keep-alive socket."""
import http.client
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / ".local-qa"
QA.mkdir(exist_ok=True)


def child():
    sys.path.insert(0, str(ROOT / "back"))
    import launcher

    started = launcher.DATA / "request.started"
    completed = launcher.DATA / "request.completed"

    def app(environ, start_response):
        if environ["PATH_INFO"] == "/slow":
            started.write_text("started")
            time.sleep(1.5)
            completed.write_text("completed")
        body = b"ok"
        start_response("200 OK", [("Content-Type", "text/plain"),
                                  ("Content-Length", str(len(body)))])
        return [body]

    with launcher.lock("server.lock"):
        launcher.serve_portable(app, int(sys.argv[2]), "disposable-test-instance")


def main():
    with tempfile.TemporaryDirectory(prefix="shutdown-", dir=QA) as temporary:
        data = Path(temporary)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        env = {**os.environ, "LASTTRAIN_DATA_DIR": str(data)}
        with (data / "server.log").open("w", encoding="utf-8") as log:
            server = subprocess.Popen([sys.executable, __file__, "_child", str(port)],
                                      env=env, stdout=log, stderr=log)
        idle = None
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    idle = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    idle.request("GET", "/")
                    assert idle.getresponse().read() == b"ok"
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(.1)
            result = []

            def request():
                client = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
                try:
                    client.request("GET", "/slow")
                    result.append(client.getresponse().read())
                finally:
                    client.close()

            active = threading.Thread(target=request)
            active.start()
            deadline = time.monotonic() + 5
            while not (data / "request.started").exists():
                if time.monotonic() >= deadline:
                    raise AssertionError("Slow request did not start")
                time.sleep(.05)
            stopped_at = time.monotonic()
            (data / "stop.request").write_text("disposable-test-instance", encoding="ascii")
            assert server.wait(timeout=10) == 0
            elapsed = time.monotonic() - stopped_at
            active.join(timeout=1)
            assert result == [b"ok"] and (data / "request.completed").exists()
            assert elapsed >= 1 and elapsed < 8
            print(f"PASS: active request completed before shutdown; {elapsed:.2f}s")
            print((data / "server.log").read_text(encoding="utf-8"))
        finally:
            if idle:
                idle.close()
            if server.poll() is None:
                server.terminate()  # Only the disposable child created above.
                server.wait(timeout=5)


if __name__ == "__main__":
    child() if len(sys.argv) > 1 and sys.argv[1] == "_child" else main()
