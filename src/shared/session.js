// What the page does with a message from the server.
//
// The page does not send screen coordinates. Every computer picks its own
// spot for a new pet, then keeps that spot while the pet walks. A later
// message with the same id is the same pet: we keep x and y, and only
// replace the words and the animal.
//
// Each person has one pet. The pet id is that person's user id.
// The wrapper below lets this file run in the page and in the tests.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.Session = api;
})(globalThis, function () {
  const SPRITE = 64;
  const RADIUS = 26;
  const SPEECH_MS = 7000;
  const TALK_MS = 1600;
  const MAX_PETS = 24;

  function createSession() {
    return { roomId: null, pets: [] };
  }

  function createPet(msg, env) {
    const rng = env.rng || Math.random;
    const width = env.width || 800;
    const height = env.height || 600;
    const spanX = Math.max(0, width - SPRITE - 16);
    const spanY = Math.max(0, height - SPRITE - 16);
    const now = env.now || 0;
    let x = 8 + rng() * spanX;
    let y = 8 + rng() * spanY;
    if (env.home) {
      const saved = env.home(msg);
      if (saved && isFinite(saved.x) && isFinite(saved.y)) {
        x = saved.x;
        y = saved.y;
      }
    }
    return {
      id: msg.id,
      name: msg.name || 'Pet',
      shape: msg.shape || 'cat',
      color: msg.color || '#ff6b6b',
      userId: msg.userId || '',
      userName: msg.userName || 'player',
      text: msg.text || '',
      speechUntil: msg.text ? now + SPEECH_MS : 0,
      talkUntil: msg.text ? now + TALK_MS : 0,
      x: x,
      y: y,
      homeX: x,
      homeY: y,
      vx: 0,
      vy: 0,
      heading: rng() * Math.PI * 2,
      wanderTarget: rng() * Math.PI * 2,
      state: 'wander',
      stateUntil: 0,
      facing: 1,
      phase: rng() * Math.PI * 2,
      width: SPRITE,
      height: SPRITE,
      radius: RADIUS,
      dragging: false
    };
  }

  function findPet(session, id) {
    for (let i = 0; i < session.pets.length; i++) {
      if (session.pets[i].id === id) return session.pets[i];
    }
    return null;
  }

  function giveSpeech(pet, msg, now) {
    if (msg.shape) pet.shape = msg.shape;
    pet.text = msg.text || '';
    pet.userName = msg.userName || pet.userName;
    pet.color = msg.color || pet.color;
    pet.name = msg.name || pet.name;
    if (pet.text) {
      pet.speechUntil = now + SPEECH_MS;
      pet.talkUntil = now + TALK_MS;
      pet.state = 'talk';
    }
  }

  function trim(session) {
    while (session.pets.length > MAX_PETS) {
      session.pets.shift();
    }
  }

  function applyMessage(session, msg, env) {
    const now = env.now || 0;
    if (!msg || !msg.type) return session;

    if (msg.type === 'watching') {
      if (msg.roomId !== session.roomId) {
        session.roomId = msg.roomId || null;
        session.pets = [];
      }
      return session;
    }

    if (msg.type === 'snapshot') {
      if (msg.roomId && session.roomId && msg.roomId !== session.roomId) return session;
      if (msg.roomId) session.roomId = msg.roomId;
      const next = [];
      const incoming = msg.pets || [];
      for (let i = 0; i < incoming.length; i++) {
        const item = incoming[i];
        const existing = findPet(session, item.id);
        if (existing) {
          giveSpeech(existing, item, now);
          next.push(existing);
        } else {
          next.push(createPet(item, env));
        }
      }
      session.pets = next;
      trim(session);
      return session;
    }

    if (msg.type === 'pet') {
      if (!msg.id) return session;
      const existing = findPet(session, msg.id);
      if (existing) {
        giveSpeech(existing, msg, now);
      } else {
        session.pets.push(createPet(msg, env));
        trim(session);
      }
      return session;
    }

    if (msg.type === 'remove') {
      if (msg.all && msg.userId) {
        const kept = [];
        for (let i = 0; i < session.pets.length; i++) {
          if (session.pets[i].userId !== msg.userId) kept.push(session.pets[i]);
        }
        session.pets = kept;
      } else if (msg.id) {
        const kept = [];
        for (let i = 0; i < session.pets.length; i++) {
          if (session.pets[i].id !== msg.id) kept.push(session.pets[i]);
        }
        session.pets = kept;
      }
    }

    return session;
  }

  return {
    SPEECH_MS: SPEECH_MS,
    TALK_MS: TALK_MS,
    createSession: createSession,
    createPet: createPet,
    applyMessage: applyMessage
  };
});
