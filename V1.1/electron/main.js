/**
 * AgentCommander Desktop - Electron Main Process
 * ================================================
 *
 * Launches the backend server and creates the native window.
 * Handles IPC communication between renderer and backend.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');

// Persistent storage for app settings
const store = new Store({
  defaults: {
    serverPort: 3001,
    theme: 'dark',
    windowBounds: { width: 1200, height: 800 },
    autoStartServer: true,
  },
});

let mainWindow = null;
let serverProcess = null;
let serverPort = store.get('serverPort');

// Determine if running in development or production
const isDev = process.env.NODE_ENV === 'development';
const resourcesPath = isDev ? path.join(__dirname, '..') : process.resourcesPath;

/**
 * Find available TypeScript runner (bun, npx tsx, or node with compiled JS)
 */
function findRunner() {
  const { execSync } = require('child_process');

  // Try Bun first (fastest)
  try {
    execSync('bun --version', { stdio: 'ignore' });
    return { cmd: 'bun', args: ['run'], ext: '.ts' };
  } catch {}

  // Try npx tsx (Node.js TypeScript runner)
  try {
    execSync('npx tsx --version', { stdio: 'ignore' });
    return { cmd: 'npx', args: ['tsx'], ext: '.ts' };
  } catch {}

  // Fallback to Node with compiled JS
  return { cmd: 'node', args: [], ext: '.js' };
}

/**
 * Start the backend server
 */
function startServer() {
  if (serverProcess) {
    console.log('[Electron] Server already running');
    return;
  }

  const runner = findRunner();
  const serverPath = path.join(resourcesPath, 'orchestrator', `index${runner.ext}`);

  console.log(`[Electron] Starting server from: ${serverPath}`);
  console.log(`[Electron] Using runner: ${runner.cmd} ${runner.args.join(' ')}`);
  console.log(`[Electron] Port: ${serverPort}`);

  // Build command args
  const args = [...runner.args, serverPath];

  serverProcess = spawn(runner.cmd, args, {
    env: {
      ...process.env,
      PORT: String(serverPort),
      NODE_ENV: isDev ? 'development' : 'production',
    },
    cwd: resourcesPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: runner.cmd === 'npx', // npx needs shell on some systems
  });

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Server] ${output}`);

    // Notify renderer of server logs
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', { type: 'stdout', data: output });
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.error(`[Server Error] ${output}`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', { type: 'stderr', data: output });
    }
  });

  serverProcess.on('close', (code) => {
    console.log(`[Electron] Server process exited with code ${code}`);
    serverProcess = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { running: false, code });
    }
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Failed to start server:', err);
    dialog.showErrorBox(
      'Server Error',
      `Failed to start backend server: ${err.message}\n\nInstall one of:\n- Bun: curl -fsSL https://bun.sh/install | bash\n- tsx: npm install -g tsx`
    );
  });
}

/**
 * Stop the backend server
 */
function stopServer() {
  if (serverProcess) {
    console.log('[Electron] Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

/**
 * Create the main application window
 */
function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false, // Wait until ready-to-show
  });

  // Save window bounds on resize
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', { width: bounds.width, height: bounds.height });
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the web UI from backend server
  const loadURL = `http://localhost:${serverPort}/llm-config.html`;

  // Wait for server to be ready before loading
  const tryLoad = (retries = 20) => {
    if (retries <= 0) {
      console.error('[Electron] Server failed to start after retries');
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
      return;
    }

    fetch(`http://localhost:${serverPort}/health`)
      .then(() => {
        console.log('[Electron] Server is ready, loading UI');
        mainWindow.loadURL(loadURL);
      })
      .catch(() => {
        console.log(`[Electron] Server not ready, retrying... (${retries} left)`);
        setTimeout(() => tryLoad(retries - 1), 500);
      });
  };

  // Give server a moment to start, then try loading
  setTimeout(() => tryLoad(), 1000);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'AgentCommander',
      submenu: [
        { label: 'About AgentCommander', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: openPreferences },
        { type: 'separator' },
        { label: 'Hide AgentCommander', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' },
        { type: 'separator' },
        { label: 'Toggle DevTools', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Server',
      submenu: [
        {
          label: 'Start Server',
          click: () => {
            startServer();
          },
        },
        {
          label: 'Stop Server',
          click: () => {
            stopServer();
          },
        },
        {
          label: 'Restart Server',
          click: () => {
            stopServer();
            setTimeout(startServer, 1000);
          },
        },
        { type: 'separator' },
        {
          label: 'Open in Browser',
          click: () => {
            shell.openExternal(`http://localhost:${serverPort}/llm-config.html`);
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Close', role: 'close' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/your-org/agentcommander');
          },
        },
        {
          label: 'LLM Providers Reference',
          click: () => {
            const docsPath = path.join(resourcesPath, 'docs', 'LLM_PROVIDERS.md');
            shell.openPath(docsPath);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Open preferences window
 */
function openPreferences() {
  // TODO: Create preferences window for settings like server port, theme, etc.
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Preferences',
    message: 'Preferences dialog coming soon!',
    detail: `Current settings:\n- Server Port: ${serverPort}\n- Theme: ${store.get('theme')}`,
  });
}

// ============================================
// IPC Handlers - Communication with Renderer
// ============================================

ipcMain.handle('get-server-status', () => {
  return {
    running: serverProcess !== null,
    port: serverPort,
  };
});

ipcMain.handle('start-server', () => {
  startServer();
  return { success: true };
});

ipcMain.handle('stop-server', () => {
  stopServer();
  return { success: true };
});

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('set-setting', (_, { key, value }) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle('open-external', (_, url) => {
  shell.openExternal(url);
  return { success: true };
});

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
  console.log('[Electron] App ready');

  createMenu();

  // Start backend server
  if (store.get('autoStartServer')) {
    startServer();
  }

  createWindow();

  app.on('activate', () => {
    // macOS: Re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS: Keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('[Electron] Shutting down...');
  stopServer();
});

app.on('will-quit', () => {
  stopServer();
});
