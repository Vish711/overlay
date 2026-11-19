const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stepPets, resolvePair, rotateToward, wrapAngle, blankPet } = require('../src/shared/movement');

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
    x: 40,
    y: 80,
    homeX: 320,
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

test('a pet sitting on its home stays put', function () {
  const pet = blankPet({
    id: 'p',
    shape: 'star',
    x: 100,
    y: 100,
    homeX: 100,
    homeY: 100,
    state: 'wander',
    stateUntil: 0,
    vx: 40
  });
  stepPets([pet], { width: 800, height: 600 }, 1 / 60, 1000, function () { return 0.1; });
  assert.equal(pet.state, 'sit');
  assert.equal(pet.vx, 0);
});

test('turning takes the short way around the circle', function () {
  const moved = rotateToward(3, -3, 1);
  assert.ok(Math.abs(wrapAngle(moved - (-3))) < 0.001);
});
