// Full-page pet window at /overlay.
//
// Same server, same room. This page joins as an overlay, so it is not
// listed as another person. It reads the same save as the room page, so
// your pet starts where you dropped it. Dragging here writes that spot
// back, and the room page moves to match.

import { attach } from './stage.js';
import { loadState, updateState, watchSave } from '../shared/save.js';
import type { Pet, RoomMessage } from '../shared/types.js';

let socket: WebSocket | null = null;

function mustEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing page element: ' + id);
  return el;
}

const canvas = mustEl('overlay') as HTMLCanvasElement;

const view = attach(canvas, {
  note: mustEl('stage-note'),
  homeFor: function (msg) {
    const state = loadState();
    if (!state || !state.home) return null;
    if (msg.userId !== state.userId) return null;
    return state.home;
  },
  onHome: function (pet: Pet) {
    const state = loadState();
    if (!state || !state.userId) return;
    if (pet.userId !== state.userId) return;
    updateState({ home: { x: pet.x, y: pet.y } });
  },
  onRemove: function (pet: Pet) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'remove', id: pet.id }));
  }
});

function moveSavedPet(userId: string, x: number, y: number): void {
  const pets = view.session.pets;
  for (let i = 0; i < pets.length; i++) {
    if (pets[i].userId !== userId) continue;
    pets[i].x = x;
    pets[i].y = y;
    pets[i].homeX = x;
    pets[i].homeY = y;
  }
}

watchSave(function (state) {
  if (!state.home || !state.userId) return;
  moveSavedPet(state.userId, state.home.x, state.home.y);
});

function connect(): void {
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  socket = new WebSocket('ws://' + location.host);
  socket.onopen = function () {
    if (!socket) return;
    socket.send(JSON.stringify({ type: 'join', role: 'overlay' }));
  };
  socket.onmessage = function (event) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(String(event.data)) as RoomMessage;
    } catch (err) {
      return;
    }
    view.apply(msg);
  };
  socket.onclose = function () {
    setTimeout(connect, 1000);
  };
}

const fillBtn = mustEl('fill-screen');
fillBtn.addEventListener('click', function () {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  document.documentElement.requestFullscreen();
});
document.addEventListener('fullscreenchange', function () {
  fillBtn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Cover the screen';
});

connect();
