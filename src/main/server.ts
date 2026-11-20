// Room server.
//
// One HTTP server hands out the pages. The same port also accepts
// WebSocket connections. A connection is either a person (role "client")
// or the full-page pet window (role "overlay", at /overlay).
//
// People in the same room share one list of members and one list of pets.
// A pet message is stamped with the sender's id and sent to every member
// of that room, including the overlay. The overlay is a member, but it is
// left out of the "who is online" list.
//
// Which full-page window watches which room: we pair them by IP address.
// Two tabs on one computer (the room page and /overlay) share one address.
// Localhost counts as one address. When that person joins a room, the
// full-page window from that address is moved into the room.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { actionFromText } from '../shared/actions.js';
import type { PetNote, RoomMessage } from '../shared/types.js';

export const DEFAULT_PORT = 55555;

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const PAGE_DIR = path.join(ROOT, 'src', 'renderer');
const SCRIPT_DIR = path.join(here, '..', 'renderer');
const SHARED_DIR = path.join(here, '..', 'shared');

const SHAPES: { [shape: string]: string } = {
  cat: '#ff6b6b',
  dog: '#4ecdc4',
  ghost: '#ffe66d',
  fire: '#ff8a5c',
  star: '#a29bfe',
  heart: '#fd79a8'
};

interface PersonSocket extends WebSocket {
  role: string;
  roomId: string | null;
  userId: string | null;
  userName: string | null;
  ip: string;
  joinedAt: number;
}

interface Member {
  ws: PersonSocket;
  id: string;
  name: string;
  role: string;
}

interface StoredPet extends PetNote {
  status: string;
}

interface Room {
  id: string;
  members: Map<string, Member>;
  pets: Map<string, StoredPet>;
}

interface World {
  rooms: Map<string, Room>;
  overlays: Set<PersonSocket>;
}

export interface OverlayApp {
  server: http.Server;
  wss: WebSocketServer;
  world: World;
}

export function createOverlayServer(): OverlayApp {
  const world: World = {
    rooms: new Map(),
    overlays: new Set()
  };

  const server = http.createServer(function (req, res) {
    handleRequest(req, res, server);
  });
  const wss = new WebSocketServer({ server: server });

  wss.on('connection', function (ws, req) {
    const person = ws as PersonSocket;
    person.role = 'client';
    person.roomId = null;
    person.userId = null;
    person.userName = null;
    person.ip = normalizeIp(req.socket.remoteAddress);
    person.joinedAt = 0;

    person.on('message', function (data) {
      let msg: RoomMessage;
      try {
        msg = JSON.parse(data.toString()) as RoomMessage;
      } catch (err) {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      handleMessage(world, person, msg);
    });

    person.on('close', function () {
      world.overlays.delete(person);
      leave(world, person);
    });
  });

  return { server: server, wss: wss, world: world };
}

function handleMessage(world: World, ws: PersonSocket, msg: RoomMessage): void {
  if (msg.type === 'join') {
    if (msg.role === 'overlay') joinOverlay(world, ws, msg);
    else joinClient(world, ws, msg);
    return;
  }
  if (msg.type === 'leave') {
    leave(world, ws);
    return;
  }
  if (msg.type === 'pet') {
    handlePet(world, ws, msg);
    return;
  }
  // type "send" is only a line for the activity list. The pet uses type "pet".
  if (msg.type === 'send') {
    handleChat(world, ws, msg);
    return;
  }
  if (msg.type === 'remove') {
    handleRemove(world, ws, msg);
  }
}

function joinOverlay(world: World, ws: PersonSocket, msg: RoomMessage): void {
  world.overlays.add(ws);
  ws.role = 'overlay';
  ws.userName = 'overlay';
  if (!ws.userId) ws.userId = 'overlay-' + shortId();

  const requested = cleanRoomId(msg.roomId);
  const roomId = requested || latestRoomForIp(world, ws.ip);
  if (!roomId) {
    send(ws, { type: 'watching', roomId: null });
    return;
  }
  moveOverlay(world, ws, roomId);
  send(ws, { type: 'watching', roomId: roomId });
  sendSnapshot(world, ws);
}

function joinClient(world: World, ws: PersonSocket, msg: RoomMessage): void {
  const roomId = cleanRoomId(msg.roomId) || ('room-' + shortId());
  const name = cleanName(msg.name);

  if (ws.roomId && ws.roomId !== roomId) leave(world, ws);
  ws.role = 'client';
  ws.userName = name;
  ws.joinedAt = Date.now();

  const room = ensureRoom(world, roomId);
  let userId = cleanId(msg.id);
  if (!userId) userId = 'user-' + shortId();
  const existing = room.members.get(userId);
  if (existing && existing.ws !== ws) {
    existing.ws.roomId = null;
    existing.ws.close();
  }
  ws.userId = userId;
  ws.roomId = roomId;
  room.members.set(userId, { ws: ws, id: userId, name: name, role: 'client' });

  send(ws, { type: 'joined', roomId: roomId, userId: userId, name: name });
  broadcast(world, roomId, { type: 'user_joined', user: { id: userId, name: name } }, ws);
  broadcastPresence(world, roomId);
  attachOverlays(world, ws.ip, roomId);
  sendSnapshot(world, ws);
}

function leave(world: World, ws: PersonSocket): void {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) {
    ws.roomId = null;
    return;
  }
  const roomId = ws.roomId;
  const role = ws.role;
  const user = { id: ws.userId || '', name: ws.userName || '' };
  removeMember(world, ws);
  if (role === 'overlay') return;
  if (!world.rooms.has(roomId)) return;
  broadcast(world, roomId, { type: 'user_left', user: user });
  broadcastPresence(world, roomId);
}

function handlePet(world: World, ws: PersonSocket, msg: RoomMessage): void {
  if (ws.role === 'overlay') return;
  if (!ws.roomId || !ws.userId || !world.rooms.has(ws.roomId)) return;
  const shape = String(msg.shape || '').toLowerCase();
  if (!SHAPES[shape]) return;
  const text = clip(msg.text, 80);
  const room = world.rooms.get(ws.roomId);
  if (!room) return;

  // A line can name one person. Anyone else in the room does not receive it.
  const toId = cleanId(msg.to);
  let toName = '';
  if (text && toId) {
    if (toId === ws.userId) {
      send(ws, { type: 'error', text: 'Pick someone else in the room.' });
      return;
    }
    const target = room.members.get(toId);
    if (!target || target.role !== 'client') {
      send(ws, { type: 'error', text: 'That person is not in the room.' });
      return;
    }
    toName = target.name;
  }

  // One pet per person. The id is the user id, so picking a different
  // animal replaces the old one instead of adding another.
  const previous = room.pets.get(ws.userId);
  const stale: string[] = [];
  for (const [id, pet] of room.pets) {
    if (pet.userId === ws.userId && id !== ws.userId) stale.push(id);
  }
  for (let i = 0; i < stale.length; i++) room.pets.delete(stale[i]);

  // The saved pet keeps the last line that was sent to the whole room,
  // so a private line is not repeated to the next person who joins.
  const publicText = text && !toId ? text : (previous ? previous.text : '');
  const pet: StoredPet = {
    id: ws.userId,
    name: clip(msg.name, 20) || titleShape(shape),
    shape: shape,
    color: cleanColor(msg.color, SHAPES[shape]),
    text: publicText,
    status: publicText ? 'ready' : '',
    userId: ws.userId,
    userName: ws.userName || 'player',
    roomId: ws.roomId
  };
  room.pets.set(pet.id, pet);
  if (!text) {
    broadcast(world, ws.roomId, Object.assign({ type: 'pet' }, pet));
    return;
  }

  const action = actionFromText(text);
  const heard: RoomMessage = {
    type: 'pet',
    id: pet.id,
    name: pet.name,
    shape: pet.shape,
    color: pet.color,
    text: text,
    userId: pet.userId,
    userName: pet.userName,
    roomId: pet.roomId,
    to: toId,
    toName: toName,
    action: action
  };
  broadcastSome(world, ws.roomId, heard, ws.userId, toId);
  broadcastSome(world, ws.roomId, {
    type: 'send',
    text: text,
    roomId: ws.roomId,
    userId: ws.userId,
    userName: ws.userName || 'player',
    to: toId,
    toName: toName,
    action: action,
    pet: { name: pet.name, shape: pet.shape, color: pet.color }
  }, ws.userId, toId);
}

function handleChat(world: World, ws: PersonSocket, msg: RoomMessage): void {
  if (ws.role === 'overlay') return;
  if (!ws.roomId || !ws.userId || !world.rooms.has(ws.roomId)) return;
  const text = clip(msg.text, 200);
  if (!text) return;
  broadcast(world, ws.roomId, {
    type: 'send',
    text: text,
    roomId: ws.roomId,
    userId: ws.userId,
    userName: ws.userName || 'player'
  });
}

function handleRemove(world: World, ws: PersonSocket, msg: RoomMessage): void {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const room = world.rooms.get(ws.roomId);
  if (!room) return;

  if (ws.role === 'client' && msg.all) {
    const ids: string[] = [];
    for (const [id, pet] of room.pets) {
      if (pet.userId === ws.userId) ids.push(id);
    }
    for (let i = 0; i < ids.length; i++) room.pets.delete(ids[i]);
    broadcast(world, ws.roomId, { type: 'remove', all: true, userId: ws.userId || '' });
    return;
  }

  if (msg.id && room.pets.has(msg.id)) {
    const pet = room.pets.get(msg.id);
    if (!pet) return;
    if (ws.role === 'client' && pet.userId !== ws.userId) return;
    room.pets.delete(msg.id);
    broadcast(world, ws.roomId, { type: 'remove', id: msg.id });
  }
}

function attachOverlays(world: World, ip: string, roomId: string): void {
  for (const ows of world.overlays) {
    if (ows.ip !== ip) continue;
    moveOverlay(world, ows, roomId);
    send(ows, { type: 'watching', roomId: roomId });
    sendSnapshot(world, ows);
  }
}

function moveOverlay(world: World, ws: PersonSocket, roomId: string): void {
  if (ws.roomId === roomId && world.rooms.has(roomId)) {
    const room = world.rooms.get(roomId);
    if (room && ws.userId && room.members.has(ws.userId)) return;
  }
  removeMember(world, ws);
  ws.role = 'overlay';
  if (!ws.userId) ws.userId = 'overlay-' + shortId();
  const room = ensureRoom(world, roomId);
  ws.roomId = roomId;
  room.members.set(ws.userId, { ws: ws, id: ws.userId, name: 'overlay', role: 'overlay' });
}

function removeMember(world: World, ws: PersonSocket): void {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) {
    ws.roomId = null;
    return;
  }
  const room = world.rooms.get(ws.roomId);
  if (!room) {
    ws.roomId = null;
    return;
  }
  if (ws.userId) room.members.delete(ws.userId);
  ws.roomId = null;
  if (clientCount(room) > 0) return;

  for (const member of room.members.values()) {
    member.ws.roomId = null;
    send(member.ws, { type: 'watching', roomId: null });
  }
  world.rooms.delete(room.id);
}

// The newest person on this address tells us which room the overlay should watch.
function latestRoomForIp(world: World, ip: string): string {
  let bestId = '';
  let bestTime = -1;
  for (const room of world.rooms.values()) {
    for (const member of room.members.values()) {
      if (member.role === 'overlay') continue;
      if (member.ws.ip === ip && member.ws.joinedAt > bestTime) {
        bestTime = member.ws.joinedAt;
        bestId = room.id;
      }
    }
  }
  return bestId;
}

function ensureRoom(world: World, roomId: string): Room {
  let room = world.rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      members: new Map(),
      pets: new Map()
    };
    world.rooms.set(roomId, room);
  }
  return room;
}

function clientCount(room: Room): number {
  let count = 0;
  for (const member of room.members.values()) {
    if (member.role !== 'overlay') count++;
  }
  return count;
}

// Empty toId means the whole room. A toId means the sender, that person,
// and a full-page window on either of their computers.
function hears(member: Member, senderId: string, toId: string, room: Room): boolean {
  if (!toId) return true;
  if (member.id === senderId || member.id === toId) return true;
  if (member.role !== 'overlay') return false;
  const sender = room.members.get(senderId);
  const target = room.members.get(toId);
  if (sender && member.ws.ip === sender.ws.ip) return true;
  if (target && member.ws.ip === target.ws.ip) return true;
  return false;
}

function broadcastSome(world: World, roomId: string, event: RoomMessage, senderId: string, toId: string): void {
  const room = world.rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const member of room.members.values()) {
    if (!hears(member, senderId, toId, room)) continue;
    if (member.ws.readyState === WebSocket.OPEN) member.ws.send(data);
  }
}

function broadcast(world: World, roomId: string, event: RoomMessage, exceptWs?: PersonSocket): void {
  const room = world.rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const member of room.members.values()) {
    if (member.ws === exceptWs) continue;
    if (member.ws.readyState === WebSocket.OPEN) member.ws.send(data);
  }
}

function broadcastPresence(world: World, roomId: string): void {
  const room = world.rooms.get(roomId);
  if (!room) return;
  const users: Array<{ id: string; name: string }> = [];
  for (const member of room.members.values()) {
    if (member.role === 'overlay') continue;
    users.push({ id: member.id, name: member.name });
  }
  broadcast(world, roomId, { type: 'presence', roomId: roomId, users: users });
}

function sendSnapshot(world: World, ws: PersonSocket): void {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const room = world.rooms.get(ws.roomId);
  if (!room) return;
  const pets: PetNote[] = [];
  for (const pet of room.pets.values()) pets.push(pet);
  send(ws, { type: 'snapshot', roomId: ws.roomId, pets: pets });
}

function send(ws: PersonSocket, event: RoomMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

export function normalizeIp(address: string | undefined): string {
  if (!address) return 'local';
  const cleaned = String(address).replace(/^::ffff:/, '');
  if (cleaned === '127.0.0.1' || cleaned === '::1') return 'local';
  return cleaned;
}

function cleanRoomId(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^[a-zA-Z0-9-]{1,32}$/.test(text)) return '';
  return text;
}

function cleanId(value: string | undefined): string {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(text)) return '';
  return text;
}

function cleanName(value: string | undefined): string {
  const text = clip(String(value || '').trim(), 20);
  return text || 'player';
}

function cleanColor(value: string | undefined, fallback: string): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return fallback;
}

function clip(value: string | undefined, max: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function titleShape(shape: string): string {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function lanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const found: string[] = [];
  const names = Object.keys(nets);
  for (let i = 0; i < names.length; i++) {
    const list = nets[names[i]] || [];
    for (let j = 0; j < list.length; j++) {
      const net = list[j];
      const family = String(net.family);
      const isV4 = family === 'IPv4' || family === '4';
      if (isV4 && !net.internal) found.push(net.address);
    }
  }
  return found;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, server: http.Server): void {
  const url = (req.url || '/').split('?')[0];

  if (url === '/info') {
    const address = server.address();
    const port = address && typeof address !== 'string' ? address.port : DEFAULT_PORT;
    const body = JSON.stringify({
      port: port,
      addresses: lanAddresses()
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  if (url === '/' || url === '/index.html') {
    sendFile(res, path.join(PAGE_DIR, 'index.html'));
    return;
  }

  if (url === '/overlay') {
    sendFile(res, path.join(PAGE_DIR, 'overlay.html'));
    return;
  }

  if (url.indexOf('/js/') === 0) {
    sendFromDir(res, SCRIPT_DIR, decodeURIComponent(url.slice(4)));
    return;
  }

  if (url.indexOf('/shared/') === 0) {
    sendFromDir(res, SHARED_DIR, decodeURIComponent(url.slice('/shared/'.length)));
    return;
  }

  if (url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// Only files inside the folder, and only pages and scripts. A path like
// "../main/server.js" is refused.
function sendFromDir(res: http.ServerResponse, rootDir: string, relativeUrl: string): void {
  const root = path.resolve(rootDir);
  const filePath = path.resolve(rootDir, relativeUrl);
  if (filePath !== root && filePath.indexOf(root + path.sep) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.js' && ext !== '.css' && ext !== '.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  sendFile(res, filePath);
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types: { [ext: string]: string } = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8'
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

export function start(port: number, onReady?: (app: OverlayApp) => void): OverlayApp {
  const appServer = createOverlayServer();
  appServer.server.on('error', function (err: NodeJS.ErrnoException) {
    if (err.code === 'EADDRINUSE') {
      console.error('Port ' + port + ' is already in use. Close the other server, then start again.');
      process.exit(1);
    }
    throw err;
  });
  appServer.server.listen(port, '0.0.0.0', function () {
    if (onReady) onReady(appServer);
  });
  return appServer;
}

const startedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (startedAs === fileURLToPath(import.meta.url)) {
  start(DEFAULT_PORT, function () {
    const addresses = lanAddresses();
    console.log('Overlay server running on http://localhost:' + DEFAULT_PORT);
    if (addresses.length > 0) {
      console.log('Other computers can use http://' + addresses[0] + ':' + DEFAULT_PORT);
    }
  });
}
