import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetVisible, launchStatusLabel } from '../prototype/js/space/mission-readability.js';

test('satellite topic reveals its initially hidden widget without mutating saved layout', () => {
  const hidden = ['SATELLITE_PASS', 'JWST'];
  assert.equal(widgetVisible('SATELLITE_PASS', hidden, ['SATELLITE_PASS']), true);
  assert.equal(widgetVisible('COUNTDOWN', hidden, ['SATELLITE_PASS']), false);
  assert.deepEqual(hidden, ['SATELLITE_PASS', 'JWST']);
  assert.equal(widgetVisible('SATELLITE_PASS', hidden, null), false);
  assert.equal(widgetVisible('COUNTDOWN', hidden, null), true);
});
test('uncertain launch status stays uncertain and unknown statuses are preserved', () => {
  assert.equal(launchStatusLabel('To Be Confirmed'), '일정 미확정');
  assert.equal(launchStatusLabel('To Be Determined'), '일정 미정');
  assert.equal(launchStatusLabel('New provider status'), 'New provider status');
  assert.equal(launchStatusLabel(null), '상태 미수신');
});
