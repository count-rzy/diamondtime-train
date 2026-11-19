LAST TRAIN v0.3 - WINDOWS PORTABLE

1. Extract the entire ZIP to a writable folder.
2. Double-click "Start Last Train.exe". Wait for the browser to open.
3. To stop the local server, double-click "Stop Last Train.exe".

No Python, Node.js, setup, administrator access, or internet is needed to run.
The browser must be installed separately. Last Train listens only on 127.0.0.1.

Your data is stored in %LOCALAPPDATA%\LastTrain\data, outside this folder.
Replacing the application folder does not replace the database. Backups are
stored in %LOCALAPPDATA%\LastTrain\data\backups. Keep separate backup copies.

UPGRADING FROM A SOURCE INSTALLATION WITH data\lasttrain.sqlite3
Stop Last Train in the old installation first. Run its backup.bat, and keep
that ZIP in a safe location. Before launching this portable edition, copy the
entire old data folder (database plus user-files) to
%LOCALAPPDATA%\LastTrain\data. Do this only if that destination has no
existing lasttrain.sqlite3. Never overwrite an existing portable database.
Keep the old data folder and backup ZIP until journeys and diary are checked.
If a portable database already exists, use the in-app export and backup tools
and resolve the two profiles separately; do not merge SQLite files by hand.

If startup fails, inspect %LOCALAPPDATA%\LastTrain\logs\startup.log and
%LOCALAPPDATA%\LastTrain\data\server.log. If the browser does not open, use
the local URL from server.json in the data folder (normally 127.0.0.1:8765).
If a port is busy, another nearby loopback port is selected automatically.
Closing the browser does not stop the server; use Stop Last Train.exe.
