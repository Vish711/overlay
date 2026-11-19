// How pets walk.
//
// Each pet has a heading (an angle in radians) and a velocity (vx, vy).
//
// A pet with a home (homeX, homeY) stays near the spot you dropped it.
// Most of the time it sits. Sometimes it takes a short stroll. If its
// center is more than 72 pixels from home, it walks back. Dragging the
// pet sets a new home. Pets with no home wander, and a heart may walk
// toward another pet.
//
// Every frame we do four things, in this order:
//
// 1. Pick a behavior from the pet's personality.
//    Cat sometimes sits. Dog sometimes dashes. Heart walks toward another pet,
//    even one on the far side of the screen.
//    Fire turns sharply, so its path zigzags. Ghost and star turn slowly,
//    so they drift in long curves. A pet that just "said" something stands
//    still for a moment (the talk state) so you can read the bubble.
// 2. Steer. Turn the heading a little toward the direction we want.
//    We do not snap to the new direction; max turn speed is personality.turn
//    radians per second. If another pet is inside the comfort radius, we
//    turn away from it instead. That is the separation rule.
// 3. Move. x and y change by velocity * dt. dt is the seconds since the
//    last frame. Hitting the edge of the screen reflects the velocity,
//    the same way a ball bounces off a wall.
// 4. Collide. Overlapping circles are pushed apart. If they were moving
//    toward each other, they swap the part of their velocity that lies on
//    the line between them. Same mass, so a head-on hit exchanges speeds.
//    We repeat that a few times because one push can shove a pet into a
//    third pet.
//
// Positions are the top-left of the 64x64 sprite. Circles use the center.
// The wrapper below lets this file run in the page and in the tests.

(function (root, factory) {
  let Spatial = root.Spatial;
  if (!Spatial && typeof require === 'function') {
    Spatial = require('./spatial');
  }
  const api = factory(Spatial);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.Movement = api;
})(globalThis, function (Spatial) {
  if (!Spatial) {
    throw new Error('spatial.js has to load before movement.js');
  }

  const PERSONALITIES = {
    cat:   { cruise: 28, turn: 1.1, sit: true,  dash: 0,   seek: 0 },
    dog:   { cruise: 64, turn: 2.2, sit: false, dash: 2.2, seek: 0.2 },
    ghost: { cruise: 34, turn: 0.55, sit: false, dash: 0,   seek: 0 },
    fire:  { cruise: 52, turn: 4.2, sit: false, dash: 0,   seek: 0 },
    star:  { cruise: 40, turn: 0.8, sit: false, dash: 0,   seek: 0 },
    heart: { cruise: 46, turn: 1.6, sit: false, dash: 0,   seek: 1 }
  };

  const COMFORT = 2.4; // multiples of the pet radius
  const COLLISION_PASSES = 3;
  const MAX_SPEED = 240; // pixels per second, after a collision

  function personalityOf(shape) {
    return PERSONALITIES[shape] || PERSONALITIES.cat;
  }

  function wrapAngle(angle) {
    const tau = Math.PI * 2;
    let a = angle % tau;
    if (a <= -Math.PI) a += tau;
    if (a > Math.PI) a -= tau;
    return a;
  }

  // Turn from `current` toward `target`, but never more than maxStep radians.
  // Angles wrap: a heading just below PI and a heading just above -PI are
  // actually neighbors, so we take the short way around the circle.
  function rotateToward(current, target, maxStep) {
    const diff = wrapAngle(target - current);
    if (Math.abs(diff) <= maxStep) return wrapAngle(target);
    const sign = diff < 0 ? -1 : 1;
    return wrapAngle(current + sign * maxStep);
  }

  function centerOf(pet) {
    return {
      x: pet.x + pet.width / 2,
      y: pet.y + pet.height / 2
    };
  }

  function nearest(pet, neighbors) {
    const here = centerOf(pet);
    let best = null;
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

  function distanceToHome(pet) {
    if (pet.homeX == null || pet.homeY == null) return 0;
    const here = centerOf(pet);
    const hx = pet.homeX + pet.width / 2;
    const hy = pet.homeY + pet.height / 2;
    return Math.hypot(hx - here.x, hy - here.y);
  }

  function chooseBehavior(pet, personality, others, now, rng) {
    if (pet.talkUntil && now < pet.talkUntil) {
      pet.state = 'talk';
      return;
    }
    if (pet.state === 'talk') {
      pet.state = 'wander';
      pet.stateUntil = 0;
    }
    if (pet.homeX != null && pet.homeY != null) {
      if (now < pet.stateUntil && pet.state !== 'talk') return;
      if (distanceToHome(pet) > 72) {
        pet.state = 'return';
        pet.stateUntil = now + 500;
        return;
      }
      if (rng() < 0.8) {
        pet.state = 'sit';
        pet.stateUntil = now + 1800 + rng() * 1400;
        return;
      }
      pet.state = 'stroll';
      pet.wanderTarget = rng() * Math.PI * 2;
      pet.stateUntil = now + 700;
      return;
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
    // Seek looks across the whole screen. Separation and bumps stay local.
    if (personality.seek && others.length > 0 && roll < personality.seek) {
      pet.state = 'seek';
      pet.stateUntil = now + 2000;
      return;
    }
    pet.state = 'wander';
    pet.stateUntil = now + 1500 + rng() * 2000;
    pet.wanderTarget = rng() * Math.PI * 2;
  }

  function steer(pet, personality, nearby, others, dt, rng) {
    if (!isFinite(pet.heading)) pet.heading = 0;

    if (pet.state === 'sit' || pet.state === 'talk') {
      pet.vx = 0;
      pet.vy = 0;
      return;
    }

    let desired = pet.heading;
    if (pet.state === 'wander') {
      // Chance this frame is dt/2, so a new direction comes about every 2 seconds.
      if (rng() < dt / 2) pet.wanderTarget = rng() * Math.PI * 2;
      desired = pet.wanderTarget;
    } else if (pet.state === 'seek') {
      const target = nearest(pet, others);
      if (target) {
        const here = centerOf(pet);
        const there = centerOf(target);
        desired = Math.atan2(there.y - here.y, there.x - here.x);
      }
    } else if (pet.state === 'dash' || pet.state === 'stroll') {
      desired = pet.wanderTarget;
    } else if (pet.state === 'return' && pet.homeX != null) {
      const here = centerOf(pet);
      desired = Math.atan2(
        (pet.homeY + pet.height / 2) - here.y,
        (pet.homeX + pet.width / 2) - here.x
      );
    }

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
    if (pet.state === 'stroll') speed = 34;
    if (pet.state === 'return') speed = 78;
    const tx = Math.cos(pet.heading) * speed;
    const ty = Math.sin(pet.heading) * speed;
    const blend = Math.min(1, dt * 3);
    pet.vx += (tx - pet.vx) * blend;
    pet.vy += (ty - pet.vy) * blend;
  }

  function clampPet(pet, bounds) {
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

  function reflect(pet, vx, vy) {
    pet.vx = vx;
    pet.vy = vy;
    pet.heading = Math.atan2(vy, vx);
    pet.wanderTarget = pet.heading;
  }

  // Equal-mass elastic collision along the line between the two centers.
  // The part of velocity on that line is exchanged. The part sideways stays.
  // Returns true when the circles were overlapping.
  function resolvePair(a, b) {
    if (a.dragging && b.dragging) return false;
    const ac = centerOf(a);
    const bc = centerOf(b);
    let dx = bc.x - ac.x;
    let dy = bc.y - ac.y;
    let dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist >= minDist) return false;

    // Sitting on the exact same pixel has no direction. Nudge along x.
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

    const va = a.vx * nx + a.vy * ny;
    const vb = b.vx * nx + b.vy * ny;
    if (va <= vb) return true;

    const changeA = vb - va;
    const changeB = va - vb;
    a.vx += changeA * nx;
    a.vy += changeA * ny;
    b.vx += changeB * nx;
    b.vy += changeB * ny;
    a.heading = Math.atan2(a.vy, a.vx);
    b.heading = Math.atan2(b.vy, b.vx);
    return true;
  }

  function resolveCollisions(pets) {
    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
      const hash = Spatial.buildHash(pets, Spatial.CELL);
      const seen = {};
      for (let i = 0; i < pets.length; i++) {
        const pet = pets[i];
        const nearby = Spatial.queryNearby(hash, pet);
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

  function stepPets(pets, bounds, dt, now, rng) {
    const step = Math.max(0, Math.min(dt, 0.05));
    const random = rng || Math.random;
    const hash = Spatial.buildHash(pets, Spatial.CELL);

    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      if (pet.dragging) continue;
      const personality = personalityOf(pet.shape);
      const nearby = Spatial.queryNearby(hash, pet);
      const others = [];
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

  function blankPet(fields) {
    const pet = {
      id: 'pet',
      shape: 'star',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      wanderTarget: 0,
      state: 'wander',
      stateUntil: 1e15,
      facing: 1,
      width: 64,
      height: 64,
      radius: 26,
      dragging: false,
      talkUntil: 0,
      userId: 'u'
    };
    if (fields) Object.assign(pet, fields);
    return pet;
  }

  return {
    PERSONALITIES: PERSONALITIES,
    wrapAngle: wrapAngle,
    rotateToward: rotateToward,
    resolvePair: resolvePair,
    stepPets: stepPets,
    blankPet: blankPet
  };
});
