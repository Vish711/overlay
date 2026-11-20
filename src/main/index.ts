// Starts the browser server. `npm start` compiles this, then runs it.

import { start, DEFAULT_PORT, lanAddresses } from './server.js';

start(DEFAULT_PORT, function () {
  console.log('Open http://localhost:' + DEFAULT_PORT);
  const addresses = lanAddresses();
  if (addresses.length > 0) {
    console.log('From another computer, open http://' + addresses[0] + ':' + DEFAULT_PORT);
  }
});
