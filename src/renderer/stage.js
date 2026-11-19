// The pet stage drawn in the browser.
//
// Both the main page and the full-page window (/overlay) use this.
// A pet's x and y are pixels on this canvas. Mouse events are converted
// from screen pixels because the canvas is not always at the top-left
// of the window (on the main page it sits in a card).

(function (root) {
  function attach(canvas, options) {
    const opts = options || {};
    const ctx = canvas.getContext('2d');
    const session = Session.createSession();
    let dragPet = null;
    let press = null;
    let noteText = '';

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (w < 2 || h < 2) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }

    function env() {
      resize();
      return {
        now: Date.now(),
        width: canvas.width || 800,
        height: canvas.height || 600,
        rng: Math.random,
        home: opts.homeFor || null
      };
    }

    function localPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }

    function pointIn(x, y, box) {
      if (!box) return false;
      return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
    }

    function petAt(x, y) {
      for (let i = session.pets.length - 1; i >= 0; i--) {
        const pet = session.pets[i];
        const sprite = {
          x: pet.drawX != null ? pet.drawX : pet.x,
          y: pet.drawY != null ? pet.drawY : pet.y,
          w: pet.width,
          h: pet.height
        };
        if (pointIn(x, y, pet.bubble) || pointIn(x, y, sprite)) return pet;
      }
      return null;
    }

    function setNote(text) {
      if (!opts.note || text === noteText) return;
      noteText = text;
      opts.note.textContent = text;
    }

    canvas.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;
      const point = localPoint(event);
      const pet = petAt(point.x, point.y);
      if (!pet) return;
      press = { pet: pet, x: point.x, y: point.y, moved: false };
    });

    window.addEventListener('mousemove', function (event) {
      if (!press) return;
      const point = localPoint(event);
      if (!press.moved) {
        if (Math.hypot(point.x - press.x, point.y - press.y) < 5) return;
        press.moved = true;
        dragPet = press.pet;
        dragPet.dragging = true;
        dragPet.vx = 0;
        dragPet.vy = 0;
        dragPet.dragOffsetX = press.x - dragPet.x;
        dragPet.dragOffsetY = press.y - dragPet.y;
      }
      if (!dragPet) return;
      dragPet.x = point.x - dragPet.dragOffsetX;
      dragPet.y = point.y - dragPet.dragOffsetY;
    });

    window.addEventListener('mouseup', function () {
      if (press && !press.moved && opts.onCycle) opts.onCycle(press.pet);
      if (dragPet) {
        dragPet.homeX = dragPet.x;
        dragPet.homeY = dragPet.y;
        dragPet.dragging = false;
        if (opts.onHome) opts.onHome(dragPet);
        dragPet = null;
      }
      press = null;
    });

    canvas.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      const point = localPoint(event);
      const pet = petAt(point.x, point.y);
      if (!pet) return;
      if (opts.onRemove) opts.onRemove(pet);
    });

    function wrapLines(text, maxWidth) {
      const words = String(text || '').split(' ');
      const lines = [];
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const trial = line ? line + ' ' + words[i] : words[i];
        if (line && ctx.measureText(trial).width > maxWidth) {
          lines.push(line);
          line = words[i];
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      return lines.slice(0, 4);
    }

    function drawBubble(pet, anchorX, anchorY, now) {
      if (!pet.text || now > pet.speechUntil) {
        pet.bubble = null;
        return;
      }
      const name = (pet.userName || 'player') + ' · Ready';
      ctx.font = '13px system-ui, sans-serif';
      const lines = wrapLines(pet.text, 180);
      ctx.font = '11px system-ui, sans-serif';
      let widest = ctx.measureText(name).width;
      ctx.font = '13px system-ui, sans-serif';
      for (let i = 0; i < lines.length; i++) {
        const width = ctx.measureText(lines[i]).width;
        if (width > widest) widest = width;
      }
      const pad = 8;
      const bw = Math.ceil(widest + pad * 2);
      const bh = pad * 2 + 14 + lines.length * 16;
      let bx = Math.round(anchorX + pet.width / 2 - bw / 2);
      let by = Math.round(anchorY - bh - 8);
      if (by < 4) by = Math.round(anchorY + pet.height + 8);
      if (bx < 4) bx = 4;
      if (bx + bw > canvas.width - 4) bx = Math.max(4, canvas.width - 4 - bw);

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pet.color || '#58a6ff';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = '#57606a';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(name, bx + pad, by + pad + 10);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '13px system-ui, sans-serif';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bx + pad, by + pad + 26 + i * 16);
      }
      pet.bubble = { x: bx, y: by, w: bw, h: bh };
    }

    function drawFrame(nowMs) {
      const now = Date.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < session.pets.length; i++) {
        const pet = session.pets[i];
        const moving = Math.hypot(pet.vx, pet.vy) > 8;
        const count = PetSprites.frameCount(pet.shape);
        const frame = Math.floor(nowMs / (moving ? 140 : 420)) % count;
        let hop = 0;
        if (pet.talkUntil && now < pet.talkUntil) {
          const t = (pet.talkUntil - now) / Session.TALK_MS;
          hop = Math.sin(t * Math.PI) * 14;
        }
        const floatY = pet.shape === 'ghost' ? Math.sin(nowMs / 380 + (pet.phase || 0)) * 8 : 0;
        pet.drawX = pet.x;
        pet.drawY = pet.y - hop + floatY;
        PetSprites.drawPet(ctx, pet.shape, frame, pet.color, pet.drawX, pet.drawY, pet.facing || 1);
      }
      for (let i = 0; i < session.pets.length; i++) {
        const pet = session.pets[i];
        drawBubble(pet, pet.drawX, pet.drawY, now);
      }

      if (!session.roomId) {
        setNote('Join a room, then pick a pet.');
      } else if (session.pets.length === 0) {
        setNote('Pick a pet. It stays here, and the box under it is where you type.');
      } else {
        setNote('Drag your pet to move it. Click it to change animals. Right-click it to hide it.');
      }
      if (opts.onFrame) opts.onFrame(session.pets);
    }

    let last = performance.now();
    function loop(nowMs) {
      resize();
      const dt = (nowMs - last) / 1000;
      last = nowMs;
      if (opts.hold) {
        const now = Date.now();
        for (let i = 0; i < session.pets.length; i++) {
          if (!opts.hold(session.pets[i])) continue;
          session.pets[i].state = 'sit';
          session.pets[i].stateUntil = now + 800;
          session.pets[i].vx = 0;
          session.pets[i].vy = 0;
        }
      }
      Movement.stepPets(session.pets, {
        width: canvas.width || 800,
        height: canvas.height || 600
      }, dt, Date.now(), Math.random);
      drawFrame(nowMs);
      requestAnimationFrame(loop);
    }

    resize();
    requestAnimationFrame(loop);

    return {
      session: session,
      apply: function (msg) {
        Session.applyMessage(session, msg, env());
      }
    };
  }

  root.Stage = { attach: attach };
})(globalThis);
