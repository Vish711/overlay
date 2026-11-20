import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkArt, PETS, frameCount } from '../src/shared/sprites.js';

test('every pet frame is a 16 by 16 picture', function () {
  assert.deepEqual(checkArt(), []);
  assert.equal(PETS.length, 6);
  for (let i = 0; i < PETS.length; i++) {
    assert.ok(frameCount(PETS[i].shape) >= 2);
  }
});
