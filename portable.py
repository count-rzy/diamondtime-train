"""Windowless entry point for the Windows onedir distribution."""
import ctypes
from ctypes import wintypes
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


class DialogButton(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("id", ctypes.c_int), ("text", wintypes.LPCWSTR)]


class TaskDialogConfig(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("size", wintypes.UINT), ("parent", wintypes.HWND),
                ("instance", wintypes.HINSTANCE), ("flags", wintypes.UINT),
                ("common_buttons", wintypes.UINT), ("title", wintypes.LPCWSTR),
                ("main_icon", ctypes.c_void_p), ("instruction", wintypes.LPCWSTR),
                ("content", wintypes.LPCWSTR), ("button_count", wintypes.UINT),
                ("buttons", ctypes.POINTER(DialogButton)), ("default_button", ctypes.c_int),
                ("radio_count", wintypes.UINT), ("radio_buttons", ctypes.c_void_p),
                ("default_radio", ctypes.c_int), ("verification", wintypes.LPCWSTR),
                ("expanded", wintypes.LPCWSTR), ("expand_text", wintypes.LPCWSTR),
                ("collapse_text", wintypes.LPCWSTR), ("footer_icon", ctypes.c_void_p),
                ("footer", wintypes.LPCWSTR), ("callback", ctypes.c_void_p),
                ("callback_data", ctypes.c_void_p), ("width", wintypes.UINT)]


def confirm_handoff():
    russian = ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3ff == 0x19
    buttons = (DialogButton * 2)(
        DialogButton(101, "Закрыть и продолжить" if russian else "Close and continue"),
        DialogButton(102, "Отмена" if russian else "Cancel"))
    config = TaskDialogConfig()
    config.size = ctypes.sizeof(config)
    config.flags = 0x8  # TDF_ALLOW_DIALOG_CANCELLATION
    config.title = "Last Train"
    config.instruction = ("Другая версия Last Train уже запущена." if russian
                          else "Another Last Train version is running.")
    config.content = ("Чтобы открыть эту версию, необходимо закрыть предыдущую.\n\n"
                      "Закрыть предыдущую версию и продолжить?" if russian else
                      "To open this version, the previous one must close.\n\nClose it and continue?")
    config.button_count = 2
    config.buttons = buttons
    config.default_button = 102
    selected = ctypes.c_int()
    function = ctypes.windll.comctl32.TaskDialogIndirect
    function.argtypes = (ctypes.POINTER(TaskDialogConfig), ctypes.POINTER(ctypes.c_int),
                         ctypes.c_void_p, ctypes.c_void_p)
    function.restype = ctypes.c_long
    result = function(ctypes.byref(config), ctypes.byref(selected), None, None)
    if result:
        raise RuntimeError(f"Windows confirmation dialog failed (HRESULT {result:#x}).")
    return selected.value == 101


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
        if existing:
            if not launcher.portable_owner(state):
                raise RuntimeError("This profile is owned by another or unverified process. Close it through its own launcher before retrying.")
            if not launcher.compatible_state(state):
                if not launcher.ready(state):
                    raise RuntimeError("The previous Last Train instance could not be verified. It was left running.")
                if not confirm_handoff():
                    logging.info("Cross-build handoff cancelled; previous instance retained")
                    return
                logging.info("Confirmed handoff from build %s, pid %s", state["build"], state["pid"])
                launcher.handoff(state)
                existing = False
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
                    from django.db import connection, connections
                    from django.db.migrations.executor import MigrationExecutor
                    try:
                        executor = MigrationExecutor(connection)
                        needs_init = bool(executor.migration_plan(executor.loader.graph.leaf_nodes()))
                    finally:
                        connections.close_all()
                if needs_init:
                    logging.info("Initializing or migrating database at %s", target)
                    try:
                        launcher.initialize()
                    except Exception as exc:
                        logging.exception("Database initialization or migration failed")
                        raise RuntimeError(
                            "Не удалось обновить базу данных. Данные и резервная копия сохранены. "
                            "Подробности записаны в startup.log."
                        ) from exc
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
                + "\n\nПодробности: %LOCALAPPDATA%\\LastTrain\\logs\\startup.log", error=True)
        sys.exit(1)
