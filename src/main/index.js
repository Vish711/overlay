const { app, BrowserWindow, screen } = require('electron');

let overlayWindow = null;

function createOverlay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: workArea.width,
    height: workArea.height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: require('path').join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile('src/renderer/overlay.html');
  overlayWindow.setIgnoreMouseEvents(false);
}

app.whenReady().then(createOverlay);

app.on('window-all-closed', () => {
  app.quit();
});
