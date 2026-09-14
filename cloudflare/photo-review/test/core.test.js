import test from 'node:test';
import assert from 'node:assert/strict';
import { clampFocus, extensionFor, formatFor } from '../src/core.js';

test('normalizes crop focus and media types', () => {
  assert.equal(clampFocus(-4), 0);
  assert.equal(clampFocus(140), 100);
  assert.equal(clampFocus('not a number'), 50);
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(formatFor('video', 'reel'), 'reel');
  assert.throws(() => formatFor('image', 'reel'));
});
