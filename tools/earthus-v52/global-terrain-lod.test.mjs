import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProgressiveRenderPolicy,
  VIEW_SCOPE,
} from '../../prototype/v2/js/progressive-planet-intelligence.js';

test('stable full-quality global Earth refines real terrain instead of holding the coarse photo-globe budget', () => {
  const policy = buildProgressiveRenderPolicy({
    scope: VIEW_SCOPE.GLOBAL,
    deviceProfile: { quality: 'FULL', maxFps: 60 },
    executionPlan: {
      primaryEngine: 'RELIEF',
      fetchPolicy: 'VISIBLE_PLUS_PREFETCH',
      cloudMode: 'OFF',
    },
    moving: false,
  });

  assert.equal(policy.maximumScreenSpaceError, 1.05);
  assert.equal(policy.progressiveRefinement, true);
  assert.equal(policy.centerFirst, true);
});
