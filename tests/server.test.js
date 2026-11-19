const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');
const { createOverlayServer } = require('../src/main/server');

const app = createOverlayServer();
let port = 0;

function connect() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket('ws://127.0.0.1:' + port);
    ws.inbox = [];
    ws.on('message', function (data) {
      ws.inbox.push(JSON.parse(data.toString()));
    });
    ws.on('open', function () { resolve(ws); });
    ws.on('error', reject);
  });
}

function matches(pred, msg) {
  if (typeof pred === 'function') return pred(msg);
  return msg.type === pred;
}

function waitFor(ws, pred, ms) {
  return new Promise(function (resolve, reject) {
    const start = Date.now();
    const timer = setInterval(function () {
      for (let i = 0; i < ws.inbox.length; i++) {
        if (matches(pred, ws.inbox[i])) {
          clearInterval(timer);
          resolve(ws.inbox[i]);
          return;
        }
      }
      if (Date.now() - start > (ms || 1000)) {
        clearInterval(timer);
        reject(new Error('no match in ' + JSON.stringify(ws.inbox)));
      }
    }, 15);
  });
}

function get(path) {
  return new Promise(function (resolve, reject) {
    http.get({ hostname: '127.0.0.1', port: port, path: path }, function (res) {
      const chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    }).on('error', reject);
  });
}

describe('browser server', { concurrency: 1 }, function () {
  before(function () {
    return new Promise(function (resolve) {
      app.server.listen(0, '127.0.0.1', function () {
        port = app.server.address().port;
        resolve();
      });
    });
  });

  after(function () {
    return new Promise(function (resolve) {
      for (const client of app.wss.clients) client.close();
      app.server.close(function () { resolve(); });
    });
  });

  test('the pages are served in the browser', async function () {
    const home = await get('/');
    const overlay = await get('/overlay');
    const blocked = await get('/js/..%2Fmain%2Fserver.js');
    assert.equal(home.status, 200);
    assert.ok(home.body.indexOf('id="stage"') !== -1);
    assert.equal(overlay.status, 200);
    assert.ok(overlay.body.indexOf('id="overlay"') !== -1);
    assert.equal(blocked.status, 403);
  });

  test('a pet sent by one person arrives for the other and for the pet window', async function () {
    const overlay = await connect();
    overlay.send(JSON.stringify({ type: 'join', role: 'overlay' }));
    const idle = await waitFor(overlay, 'watching');
    assert.equal(idle.roomId, null);

    const ada = await connect();
    ada.send(JSON.stringify({ type: 'join', roomId: 'demo', name: 'Ada', id: 'ada' }));
    const joined = await waitFor(ada, 'joined');
    assert.equal(joined.roomId, 'demo');

    const watching = await waitFor(overlay, function (msg) {
      return msg.type === 'watching' && msg.roomId === 'demo';
    });
    assert.equal(watching.roomId, 'demo');

    const bea = await connect();
    bea.send(JSON.stringify({ type: 'join', roomId: 'demo', name: 'Bea', id: 'bea' }));
    const presence = await waitFor(bea, function (msg) {
      return msg.type === 'presence' && msg.users.length === 2;
    });
    for (let i = 0; i < presence.users.length; i++) {
      assert.notEqual(presence.users[i].name, 'overlay');
    }

    ada.send(JSON.stringify({
      type: 'pet',
      text: 'hello from ada',
      name: 'Cat',
      shape: 'cat',
      color: '#ff6b6b'
    }));

    const onBea = await waitFor(bea, 'pet');
    const onAda = await waitFor(ada, 'pet');
    const onOverlay = await waitFor(overlay, 'pet');
    assert.equal(onBea.text, 'hello from ada');
    assert.equal(onBea.shape, 'cat');
    assert.equal(onBea.userName, 'Ada');
    assert.equal(onBea.id, 'ada');
    assert.equal(onAda.id, onBea.id);
    assert.equal(onOverlay.id, onBea.id);

    const chat = await waitFor(bea, 'send');
    assert.equal(chat.text, 'hello from ada');
    assert.equal(chat.pet.name, 'Cat');

    ada.send(JSON.stringify({ type: 'remove', all: true }));
    const removed = await waitFor(bea, 'remove');
    assert.equal(removed.all, true);
    assert.equal(removed.userId, 'ada');
  });

  test('junk input does not kill the room', async function () {
    const ada = await connect();
    ada.send(JSON.stringify({ type: 'join', roomId: 'demo', name: 'Ada', id: 'ada' }));
    await waitFor(ada, 'joined');
    ada.send('this is not json');
    ada.send(JSON.stringify({ type: 'send', text: 'still here' }));
    const chat = await waitFor(ada, function (msg) {
      return msg.type === 'send' && msg.text === 'still here';
    });
    assert.equal(chat.text, 'still here');
  });
});
