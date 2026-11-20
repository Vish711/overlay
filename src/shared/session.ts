// What the page does with a message from the server.
//
// The page does not send screen coordinates. Every computer picks its own
// spot for a new pet, then keeps that spot while the pet walks. A later
// message with the same id is the same pet: we keep x and y, and only
// replace the words and the animal.
//
// Each person has one pet. The pet id is that person's user id.

import { COME_MS, DANCE_MS, RUN_MS, SIT_MS } from './actions.js';
import type { Pet, PetNote, RoomMessage, Spot } from './types.js';

const SPRITE = 64;
const RADIUS = 26;
export const SPEECH_MS = 7000;
export const TALK_MS = 1600;
const MAX_PETS = 24;

export interface Session {
  roomId: string | null;
  pets: Pet[];
}

export interface ScreenEnv {
  now?: number;
  width?: number;
  height?: number;
  rng?: () => number;
  home?: ((msg: PetNote) => Spot | null) | null;
}

export function createSession(): Session {
  return { roomId: null, pets: [] };
}

function createPet(msg: PetNote, env: ScreenEnv): Pet {
  const rng = env.rng || Math.random;
  const width = env.width || 800;
  const height = env.height || 600;
  const spanX = Math.max(0, width - SPRITE - 16);
  const spanY = Math.max(0, height - SPRITE - 16);
  const now = env.now || 0;
  let x = 8 + rng() * spanX;
  let y = 8 + rng() * spanY;
  if (env.home) {
    const saved = env.home(msg);
    if (saved && isFinite(saved.x) && isFinite(saved.y)) {
      x = saved.x;
      y = saved.y;
    }
  }
  return {
    id: msg.id,
    name: msg.name || 'Pet',
    shape: msg.shape || 'cat',
    color: msg.color || '#ff6b6b',
    userId: msg.userId || '',
    userName: msg.userName || 'player',
    text: msg.text || '',
    toName: msg.toName || '',
    speechUntil: msg.text ? now + SPEECH_MS : 0,
    talkUntil: msg.text ? now + TALK_MS : 0,
    focusId: '',
    danceUntil: 0,
    x: x,
    y: y,
    homeX: x,
    homeY: y,
    vx: 0,
    vy: 0,
    heading: rng() * Math.PI * 2,
    wanderTarget: rng() * Math.PI * 2,
    state: 'wander',
    stateUntil: 0,
    facing: 1,
    phase: rng() * Math.PI * 2,
    width: SPRITE,
    height: SPRITE,
    radius: RADIUS,
    dragging: false,
    drawX: x,
    drawY: y,
    bubble: null,
    dragOffsetX: 0,
    dragOffsetY: 0
  };
}

function findPet(session: Session, id: string): Pet | null {
  for (let i = 0; i < session.pets.length; i++) {
    if (session.pets[i].id === id) return session.pets[i];
  }
  return null;
}

function giveSpeech(pet: Pet, msg: PetNote, now: number): void {
  if (msg.shape) pet.shape = msg.shape;
  pet.text = msg.text || '';
  pet.userName = msg.userName || pet.userName;
  pet.color = msg.color || pet.color;
  pet.name = msg.name || pet.name;
  pet.toName = msg.toName || '';
  if (pet.text) {
    pet.speechUntil = now + SPEECH_MS;
    pet.talkUntil = now + TALK_MS;
    pet.state = 'talk';
  }
}

function trim(session: Session): void {
  while (session.pets.length > MAX_PETS) {
    session.pets.shift();
  }
}

function asNote(msg: RoomMessage): PetNote {
  return {
    id: msg.id || '',
    name: msg.name || 'Pet',
    shape: msg.shape || 'cat',
    color: msg.color || '#ff6b6b',
    userId: msg.userId || '',
    userName: msg.userName || 'player',
    text: msg.text || '',
    toName: msg.toName || ''
  };
}

// A line can tell one pet, or every pet, to sit, come, run, or dance.
// "say" means there is no order, so the pets keep doing what they were doing.
function applyOrder(session: Session, msg: RoomMessage, now: number, rng: () => number): void {
  const action = msg.action || '';
  if (!action || action === 'say') return;
  const toId = msg.to || '';
  for (let i = 0; i < session.pets.length; i++) {
    const pet = session.pets[i];
    if (toId && pet.userId !== toId) continue;
    if (action === 'sit') {
      pet.state = 'sit';
      pet.stateUntil = now + SIT_MS;
      pet.vx = 0;
      pet.vy = 0;
    } else if (action === 'come') {
      pet.state = 'come';
      pet.stateUntil = now + COME_MS;
      pet.focusId = msg.userId || '';
    } else if (action === 'run') {
      pet.state = 'run';
      pet.stateUntil = now + RUN_MS;
      pet.wanderTarget = rng() * Math.PI * 2;
    } else if (action === 'dance') {
      pet.state = 'dance';
      pet.stateUntil = now + DANCE_MS;
      pet.danceUntil = now + DANCE_MS;
      pet.vx = 0;
      pet.vy = 0;
    }
  }
}

// Update the list of pets from one server message.
export function applyMessage(session: Session, msg: RoomMessage, env: ScreenEnv): Session {
  const now = env.now || 0;
  if (!msg || !msg.type) return session;

  if (msg.type === 'watching') {
    if (msg.roomId !== session.roomId) {
      session.roomId = msg.roomId || null;
      session.pets = [];
    }
    return session;
  }

  if (msg.type === 'snapshot') {
    if (msg.roomId && session.roomId && msg.roomId !== session.roomId) return session;
    if (msg.roomId) session.roomId = msg.roomId;
    const next: Pet[] = [];
    const incoming = msg.pets || [];
    for (let i = 0; i < incoming.length; i++) {
      const item = incoming[i];
      const existing = findPet(session, item.id);
      if (existing) {
        giveSpeech(existing, item, now);
        next.push(existing);
      } else {
        next.push(createPet(item, env));
      }
    }
    session.pets = next;
    trim(session);
    return session;
  }

  if (msg.type === 'pet') {
    if (!msg.id) return session;
    const note = asNote(msg);
    const existing = findPet(session, msg.id);
    if (existing) {
      giveSpeech(existing, note, now);
    } else {
      session.pets.push(createPet(note, env));
      trim(session);
    }
    applyOrder(session, msg, now, env.rng || Math.random);
    return session;
  }

  if (msg.type === 'remove') {
    if (msg.all && msg.userId) {
      const kept: Pet[] = [];
      for (let i = 0; i < session.pets.length; i++) {
        if (session.pets[i].userId !== msg.userId) kept.push(session.pets[i]);
      }
      session.pets = kept;
    } else if (msg.id) {
      const kept: Pet[] = [];
      for (let i = 0; i < session.pets.length; i++) {
        if (session.pets[i].id !== msg.id) kept.push(session.pets[i]);
      }
      session.pets = kept;
    }
  }

  return session;
}
