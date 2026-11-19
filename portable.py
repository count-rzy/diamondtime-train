"""Windowless entry point for the Windows onedir distribution."""
import ctypes
import logging
import os
import sys
import traceback
import webbrowser
from pathlib import Path


def message(text, error=False):
    if os.environ.get("LASTTRAIN_NONINTERACTIVE"):
        stream = sys.stderr if error else sys.stdout
        if stream:
            stream.write(str(text).encode("ascii", "backslashreplace").decode() + "\n")
        return
    flags = 0x10 if error else 0x40  # MB_ICONERROR / MB_ICONINFORMATION
    ctypes.windll.user32.MessageBoxW(None, str(text), "Last Train", flags)


def run():
    if os.name != "nt":
        raise RuntimeError("The portable launcher requires Windows.")
    root = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    sys.path.insert(0, str(root / "back"))
    custom = os.environ.get("LASTTRAIN_DATA_DIR")
    if custom and not Path(custom).is_absolute():
        raise RuntimeError("LASTTRAIN_DATA_DIR must be an absolute path.")
    app_home = Path(os.environ["LOCALAPPDATA"]) / "LastTrain"
    data = Path(custom) if custom else app_home / "data"
    for directory in (data, data / "backups", data / "user-files", app_home / "logs",
                      app_home / "imports", app_home / "settings"):
        directory.mkdir(parents=True, exist_ok=True)
    os.environ["LASTTRAIN_DATA_DIR"] = str(data.resolve())
    os.environ["LASTTRAIN_PORTABLE"] = "1"
    os.environ["DJANGO_DEBUG"] = "0"
    logging.basicConfig(filename=app_home / "logs" / "startup.log", level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    # A windowless executable has no usable console stream. Capture Django's
    # migration output and Unicode paths without depending on the code page.
    output = (app_home / "logs" / "launcher.log").open("a", encoding="utf-8", buffering=1)
    sys.stdout = output
    sys.stderr = output

    import launcher
    if len(sys.argv) > 1 and sys.argv[1] == "_serve":
        launcher.main()
        return
    stopping = Path(sys.executable).stem.lower().startswith("stop last train") or "--stop" in sys.argv
    with launcher.lock("launcher.lock"):
        if stopping:
            launcher.stop()
            message("Last Train остановлен.")
            return
        state = launcher.read_state()
        existing = bool(state and launcher.owned_process(state))
        if not existing:
            # A source checkout may have a database beside the extracted EXE.
            # Require an explicit migration; never silently create a second profile.
            legacy = Path(sys.executable).resolve().parent / "data" / "lasttrain.sqlite3"
            if not (data / "lasttrain.sqlite3").exists() and legacy.is_file() and legacy != data / "lasttrain.sqlite3":
                raise RuntimeError(
                    "Найдена прежняя база рядом с программой. Перенесите данные по инструкции "
                    "в README.txt до первого запуска. Исходная база не изменена."
                )
            with launcher.lock("server.lock"):
                target = data / "lasttrain.sqlite3"
                needs_init = not target.is_file()
                if not needs_init:
                    from local_data import integrity
                    integrity(target)
                    launcher.django_ready()
                    from django.db import connection
                    from django.db.migrations.executor import MigrationExecutor
                    executor = MigrationExecutor(connection)
                    needs_init = bool(executor.migration_plan(executor.loader.graph.leaf_nodes()))
                if needs_init:
                    logging.info("Initializing or migrating database at %s", target)
                    launcher.initialize()
        url = launcher.start(no_browser=True)
    logging.info("Last Train ready at %s; existing=%s", url, existing)
    if "--no-browser" not in sys.argv:
        opened = webbrowser.open(url)
        logging.info("Default-browser launch request accepted=%s", opened)
        if not opened:
            message("Приложение запущено. Откройте в браузере: " + url)


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        # Logging may not yet be initialized (for example, LOCALAPPDATA missing).
        logging.error("Startup failed: %s\n%s", exc, traceback.format_exc())
        message("Не удалось запустить Last Train:\n\n" + str(exc)
                + "\n\nПроверьте %LOCALAPPDATA%\\LastTrain\\logs\\startup.log", error=True)
        sys.exit(1)
