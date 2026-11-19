// Room server.
//
// One HTTP server hands out the client page. The same port also accepts
// WebSocket connections. A connection is either a person (role "client")
// or the full-page pet window in the browser (role "overlay", at /overlay).
//
// People in the same roomId share one Map of members and one Map of pets.
// A pet message is stamped with the sender's id and broadcast to every
// member of that room, including the overlay. The overlay is a member, but
// it is left out of the "who is online" list.
//
// Which full-page window watches which room: we pair them by IP address.
// Two tabs on one computer (the room page and /overlay) share one address.
// Localhost counts as one address. When that person joins a room, the
// full-page window from that address is moved into the room. A friend on
// another computer has a different address, so their window follows them.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PORT = 55555;
const ROOT = path.join(__dirname, '..', '..');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');
const SHARED_DIR = path.join(ROOT, 'src', 'shared');

const SHAPES = {
  cat: '#ff6b6b',
  dog: '#4ecdc4',
  ghost: '#ffe66d',
  fire: '#ff8a5c',
  star: '#a29bfe',
  heart: '#fd79a8'
};

function createOverlayServer() {
  const world = {
    rooms: new Map(),
    overlays: new Set()
  };

  const server = http.createServer(function (req, res) {
    handleRequest(req, res, server);
  });
  const wss = new WebSocketServer({ server: server });

  wss.on('connection', function (ws, req) {
    ws.role = 'client';
    ws.roomId = null;
    ws.userId = null;
    ws.userName = null;
    ws.ip = normalizeIp(req.socket.remoteAddress);
    ws.joinedAt = 0;

    ws.on('message', function (data) {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      handleMessage(world, ws, msg);
    });

    ws.on('close', function () {
      world.overlays.delete(ws);
      leave(world, ws);
    });
  });

  return { server: server, wss: wss, world: world };
}

function handleMessage(world, ws, msg) {
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

function joinOverlay(world, ws, msg) {
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

function joinClient(world, ws, msg) {
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

function leave(world, ws) {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) {
    ws.roomId = null;
    return;
  }
  const roomId = ws.roomId;
  const role = ws.role;
  const user = { id: ws.userId, name: ws.userName };
  removeMember(world, ws);
  if (role === 'overlay') return;
  if (!world.rooms.has(roomId)) return;
  broadcast(world, roomId, { type: 'user_left', user: user });
  broadcastPresence(world, roomId);
}

function handlePet(world, ws, msg) {
  if (ws.role === 'overlay') return;
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const shape = String(msg.shape || '').toLowerCase();
  if (!SHAPES[shape]) return;
  const text = clip(msg.text, 80);
  const room = world.rooms.get(ws.roomId);
  // One pet per person. The id is the user id, so picking a different
  // animal replaces the old one instead of adding another.
  const previous = room.pets.get(ws.userId);
  // Drop any older pet that was saved under a different id for this person.
  const stale = [];
  room.pets.forEach(function (pet, id) {
    if (pet.userId === ws.userId && id !== ws.userId) stale.push(id);
  });
  for (let i = 0; i < stale.length; i++) room.pets.delete(stale[i]);

  const pet = {
    id: ws.userId,
    name: clip(msg.name, 20) || titleShape(shape),
    shape: shape,
    color: cleanColor(msg.color, SHAPES[shape]),
    text: text || (previous ? previous.text : ''),
    status: text ? 'ready' : '',
    userId: ws.userId,
    userName: ws.userName,
    roomId: ws.roomId
  };
  room.pets.set(pet.id, pet);
  broadcast(world, ws.roomId, Object.assign({ type: 'pet' }, pet));
  if (!text) return;
  broadcast(world, ws.roomId, {
    type: 'send',
    text: text,
    roomId: ws.roomId,
    userId: ws.userId,
    userName: ws.userName,
    pet: { name: pet.name, shape: pet.shape, color: pet.color }
  });
}

function handleChat(world, ws, msg) {
  if (ws.role === 'overlay') return;
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const text = clip(msg.text, 200);
  if (!text) return;
  broadcast(world, ws.roomId, {
    type: 'send',
    text: text,
    roomId: ws.roomId,
    userId: ws.userId,
    userName: ws.userName
  });
}

function handleRemove(world, ws, msg) {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const room = world.rooms.get(ws.roomId);

  if (ws.role === 'client' && msg.all) {
    const ids = [];
    room.pets.forEach(function (pet, id) {
      if (pet.userId === ws.userId) ids.push(id);
    });
    for (let i = 0; i < ids.length; i++) room.pets.delete(ids[i]);
    broadcast(world, ws.roomId, { type: 'remove', all: true, userId: ws.userId });
    return;
  }

  if (msg.id && room.pets.has(msg.id)) {
    const pet = room.pets.get(msg.id);
    if (ws.role === 'client' && pet.userId !== ws.userId) return;
    room.pets.delete(msg.id);
    broadcast(world, ws.roomId, { type: 'remove', id: msg.id });
  }
}

function attachOverlays(world, ip, roomId) {
  for (const ows of world.overlays) {
    if (ows.ip !== ip) continue;
    moveOverlay(world, ows, roomId);
    send(ows, { type: 'watching', roomId: roomId });
    sendSnapshot(world, ows);
  }
}

function moveOverlay(world, ws, roomId) {
  if (ws.roomId === roomId && world.rooms.has(roomId)) {
    const room = world.rooms.get(roomId);
    if (room.members.has(ws.userId)) return;
  }
  removeMember(world, ws);
  ws.role = 'overlay';
  if (!ws.userId) ws.userId = 'overlay-' + shortId();
  const room = ensureRoom(world, roomId);
  ws.roomId = roomId;
  room.members.set(ws.userId, { ws: ws, id: ws.userId, name: 'overlay', role: 'overlay' });
}

function removeMember(world, ws) {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) {
    ws.roomId = null;
    return;
  }
  const room = world.rooms.get(ws.roomId);
  room.members.delete(ws.userId);
  ws.roomId = null;
  if (clientCount(room) > 0) return;

  for (const member of room.members.values()) {
    member.ws.roomId = null;
    send(member.ws, { type: 'watching', roomId: null });
  }
  world.rooms.delete(room.id);
}

function latestRoomForIp(world, ip) {
  let bestId = null;
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

function ensureRoom(world, roomId) {
  if (!world.rooms.has(roomId)) {
    world.rooms.set(roomId, {
      id: roomId,
      members: new Map(),
      pets: new Map()
    });
  }
  return world.rooms.get(roomId);
}

function clientCount(room) {
  let count = 0;
  for (const member of room.members.values()) {
    if (member.role !== 'overlay') count++;
  }
  return count;
}

function broadcast(world, roomId, event, exceptWs) {
  const room = world.rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const member of room.members.values()) {
    if (member.ws === exceptWs) continue;
    if (member.ws.readyState === WebSocket.OPEN) member.ws.send(data);
  }
}

function broadcastPresence(world, roomId) {
  const room = world.rooms.get(roomId);
  if (!room) return;
  const users = [];
  for (const member of room.members.values()) {
    if (member.role === 'overlay') continue;
    users.push({ id: member.id, name: member.name });
  }
  broadcast(world, roomId, { type: 'presence', roomId: roomId, users: users });
}

function sendSnapshot(world, ws) {
  if (!ws.roomId || !world.rooms.has(ws.roomId)) return;
  const pets = [];
  for (const pet of world.rooms.get(ws.roomId).pets.values()) pets.push(pet);
  send(ws, { type: 'snapshot', roomId: ws.roomId, pets: pets });
}

function send(ws, event) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

function normalizeIp(address) {
  if (!address) return 'local';
  const cleaned = String(address).replace(/^::ffff:/, '');
  if (cleaned === '127.0.0.1' || cleaned === '::1') return 'local';
  return cleaned;
}

function cleanRoomId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^[a-zA-Z0-9-]{1,32}$/.test(text)) return '';
  return text;
}

function cleanId(value) {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(text)) return '';
  return text;
}

function cleanName(value) {
  const text = clip(String(value || '').trim(), 20);
  return text || 'player';
}

function cleanColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return fallback;
}

function clip(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function titleShape(shape) {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const found = [];
  const names = Object.keys(nets);
  for (let i = 0; i < names.length; i++) {
    const list = nets[names[i]] || [];
    for (let j = 0; j < list.length; j++) {
      const net = list[j];
      const family = net.family;
      const isV4 = family === 'IPv4' || family === 4;
      if (isV4 && !net.internal) found.push(net.address);
    }
  }
  return found;
}

function handleRequest(req, res, server) {
  const url = (req.url || '/').split('?')[0];

  if (url === '/info') {
    const address = server.address();
    const body = JSON.stringify({
      port: address ? address.port : DEFAULT_PORT,
      addresses: lanAddresses()
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  if (url === '/' || url === '/index.html') {
    sendFile(res, path.join(RENDERER_DIR, 'index.html'));
    return;
  }

  if (url === '/overlay') {
    sendFile(res, path.join(RENDERER_DIR, 'overlay.html'));
    return;
  }

  if (url.indexOf('/js/') === 0) {
    sendFromDir(res, RENDERER_DIR, decodeURIComponent(url.slice(4)));
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

function sendFromDir(res, rootDir, relativeUrl) {
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

function sendFile(res, filePath) {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
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

function start(port, onReady) {
  const appServer = createOverlayServer();
  appServer.server.on('error', function (err) {
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

if (require.main === module) {
  start(DEFAULT_PORT, function () {
    const addresses = lanAddresses();
    console.log('Overlay server running on http://localhost:' + DEFAULT_PORT);
    if (addresses.length > 0) {
      console.log('Other computers can use http://' + addresses[0] + ':' + DEFAULT_PORT);
    }
  });
}

module.exports = {
  DEFAULT_PORT: DEFAULT_PORT,
  createOverlayServer: createOverlayServer,
  start: start,
  normalizeIp: normalizeIp,
  lanAddresses: lanAddresses
};
