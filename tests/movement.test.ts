import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepPets, resolvePair, rotateToward, wrapAngle, blankPet } from '../src/shared/movement.js';

test('a head-on hit swaps the speeds and separates the circles', function () {
  const a = blankPet({ id: 'a', x: 0, y: 0, vx: 30, vy: 0 });
  const b = blankPet({ id: 'b', x: 40, y: 0, vx: -30, vy: 0 });
  assert.equal(resolvePair(a, b), true);
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  assert.ok(Math.hypot(dx, dy) >= a.radius + b.radius - 0.01);
  assert.ok(a.vx < 0);
  assert.ok(b.vx > 0);
});

test('pets stay inside the stage', function () {
  const pet = blankPet({
    id: 'p',
    shape: 'dog',
    x: 100,
    y: 40,
    heading: 0,
    wanderTarget: 0,
    state: 'wander',
    stateUntil: 1e15
  });
  const bounds = { width: 220, height: 200 };
  let now = 0;
  for (let i = 0; i < 600; i++) {
    stepPets([pet], bounds, 1 / 60, now, function () { return 0.5; });
    now += 16;
    assert.ok(pet.x >= 0 && pet.x <= bounds.width - pet.width);
    assert.ok(pet.y >= 0 && pet.y <= bounds.height - pet.height);
  }
});

test('a cat sits when the roll is low', function () {
  const cat = blankPet({
    id: 'c',
    shape: 'cat',
    x: 80,
    y: 80,
    state: 'wander',
    stateUntil: 0
  });
  stepPets([cat], { width: 800, height: 600 }, 1 / 60, 5000, function () { return 0; });
  assert.equal(cat.state, 'sit');
});

test('a heart walks toward another pet', function () {
  const heart = blankPet({
    id: 'h',
    shape: 'heart',
    x: 80,
    y: 200,
    heading: 0,
    state: 'wander',
    stateUntil: 0
  });
  const other = blankPet({
    id: 'o',
    shape: 'star',
    x: 460,
    y: 200,
    state: 'sit',
    stateUntil: 1e15
  });
  const start = heart.x;
  let now = 1000;
  for (let i = 0; i < 180; i++) {
    stepPets([heart, other], { width: 800, height: 600 }, 1 / 60, now, function () { return 0; });
    now += 16;
  }
  assert.ok(heart.x > start + 60, 'heart x moved from ' + start + ' to ' + heart.x);
});

test('a pet with a home walks back to it', function () {
  const pet = blankPet({
    id: 'p',
    shape: 'cat',
    x: 0,
    y: 80,
    homeX: 620,
    homeY: 80,
    state: 'wander',
    stateUntil: 0
  });
  let now = 1000;
  for (let i = 0; i < 150; i++) {
    stepPets([pet], { width: 800, height: 600 }, 1 / 60, now, function () { return 0.95; });
    now += 16;
  }
  assert.ok(pet.x > 120, 'pet walked home, x=' + pet.x);
});

test('a pet near the spot you dropped it keeps walking', function () {
  const pet = blankPet({
    id: 'p',
    shape: 'star',
    x: 100,
    y: 100,
    homeX: 100,
    homeY: 100,
    state: 'wander',
    stateUntil: 0
  });
  const start = pet.x;
  let now = 1000;
  for (let i = 0; i < 90; i++) {
    stepPets([pet], { width: 800, height: 600 }, 1 / 60, now, function () { return 0.5; });
    now += 16;
  }
  assert.ok(Math.abs(pet.x - start) > 15, 'star x moved from ' + start + ' to ' + pet.x);
});

test('come walks toward the person who asked', function () {
  const pet = blankPet({
    id: 'b',
    userId: 'bob',
    x: 80,
    y: 200,
    heading: 0,
    state: 'come',
    stateUntil: 1e15,
    focusId: 'ann'
  });
  const caller = blankPet({
    id: 'ann',
    userId: 'ann',
    x: 460,
    y: 200,
    state: 'sit',
    stateUntil: 1e15
  });
  const start = pet.x;
  let now = 1000;
  for (let i = 0; i < 120; i++) {
    stepPets([pet, caller], { width: 800, height: 600 }, 1 / 60, now, function () { return 0.5; });
    now += 16;
  }
  assert.ok(pet.x > start + 60, 'pet walked toward the caller, x=' + pet.x);
});

test('run keeps going the way it was pointed', function () {
  const pet = blankPet({
    id: 'r',
    x: 40,
    y: 200,
    heading: 0,
    wanderTarget: 0,
    state: 'run',
    stateUntil: 1e15
  });
  const start = pet.x;
  stepPets([pet], { width: 800, height: 600 }, 1 / 60, 1000, function () { return 0.5; });
  assert.ok(pet.x > start);
});

test('turning takes the short way around the circle', function () {
  const moved = rotateToward(3, -3, 1);
  assert.ok(Math.abs(wrapAngle(moved - (-3))) < 0.001);
});
