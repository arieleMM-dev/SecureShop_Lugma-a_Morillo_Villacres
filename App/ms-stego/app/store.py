import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

class Store:
    def __init__(self, root: Path):
        self.root=root.resolve(); self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        (self.root/'quarantine').mkdir(exist_ok=True,mode=0o700)
        with self.connection() as db:
            db.executescript("""PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS analyses (
            analysis_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, filename TEXT NOT NULL,
            sha256 TEXT NOT NULL, technique TEXT NOT NULL, indicators TEXT NOT NULL,
            created_at TEXT NOT NULL, status TEXT NOT NULL, action TEXT NOT NULL,
            limitations TEXT NOT NULL, file_name TEXT, retained_until TEXT);
            CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, request_id TEXT NOT NULL,
            user_id TEXT, method TEXT NOT NULL, route TEXT NOT NULL, status_code INTEGER NOT NULL,
            analysis_id TEXT, event TEXT NOT NULL);
            PRAGMA user_version=1;""")
    @contextmanager
    def connection(self):
        db=sqlite3.connect(self.root/'stego.sqlite3',timeout=5)
        db.row_factory=sqlite3.Row
        try:
            yield db;db.commit()
        finally: db.close()
    def get(self, identifier):
        with self.connection() as db:
            row=db.execute('SELECT * FROM analyses WHERE analysis_id=?',(identifier,)).fetchone()
        if row is None:return None
        data=dict(row);data['indicators']=json.loads(data['indicators']);return data
    def insert(self, result, private_file, days):
        until=(datetime.now(timezone.utc)+timedelta(days=days)).isoformat() if private_file else None
        with self.connection() as db:
            db.execute('INSERT INTO analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(
                result['analysis_id'],result['user_id'],result['filename'],result['sha256'],result['technique'],
                json.dumps(result['indicators'],allow_nan=False),result['created_at'],result['status'],result['action'],
                result['limitations'],private_file,until))
    def audit(self,request_id,user_id,method,route,status_code,analysis_id=None,event='request'):
        with self.connection() as db:
            db.execute('INSERT INTO audit_events(occurred_at,request_id,user_id,method,route,status_code,analysis_id,event) VALUES (?,?,?,?,?,?,?,?)',(
                datetime.now(timezone.utc).isoformat(),request_id,user_id,method,route,status_code,analysis_id,event))
    def purge(self):
        now=datetime.now(timezone.utc).isoformat()
        with self.connection() as db:
            rows=db.execute('SELECT analysis_id,file_name FROM analyses WHERE file_name IS NOT NULL AND retained_until < ?',(now,)).fetchall()
            for row in rows:
                # Solo UUID.bin creados por el servidor, nunca nombres del cliente.
                from uuid import UUID
                try:
                    safe=str(UUID(row['analysis_id']))+'.bin'
                    if row['file_name']!=safe:continue
                    (self.root/'quarantine'/safe).unlink(missing_ok=True)
                    db.execute('UPDATE analyses SET file_name=NULL WHERE analysis_id=?',(row['analysis_id'],))
                except (ValueError,OSError):continue
        return len(rows)
