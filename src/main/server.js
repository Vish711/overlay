const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, '../renderer/index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading page');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url.startsWith('/pets/')) {
    const petPath = path.join(__dirname, '../../assets/pets', req.url.replace('/pets/', ''));
    fs.readFile(petPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(petPath);
      const type = ext === '.gif' ? 'image/gif' : 'image/png';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

function broadcastPresence(roomId) {
  const users = Array.from(rooms.get(roomId).values());
  const data = JSON.stringify({ type: 'presence', users: users.map(u => ({ id: u.id, name: u.name })) });
  rooms.get(roomId).forEach((u) => {
    if (u.ws.readyState === 1) {
      u.ws.send(data);
    }
  });
}

function broadcastRoomEvent(roomId, event) {
  if (rooms.has(roomId)) {
    const data = JSON.stringify(event);
    rooms.get(roomId).forEach((u) => {
      if (u.ws.readyState === 1) {
        u.ws.send(data);
      }
    });
  }
}

wss.on('connection', (ws) => {
  let room = null;
  let userId = null;
  let userName = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'join') {
      if (!rooms.has(msg.roomId)) {
        rooms.set(msg.roomId, new Map());
        broadcastRoomEvent(msg.roomId, { type: 'room_created', roomId: msg.roomId });
      }
      room = msg.roomId;
      userId = msg.id || 'user-' + Math.random().toString(36).substr(2, 6);
      userName = msg.name || 'player';
      rooms.get(room).set(userId, { ws, id: userId, name: userName });
      broadcastPresence(room);
      broadcastRoomEvent(room, { type: 'user_joined', user: { id: userId, name: userName } });
    }

    if (msg.type === 'leave' && room) {
      rooms.get(room).delete(userId);
      broadcastRoomEvent(room, { type: 'user_left', user: { id: userId, name: userName } });
      broadcastPresence(room);
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
      room = null;
    }

    if (msg.type === 'send' && room) {
      const relayData = { type: 'send', text: msg.text, roomId: room };
      if (msg.pet) relayData.pet = msg.pet;
      rooms.get(room).forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(relayData));
        }
      });
    }

    if (msg.type === 'pet' && room) {
      msg.roomId = room;
      msg.userId = userId;
      msg.userName = userName;
      rooms.get(room).forEach((u) => {
        if (u.ws.readyState === 1) {
          u.ws.send(JSON.stringify(msg));
        }
      });
    }

    if (msg.type === 'remove' && room) {
      msg.roomId = room;
      msg.userId = userId;
      msg.userName = userName;
      rooms.get(room).forEach((u) => {
        if (u.ws.readyState === 1) {
          u.ws.send(JSON.stringify(msg));
        }
      });
    }
  });

  ws.on('close', () => {
    if (room && rooms.has(room)) {
      rooms.get(room).delete(userId);
      broadcastRoomEvent(room, { type: 'user_left', user: { id: userId, name: userName } });
      broadcastPresence(room);
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
    }
  });
});

server.listen(55555, () => {
  console.log('Overlay server running on http://localhost:55555');
});
