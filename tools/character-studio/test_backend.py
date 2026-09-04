import base64
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zlib

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('dev', ROOT / 'tools/character-studio/dev_server.py')
dev = importlib.util.module_from_spec(spec); spec.loader.exec_module(dev)
h = dev.studio


def png():
    def chunk(name, value):
        return struct.pack('>I', len(value)) + name + value + struct.pack('>I', zlib.crc32(name + value))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 32, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\x45\x88\x65\x80' * 32) * 32)) + chunk(b'IEND', b'')


def character():
    layers = [dict(id=f'part_{i}', role='body', rect=[0, 0, 1, 1], pivot=[.5, .5], x=0, y=.5, width=.4, height=.4, depth=i * .01, rotation=0) for i in range(3)]
    return dict(character_id='test-yeti', name='테스트 예티', prompt='paper yeti', region='히말라야', league='', placement=dict(lat=30, lon=85, scale=.08), motion='breathe', lod=dict(enter_px=100, exit_px=80), layers=layers, assets={}, hashes={}, approvals={'master': '', 'motion': False}, references={}, updated_at='2026-09-04T00:00:00Z')


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.store = dev.LocalStore(self.temp.name); self.c = character()

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, **data):
        return h.dispatch(self.store, dict(action=action, character_id=self.c['character_id'], **data), 'admin-test', key_available=False)

    def complete(self):
        for slot in h.SLOTS:
            asset = self.call('asset_put', slot=slot, png=base64.b64encode(png()).decode()); self.c['assets'][slot] = asset; self.c['hashes'][slot] = asset['hash']
        self.c['approvals'] = dict(master=self.c['hashes']['master_sheet'], motion=True)
        self.c['references'] = dict(runtime_3q=self.c['hashes']['master_sheet'], parts_atlas=self.c['hashes']['runtime_3q'])

    def test_save_reload_conflict_and_no_public_draft(self):
        first = self.call('save', character=self.c, revision=None)
        self.assertEqual(self.call('get')['character']['name'], '테스트 예티')
        self.assertIsNone(self.store.get(h.PUBLIC + 'catalog.json')[0])
        with self.assertRaises(h.Conflict):
            self.call('save', character=self.c, revision=None)
        self.c['name'] = '수정 예티'
        self.call('save', character=self.c, revision=first['revision'])

    def test_export_publication_has_exact_filenames_and_unpublish_keeps_draft(self):
        self.complete(); revision = self.call('save', character=self.c, revision=None)['revision']
        published = self.call('publish', revision=revision)
        catalog, _ = h.read_json(self.store, h.PUBLIC + 'catalog.json')
        self.assertEqual(len(catalog['characters']), 1)
        m = h.manifest(self.c)
        for name in m['files'].values():
            self.assertIsNotNone(self.store.get(h.PUBLIC + 'test-yeti/' + name)[0])
        self.assertIn('/versions/', catalog['characters'][0]['manifest'])
        self.call('unpublish', revision=published['revision'])
        catalog, _ = h.read_json(self.store, h.PUBLIC + 'catalog.json'); self.assertEqual(catalog['characters'], [])
        self.assertEqual(self.call('get')['character']['name'], self.c['name'])

    def test_incomplete_and_stale_design_cannot_publish(self):
        revision = self.call('save', character=self.c, revision=None)['revision']
        with self.assertRaises(h.ApiError):
            self.call('publish', revision=revision)
        self.complete(); self.c['references']['runtime_3q'] = 'old'
        with self.assertRaises(h.ApiError):
            h.validate(self.c, complete=True)

    def test_key_missing_does_not_queue_or_charge(self):
        self.call('save', character=self.c, revision=None)
        self.assertFalse(self.call('status')['image_generation_ready'])
        with self.assertRaises(h.ApiError) as error:
            self.call('generate', slot='master_sheet', request_id=str(uuid.uuid4()))
        self.assertEqual(error.exception.status, 503)
        self.assertEqual(self.call('get')['character']['generation_count'], 0)
        self.assertEqual(self.store.list(h.PRIVATE + 'jobs/'), [])

    def test_generation_idempotency_and_server_owned_limit(self):
        self.call('save', character=self.c, revision=None); queued = []; request = dict(action='generate', character_id='test-yeti', slot='master_sheet', request_id=str(uuid.uuid4()))
        a = h.dispatch(self.store, request, 'admin-test', queued.append, True)
        b = h.dispatch(self.store, request, 'admin-test', queued.append, True)
        self.assertEqual(a['job_id'], b['job_id']); self.assertEqual(len(queued), 1)
        current = self.call('get'); self.assertEqual(current['character']['generation_count'], 1)
        self.c['generation_count'] = 0
        self.call('save', character=self.c, revision=current['revision'])
        self.assertEqual(self.call('get')['character']['generation_count'], 1)
        with patch.object(h, 'image_key', return_value='test-only'), patch.object(h, 'call_openai', return_value=(png(), {'output_tokens': 1})) as provider:
            h.generate_worker(self.store, queued[0]); h.generate_worker(self.store, queued[0]); self.assertEqual(provider.call_count, 1)

    def test_paths_invalid_numbers_and_foreign_assets_rejected(self):
        for cid in ['../escape', 'bad/name', '한글', 'ab?x']:
            with self.assertRaises(h.ApiError):
                h.character_id(cid)
        asset = self.call('asset_put', slot='master_sheet', png=base64.b64encode(png()).decode())
        with self.assertRaises(h.ApiError):
            h.asset_bytes(self.store, 'other-id', asset)
        for value in [float('nan'), 999, '37.5', True]:
            c = copy.deepcopy(self.c); c['placement']['lat'] = value
            with self.assertRaises(h.ApiError):
                h.validate(c)

    def test_unauthorized_and_url_worker_spoof_rejected_before_storage(self):
        for event in [dict(requestContext={'http': {'method': 'POST'}}, headers={}, body='{}'), dict(requestContext={'http': {'method': 'POST'}}, headers={}, body=json.dumps({'worker_job': 'any'}))]:
            with patch.object(h, 'S3Store', side_effect=AssertionError('must not reach storage')):
                self.assertEqual(h.handler(event, None)['statusCode'], 401)


if __name__ == '__main__':
    unittest.main()
