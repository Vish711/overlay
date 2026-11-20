import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyMessage } from '../src/shared/session.js';
import type { ScreenEnv } from '../src/shared/session.js';

function env(now: number): ScreenEnv {
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

test('sit is only for the person you named', function () {
  const session = createSession();
  applyMessage(session, {
    type: 'pet',
    id: 'ann',
    shape: 'cat',
    color: '#ff6b6b',
    text: '',
    userName: 'Ann',
    userId: 'ann',
    name: 'Cat'
  }, env(1000));
  applyMessage(session, {
    type: 'pet',
    id: 'bob',
    shape: 'dog',
    color: '#4ecdc4',
    text: '',
    userName: 'Bob',
    userId: 'bob',
    name: 'Dog'
  }, env(1000));
  applyMessage(session, {
    type: 'pet',
    id: 'ann',
    shape: 'cat',
    color: '#ff6b6b',
    text: 'sit please',
    userName: 'Ann',
    userId: 'ann',
    name: 'Cat',
    to: 'bob',
    toName: 'Bob',
    action: 'sit'
  }, env(3000));
  assert.equal(session.pets[0].text, 'sit please');
  assert.equal(session.pets[0].toName, 'Bob');
  assert.equal(session.pets[0].state, 'talk');
  assert.equal(session.pets[1].state, 'sit');
  assert.equal(session.pets[1].text, '');
});

test('come remembers who to walk toward', function () {
  const session = createSession();
  applyMessage(session, {
    type: 'pet',
    id: 'bob',
    shape: 'dog',
    color: '#4ecdc4',
    text: '',
    userId: 'bob',
    userName: 'Bob',
    name: 'Dog'
  }, env(1000));
  applyMessage(session, {
    type: 'pet',
    id: 'ann',
    shape: 'cat',
    color: '#ff6b6b',
    text: 'come here',
    userId: 'ann',
    userName: 'Ann',
    name: 'Cat',
    to: 'bob',
    action: 'come'
  }, env(2000));
  assert.equal(session.pets[0].state, 'come');
  assert.equal(session.pets[0].focusId, 'ann');
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
