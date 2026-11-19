// The site is the browser. This file starts the same server as `npm start`
// for anyone who runs `node src/main/index.js`.

const { start, DEFAULT_PORT, lanAddresses } = require('./server');

start(DEFAULT_PORT, function () {
  console.log('Open http://localhost:' + DEFAULT_PORT);
  const addresses = lanAddresses();
  if (addresses.length > 0) {
    console.log('From another computer, open http://' + addresses[0] + ':' + DEFAULT_PORT);
  }
});
