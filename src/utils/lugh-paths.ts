/**
 * Lugh path resolution utilities
 *
 * Directory structure:
 * ~/.lugh/              # User-level (LUGH_HOME)
 * ├── workspaces/         # Cloned repositories
 * ├── worktrees/          # Git worktrees
 * └── config.yaml         # Global config
 *
 * For Docker: /.lugh/
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Expand ~ to home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~')) {
    const pathAfterTilde = path.slice(1).replace(/^[/\\]/, '');
    return join(homedir(), pathAfterTilde);
  }
  return path;
}

/**
 * Detect if running in Docker container
 */
export function isDocker(): boolean {
  return (
    process.env.WORKSPACE_PATH === '/workspace' ||
    (process.env.HOME === '/root' && Boolean(process.env.WORKSPACE_PATH)) ||
    process.env.LUGH_DOCKER === 'true'
  );
}

/**
 * Get the Lugh home directory
 * - Docker: /.lugh
 * - Local: ~/.lugh (or LUGH_HOME env var)
 */
export function getLughHome(): string {
  if (isDocker()) {
    return '/.lugh';
  }

  const envHome = process.env.LUGH_HOME;
  if (envHome) {
    return expandTilde(envHome);
  }

  return join(homedir(), '.lugh');
}

/**
 * Get the workspaces directory (where repos are cloned)
 */
export function getLughWorkspacesPath(): string {
  return join(getLughHome(), 'workspaces');
}

/**
 * Get the worktrees directory (where git worktrees are created)
 */
export function getLughWorktreesPath(): string {
  return join(getLughHome(), 'worktrees');
}

/**
 * Get the global config file path
 */
export function getLughConfigPath(): string {
  return join(getLughHome(), 'config.yaml');
}

/**
 * Get command folder search paths for a repository
 * Returns folders in priority order (first match wins)
 */
export function getCommandFolderSearchPaths(): string[] {
  return ['.lugh/commands', '.claude/commands', '.agents/commands'];
}

/**
 * Get workflow folder search paths for a repository (future)
 */
export function getWorkflowFolderSearchPaths(): string[] {
  return ['.lugh/workflows', '.claude/workflows', '.agents/workflows'];
}

/**
 * Log the Lugh paths configuration (for startup)
 */
export function logLughPaths(): void {
  const home = getLughHome();
  const workspaces = getLughWorkspacesPath();
  const worktrees = getLughWorktreesPath();
  const config = getLughConfigPath();

  console.log('[Lugh] Paths configured:');
  console.log(`  Home: ${home}`);
  console.log(`  Workspaces: ${workspaces}`);
  console.log(`  Worktrees: ${worktrees}`);
  console.log(`  Config: ${config}`);
}
