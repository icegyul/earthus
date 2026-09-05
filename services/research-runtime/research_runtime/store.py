"""Local single-user research metadata. Submitted experiments/runs are immutable."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import os


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


class LocalInstanceLock:
    """OS-owned advisory lock. Process exit releases it, unlike stale PID files."""
    def __init__(self, directory):
        folder = Path(directory).resolve()
        folder.mkdir(parents=True, exist_ok=True)
        self.file = (folder / '.service.lock').open('a+b')
        if self.file.tell() == 0:
            self.file.write(b'0'); self.file.flush()
        self.file.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.file.close()
            raise ValueError('DATA_DIRECTORY_IN_USE: 이 작업 폴더를 사용하는 계산 서비스가 이미 실행 중입니다.') from error

    def close(self):
        if self.file.closed:
            return
        self.file.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.file.fileno(), fcntl.LOCK_UN)
        self.file.close()


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'research.sqlite3'
        self.lock = threading.RLock()
        with self.connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS objects (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, created TEXT NOT NULL,
                    body TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS submissions (
                    key TEXT PRIMARY KEY, digest TEXT NOT NULL, run_id TEXT NOT NULL
                );
            ''')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, kind, body):
        item = {**body, 'id': uuid.uuid4().hex, 'createdAt': utc_now()}
        with self.lock, self.connection() as db:
            db.execute('INSERT INTO objects VALUES (?,?,?,?)',
                       (item['id'], kind, item['createdAt'], json.dumps(item, allow_nan=False)))
        return item

    def get(self, kind, identifier):
        with self.connection() as db:
            row = db.execute('SELECT body FROM objects WHERE kind=? AND id=?', (kind, identifier)).fetchone()
        if row is None:
            raise KeyError(f'{kind} not found')
        return json.loads(row['body'])

    def list(self, kind):
        with self.connection() as db:
            rows = db.execute('SELECT body FROM objects WHERE kind=? ORDER BY created DESC', (kind,)).fetchall()
        return [json.loads(row['body']) for row in rows]

    def update_run(self, identifier, **updates):
        with self.lock, self.connection() as db:
            row = db.execute("SELECT body FROM objects WHERE kind='run' AND id=?", (identifier,)).fetchone()
            if row is None:
                raise KeyError('run not found')
            item = {**json.loads(row['body']), **updates, 'updatedAt': utc_now()}
            db.execute('UPDATE objects SET body=? WHERE id=?', (json.dumps(item, allow_nan=False), identifier))
        return item

    def submit(self, key, digest, body):
        """One transaction: same key/body returns same run, conflicting body is rejected."""
        with self.lock, self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT digest, run_id FROM submissions WHERE key=?', (key,)).fetchone()
            if prior:
                if prior['digest'] != digest:
                    raise ValueError('IDEMPOTENCY_CONFLICT')
                row = db.execute('SELECT body FROM objects WHERE id=?', (prior['run_id'],)).fetchone()
                return json.loads(row['body']), False
            item = {**body, 'id': uuid.uuid4().hex, 'createdAt': utc_now()}
            db.execute('INSERT INTO objects VALUES (?,?,?,?)',
                       (item['id'], 'run', item['createdAt'], json.dumps(item, allow_nan=False)))
            db.execute('INSERT INTO submissions VALUES (?,?,?)', (key, digest, item['id']))
        return item, True

    def prior_submission(self, key, digest):
        with self.connection() as db:
            prior = db.execute('SELECT digest,run_id FROM submissions WHERE key=?',(key,)).fetchone()
            if not prior:
                return None
            if prior['digest'] != digest:
                raise ValueError('IDEMPOTENCY_CONFLICT')
            row = db.execute('SELECT body FROM objects WHERE id=?',(prior['run_id'],)).fetchone()
            return json.loads(row['body'])

    def fail_interrupted(self):
        for run in self.list('run'):
            if run['status'] in ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED'):
                self.update_run(run['id'], status='FAILED', finishedAt=utc_now(),
                                error={'code': 'WORKER_RESTARTED', 'message': '계산 서비스가 재시작되었습니다. 새 실행으로 다시 시도하세요.'})
