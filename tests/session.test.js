const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, applyMessage } = require('../src/shared/session');

function env(now) {
  return { now: now, width: 800, height: 600, rng: function () { return 0.25; } };
}

test('the same pet id keeps its place and gets new words', function () {
  const session = createSession();
  applyMessage(session, {
    type: 'pet',
    id: 'u:cat',
    shape: 'cat',
    color: '#ff6b6b',
    text: 'hi',
    userName: 'Ada',
    userId: 'u',
    name: 'Cat'
  }, env(1000));
  assert.equal(session.pets.length, 1);
  const x = session.pets[0].x;
  applyMessage(session, {
    type: 'pet',
    id: 'u:cat',
    shape: 'cat',
    color: '#ff6b6b',
    text: 'again',
    userName: 'Ada',
    userId: 'u',
    name: 'Cat'
  }, env(2000));
  assert.equal(session.pets.length, 1);
  assert.equal(session.pets[0].x, x);
  assert.equal(session.pets[0].text, 'again');
  assert.ok(session.pets[0].speechUntil > 2000);
});

test('switching rooms clears the pets', function () {
  const session = createSession();
  session.roomId = 'a';
  applyMessage(session, {
    type: 'pet',
    id: 'u:dog',
    shape: 'dog',
    text: 'woof',
    userId: 'u',
    userName: 'Bea',
    name: 'Dog',
    color: '#4ecdc4'
  }, env(1000));
  applyMessage(session, { type: 'watching', roomId: 'b' }, env(1000));
  assert.equal(session.roomId, 'b');
  assert.equal(session.pets.length, 0);
});
