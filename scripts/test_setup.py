"""Fresh project install with installed Windows prerequisites; never a clean-machine claim."""
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / '.local-qa'


def main():
    QA.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='install-', dir=QA) as temporary:
        project = Path(temporary) / 'Last Train installation'
        project.mkdir()
        for directory in ('back', 'front', 'scripts'):
            shutil.copytree(ROOT / directory, project / directory,
                            ignore=shutil.ignore_patterns('.venv', 'node_modules', 'dist', '__pycache__', '*.sqlite3', '*.log'))
        for batch in ROOT.glob('*.bat'):
            shutil.copy2(batch, project / batch.name)
        data = project / 'test-data'
        env = {**os.environ, 'LASTTRAIN_DATA_DIR': str(data), 'LASTTRAIN_NONINTERACTIVE': '1'}

        def run(name, *args, environment=None, success=True):
            result = subprocess.run(['cmd.exe', '/d', '/c', str(project / f'{name}.bat'), *args],
                                    cwd=project, env=environment or env, capture_output=True, text=True)
            (QA / f'setup-{name}.log').write_text(result.stdout + result.stderr, encoding='utf-8')
            if success and result.returncode:
                raise RuntimeError(result.stdout[-4000:] + result.stderr[-4000:])
            if not success:
                assert result.returncode != 0
            return result.stdout

        assert 'Run setup.bat first' in run('start', '--no-browser', success=False)
        system = Path(os.environ['SystemRoot']) / 'System32'
        missing = {**env, 'PATH': f'{system};{system / "WindowsPowerShell/v1.0"}'}
        assert 'Install Python' in run('setup', environment=missing, success=False)
        print('PASS: missing installation and missing Python messages', flush=True)
        run('setup')
        print('PASS: first setup in a fresh project directory (new venv and node_modules)', flush=True)
        with closing(sqlite3.connect(data / 'lasttrain.sqlite3')) as db:
            db.execute("UPDATE auth_user SET first_name='Preserve this local profile'")
            db.commit()
        run('setup')
        with closing(sqlite3.connect(data / 'lasttrain.sqlite3')) as db:
            assert db.execute('SELECT first_name FROM auth_user').fetchone()[0] == 'Preserve this local profile'
        print('PASS: repeated setup preserves the existing test database', flush=True)
        offline = {**env, 'HTTP_PROXY':'http://127.0.0.1:1', 'HTTPS_PROXY':'http://127.0.0.1:1', 'NO_PROXY':'127.0.0.1,localhost'}
        try:
            assert 'Last Train ready:' in run('start', '--no-browser', environment=offline)
            assert json.loads((data / 'server.json').read_text())['pid'] > 0
            print('PASS: installed launcher starts with external HTTP(S) proxy unavailable', flush=True)
        finally:
            run('stop')
    print('PASS: isolated Windows installation checks; system Python/Node were already installed', flush=True)


if __name__ == '__main__':
    main()
