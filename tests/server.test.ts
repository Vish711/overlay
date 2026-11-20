import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createOverlayServer } from '../src/main/server.js';
import type { RoomMessage } from '../src/shared/types.js';

const app = createOverlayServer();
let port = 0;

interface Inbox {
  send: (data: string) => void;
  inbox: RoomMessage[];
  close: () => void;
}

function connect(): Promise<Inbox> {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket('ws://127.0.0.1:' + port);
    const box: Inbox = {
      inbox: [],
      send: function (data: string) { ws.send(data); },
      close: function () { ws.close(); }
    };
    ws.on('message', function (data) {
      box.inbox.push(JSON.parse(data.toString()) as RoomMessage);
    });
    ws.on('open', function () { resolve(box); });
    ws.on('error', reject);
  });
}

function matches(pred: string | ((msg: RoomMessage) => boolean), msg: RoomMessage): boolean {
  if (typeof pred === 'function') return pred(msg);
  return msg.type === pred;
}

function waitFor(ws: Inbox, pred: string | ((msg: RoomMessage) => boolean), ms?: number): Promise<RoomMessage> {
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

function get(urlPath: string): Promise<{ status: number | undefined; body: string }> {
  return new Promise(function (resolve, reject) {
    http.get({ hostname: '127.0.0.1', port: port, path: urlPath }, function (res) {
      const chunks: Buffer[] = [];
      res.on('data', function (chunk: Buffer) { chunks.push(chunk); });
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
        const address = app.server.address();
        if (!address || typeof address === 'string') throw new Error('no port');
        port = address.port;
        resolve(undefined);
      });
    });
  });

  after(function () {
    return new Promise(function (resolve) {
      for (const client of app.wss.clients) client.close();
      app.server.close(function () { resolve(undefined); });
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
      return msg.type === 'presence' && !!msg.users && msg.users.length === 2;
    });
    const users = presence.users || [];
    for (let i = 0; i < users.length; i++) {
      assert.notEqual(users[i].name, 'overlay');
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
    assert.equal(chat.pet && chat.pet.name, 'Cat');

    ada.send(JSON.stringify({ type: 'remove', all: true }));
    const removed = await waitFor(bea, 'remove');
    assert.equal(removed.all, true);
    assert.equal(removed.userId, 'ada');
  });

  test('a line to one person stays between those two', async function () {
    const ann = await connect();
    ann.send(JSON.stringify({ type: 'join', roomId: 'whisper', name: 'Ann', id: 'ann' }));
    await waitFor(ann, 'joined');

    const bob = await connect();
    bob.send(JSON.stringify({ type: 'join', roomId: 'whisper', name: 'Bob', id: 'bob' }));
    await waitFor(bob, function (msg) {
      return msg.type === 'presence' && !!msg.users && msg.users.length === 2;
    });

    const cam = await connect();
    cam.send(JSON.stringify({ type: 'join', roomId: 'whisper', name: 'Cam', id: 'cam' }));
    await waitFor(cam, function (msg) {
      return msg.type === 'presence' && !!msg.users && msg.users.length === 3;
    });

    ann.send(JSON.stringify({
      type: 'pet',
      text: 'sit please',
      name: 'Cat',
      shape: 'cat',
      color: '#ff6b6b',
      to: 'bob'
    }));

    const onBob = await waitFor(bob, function (msg) {
      return msg.type === 'pet' && msg.text === 'sit please';
    });
    assert.equal(onBob.to, 'bob');
    assert.equal(onBob.toName, 'Bob');
    assert.equal(onBob.action, 'sit');

    const onAnn = await waitFor(ann, function (msg) {
      return msg.type === 'send' && msg.text === 'sit please';
    });
    assert.equal(onAnn.action, 'sit');

    await new Promise(function (resolve) { setTimeout(resolve, 250); });
    for (let i = 0; i < cam.inbox.length; i++) {
      assert.notEqual(cam.inbox[i].text, 'sit please');
    }
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
