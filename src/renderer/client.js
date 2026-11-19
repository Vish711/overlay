// The room page.
//
// Each person has one pet.
// Picking an animal sends { type: 'pet' } with no line, which puts it on
// the page. The box under your pet sends the same message with text.
// The server keeps a single pet per user id and broadcasts it. Ready on
// the bubble means that pet has a new line.

(function () {
  const pets = PetSprites.PETS;
  const roomInput = document.getElementById('room');
  const nameInput = document.getElementById('name');
  const serverInput = document.getElementById('server');
  const joinBtn = document.getElementById('join');
  const leaveBtn = document.getElementById('leave');
  const useServerBtn = document.getElementById('use-server');
  const roomInfo = document.getElementById('room-info');
  const note = document.getElementById('note');
  const friendsDiv = document.getElementById('friends');
  const chatLog = document.getElementById('chat-log');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status');
  const clearBtn = document.getElementById('clear-pets');
  const petList = document.getElementById('pet-list');
  const composer = document.getElementById('composer');
  const lineInput = document.getElementById('pet-line');

  const uid = 'user-' + Math.random().toString(36).slice(2, 8);
  let socket = null;
  let joinedRoom = null;
  let myId = uid;
  let lanHint = '';
  let chosen = pets[0];
  let lineFocused = false;

  const stage = Stage.attach(document.getElementById('stage'), {
    note: document.getElementById('stage-note'),
    homeFor: function (msg) {
      if (msg.userId !== myId) return null;
      return loadHome();
    },
    hold: function (pet) {
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

  pets.forEach(function (pet) {
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
  });
  markSelected();

  function tick(now) {
    const items = petList.children;
    for (let i = 0; i < pets.length; i++) {
      const canvas = items[i].querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const frame = Math.floor(now / 280) % PetSprites.frameCount(pets[i].shape);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      PetSprites.drawPet(ctx, pets[i].shape, frame, pets[i].color, 0, 0, 1);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function indexOfShape(shape) {
    for (let i = 0; i < pets.length; i++) {
      if (pets[i].shape === shape) return i;
    }
    return 0;
  }

  function findMine(list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].userId === myId) return list[i];
    }
    return null;
  }

  function markSelected() {
    const items = petList.children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('selected', items[i].dataset.shape === chosen.shape);
    }
  }

  function loadHome() {
    try {
      const saved = JSON.parse(localStorage.getItem('overlay-home') || 'null');
      if (!saved || !isFinite(saved.x) || !isFinite(saved.y)) return null;
      return saved;
    } catch (err) {
      return null;
    }
  }

  function saveHome(x, y) {
    try {
      localStorage.setItem('overlay-home', JSON.stringify({ x: x, y: y }));
    } catch (err) {
      // The page still works if the browser will not store the spot.
    }
  }

  function placeComposer(pet) {
    if (!pet) {
      composer.hidden = true;
      return;
    }
    const canvas = document.getElementById('stage');
    const left = Math.max(8, Math.min(canvas.width - 240, pet.drawX + pet.width / 2 - 115));
    const top = Math.max(8, Math.min(canvas.height - 52, (pet.drawY || pet.y) + pet.height - 18));
    composer.hidden = false;
    composer.style.left = left + 'px';
    composer.style.top = top + 'px';
  }

  function setConnected(on) {
    statusDot.className = on ? 'dot connected' : 'dot disconnected';
    statusText.textContent = on ? 'Connected' : 'Disconnected';
  }

  function showNote(text) {
    note.textContent = text || '';
  }

  function inRoom() {
    return !!(joinedRoom && socket && socket.readyState === 1);
  }

  function requireRoom() {
    if (inRoom()) {
      showNote('');
      return true;
    }
    showNote('Join a room first.');
    return false;
  }

  function sendJson(payload) {
    if (!socket || socket.readyState !== 1) {
      showNote('Not connected to the server.');
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  }

  function sendJoin(roomId) {
    sendJson({
      type: 'join',
      roomId: roomId || '',
      name: nameInput.value,
      id: myId,
      role: 'client'
    });
  }

  function showPet(text) {
    if (!requireRoom()) return false;
    return sendJson({
      type: 'pet',
      text: text || '',
      name: chosen.name,
      shape: chosen.shape,
      color: chosen.color
    });
  }

  function choosePet(pet) {
    chosen = pet;
    markSelected();
    if (inRoom()) showPet('');
  }

  function sendLine() {
    const text = lineInput.value.trim();
    if (!text) {
      showNote('Type a line for your pet to say.');
      return;
    }
    if (showPet(text)) {
      lineInput.value = '';
      showNote(chosen.name + ' is saying it.');
    }
  }

  function addChat(msg) {
    const row = document.createElement('div');
    row.className = 'chat-line';
    const who = document.createElement('span');
    who.className = 'who';
    if (msg.pet) who.textContent = (msg.userName || 'player') + ' · ' + msg.pet.name + ' · Ready';
    else who.textContent = msg.userName || 'player';
    const body = document.createElement('span');
    body.textContent = msg.text || '';
    row.appendChild(who);
    row.appendChild(body);
    chatLog.appendChild(row);
    while (chatLog.children.length > 80) chatLog.removeChild(chatLog.firstChild);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderFriends(users) {
    friendsDiv.textContent = '';
    if (!users || users.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'Nobody in the room yet.';
      friendsDiv.appendChild(empty);
      return;
    }
    for (let i = 0; i < users.length; i++) {
      const chip = document.createElement('div');
      chip.className = 'friend';
      const label = users[i].name || users[i].id || 'player';
      chip.textContent = users[i].id === myId ? label + ' (you)' : label;
      friendsDiv.appendChild(chip);
    }
  }

  function describeRoom() {
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

  function connect() {
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
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      onMessage(msg);
    });
  }

  function onMessage(msg) {
    if (msg.type === 'joined') {
      joinedRoom = msg.roomId;
      myId = msg.userId || myId;
      stage.session.roomId = msg.roomId;
      roomInput.value = msg.roomId;
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
    describeRoom();
    renderFriends([]);
    showNote('You left the room. Your pet is hidden.');
  });

  composer.addEventListener('submit', function (event) {
    event.preventDefault();
    sendLine();
  });
  lineInput.addEventListener('focus', function () { lineFocused = true; });
  lineInput.addEventListener('blur', function () { lineFocused = false; });

  clearBtn.addEventListener('click', function () {
    if (!requireRoom()) return;
    sendJson({ type: 'remove', all: true });
    showNote('Your pet is hidden.');
  });

  useServerBtn.addEventListener('click', function () {
    let host = serverInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host) return;
    serverInput.value = host;
    if (host !== location.host) window.location.href = 'http://' + host + '/';
    else showNote('This page is already using that server.');
  });

  fetch('/info').then(function (res) { return res.json(); }).then(function (info) {
    if (info.addresses && info.addresses.length > 0) {
      lanHint = info.addresses[0] + ':' + info.port;
      describeRoom();
    }
  }).catch(function () {});

  connect();
})();
