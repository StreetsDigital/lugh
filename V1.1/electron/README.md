# AgentCommander Desktop

Native desktop application wrapping the AgentCommander web UI.

## Quick Start

### Prerequisites

- Node.js 18+ (for Electron)
- Bun (for the backend server)

### Development

```bash
# Install dependencies
cd electron
npm install

# Start in development mode
npm run dev
```

This will:
1. Start the Electron app
2. Auto-start the backend server (Bun)
3. Load the web UI at `http://localhost:3001/llm-config.html`

### Building for Production

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac    # macOS (DMG + ZIP)
npm run build:win    # Windows (NSIS + Portable)
npm run build:linux  # Linux (AppImage + DEB)
```

Built apps are output to `electron/dist/`.

## Architecture

```
electron/
├── main.js          # Electron main process (window, server management)
├── preload.js       # Secure IPC bridge (contextBridge)
├── renderer.js      # Renderer helpers (status indicator, log console)
├── error.html       # Error page shown when server fails
├── assets/          # App icons (SVG, ICO, ICNS, PNG)
└── package.json     # Electron dependencies and build config
```

## Features

### Server Management
- Auto-starts backend server on app launch
- Graceful shutdown on app close
- Server menu: Start/Stop/Restart
- Real-time server logs (press `⌘\``)

### Desktop Integration
- Native macOS/Windows/Linux app
- System tray support (future)
- Auto-update support (future)
- Dark mode support

### IPC Communication
The preload script exposes safe APIs via `window.agentCommander`:

```javascript
// Server management
await agentCommander.getServerStatus()
await agentCommander.startServer()
await agentCommander.stopServer()

// Settings
const settings = await agentCommander.getSettings()
await agentCommander.setSetting('serverPort', 3002)

// Events
agentCommander.onServerLog((log) => console.log(log))
agentCommander.onServerStatus((status) => console.log(status))
```

## Configuration

Settings are persisted using `electron-store` at:
- macOS: `~/Library/Application Support/agentcommander-desktop/config.json`
- Windows: `%APPDATA%/agentcommander-desktop/config.json`
- Linux: `~/.config/agentcommander-desktop/config.json`

### Default Settings

```json
{
  "serverPort": 3001,
  "theme": "dark",
  "windowBounds": { "width": 1200, "height": 800 },
  "autoStartServer": true
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘,` | Preferences |
| `⌘\`` | Toggle server logs |
| `⌘R` | Reload page |
| `⌘+` | Zoom in |
| `⌘-` | Zoom out |
| `⌘0` | Reset zoom |

## Troubleshooting

### Server won't start
1. Ensure Bun is installed: `curl -fsSL https://bun.sh/install | bash`
2. Check port 3001 is available: `lsof -i :3001`
3. View server logs with `⌘\``

### App crashes on launch
1. Delete config: `rm -rf ~/Library/Application\ Support/agentcommander-desktop`
2. Reinstall dependencies: `rm -rf node_modules && npm install`

### Build fails
1. Ensure you have the required icons in `assets/`
2. For Windows builds on macOS: `brew install wine-stable`
3. Check electron-builder logs for specific errors

## Distribution

### Build Outputs

After running `npm run build`, you'll find:

| Platform | File | Description |
|----------|------|-------------|
| macOS | `AgentCommander-1.1.0.dmg` | Drag-and-drop installer |
| macOS | `AgentCommander-1.1.0-mac.zip` | Portable ZIP archive |
| Windows | `AgentCommander Setup 1.1.0.exe` | NSIS installer |
| Windows | `AgentCommander 1.1.0.exe` | Portable executable |
| Linux | `AgentCommander-1.1.0.AppImage` | Universal Linux binary |
| Linux | `AgentCommander_1.1.0_amd64.deb` | Debian/Ubuntu package |

### Code Signing

For production distribution, you'll need to sign the app:

**macOS:**
1. Get an Apple Developer ID certificate
2. Set environment variables:
   ```bash
   export CSC_IDENTITY_AUTO_DISCOVERY=true
   # Or specify explicitly:
   export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
   ```
3. For notarization (required for Catalina+):
   ```bash
   export APPLE_ID=your@apple.id
   export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   export APPLE_TEAM_ID=XXXXXXXXXX
   ```

**Windows:**
1. Obtain a code signing certificate
2. Set environment variables:
   ```bash
   export CSC_LINK=/path/to/certificate.pfx
   export CSC_KEY_PASSWORD=your_password
   ```

### Icon Generation

Icons are auto-generated from `assets/icon.svg` during build:

```bash
# Generate icons manually
npm run generate-icons
```

Required tools (installed as dev dependencies):
- `sharp` - SVG to PNG conversion
- macOS `iconutil` - PNG to ICNS (built-in)
- `png2icons` - PNG to ICO

## Development Notes

### Running with Docker Backend

If you want to use the Docker-based backend instead of local Bun:

1. Start the Docker services: `docker-compose up -d`
2. Disable auto-start in Electron settings
3. Point to Docker port: `setSetting('serverPort', 3001)`

### Hot Reload

The web UI supports hot reload during development. Changes to the public HTML/JS will reflect on browser refresh (`⌘R`).

For changes to `main.js` or `preload.js`, you need to restart the Electron app.
