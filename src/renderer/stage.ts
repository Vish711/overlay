// The pet stage drawn in the browser.
//
// The canvas covers the whole window. The canvas itself does not take
// clicks. A click counts only when it lands on a pet or its bubble.
// Everything else falls through to the page. That is the overlay.
//
// x and y are pixels on this canvas.

import { DANCE_MS } from '../shared/actions.js';
import { stepPets } from '../shared/movement.js';
import { applyMessage, createSession, SPEECH_MS, TALK_MS } from '../shared/session.js';
import type { ScreenEnv } from '../shared/session.js';
import { drawPet, frameCount } from '../shared/sprites.js';
import type { Pet, PetNote, RoomMessage, Spot } from '../shared/types.js';

export interface StageOptions {
  note?: HTMLElement | null;
  homeFor?: (msg: PetNote) => Spot | null;
  hold?: (pet: Pet) => boolean;
  onFrame?: (pets: Pet[]) => void;
  onCycle?: (pet: Pet) => void;
  onHome?: (pet: Pet) => void;
  onRemove?: (pet: Pet) => void;
}

export interface StageView {
  session: { roomId: string | null; pets: Pet[] };
  apply: (msg: RoomMessage) => void;
}

interface Press {
  pet: Pet;
  x: number;
  y: number;
  moved: boolean;
}

interface Bounce {
  hop: number;
  wiggle: number;
  excited: boolean;
}

export function attach(canvas: HTMLCanvasElement, options?: StageOptions): StageView {
  const opts = options || {};
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('This browser cannot draw on a canvas.');
  const ctx: CanvasRenderingContext2D = drawing;
  const session = createSession();
  let dragPet: Pet | null = null;
  let press: Press | null = null;
  let noteText = '';

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w < 2 || h < 2) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  function env(): ScreenEnv {
    resize();
    return {
      now: Date.now(),
      width: canvas.width || 800,
      height: canvas.height || 600,
      rng: Math.random,
      home: opts.homeFor || null
    };
  }

  function localPoint(event: MouseEvent): Spot {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function pointIn(x: number, y: number, box: { x: number; y: number; w: number; h: number } | null): boolean {
    if (!box) return false;
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  }

  function petAt(x: number, y: number): Pet | null {
    for (let i = session.pets.length - 1; i >= 0; i--) {
      const pet = session.pets[i];
      const sprite = {
        x: pet.drawX != null ? pet.drawX : pet.x,
        y: pet.drawY != null ? pet.drawY : pet.y,
        w: pet.width,
        h: pet.height
      };
      if (pointIn(x, y, pet.bubble) || pointIn(x, y, sprite)) return pet;
    }
    return null;
  }

  function setNote(text: string): void {
    if (!opts.note || text === noteText) return;
    noteText = text;
    opts.note.textContent = text;
  }

  function onComposer(event: MouseEvent): boolean {
    const el = event.target;
    if (!el || !(el instanceof Element)) return false;
    return !!el.closest('#composer');
  }

  // Capture runs before a button under the pet sees the click.
  // If the pointer is not on a pet, we do nothing and the page gets the click.
  window.addEventListener('mousedown', function (event) {
    if (event.button !== 0) return;
    if (onComposer(event)) return;
    const point = localPoint(event);
    const pet = petAt(point.x, point.y);
    if (!pet) return;
    press = { pet: pet, x: point.x, y: point.y, moved: false };
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('mousemove', function (event) {
    if (!press) return;
    const point = localPoint(event);
    if (!press.moved) {
      if (Math.hypot(point.x - press.x, point.y - press.y) < 5) return;
      press.moved = true;
      dragPet = press.pet;
      dragPet.dragging = true;
      dragPet.vx = 0;
      dragPet.vy = 0;
      dragPet.dragOffsetX = press.x - dragPet.x;
      dragPet.dragOffsetY = press.y - dragPet.y;
    }
    if (!dragPet) return;
    dragPet.x = point.x - dragPet.dragOffsetX;
    dragPet.y = point.y - dragPet.dragOffsetY;
  });

  window.addEventListener('mouseup', function () {
    if (press && !press.moved && opts.onCycle) opts.onCycle(press.pet);
    if (dragPet) {
      dragPet.homeX = dragPet.x;
      dragPet.homeY = dragPet.y;
      dragPet.state = 'wander';
      dragPet.stateUntil = 0;
      dragPet.dragging = false;
      if (opts.onHome) opts.onHome(dragPet);
      dragPet = null;
    }
    press = null;
  });

  window.addEventListener('contextmenu', function (event) {
    const point = localPoint(event);
    const pet = petAt(point.x, point.y);
    if (!pet) return;
    event.preventDefault();
    event.stopPropagation();
    if (opts.onRemove) opts.onRemove(pet);
  }, true);

  function wrapLines(text: string, maxWidth: number): string[] {
    const words = String(text || '').split(' ');
    const lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const trial = line ? line + ' ' + words[i] : words[i];
      if (line && ctx.measureText(trial).width > maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }

  function drawBubble(pet: Pet, anchorX: number, anchorY: number, now: number): void {
    if (!pet.text || now > pet.speechUntil) {
      pet.bubble = null;
      return;
    }
    let name = pet.userName || 'player';
    if (pet.toName) name = name + ' to ' + pet.toName;
    else name = name + ' · Ready';
    ctx.font = '13px system-ui, sans-serif';
    const lines = wrapLines(pet.text, 180);
    ctx.font = '11px system-ui, sans-serif';
    let widest = ctx.measureText(name).width;
    ctx.font = '13px system-ui, sans-serif';
    for (let i = 0; i < lines.length; i++) {
      const width = ctx.measureText(lines[i]).width;
      if (width > widest) widest = width;
    }
    const pad = 8;
    const bw = Math.ceil(widest + pad * 2);
    const bh = pad * 2 + 14 + lines.length * 16;
    let bx = Math.round(anchorX + pet.width / 2 - bw / 2);
    let by = Math.round(anchorY - bh - 8);
    if (by < 4) by = Math.round(anchorY + pet.height + 8);
    if (bx < 4) bx = 4;
    if (bx + bw > canvas.width - 4) bx = Math.max(4, canvas.width - 4 - bw);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = pet.color || '#58a6ff';
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = '#57606a';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(name, bx + pad, by + pad + 10);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '13px system-ui, sans-serif';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + pad, by + pad + 26 + i * 16);
    }
    pet.bubble = { x: bx, y: by, w: bw, h: bh };
  }

  // A new line makes the pet bounce. The bounce is only drawn.
  // Walking and bumps still use x and y.
  function talkBounce(pet: Pet, now: number): Bounce {
    const dancing = pet.danceUntil > now;
    const talking = pet.speechUntil > now;
    if (!dancing && !talking) {
      return { hop: 0, wiggle: 0, excited: false };
    }
    // Dance is a big hop. A normal line is a big hop at first, then a small one.
    let age = 0;
    let excited = false;
    if (dancing) {
      age = now - (pet.danceUntil - DANCE_MS);
      excited = true;
    } else {
      age = now - (pet.speechUntil - SPEECH_MS);
      excited = age < TALK_MS;
    }
    const period = excited ? 150 : 420;
    const hop = Math.abs(Math.sin((age / period) * Math.PI)) * (excited ? 28 : 7);
    const wiggle = excited ? Math.sin(age / 70) * 4 : 0;
    return { hop: hop, wiggle: wiggle, excited: excited };
  }

  function drawFrame(nowMs: number): void {
    const now = Date.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < session.pets.length; i++) {
      const pet = session.pets[i];
      const bounce = talkBounce(pet, now);
      const moving = Math.hypot(pet.vx, pet.vy) > 8 || bounce.excited;
      const count = frameCount(pet.shape);
      const frameMs = bounce.excited ? 90 : (moving ? 140 : 420);
      const frame = Math.floor(nowMs / frameMs) % count;
      const floatY = pet.shape === 'ghost' ? Math.sin(nowMs / 380 + (pet.phase || 0)) * 8 : 0;
      pet.drawX = pet.x + bounce.wiggle;
      pet.drawY = pet.y - bounce.hop + floatY;
      drawPet(ctx, pet.shape, frame, pet.color, pet.drawX, pet.drawY, pet.facing || 1);
    }
    for (let i = 0; i < session.pets.length; i++) {
      drawBubble(session.pets[i], session.pets[i].drawX, session.pets[i].drawY, now);
    }

    if (!session.roomId) {
      setNote('Join a room, then pick a pet.');
    } else if (session.pets.length === 0) {
      setNote('Pick a pet. It floats over the whole screen. The box under it is where you type.');
    } else {
      setNote('Drag your pet anywhere. Click it to change animals. Right-click it to hide it.');
    }
    if (opts.onFrame) opts.onFrame(session.pets);
  }

  let last = performance.now();
  function loop(nowMs: number): void {
    resize();
    const dt = (nowMs - last) / 1000;
    last = nowMs;
    if (opts.hold) {
      const now = Date.now();
      for (let i = 0; i < session.pets.length; i++) {
        if (!opts.hold(session.pets[i])) continue;
        session.pets[i].state = 'sit';
        session.pets[i].stateUntil = now + 800;
        session.pets[i].vx = 0;
        session.pets[i].vy = 0;
      }
    }
    stepPets(session.pets, {
      width: canvas.width || 800,
      height: canvas.height || 600
    }, dt, Date.now(), Math.random);
    drawFrame(nowMs);
    requestAnimationFrame(loop);
  }

  resize();
  requestAnimationFrame(loop);

  return {
    session: session,
    apply: function (msg: RoomMessage) {
      applyMessage(session, msg, env());
    }
  };
}
