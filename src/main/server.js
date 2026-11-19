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

wss.on('connection', (ws) => {
  let room = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'join') {
      if (!rooms.has(msg.roomId)) {
        rooms.set(msg.roomId, new Set());
      }
      room = msg.roomId;
      rooms.get(room).add(ws);
      ws.send(JSON.stringify({ type: 'presence', users: Array.from(rooms.get(room)) }));
    }

    if (msg.type === 'leave' && room) {
      rooms.get(room).delete(ws);
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
      room = null;
    }

    if (msg.type === 'send' && room) {
      rooms.get(room).forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'send', text: msg.text, roomId: room }));
        }
      });
    }

    if (msg.type === 'pet' && room) {
      msg.roomId = room;
      rooms.get(room).forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(msg));
        }
      });
    }

    if (msg.type === 'remove' && room) {
      msg.roomId = room;
      rooms.get(room).forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(msg));
        }
      });
    }
  });

  ws.on('close', () => {
    if (room && rooms.has(room)) {
      rooms.get(room).delete(ws);
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
    }
  });
});

server.listen(55555, () => {
  console.log('Overlay server running on http://localhost:55555');
});
