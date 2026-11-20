// The room page.
//
// Each person has one pet. The pet is drawn on a clear layer that covers
// the window, so it can sit anywhere on the screen. Picking an animal
// sends { type: 'pet' } with no line. The box under your pet sends the
// same message with text. The server keeps one pet per person and sends
// it to the room. Ready on the bubble means that pet has a new line.
//
// The browser remembers your name, room, animal, and the spot you dropped
// the pet. Refreshing the page puts you back in that room. The /overlay
// page reads the same save, so the pet starts in the same place there.

import { attach } from './stage.js';
import { drawPet, frameCount, PETS } from '../shared/sprites.js';
import type { Animal } from '../shared/sprites.js';
import { loadState, updateState, watchSave } from '../shared/save.js';
import type { Pet, RoomMessage } from '../shared/types.js';

const pets = PETS;
const roomInput = mustInput('room');
const nameInput = mustInput('name');
const serverInput = mustInput('server');
const joinBtn = mustEl('join');
const leaveBtn = mustEl('leave');
const useServerBtn = mustEl('use-server');
const roomInfo = mustEl('room-info');
const note = mustEl('note');
const friendsDiv = mustEl('friends');
const chatLog = mustEl('chat-log');
const statusDot = mustEl('status-dot');
const statusText = mustEl('status');
const clearBtn = mustEl('clear-pets');
const fillBtn = mustEl('fill-screen');
const petList = mustEl('pet-list');
const composer = mustEl('composer') as HTMLFormElement;
const lineInput = mustInput('pet-line');
const toSelect = mustEl('pet-to') as HTMLSelectElement;
const stageCanvas = mustEl('stage') as HTMLCanvasElement;

const remembered = loadState();
let socket: WebSocket | null = null;
let joinedRoom: string | null = remembered && remembered.roomId ? remembered.roomId : null;
let myId = remembered && remembered.userId ? remembered.userId : ('user-' + Math.random().toString(36).slice(2, 8));
let lanHint = '';
let chosen = pets[0];
let lineFocused = false;

if (remembered && remembered.name) nameInput.value = remembered.name;
if (remembered && remembered.roomId) roomInput.value = remembered.roomId;
if (remembered && remembered.shape) {
  for (let i = 0; i < pets.length; i++) {
    if (pets[i].shape === remembered.shape) chosen = pets[i];
  }
}

const stage = attach(stageCanvas, {
  note: mustEl('stage-note'),
  homeFor: function (msg) {
    if (msg.userId !== myId) return null;
    return loadHome();
  },
  hold: function (pet) {
    // Typing holds your pet still, unless a line just told it to move or dance.
    if (pet.state === 'run' || pet.state === 'come' || pet.state === 'dance') {
      if (pet.stateUntil > Date.now()) return false;
    }
    return lineFocused && pet.userId === myId;
  },
  onFrame: function (list) {
    placeComposer(findMine(list));
  },
  onCycle: function (pet) {
    if (pet.userId !== myId) return;
    const index = indexOfShape(pet.shape);
    choosePet(pets[(index + 1) % pets.length]);
  },
  onHome: function (pet) {
    if (pet.userId !== myId) return;
    saveHome(pet.x, pet.y);
  },
  onRemove: function (pet) {
    if (pet.userId !== myId) return;
    sendJson({ type: 'remove', id: pet.id });
  }
});

serverInput.value = location.host;

for (let i = 0; i < pets.length; i++) {
  const pet = pets[i];
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.className = 'pet-item';
  wrapper.dataset.shape = pet.shape;

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'pet-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  canvasWrap.appendChild(canvas);

  const name = document.createElement('div');
  name.className = 'pet-name';
  name.textContent = pet.name;

  wrapper.appendChild(canvasWrap);
  wrapper.appendChild(name);
  petList.appendChild(wrapper);

  wrapper.addEventListener('click', function () {
    choosePet(pet);
  });
}
markSelected();

function tick(now: number): void {
  const items = petList.children;
  for (let i = 0; i < pets.length; i++) {
    const item = items[i];
    if (!(item instanceof HTMLElement)) continue;
    const canvas = item.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const frame = Math.floor(now / 280) % frameCount(pets[i].shape);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPet(ctx, pets[i].shape, frame, pets[i].color, 0, 0, 1);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function mustEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing page element: ' + id);
  return el;
}

function mustInput(id: string): HTMLInputElement {
  const el = mustEl(id);
  if (!(el instanceof HTMLInputElement)) throw new Error('Expected an input: ' + id);
  return el;
}

function indexOfShape(shape: string): number {
  for (let i = 0; i < pets.length; i++) {
    if (pets[i].shape === shape) return i;
  }
  return 0;
}

function findMine(list: Pet[]): Pet | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].userId === myId) return list[i];
  }
  return null;
}

function markSelected(): void {
  const items = petList.children;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!(item instanceof HTMLElement)) continue;
    item.classList.toggle('selected', item.dataset.shape === chosen.shape);
  }
}

function loadHome(): { x: number; y: number } | null {
  const state = loadState();
  if (!state || !state.home) return null;
  return state.home;
}

function saveHome(x: number, y: number): void {
  updateState({
    userId: myId,
    name: nameInput.value.trim(),
    roomId: joinedRoom || '',
    shape: chosen.shape,
    home: { x: x, y: y }
  });
}

function placeComposer(pet: Pet | null): void {
  if (!pet) {
    composer.hidden = true;
    return;
  }
  const canvas = stageCanvas;
  const drawX = pet.drawX != null ? pet.drawX : pet.x;
  const drawY = pet.drawY != null ? pet.drawY : pet.y;
  const left = Math.max(8, Math.min(canvas.width - 360, drawX + pet.width / 2 - 170));
  const top = Math.max(8, Math.min(canvas.height - 52, drawY + pet.height - 18));
  composer.hidden = false;
  composer.style.left = left + 'px';
  composer.style.top = top + 'px';
}

function setConnected(on: boolean): void {
  statusDot.className = on ? 'dot connected' : 'dot disconnected';
  statusText.textContent = on ? 'Connected' : 'Disconnected';
}

function showNote(text: string): void {
  note.textContent = text || '';
}

function inRoom(): boolean {
  return !!(joinedRoom && socket && socket.readyState === WebSocket.OPEN);
}

function requireRoom(): boolean {
  if (inRoom()) {
    showNote('');
    return true;
  }
  showNote('Join a room first.');
  return false;
}

function sendJson(payload: RoomMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showNote('Not connected to the server.');
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}

function sendJoin(roomId: string): void {
  sendJson({
    type: 'join',
    roomId: roomId || '',
    name: nameInput.value,
    id: myId,
    role: 'client'
  });
}

function showPet(text: string): boolean {
  if (!requireRoom()) return false;
  const payload: RoomMessage = {
    type: 'pet',
    text: text || '',
    name: chosen.name,
    shape: chosen.shape,
    color: chosen.color
  };
  if (text && toSelect.value) payload.to = toSelect.value;
  return sendJson(payload);
}

function choosePet(pet: Animal): void {
  chosen = pet;
  markSelected();
  updateState({
    userId: myId,
    name: nameInput.value.trim(),
    roomId: joinedRoom || '',
    shape: pet.shape
  });
  if (inRoom()) showPet('');
}

function sendLine(): void {
  const text = lineInput.value.trim();
  if (!text) {
    showNote('Type a line for your pet to say.');
    return;
  }
  if (showPet(text)) {
    lineInput.value = '';
    showNote(chosen.name + ' is saying it. ' + sendToNote());
  }
}

function addChat(msg: RoomMessage): void {
  const row = document.createElement('div');
  row.className = 'chat-line';
  const who = document.createElement('span');
  who.className = 'who';
  let title = msg.userName || 'player';
  if (msg.pet) title = title + ' · ' + msg.pet.name;
  if (msg.toName) title = title + ' to ' + msg.toName;
  else if (msg.pet) title = title + ' · Ready';
  if (msg.action && msg.action !== 'say') title = title + ' · ' + msg.action;
  who.textContent = title;
  const body = document.createElement('span');
  body.textContent = msg.text || '';
  row.appendChild(who);
  row.appendChild(body);
  chatLog.appendChild(row);
  while (chatLog.children.length > 80) {
    const first = chatLog.firstChild;
    if (first) chatLog.removeChild(first);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
}

function sendToNote(): string {
  if (!toSelect.value) return 'Sending to everyone.';
  const option = toSelect.options[toSelect.selectedIndex];
  const name = option ? option.text : 'them';
  return 'Sending to ' + name + '.';
}

function markSendTo(): void {
  const chips = friendsDiv.querySelectorAll('button');
  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i];
    chip.classList.toggle('selected', !!toSelect.value && chip.dataset.id === toSelect.value);
  }
}

function renderFriends(users: Array<{ id: string; name: string }> | undefined): void {
  const list = users || [];
  const current = toSelect.value;
  toSelect.textContent = '';
  const everyone = document.createElement('option');
  everyone.value = '';
  everyone.textContent = 'Everyone';
  toSelect.appendChild(everyone);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === myId) continue;
    const option = document.createElement('option');
    option.value = list[i].id;
    option.textContent = list[i].name || list[i].id;
    toSelect.appendChild(option);
  }
  let stillThere = false;
  for (let i = 0; i < toSelect.options.length; i++) {
    if (toSelect.options[i].value === current) stillThere = true;
  }
  toSelect.value = stillThere ? current : '';

  friendsDiv.textContent = '';
  if (list.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'Nobody in the room yet.';
    friendsDiv.appendChild(empty);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const user = list[i];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'friend';
    chip.dataset.id = user.id;
    const label = user.name || user.id || 'player';
    chip.textContent = user.id === myId ? label + ' (you)' : label;
    if (user.id !== myId) {
      chip.addEventListener('click', function () {
        if (toSelect.value === user.id) toSelect.value = '';
        else toSelect.value = user.id;
        markSendTo();
        showNote(sendToNote());
      });
    }
    friendsDiv.appendChild(chip);
  }
  markSendTo();
}

function describeRoom(): void {
  if (!joinedRoom) {
    roomInfo.textContent = '';
    return;
  }
  roomInfo.textContent = '';
  roomInfo.appendChild(document.createTextNode('In room '));
  const code = document.createElement('strong');
  code.textContent = joinedRoom;
  roomInfo.appendChild(code);
  roomInfo.appendChild(document.createTextNode('. Share that id. '));
  if (lanHint) {
    roomInfo.appendChild(document.createTextNode('From another computer, open http://' + lanHint + ' and join the same room.'));
  } else {
    roomInfo.appendChild(document.createTextNode('On this computer, open another window to this page and join the same room.'));
  }
}

function connect(): void {
  socket = new WebSocket('ws://' + location.host);
  socket.addEventListener('open', function () {
    setConnected(true);
    showNote('');
    if (joinedRoom) sendJoin(joinedRoom);
  });
  socket.addEventListener('close', function () {
    setConnected(false);
    setTimeout(connect, 1000);
  });
  socket.addEventListener('message', function (event) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(String(event.data)) as RoomMessage;
    } catch (err) {
      return;
    }
    onMessage(msg);
  });
}

function onMessage(msg: RoomMessage): void {
  if (msg.type === 'joined') {
    joinedRoom = msg.roomId || joinedRoom;
    myId = msg.userId || myId;
    stage.session.roomId = msg.roomId || null;
    if (msg.roomId) roomInput.value = msg.roomId;
    updateState({
      userId: myId,
      name: nameInput.value.trim() || 'player',
      roomId: joinedRoom || '',
      shape: chosen.shape
    });
    describeRoom();
    showNote('');
    showPet('');
  }
  if (msg.type === 'pet' || msg.type === 'snapshot' || msg.type === 'remove') {
    stage.apply(msg);
  }
  if (msg.type === 'presence') {
    renderFriends(msg.users);
  }
  if (msg.type === 'send') {
    addChat(msg);
  }
  if (msg.type === 'user_joined' && msg.user && msg.user.id !== myId) {
    showNote(msg.user.name + ' joined.');
  }
  if (msg.type === 'user_left' && msg.user) {
    showNote(msg.user.name + ' left.');
  }
  if (msg.type === 'error') showNote(msg.text || 'Something went wrong.');
}

joinBtn.addEventListener('click', function () {
  const typed = roomInput.value.trim();
  if (typed && !/^[a-zA-Z0-9-]{1,32}$/.test(typed)) {
    showNote('Room ids use letters, numbers, and dashes.');
    return;
  }
  sendJoin(typed);
});

leaveBtn.addEventListener('click', function () {
  if (!inRoom()) return;
  sendJson({ type: 'leave' });
  joinedRoom = null;
  stage.session.roomId = null;
  stage.session.pets = [];
  composer.hidden = true;
  updateState({ roomId: '' });
  describeRoom();
  renderFriends([]);
  showNote('You left the room. Your pet is hidden.');
});

composer.addEventListener('submit', function (event) {
  event.preventDefault();
  sendLine();
});
toSelect.addEventListener('change', function () {
  markSendTo();
  showNote(sendToNote());
});
lineInput.addEventListener('focus', function () { lineFocused = true; });
lineInput.addEventListener('blur', function () { lineFocused = false; });

clearBtn.addEventListener('click', function () {
  if (!requireRoom()) return;
  sendJson({ type: 'remove', all: true });
  showNote('Your pet is hidden.');
});

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

useServerBtn.addEventListener('click', function () {
  let host = serverInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!host) return;
  serverInput.value = host;
  if (host !== location.host) window.location.href = 'http://' + host + '/';
  else showNote('This page is already using that server.');
});

fetch('/info').then(function (res) { return res.json(); }).then(function (info: { addresses?: string[]; port?: number }) {
  if (info.addresses && info.addresses.length > 0) {
    lanHint = info.addresses[0] + ':' + info.port;
    describeRoom();
  }
}).catch(function () {});

watchSave(function (state) {
  if (!state.home || state.userId !== myId) return;
  const mine = findMine(stage.session.pets);
  if (!mine) return;
  mine.x = state.home.x;
  mine.y = state.home.y;
  mine.homeX = state.home.x;
  mine.homeY = state.home.y;
});

updateState({
  userId: myId,
  name: nameInput.value.trim(),
  roomId: joinedRoom || '',
  shape: chosen.shape
});
connect();
