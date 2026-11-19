// Full-page pet window at /overlay.
// Same server, same room. This page joins as an overlay so it is not listed
// as another person. The main page already draws pets too; this is the
// big view you can put on a second monitor.

(function () {
  let socket = null;

  const view = Stage.attach(document.getElementById('overlay'), {
    note: document.getElementById('stage-note'),
    onRemove: function (pet) {
      if (!socket || socket.readyState !== 1) return;
      socket.send(JSON.stringify({ type: 'remove', id: pet.id }));
    }
  });

  function connect() {
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    socket = new WebSocket('ws://' + location.host);
    socket.onopen = function () {
      socket.send(JSON.stringify({ type: 'join', role: 'overlay' }));
    };
    socket.onmessage = function (event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      view.apply(msg);
    };
    socket.onclose = function () {
      setTimeout(connect, 1000);
    };
  }

  connect();
})();
