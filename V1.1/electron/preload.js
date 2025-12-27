/**
 * AgentCommander Desktop - Preload Script
 * ========================================
 *
 * Secure bridge between the renderer (web UI) and main process.
 * Exposes safe APIs to the renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer
contextBridge.exposeInMainWorld('agentCommander', {
  // Server management
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', { key, value }),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Event listeners
  onServerLog: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },

  onServerStatus: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('server-status', handler);
    return () => ipcRenderer.removeListener('server-status', handler);
  },

  // Platform info
  platform: process.platform,
  version: process.versions.electron,

  // App identification
  isElectron: true,
});

// Log when preload script has finished
console.log('[Preload] AgentCommander APIs exposed to renderer');
