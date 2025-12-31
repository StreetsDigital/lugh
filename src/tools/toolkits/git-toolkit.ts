/**
 * Git Toolkit
 * ============
 *
 * Tools for git operations: clone, commit, push, branch management.
 * Uses execFileAsync for security (no shell injection).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { Toolkit } from '../toolkit';
import { FunctionTool } from '../function-tool';
import type { ToolResult } from '../types';

const execFileAsync = promisify(execFile);

/**
 * Execute a git command safely
 */
async function gitExec(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 1 minute
    });
    return result;
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    throw new Error(err.stderr || err.message);
  }
}

/**
 * GitToolkit - Tools for git operations
 */
export class GitToolkit extends Toolkit {
  readonly name = 'git';
  readonly description = 'Git version control operations';

  constructor() {
    super();
    this.initializeTools();
  }

  private initializeTools(): void {
    // Clone repository
    this.registerTool(
      new FunctionTool({
        name: 'clone',
        description: 'Clone a git repository',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Repository URL to clone' },
            directory: { type: 'string', description: 'Target directory (optional)' },
            branch: { type: 'string', description: 'Branch to clone (optional)' },
            depth: { type: 'number', description: 'Shallow clone depth (optional)' },
          },
          required: ['url'],
        },
        execute: async (input: {
          url: string;
          directory?: string;
          branch?: string;
          depth?: number;
        }): Promise<ToolResult<{ path: string }>> => {
          const args = ['clone'];

          if (input.branch) {
            args.push('--branch', input.branch);
          }
          if (input.depth) {
            args.push('--depth', input.depth.toString());
          }

          args.push(input.url);

          if (input.directory) {
            args.push(input.directory);
          }

          try {
            await gitExec(args);
            const clonedPath = input.directory || input.url.split('/').pop()?.replace('.git', '') || 'repo';
            return { success: true, data: { path: clonedPath } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['git', 'vcs'],
      })
    );

    // Git status
    this.registerTool(
      new FunctionTool({
        name: 'status',
        description: 'Get git repository status',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            short: { type: 'boolean', description: 'Short format output' },
          },
          required: ['cwd'],
        },
        execute: async (input: {
          cwd: string;
          short?: boolean;
        }): Promise<ToolResult<{ status: string; clean: boolean }>> => {
          try {
            const args = ['status'];
            if (input.short) args.push('--short');

            const { stdout } = await gitExec(args, input.cwd);
            const clean = stdout.includes('nothing to commit') ||
                          (input.short && stdout.trim() === '');

            return { success: true, data: { status: stdout, clean } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['git', 'vcs', 'status'],
      })
    );

    // Git add
    this.registerTool(
      new FunctionTool({
        name: 'add',
        description: 'Stage files for commit',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to stage (use ["."] for all)',
            },
          },
          required: ['cwd', 'files'],
        },
        execute: async (input: {
          cwd: string;
          files: string[];
        }): Promise<ToolResult<{ staged: string[] }>> => {
          try {
            await gitExec(['add', ...input.files], input.cwd);
            return { success: true, data: { staged: input.files } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['git', 'vcs'],
      })
    );

    // Git commit
    this.registerTool(
      new FunctionTool({
        name: 'commit',
        description: 'Create a commit with staged changes',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            message: { type: 'string', description: 'Commit message' },
            all: { type: 'boolean', description: 'Stage all modified files (-a)' },
          },
          required: ['cwd', 'message'],
        },
        execute: async (input: {
          cwd: string;
          message: string;
          all?: boolean;
        }): Promise<ToolResult<{ hash: string; message: string }>> => {
          try {
            const args = ['commit', '-m', input.message];
            if (input.all) args.splice(1, 0, '-a');

            const { stdout } = await gitExec(args, input.cwd);

            // Extract commit hash from output
            const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
            const hash = hashMatch ? hashMatch[1] : 'unknown';

            return { success: true, data: { hash, message: input.message } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['git', 'vcs'],
      })
    );

    // Git push
    this.registerTool(
      new FunctionTool({
        name: 'push',
        description: 'Push commits to remote repository',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            remote: { type: 'string', description: 'Remote name (default: origin)' },
            branch: { type: 'string', description: 'Branch to push' },
            setUpstream: { type: 'boolean', description: 'Set upstream (-u)' },
            force: { type: 'boolean', description: 'Force push (use with caution)' },
          },
          required: ['cwd'],
        },
        execute: async (input: {
          cwd: string;
          remote?: string;
          branch?: string;
          setUpstream?: boolean;
          force?: boolean;
        }): Promise<ToolResult<{ pushed: boolean }>> => {
          try {
            const args = ['push'];

            if (input.setUpstream) args.push('-u');
            if (input.force) args.push('--force-with-lease'); // Safer than --force

            if (input.remote) args.push(input.remote);
            if (input.branch) args.push(input.branch);

            await gitExec(args, input.cwd);
            return { success: true, data: { pushed: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'high',
        requiresApproval: true,
        tags: ['git', 'vcs'],
      })
    );

    // Git pull
    this.registerTool(
      new FunctionTool({
        name: 'pull',
        description: 'Pull changes from remote repository',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            remote: { type: 'string', description: 'Remote name (default: origin)' },
            branch: { type: 'string', description: 'Branch to pull' },
            rebase: { type: 'boolean', description: 'Rebase instead of merge' },
          },
          required: ['cwd'],
        },
        execute: async (input: {
          cwd: string;
          remote?: string;
          branch?: string;
          rebase?: boolean;
        }): Promise<ToolResult<{ pulled: boolean }>> => {
          try {
            const args = ['pull'];
            if (input.rebase) args.push('--rebase');
            if (input.remote) args.push(input.remote);
            if (input.branch) args.push(input.branch);

            await gitExec(args, input.cwd);
            return { success: true, data: { pulled: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['git', 'vcs'],
      })
    );

    // Git branch operations
    this.registerTool(
      new FunctionTool({
        name: 'branch',
        description: 'Branch operations: list, create, delete, switch',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            action: {
              type: 'string',
              enum: ['list', 'create', 'delete', 'switch'],
              description: 'Branch action',
            },
            name: { type: 'string', description: 'Branch name (for create/delete/switch)' },
            startPoint: { type: 'string', description: 'Starting point for new branch' },
          },
          required: ['cwd', 'action'],
        },
        execute: async (input: {
          cwd: string;
          action: 'list' | 'create' | 'delete' | 'switch';
          name?: string;
          startPoint?: string;
        }): Promise<ToolResult<{ branches?: string[]; current?: string; created?: string; deleted?: string; switched?: string }>> => {
          try {
            switch (input.action) {
              case 'list': {
                const { stdout } = await gitExec(['branch', '-a'], input.cwd);
                const branches = stdout
                  .split('\n')
                  .map((b) => b.trim())
                  .filter((b) => b);
                const current = branches.find((b) => b.startsWith('*'))?.slice(2);
                return { success: true, data: { branches, current } };
              }

              case 'create': {
                if (!input.name) {
                  return { success: false, error: 'Branch name required' };
                }
                const args = ['branch', input.name];
                if (input.startPoint) args.push(input.startPoint);
                await gitExec(args, input.cwd);
                return { success: true, data: { created: input.name } };
              }

              case 'delete': {
                if (!input.name) {
                  return { success: false, error: 'Branch name required' };
                }
                await gitExec(['branch', '-d', input.name], input.cwd);
                return { success: true, data: { deleted: input.name } };
              }

              case 'switch': {
                if (!input.name) {
                  return { success: false, error: 'Branch name required' };
                }
                await gitExec(['checkout', input.name], input.cwd);
                return { success: true, data: { switched: input.name } };
              }

              default:
                return { success: false, error: `Unknown action: ${input.action}` };
            }
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['git', 'vcs', 'branch'],
      })
    );

    // Git log
    this.registerTool(
      new FunctionTool({
        name: 'log',
        description: 'View commit history',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            count: { type: 'number', description: 'Number of commits to show' },
            oneline: { type: 'boolean', description: 'One line per commit' },
            branch: { type: 'string', description: 'Branch to show log for' },
          },
          required: ['cwd'],
        },
        execute: async (input: {
          cwd: string;
          count?: number;
          oneline?: boolean;
          branch?: string;
        }): Promise<ToolResult<{ log: string }>> => {
          try {
            const args = ['log'];
            if (input.count) args.push(`-n`, input.count.toString());
            if (input.oneline) args.push('--oneline');
            if (input.branch) args.push(input.branch);

            const { stdout } = await gitExec(args, input.cwd);
            return { success: true, data: { log: stdout } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['git', 'vcs', 'history'],
      })
    );

    // Git diff
    this.registerTool(
      new FunctionTool({
        name: 'diff',
        description: 'Show changes between commits, commit and working tree, etc.',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            staged: { type: 'boolean', description: 'Show staged changes' },
            file: { type: 'string', description: 'Specific file to diff' },
            commit: { type: 'string', description: 'Commit to diff against' },
          },
          required: ['cwd'],
        },
        execute: async (input: {
          cwd: string;
          staged?: boolean;
          file?: string;
          commit?: string;
        }): Promise<ToolResult<{ diff: string; hasChanges: boolean }>> => {
          try {
            const args = ['diff'];
            if (input.staged) args.push('--staged');
            if (input.commit) args.push(input.commit);
            if (input.file) args.push('--', input.file);

            const { stdout } = await gitExec(args, input.cwd);
            return {
              success: true,
              data: { diff: stdout, hasChanges: stdout.trim().length > 0 },
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['git', 'vcs', 'diff'],
      })
    );

    // Git stash
    this.registerTool(
      new FunctionTool({
        name: 'stash',
        description: 'Stash operations: save, list, pop, apply',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            action: {
              type: 'string',
              enum: ['save', 'list', 'pop', 'apply', 'drop'],
              description: 'Stash action',
            },
            message: { type: 'string', description: 'Stash message (for save)' },
            index: { type: 'number', description: 'Stash index (for pop/apply/drop)' },
          },
          required: ['cwd', 'action'],
        },
        execute: async (input: {
          cwd: string;
          action: 'save' | 'list' | 'pop' | 'apply' | 'drop';
          message?: string;
          index?: number;
        }): Promise<ToolResult<{ stashes?: string[]; saved?: boolean; applied?: boolean; dropped?: boolean }>> => {
          try {
            const stashRef = input.index !== undefined ? `stash@{${input.index}}` : undefined;

            switch (input.action) {
              case 'save': {
                const args = ['stash', 'push'];
                if (input.message) args.push('-m', input.message);
                await gitExec(args, input.cwd);
                return { success: true, data: { saved: true } };
              }

              case 'list': {
                const { stdout } = await gitExec(['stash', 'list'], input.cwd);
                const stashes = stdout.split('\n').filter((s) => s.trim());
                return { success: true, data: { stashes } };
              }

              case 'pop': {
                const args = ['stash', 'pop'];
                if (stashRef) args.push(stashRef);
                await gitExec(args, input.cwd);
                return { success: true, data: { applied: true } };
              }

              case 'apply': {
                const args = ['stash', 'apply'];
                if (stashRef) args.push(stashRef);
                await gitExec(args, input.cwd);
                return { success: true, data: { applied: true } };
              }

              case 'drop': {
                const args = ['stash', 'drop'];
                if (stashRef) args.push(stashRef);
                await gitExec(args, input.cwd);
                return { success: true, data: { dropped: true } };
              }

              default:
                return { success: false, error: `Unknown action: ${input.action}` };
            }
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['git', 'vcs', 'stash'],
      })
    );
  }
}

/**
 * Create GitToolkit instance
 */
export function createGitToolkit(): GitToolkit {
  return new GitToolkit();
}
