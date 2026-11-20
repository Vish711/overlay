// How pets walk.
//
// Each pet has:
//   heading  which way it is pointed. 0 means right. A full turn is
//            about 6.28 (that is 2 * pi, called radians).
//   vx, vy   how fast it moves, in pixels per second. Right and down
//            are positive.
//
// Dragging a pet stores that spot as homeX, homeY. The pet keeps walking
// around that spot. If it gets more than ROAM pixels away, it walks back.
//
// Every frame we do four things, in order:
// 1. Pick a behavior (sit, wander, dash, walk toward a friend, or go home).
//    A line can also give an order: sit, come, run, or dance. That order
//    lasts until its timer ends. Then the pet picks on its own again.
// 2. Steer. Turn a little toward the direction we want. Do not snap.
//    If another pet is too close, turn away from it instead.
// 3. Move. Add velocity * seconds to x and y. Bounce off the edges.
// 4. Bump. If two circles overlap, push them apart and trade the speed
//    that points along the line between them. Same as two equal pool balls.

import { buildHash, queryNearby, CELL } from './spatial.js';
import type { Pet } from './types.js';

interface Personality {
  cruise: number;
  turn: number;
  sit: boolean;
  dash: number;
  seek: number;
}

// cruise: normal speed, pixels per second
// turn: how fast the pet can change direction, in radians per second
// sit: cats rest sometimes
// dash: dogs sometimes run faster. 0 means never.
// seek: chance to walk toward another pet. 1 means always, when the roll says so.
const PERSONALITIES: { [shape: string]: Personality } = {
  cat:   { cruise: 28, turn: 1.1, sit: true,  dash: 0,   seek: 0 },
  dog:   { cruise: 64, turn: 2.2, sit: false, dash: 2.2, seek: 0.2 },
  ghost: { cruise: 34, turn: 0.55, sit: false, dash: 0,   seek: 0 },
  fire:  { cruise: 52, turn: 4.2, sit: false, dash: 0,   seek: 0 },
  star:  { cruise: 40, turn: 0.8, sit: false, dash: 0,   seek: 0 },
  heart: { cruise: 46, turn: 1.6, sit: false, dash: 0,   seek: 1 }
};

const COMFORT = 2.4;
const COLLISION_PASSES = 3;
const MAX_SPEED = 240;
const ROAM = 280;

function personalityOf(shape: string): Personality {
  return PERSONALITIES[shape] || PERSONALITIES.cat;
}

// Keep an angle between -pi and pi, so "just past a full turn" is a small number.
export function wrapAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  let wrapped = angle % fullTurn;
  if (wrapped <= -Math.PI) wrapped += fullTurn;
  if (wrapped > Math.PI) wrapped -= fullTurn;
  return wrapped;
}

// Turn from current toward target, but never more than maxStep in one call.
// We take the short way around the circle.
export function rotateToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  const sign = diff < 0 ? -1 : 1;
  return wrapAngle(current + sign * maxStep);
}

function centerOf(pet: Pet): { x: number; y: number } {
  return {
    x: pet.x + pet.width / 2,
    y: pet.y + pet.height / 2
  };
}

function nearest(pet: Pet, neighbors: Pet[]): Pet | null {
  const here = centerOf(pet);
  let best: Pet | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const there = centerOf(other);
    const dist = Math.hypot(there.x - here.x, there.y - here.y);
    if (dist < bestDist) {
      best = other;
      bestDist = dist;
    }
  }
  return best;
}

function distanceToHome(pet: Pet): number {
  if (pet.homeX == null || pet.homeY == null) return 0;
  const here = centerOf(pet);
  const homeX = pet.homeX + pet.width / 2;
  const homeY = pet.homeY + pet.height / 2;
  return Math.hypot(homeX - here.x, homeY - here.y);
}

function isOrder(state: string): boolean {
  return state === 'sit' || state === 'run' || state === 'come' || state === 'dance';
}

function petNamed(pets: Pet[], id: string): Pet | null {
  for (let i = 0; i < pets.length; i++) {
    if (pets[i].userId === id || pets[i].id === id) return pets[i];
  }
  return null;
}

// Roll a random number and pick what the pet does until stateUntil.
// An order from a message is kept until it runs out.
function chooseBehavior(pet: Pet, personality: Personality, others: Pet[], now: number, rng: () => number): void {
  if (isOrder(pet.state) && now < pet.stateUntil) return;

  if (pet.talkUntil && now < pet.talkUntil) {
    pet.state = 'talk';
    return;
  }
  if (pet.state === 'talk') {
    pet.state = 'wander';
    pet.stateUntil = 0;
  }
  if (pet.homeX != null && pet.homeY != null && distanceToHome(pet) > ROAM) {
    pet.state = 'return';
    pet.stateUntil = now + 400;
    return;
  }
  if (pet.state === 'return') {
    pet.state = 'wander';
    pet.stateUntil = 0;
  }
  if (now < pet.stateUntil) return;

  const roll = rng();
  if (personality.sit && roll < 0.28) {
    pet.state = 'sit';
    pet.stateUntil = now + 1600;
    return;
  }
  if (personality.dash && roll > 0.82) {
    pet.state = 'dash';
    pet.stateUntil = now + 700;
    pet.wanderTarget = rng() * Math.PI * 2;
    return;
  }
  // Looking for a friend uses the whole list. Bumps only use nearby pets.
  if (personality.seek && others.length > 0 && roll < personality.seek) {
    pet.state = 'seek';
    pet.stateUntil = now + 2000;
    return;
  }
  pet.state = 'wander';
  pet.stateUntil = now + 1500 + rng() * 2000;
  pet.wanderTarget = rng() * Math.PI * 2;
}

// Point the pet, then set vx and vy from that direction and the speed.
function steer(pet: Pet, personality: Personality, nearby: Pet[], others: Pet[], dt: number, rng: () => number): void {
  if (!isFinite(pet.heading)) pet.heading = 0;

  if (pet.state === 'sit' || pet.state === 'talk' || pet.state === 'dance') {
    pet.vx = 0;
    pet.vy = 0;
    return;
  }

  let desired = pet.heading;
  if (pet.state === 'wander') {
    // About once every 2 seconds, pick a new direction.
    if (rng() < dt / 2) pet.wanderTarget = rng() * Math.PI * 2;
    desired = pet.wanderTarget;
  } else if (pet.state === 'seek') {
    const target = nearest(pet, others);
    if (target) {
      const here = centerOf(pet);
      const there = centerOf(target);
      desired = Math.atan2(there.y - here.y, there.x - here.x);
    }
  } else if (pet.state === 'come') {
    const target = petNamed(others, pet.focusId);
    if (target) {
      const here = centerOf(pet);
      const there = centerOf(target);
      desired = Math.atan2(there.y - here.y, there.x - here.x);
    }
  } else if (pet.state === 'run' || pet.state === 'dash' || pet.state === 'stroll') {
    desired = pet.wanderTarget;
  } else if (pet.state === 'return' && pet.homeX != null && pet.homeY != null) {
    const here = centerOf(pet);
    desired = Math.atan2(
      (pet.homeY + pet.height / 2) - here.y,
      (pet.homeX + pet.width / 2) - here.x
    );
  }

  // If someone is inside the comfort circle, face away from them.
  const here = centerOf(pet);
  let awayX = 0;
  let awayY = 0;
  let close = 0;
  const comfort = pet.radius * COMFORT;
  for (let i = 0; i < nearby.length; i++) {
    const there = centerOf(nearby[i]);
    const dx = here.x - there.x;
    const dy = here.y - there.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    // The pet we were told to walk toward is allowed to get close.
    if (pet.state === 'come' && (nearby[i].userId === pet.focusId || nearby[i].id === pet.focusId)) continue;
    if (dist < comfort) {
      awayX += dx / dist;
      awayY += dy / dist;
      close++;
    }
  }
  if (close > 0) desired = Math.atan2(awayY, awayX);

  pet.heading = rotateToward(pet.heading, desired, personality.turn * dt);

  let speed = personality.cruise;
  if (pet.state === 'dash') speed = personality.cruise * personality.dash;
  if (pet.state === 'run') speed = 140;
  if (pet.state === 'come') speed = 90;
  if (pet.state === 'stroll') speed = 34;
  if (pet.state === 'return') speed = 78;
  const wantX = Math.cos(pet.heading) * speed;
  const wantY = Math.sin(pet.heading) * speed;
  // Slide the current speed toward the wanted speed. Do not snap.
  const blend = Math.min(1, dt * 3);
  pet.vx += (wantX - pet.vx) * blend;
  pet.vy += (wantY - pet.vy) * blend;
}

function reflect(pet: Pet, vx: number, vy: number): void {
  pet.vx = vx;
  pet.vy = vy;
  pet.heading = Math.atan2(vy, vx);
  pet.wanderTarget = pet.heading;
}

// Keep the pet inside the window. Hitting an edge reverses that part of the speed.
function clampPet(pet: Pet, bounds: { width: number; height: number }): void {
  const maxX = Math.max(0, bounds.width - pet.width);
  const maxY = Math.max(0, bounds.height - pet.height);

  if (pet.x < 0) {
    pet.x = 0;
    if (pet.vx < 0) reflect(pet, -pet.vx, pet.vy);
  } else if (pet.x > maxX) {
    pet.x = maxX;
    if (pet.vx > 0) reflect(pet, -pet.vx, pet.vy);
  }

  if (pet.y < 0) {
    pet.y = 0;
    if (pet.vy < 0) reflect(pet, pet.vx, -pet.vy);
  } else if (pet.y > maxY) {
    pet.y = maxY;
    if (pet.vy > 0) reflect(pet, pet.vx, -pet.vy);
  }

  const speed = Math.hypot(pet.vx, pet.vy);
  if (speed > MAX_SPEED) {
    pet.vx = pet.vx / speed * MAX_SPEED;
    pet.vy = pet.vy / speed * MAX_SPEED;
  }
  if (pet.vx < -4) pet.facing = -1;
  else if (pet.vx > 4) pet.facing = 1;
}

// Two overlapping circles.
// 1. Find the line between their centers.
// 2. Push them apart along that line so they just touch.
// 3. If they were moving toward each other, trade the speed along that line.
//    The sideways speed stays. That is a fair bump for two pets of the same weight.
export function resolvePair(a: Pet, b: Pet): boolean {
  if (a.dragging && b.dragging) return false;
  const ac = centerOf(a);
  const bc = centerOf(b);
  let dx = bc.x - ac.x;
  let dy = bc.y - ac.y;
  let dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return false;

  // Same pixel has no direction. Nudge along x so we still have a line.
  if (dist < 0.001) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;

  if (a.dragging) {
    b.x += nx * overlap;
    b.y += ny * overlap;
    return true;
  }
  if (b.dragging) {
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    return true;
  }

  a.x -= nx * overlap / 2;
  a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2;
  b.y += ny * overlap / 2;

  const speedA = a.vx * nx + a.vy * ny;
  const speedB = b.vx * nx + b.vy * ny;
  // Already moving apart. Leave the speeds alone.
  if (speedA <= speedB) return true;

  const changeA = speedB - speedA;
  const changeB = speedA - speedB;
  a.vx += changeA * nx;
  a.vy += changeA * ny;
  b.vx += changeB * nx;
  b.vy += changeB * ny;
  a.heading = Math.atan2(a.vy, a.vx);
  b.heading = Math.atan2(b.vy, b.vx);
  return true;
}

function resolveCollisions(pets: Pet[]): void {
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    const hash = buildHash(pets, CELL);
    const seen: { [pair: string]: boolean } = {};
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      const nearby = queryNearby(hash, pet);
      for (let j = 0; j < nearby.length; j++) {
        const other = nearby[j];
        const pair = pet.id < other.id ? pet.id + '|' + other.id : other.id + '|' + pet.id;
        if (seen[pair]) continue;
        seen[pair] = true;
        resolvePair(pet, other);
      }
    }
  }
}

// Move every pet forward by dt seconds. dt is capped so a long pause
// does not throw a pet across the screen.
export function stepPets(pets: Pet[], bounds: { width: number; height: number }, dt: number, now: number, rng?: () => number): void {
  const step = Math.max(0, Math.min(dt, 0.05));
  const random = rng || Math.random;
  const hash = buildHash(pets, CELL);

  for (let i = 0; i < pets.length; i++) {
    const pet = pets[i];
    if (pet.dragging) continue;
    const personality = personalityOf(pet.shape);
    const nearby = queryNearby(hash, pet);
    const others: Pet[] = [];
    for (let j = 0; j < pets.length; j++) {
      if (pets[j] !== pet) others.push(pets[j]);
    }
    chooseBehavior(pet, personality, others, now, random);
    steer(pet, personality, nearby, others, step, random);
    pet.x += pet.vx * step;
    pet.y += pet.vy * step;
    clampPet(pet, bounds);
  }

  resolveCollisions(pets);
  for (let i = 0; i < pets.length; i++) {
    clampPet(pets[i], bounds);
  }
}

// A pet used by the tests. Pass any fields you want to change.
export function blankPet(fields?: Partial<Pet>): Pet {
  const pet: Pet = {
    id: 'pet',
    name: 'Pet',
    shape: 'star',
    color: '#a29bfe',
    userId: 'u',
    userName: 'player',
    text: '',
    x: 0,
    y: 0,
    homeX: null,
    homeY: null,
    vx: 0,
    vy: 0,
    heading: 0,
    wanderTarget: 0,
    state: 'wander',
    stateUntil: 1e15,
    facing: 1,
    phase: 0,
    width: 64,
    height: 64,
    radius: 26,
    dragging: false,
    speechUntil: 0,
    talkUntil: 0,
    focusId: '',
    danceUntil: 0,
    drawX: 0,
    drawY: 0,
    bubble: null,
    dragOffsetX: 0,
    dragOffsetY: 0
  };
  if (fields) Object.assign(pet, fields);
  return pet;
}
