const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });

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

console.log('Overlay server running on ws://localhost:8080');
