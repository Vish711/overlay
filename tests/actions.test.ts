import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionFromText } from '../src/shared/actions.js';

test('the first known word picks the action', function () {
  assert.equal(actionFromText('please sit'), 'sit');
  assert.equal(actionFromText('come over here'), 'come');
  assert.equal(actionFromText('Run!'), 'run');
  assert.equal(actionFromText('do a little dance'), 'dance');
  assert.equal(actionFromText('hello there'), 'say');
});
