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
                -- PHASE 3F: which EarthEvent a run was submitted for. Additive on purpose.
                --
                -- Why a separate table instead of a column on objects: the three INSERTs into objects are
                -- positional (`VALUES (?,?,?,?)`), so a new column would silently land in the wrong slot or
                -- fail outright. A missing row is also a better "no event" than a NULL column - legacy runs
                -- need no backfill and read exactly as they did before.
                --
                -- Why not in the model provenance: the event link is a linkage, not a model input. It must
                -- not change models.py (whose SHA is pinned by test_08_v1_immutable) and it must not alter
                -- any manifest, forcing or validation value.
                --
                -- Rollback is `DROP TABLE run_event_link`, which restores the exact prior schema because
                -- nothing outside this table changed. Only links are lost; no run, result or hash is touched.
                CREATE TABLE IF NOT EXISTS run_event_link (
                    run_id TEXT NOT NULL, event_id TEXT NOT NULL, linked_at TEXT NOT NULL,
                    PRIMARY KEY (run_id, event_id)
                );
                CREATE INDEX IF NOT EXISTS run_event_link_event_idx ON run_event_link(event_id);
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

    def submit(self, key, digest, body, event_ids=()):
        """One transaction: same key/body returns same run, conflicting body is rejected.

        event_ids are written in the same transaction as the run, so a run never exists with its
        EarthEvent link half-written. Passing none keeps the pre-PHASE-3F behaviour exactly.
        """
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
            linked_at = utc_now()
            for event_id in event_ids:
                db.execute('INSERT OR IGNORE INTO run_event_link VALUES (?,?,?)', (item['id'], event_id, linked_at))
        return item, True

    def events_for_run(self, run_id):
        """EarthEvent ids this run was submitted for. Empty for every pre-PHASE-3F run."""
        with self.connection() as db:
            rows = db.execute('SELECT event_id FROM run_event_link WHERE run_id=? ORDER BY event_id',
                              (run_id,)).fetchall()
        return [row['event_id'] for row in rows]

    def runs_for_event(self, event_id):
        """Run ids linked to one EarthEvent, newest first. Reverse leg of the event timeline trace."""
        with self.connection() as db:
            rows = db.execute(
                'SELECT link.run_id AS run_id FROM run_event_link AS link '
                'JOIN objects AS o ON o.id = link.run_id AND o.kind = \'run\' '
                'WHERE link.event_id = ? ORDER BY o.created DESC', (event_id,)).fetchall()
        return [row['run_id'] for row in rows]

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
