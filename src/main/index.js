const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let overlayWindow = null;

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.workArea;

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Same idea as a localhost server: this process can be running while the
  // person keeps using the machine. The window only draws. It never activates,
  // and mouse and keyboard go to the windows underneath.
  const stayOutOfTheWay = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.setIgnoreMouseEvents(true);
    overlayWindow.setFocusable(false);
  };
  stayOutOfTheWay();
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.on('show', stayOutOfTheWay);

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlayWindow.once('ready-to-show', () => {
    stayOutOfTheWay();
    overlayWindow.showInactive();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

const onlyInstance = app.requestSingleInstanceLock();
if (!onlyInstance) {
  app.quit();
} else {
  app.whenReady().then(createOverlay);
}

app.on('window-all-closed', () => {
  app.quit();
});
