const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkArt, PETS, frameCount } = require('../src/shared/sprites');

test('every pet frame is a 16 by 16 picture', function () {
  assert.deepEqual(checkArt(), []);
  assert.equal(PETS.length, 6);
  for (let i = 0; i < PETS.length; i++) {
    assert.ok(frameCount(PETS[i].shape) >= 2);
  }
});
