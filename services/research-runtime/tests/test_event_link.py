"""PHASE 3F: the EarthEvent link on a simulation run.

The link lives in its own `run_event_link` table, not as a column on `objects` and not in the model
provenance. These tests pin the three properties that make that choice safe:

  · a ledger written before PHASE 3F still reads, and reports no event rather than failing
  · a new run records its event in the same transaction as the run row
  · dropping the table restores the pre-PHASE-3F state exactly - only links are lost

Nothing here touches physics, forcing, manifests or validation semantics.
"""
import json
import sqlite3
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path

from research_runtime.service import ResearchService, event_ids
from research_runtime.store import Store

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'
EVENT = 'eq-us7000test'
OTHER_EVENT = 'tc-1000001'


def fixture():
    return json.loads((EXAMPLES / 'constant-eastward.dataset.json').read_text(encoding='utf-8-sig'))


def spec():
    value = json.loads((EXAMPLES / 'constant-eastward.experiment.json').read_text(encoding='utf-8-sig'))
    value.update(durationSeconds=600, outputStepSeconds=300)   # lifecycle only; numerics tested elsewhere
    return value


class EventLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = ResearchService(self.temp.name)
        self.dataset = self.service.register_dataset(fixture())
        self.project = self.service.create_project({'name': '사건 연결', 'question': '사건에 붙은 실행을 되짚는다'})
        self.spec = spec()
        self.spec['projectId'] = self.project['id']
        self.experiment = self.service.create_experiment({
            'projectId': self.project['id'], 'datasetId': self.dataset['id'], 'spec': self.spec})

    def tearDown(self):
        self.service.close()
        self.temp.cleanup()

    def wait_run(self, identifier):
        for _ in range(800):
            run = self.service.get_run(identifier)
            if run['status'] in ('SUCCEEDED', 'FAILED', 'CANCELLED'):
                return run
            time.sleep(.025)
        self.fail('job failed to finish within 20s')

    # --- 1. legacy record: a run submitted without an event still reads, and reports none -------------
    def test_run_without_event_reads_and_reports_no_event(self):
        run = self.service.submit({'experimentId': self.experiment['id']}, 'legacy-run-0001')
        stored = self.service.get_run(run['id'], include_result=False)
        self.assertEqual([], stored['eventIds'])
        self.assertEqual([], self.service.store.events_for_run(run['id']))
        finished = self.wait_run(run['id'])
        self.assertEqual('SUCCEEDED', finished['status'], finished.get('error'))
        self.assertEqual([], finished['eventIds'])

    # --- 2. new run with an event ---------------------------------------------------------------------
    def test_run_with_event_records_the_link(self):
        run = self.service.submit({'experimentId': self.experiment['id'], 'eventId': EVENT}, 'evt-run-0001')
        self.assertEqual([EVENT], self.service.store.events_for_run(run['id']))
        self.assertEqual([EVENT], self.service.get_run(run['id'], include_result=False)['eventIds'])
        finished = self.wait_run(run['id'])
        self.assertEqual('SUCCEEDED', finished['status'], finished.get('error'))
        self.assertEqual([EVENT], finished['eventIds'])

    # --- 3. simulation lookup by event_id, both directions --------------------------------------------
    def test_lookup_by_event_and_back(self):
        run = self.service.submit({'experimentId': self.experiment['id'], 'eventId': EVENT}, 'evt-run-0002')
        forward = self.service.runs_for_event(EVENT)
        self.assertEqual(EVENT, forward['eventId'])
        self.assertEqual([run['id']], forward['runIds'])
        # reverse leg: run -> event, so an event timeline entry can be traced back to its run
        self.assertEqual([EVENT], self.service.get_run(run['id'], include_result=False)['eventIds'])
        # an event with nothing linked is an empty list, never an error and never a guess
        self.assertEqual({'eventId': OTHER_EVENT, 'runIds': []}, self.service.runs_for_event(OTHER_EVENT))

    def test_one_run_can_serve_several_events(self):
        run = self.service.submit({'experimentId': self.experiment['id'], 'eventIds': [EVENT, OTHER_EVENT]},
                                  'evt-run-0003')
        self.assertEqual([EVENT, OTHER_EVENT], sorted(self.service.store.events_for_run(run['id'])))
        for event in (EVENT, OTHER_EVENT):
            self.assertEqual([run['id']], self.service.runs_for_event(event)['runIds'])

    # --- 4. the link is part of the submission body, so idempotency covers it -------------------------
    def test_same_key_with_a_different_event_is_a_conflict(self):
        self.service.submit({'experimentId': self.experiment['id'], 'eventId': EVENT}, 'evt-conflict-01')
        with self.assertRaises(ValueError) as error:
            self.service.submit({'experimentId': self.experiment['id'], 'eventId': OTHER_EVENT}, 'evt-conflict-01')
        self.assertIn('IDEMPOTENCY_CONFLICT', str(error.exception))

    def test_replaying_the_same_submission_keeps_one_link(self):
        body = {'experimentId': self.experiment['id'], 'eventId': EVENT}
        first = self.service.submit(body, 'evt-replay-0001')
        second = self.service.submit(body, 'evt-replay-0001')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual([EVENT], self.service.store.events_for_run(first['id']))

    # --- 5. bad ids are rejected before anything is written ------------------------------------------
    def test_rejects_unusable_event_ids(self):
        for bad in ('', ' ', ' eq-1', 'eq-1 ', 'eq\n1', 'x' * 201, 5, {'id': 'eq-1'}):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    event_ids({'eventId': bad})
        with self.assertRaises(ValueError):
            event_ids({'eventIds': [f'eq-{i}' for i in range(21)]})
        # and nothing is written when the id is bad
        before = len(self.service.store.list('run'))
        with self.assertRaises(ValueError):
            self.service.submit({'experimentId': self.experiment['id'], 'eventId': ' bad'}, 'evt-bad-00001')
        self.assertEqual(before, len(self.service.store.list('run')))

    def test_accepts_both_canonical_event_id_shapes(self):
        # {kind}-{sourceId} (intel-feed) and {kind}:{sourceId} (LAB reports) must both pass
        self.assertEqual(('eq-us7000abcd',), event_ids({'eventId': 'eq-us7000abcd'}))
        self.assertEqual(('earthquake:us7000abcd',), event_ids({'eventId': 'earthquake:us7000abcd'}))
        self.assertEqual((), event_ids({'experimentId': 'x'}))
        self.assertEqual((), event_ids({'eventId': None}))


class MigrationRecoveryTests(unittest.TestCase):
    """The forward migration is CREATE TABLE IF NOT EXISTS; the rollback is DROP TABLE.

    Both directions are exercised against a real ledger so the recovery path is not a claim on paper.
    """
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    @contextmanager
    def _ledger(self):
        """Mirror Store.connection(): `with sqlite3.connect(...)` commits but never closes, and an open
        handle makes the Windows tempdir cleanup fail with WinError 32."""
        db = sqlite3.connect(self.directory / 'research.sqlite3')
        try:
            with db:
                yield db
        finally:
            db.close()

    def test_forward_migration_is_rerunnable_and_additive(self):
        store = Store(self.directory)
        run = store.create('run', {'status': 'QUEUED'})
        with self._ledger() as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual({'objects', 'submissions', 'run_event_link'}, tables)
        # Re-opening the same directory must not fail or duplicate anything.
        again = Store(self.directory)
        self.assertEqual(run['id'], again.get('run', run['id'])['id'])

    def test_pre_phase3f_ledger_still_reads_after_the_table_is_added(self):
        """Simulate a ledger written before PHASE 3F: drop the table, then reopen."""
        store = Store(self.directory)
        run, _ = store.submit('legacy-key-0001', 'digest-legacy', {'status': 'SUCCEEDED'})
        with self._ledger() as db:
            db.execute('DROP TABLE run_event_link')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn('run_event_link', tables)

        reopened = Store(self.directory)                       # forward migration runs here
        self.assertEqual(run['id'], reopened.get('run', run['id'])['id'])
        self.assertEqual([], reopened.events_for_run(run['id']))
        self.assertEqual([], reopened.runs_for_event(EVENT))
        self.assertEqual(run, reopened.prior_submission('legacy-key-0001', 'digest-legacy'))

    def test_rollback_loses_only_links(self):
        store = Store(self.directory)
        run, _ = store.submit('roll-key-000001', 'digest-roll', {'status': 'SUCCEEDED'}, event_ids=(EVENT,))
        self.assertEqual([EVENT], store.events_for_run(run['id']))
        before = store.get('run', run['id'])

        with self._ledger() as db:                             # documented rollback statement
            db.execute('DROP TABLE run_event_link')

        recovered = Store(self.directory)
        self.assertEqual(before, recovered.get('run', run['id']))   # run body byte-for-byte unchanged
        self.assertEqual([], recovered.events_for_run(run['id']))   # only the link is gone
        self.assertEqual(run, recovered.prior_submission('roll-key-000001', 'digest-roll'))

    def test_link_is_written_in_the_same_transaction_as_the_run(self):
        store = Store(self.directory)
        run, created = store.submit('atomic-key-0001', 'digest-atomic', {'status': 'QUEUED'},
                                    event_ids=(EVENT, OTHER_EVENT))
        self.assertTrue(created)
        with self._ledger() as db:
            rows = db.execute('SELECT run_id, event_id FROM run_event_link ORDER BY event_id').fetchall()
        self.assertEqual([(run['id'], EVENT), (run['id'], OTHER_EVENT)], sorted(rows))

    def test_duplicate_event_link_is_idempotent(self):
        store = Store(self.directory)
        run, _ = store.submit('dupe-key-000001', 'digest-dupe', {'status': 'QUEUED'}, event_ids=(EVENT, EVENT))
        self.assertEqual([EVENT], store.events_for_run(run['id']))

    def test_runs_for_event_ignores_links_whose_run_is_gone(self):
        """A link without its run must not surface a phantom run id (foreign keys are off)."""
        store = Store(self.directory)
        run, _ = store.submit('orphan-key-0001', 'digest-orphan', {'status': 'QUEUED'}, event_ids=(EVENT,))
        with self._ledger() as db:
            db.execute('DELETE FROM objects WHERE id=?', (run['id'],))
        self.assertEqual([], Store(self.directory).runs_for_event(EVENT))


class EventLinkHttpTests(unittest.TestCase):
    """GET /api/research/events/{event_id}/runs - the reverse leg over the real API."""

    def setUp(self):
        import threading
        from research_runtime.server import Server
        self.temp = tempfile.TemporaryDirectory()
        self.server = Server(0, self.temp.name, seed=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None, headers=None):
        import urllib.request
        data = None if body is None else json.dumps(body).encode()
        return urllib.request.urlopen(urllib.request.Request(
            self.url + path, data=data,
            headers={'Content-Type': 'application/json', **(headers or {})}), timeout=20)

    def test_event_runs_endpoint(self):
        import urllib.error
        import urllib.parse
        service = self.server.service
        value = spec()
        # The server seeds two example datasets; bind to the one this spec declares, or
        # create_experiment refuses with DATASET_BINDING_MISMATCH.
        wanted = value['datasetVersions'][0]['datasetId']
        dataset = next(d for d in service.dataset_index() if d['manifest']['datasetId'] == wanted)
        project = service.create_project({'name': 'HTTP 사건 연결', 'question': 'API 로 되짚는다'})
        value['projectId'] = project['id']
        experiment = service.create_experiment({'projectId': project['id'], 'datasetId': dataset['id'], 'spec': value})

        with self.request(f'/api/research/events/{EVENT}/runs') as response:
            self.assertEqual({'eventId': EVENT, 'runIds': []}, json.load(response))

        with self.request('/api/research/runs', {'experimentId': experiment['id'], 'eventId': EVENT},
                          {'Idempotency-Key': 'http-evt-000001'}) as response:
            run = json.load(response)['run']

        with self.request(f'/api/research/events/{EVENT}/runs') as response:
            self.assertEqual({'eventId': EVENT, 'runIds': [run['id']]}, json.load(response))
        with self.request(f'/api/research/runs/{run["id"]}') as response:
            self.assertEqual([EVENT], json.load(response)['run']['eventIds'])

        # a colon-shaped LAB event id must survive URL encoding
        quoted = urllib.parse.quote('earthquake:us7000abcd', safe='')
        with self.request(f'/api/research/events/{quoted}/runs') as response:
            self.assertEqual({'eventId': 'earthquake:us7000abcd', 'runIds': []}, json.load(response))

        # an unusable id is refused, not answered with an empty list
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/api/research/events/%20/runs')
        self.assertEqual(422, error.exception.code)


if __name__ == '__main__':
    unittest.main()
