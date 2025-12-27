/**
 * AgentCommander Desktop - Renderer Helpers
 * ==========================================
 *
 * Optional JavaScript that can be injected into the web UI
 * to add Electron-specific functionality.
 */

// Check if running in Electron
const isElectron = () => {
  return window.agentCommander?.isElectron === true;
};

// Server status indicator
class ServerStatusIndicator {
  constructor() {
    this.element = null;
    this.init();
  }

  init() {
    if (!isElectron()) return;

    // Create status indicator element
    this.element = document.createElement('div');
    this.element.id = 'electron-status';
    this.element.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 15px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 0.85rem;
      color: #8b949e;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    document.body.appendChild(this.element);
    this.updateStatus();

    // Listen for status changes
    window.agentCommander.onServerStatus((status) => {
      this.updateStatus(status);
    });
  }

  async updateStatus(status) {
    if (!this.element) return;

    if (!status) {
      status = await window.agentCommander.getServerStatus();
    }

    const dot = status.running
      ? '<span style="width: 8px; height: 8px; background: #238636; border-radius: 50%; display: inline-block;"></span>'
      : '<span style="width: 8px; height: 8px; background: #da3633; border-radius: 50%; display: inline-block;"></span>';

    this.element.innerHTML = `
      ${dot}
      <span>Server ${status.running ? 'Running' : 'Stopped'}</span>
      <span style="color: #484f58;">Port ${status.port}</span>
    `;
  }
}

// Server log console
class ServerLogConsole {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.visible = false;
    this.element = null;
    this.init();
  }

  init() {
    if (!isElectron()) return;

    // Create console element
    this.element = document.createElement('div');
    this.element.id = 'electron-console';
    this.element.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 20px;
      width: 500px;
      height: 300px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 11px;
      overflow: hidden;
      z-index: 9998;
      display: none;
      flex-direction: column;
    `;

    this.element.innerHTML = `
      <div style="padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8b949e; font-weight: 500;">Server Logs</span>
        <button id="close-console" style="background: none; border: none; color: #8b949e; cursor: pointer; font-size: 16px;">×</button>
      </div>
      <div id="log-content" style="flex: 1; overflow-y: auto; padding: 8px; color: #c9d1d9;"></div>
    `;

    document.body.appendChild(this.element);

    // Close button
    this.element.querySelector('#close-console').addEventListener('click', () => {
      this.hide();
    });

    // Listen for logs
    window.agentCommander.onServerLog((log) => {
      this.addLog(log);
    });

    // Toggle with keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' && e.metaKey) {
        this.toggle();
      }
    });
  }

  addLog(log) {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.visible) {
      this.render();
    }
  }

  render() {
    const content = this.element.querySelector('#log-content');
    if (!content) return;

    const html = this.logs.map((log) => {
      const color = log.type === 'stderr' ? '#f85149' : '#c9d1d9';
      const escaped = log.data
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div style="color: ${color}; white-space: pre-wrap; margin-bottom: 2px;">${escaped}</div>`;
    }).join('');

    content.innerHTML = html;
    content.scrollTop = content.scrollHeight;
  }

  show() {
    this.visible = true;
    this.element.style.display = 'flex';
    this.render();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  toggle() {
    this.visible ? this.hide() : this.show();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (isElectron()) {
    console.log('[Electron] Renderer helpers loaded');
    new ServerStatusIndicator();
    new ServerLogConsole();

    // Add Electron badge to title
    const title = document.querySelector('h1');
    if (title) {
      const badge = document.createElement('span');
      badge.style.cssText = `
        font-size: 0.6em;
        background: #30363d;
        color: #8b949e;
        padding: 2px 8px;
        border-radius: 10px;
        margin-left: 10px;
        vertical-align: middle;
      `;
      badge.textContent = 'Desktop';
      title.appendChild(badge);
    }
  }
});
