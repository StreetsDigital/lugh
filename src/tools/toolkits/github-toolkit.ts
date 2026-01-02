/**
 * GitHub Toolkit
 * ===============
 *
 * Tools for GitHub operations: issues, PRs, comments, reviews.
 * Uses GitHub CLI (gh) for operations.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { Toolkit } from '../toolkit';
import { FunctionTool } from '../function-tool';
import type { ToolResult } from '../types';

const execFileAsync = promisify(execFile);

/**
 * Execute a GitHub CLI command
 */
async function ghExec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('gh', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 1 minute
      env: {
        ...process.env,
        GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      },
    });
    return result;
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    throw new Error(err.stderr || err.message);
  }
}

/**
 * Parse JSON output from gh CLI
 */
function parseJSON<T>(output: string): T {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Failed to parse GitHub response: ${output.slice(0, 200)}`);
  }
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  body: string;
  url: string;
  author: { login: string };
  labels: Array<{ name: string }>;
  createdAt: string;
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  body: string;
  url: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  mergeable: string;
  createdAt: string;
}

/**
 * GitHubToolkit - Tools for GitHub operations
 */
export class GitHubToolkit extends Toolkit {
  readonly name = 'github';
  readonly description = 'GitHub operations: issues, PRs, reviews, comments';

  constructor() {
    super();
    this.initializeTools();
  }

  private initializeTools(): void {
    // Search Issues
    this.registerTool(
      new FunctionTool({
        name: 'searchIssues',
        description: 'Search GitHub issues',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            query: { type: 'string', description: 'Search query' },
            state: {
              type: 'string',
              enum: ['open', 'closed', 'all'],
              description: 'Issue state filter',
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by labels',
            },
            limit: { type: 'number', description: 'Maximum results (default: 10)' },
          },
          required: ['repo'],
        },
        execute: async (input: {
          repo: string;
          query?: string;
          state?: string;
          labels?: string[];
          limit?: number;
        }): Promise<ToolResult<{ issues: GitHubIssue[] }>> => {
          try {
            const args = [
              'issue',
              'list',
              '-R',
              input.repo,
              '--json',
              'number,title,state,body,url,author,labels,createdAt',
            ];

            if (input.state) args.push('--state', input.state);
            if (input.labels?.length) args.push('--label', input.labels.join(','));
            if (input.limit) args.push('--limit', input.limit.toString());
            if (input.query) args.push('--search', input.query);

            const { stdout } = await ghExec(args);
            const issues = parseJSON<GitHubIssue[]>(stdout);

            return { success: true, data: { issues } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['github', 'issues', 'search'],
      })
    );

    // Create Issue
    this.registerTool(
      new FunctionTool({
        name: 'createIssue',
        description: 'Create a new GitHub issue',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body (markdown)' },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to add',
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Users to assign',
            },
          },
          required: ['repo', 'title'],
        },
        execute: async (input: {
          repo: string;
          title: string;
          body?: string;
          labels?: string[];
          assignees?: string[];
        }): Promise<ToolResult<{ number: number; url: string }>> => {
          try {
            const args = ['issue', 'create', '-R', input.repo, '--title', input.title];

            if (input.body) args.push('--body', input.body);
            if (input.labels?.length) {
              for (const label of input.labels) {
                args.push('--label', label);
              }
            }
            if (input.assignees?.length) {
              for (const assignee of input.assignees) {
                args.push('--assignee', assignee);
              }
            }

            const { stdout } = await ghExec(args);
            // Extract issue number and URL from output
            const urlMatch = stdout.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
            const number = urlMatch ? parseInt(urlMatch[1], 10) : 0;
            const url = urlMatch ? urlMatch[0] : stdout.trim();

            return { success: true, data: { number, url } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['github', 'issues', 'create'],
      })
    );

    // Get Issue
    this.registerTool(
      new FunctionTool({
        name: 'getIssue',
        description: 'Get details of a GitHub issue',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'Issue number' },
          },
          required: ['repo', 'number'],
        },
        execute: async (input: {
          repo: string;
          number: number;
        }): Promise<ToolResult<{ issue: GitHubIssue }>> => {
          try {
            const args = [
              'issue',
              'view',
              input.number.toString(),
              '-R',
              input.repo,
              '--json',
              'number,title,state,body,url,author,labels,createdAt',
            ];

            const { stdout } = await ghExec(args);
            const issue = parseJSON<GitHubIssue>(stdout);

            return { success: true, data: { issue } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['github', 'issues'],
      })
    );

    // Comment on Issue/PR
    this.registerTool(
      new FunctionTool({
        name: 'comment',
        description: 'Add a comment to an issue or PR',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment body (markdown)' },
          },
          required: ['repo', 'number', 'body'],
        },
        execute: async (input: {
          repo: string;
          number: number;
          body: string;
        }): Promise<ToolResult<{ commented: boolean }>> => {
          try {
            await ghExec([
              'issue',
              'comment',
              input.number.toString(),
              '-R',
              input.repo,
              '--body',
              input.body,
            ]);

            return { success: true, data: { commented: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['github', 'issues', 'pr', 'comment'],
      })
    );

    // Create PR
    this.registerTool(
      new FunctionTool({
        name: 'createPR',
        description: 'Create a pull request',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory (git repo)' },
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR body (markdown)' },
            base: { type: 'string', description: 'Base branch (default: main)' },
            head: { type: 'string', description: 'Head branch (default: current)' },
            draft: { type: 'boolean', description: 'Create as draft' },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to add',
            },
          },
          required: ['cwd', 'title'],
        },
        execute: async (input: {
          cwd: string;
          title: string;
          body?: string;
          base?: string;
          head?: string;
          draft?: boolean;
          labels?: string[];
        }): Promise<ToolResult<{ number: number; url: string }>> => {
          try {
            const args = ['pr', 'create', '--title', input.title];

            if (input.body) args.push('--body', input.body);
            if (input.base) args.push('--base', input.base);
            if (input.head) args.push('--head', input.head);
            if (input.draft) args.push('--draft');
            if (input.labels?.length) {
              for (const label of input.labels) {
                args.push('--label', label);
              }
            }

            const { stdout } = await ghExec(args, input.cwd);
            const urlMatch = stdout.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
            const number = urlMatch ? parseInt(urlMatch[1], 10) : 0;
            const url = urlMatch ? urlMatch[0] : stdout.trim();

            return { success: true, data: { number, url } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'high',
        requiresApproval: true,
        tags: ['github', 'pr', 'create'],
      })
    );

    // List PRs
    this.registerTool(
      new FunctionTool({
        name: 'listPRs',
        description: 'List pull requests',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            state: {
              type: 'string',
              enum: ['open', 'closed', 'merged', 'all'],
              description: 'PR state filter',
            },
            author: { type: 'string', description: 'Filter by author' },
            limit: { type: 'number', description: 'Maximum results (default: 10)' },
          },
          required: ['repo'],
        },
        execute: async (input: {
          repo: string;
          state?: string;
          author?: string;
          limit?: number;
        }): Promise<ToolResult<{ prs: GitHubPR[] }>> => {
          try {
            const args = [
              'pr',
              'list',
              '-R',
              input.repo,
              '--json',
              'number,title,state,body,url,author,headRefName,baseRefName,mergeable,createdAt',
            ];

            if (input.state) args.push('--state', input.state);
            if (input.author) args.push('--author', input.author);
            if (input.limit) args.push('--limit', input.limit.toString());

            const { stdout } = await ghExec(args);
            const prs = parseJSON<GitHubPR[]>(stdout);

            return { success: true, data: { prs } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['github', 'pr', 'list'],
      })
    );

    // Get PR
    this.registerTool(
      new FunctionTool({
        name: 'getPR',
        description: 'Get details of a pull request',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'PR number' },
          },
          required: ['repo', 'number'],
        },
        execute: async (input: {
          repo: string;
          number: number;
        }): Promise<ToolResult<{ pr: GitHubPR }>> => {
          try {
            const args = [
              'pr',
              'view',
              input.number.toString(),
              '-R',
              input.repo,
              '--json',
              'number,title,state,body,url,author,headRefName,baseRefName,mergeable,createdAt',
            ];

            const { stdout } = await ghExec(args);
            const pr = parseJSON<GitHubPR>(stdout);

            return { success: true, data: { pr } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['github', 'pr'],
      })
    );

    // Get PR Diff
    this.registerTool(
      new FunctionTool({
        name: 'getPRDiff',
        description: 'Get the diff for a pull request',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'PR number' },
          },
          required: ['repo', 'number'],
        },
        execute: async (input: {
          repo: string;
          number: number;
        }): Promise<ToolResult<{ diff: string }>> => {
          try {
            const { stdout } = await ghExec([
              'pr',
              'diff',
              input.number.toString(),
              '-R',
              input.repo,
            ]);

            return { success: true, data: { diff: stdout } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'low',
        tags: ['github', 'pr', 'diff'],
      })
    );

    // Review PR
    this.registerTool(
      new FunctionTool({
        name: 'reviewPR',
        description: 'Submit a review on a pull request',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'PR number' },
            action: {
              type: 'string',
              enum: ['approve', 'request-changes', 'comment'],
              description: 'Review action',
            },
            body: { type: 'string', description: 'Review comment' },
          },
          required: ['repo', 'number', 'action'],
        },
        execute: async (input: {
          repo: string;
          number: number;
          action: 'approve' | 'request-changes' | 'comment';
          body?: string;
        }): Promise<ToolResult<{ reviewed: boolean }>> => {
          try {
            const args = ['pr', 'review', input.number.toString(), '-R', input.repo];

            switch (input.action) {
              case 'approve':
                args.push('--approve');
                break;
              case 'request-changes':
                args.push('--request-changes');
                break;
              case 'comment':
                args.push('--comment');
                break;
            }

            if (input.body) args.push('--body', input.body);

            await ghExec(args);
            return { success: true, data: { reviewed: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'high',
        requiresApproval: true,
        tags: ['github', 'pr', 'review'],
      })
    );

    // Merge PR
    this.registerTool(
      new FunctionTool({
        name: 'mergePR',
        description: 'Merge a pull request',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'PR number' },
            method: {
              type: 'string',
              enum: ['merge', 'squash', 'rebase'],
              description: 'Merge method',
            },
            deleteBranch: { type: 'boolean', description: 'Delete branch after merge' },
          },
          required: ['repo', 'number'],
        },
        execute: async (input: {
          repo: string;
          number: number;
          method?: 'merge' | 'squash' | 'rebase';
          deleteBranch?: boolean;
        }): Promise<ToolResult<{ merged: boolean }>> => {
          try {
            const args = ['pr', 'merge', input.number.toString(), '-R', input.repo];

            if (input.method === 'squash') args.push('--squash');
            else if (input.method === 'rebase') args.push('--rebase');
            else args.push('--merge');

            if (input.deleteBranch) args.push('--delete-branch');

            await ghExec(args);
            return { success: true, data: { merged: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'high',
        requiresApproval: true,
        tags: ['github', 'pr', 'merge'],
      })
    );

    // Close Issue/PR
    this.registerTool(
      new FunctionTool({
        name: 'close',
        description: 'Close an issue or PR',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository (owner/repo)' },
            number: { type: 'number', description: 'Issue or PR number' },
            type: {
              type: 'string',
              enum: ['issue', 'pr'],
              description: 'Type (issue or pr)',
            },
            comment: { type: 'string', description: 'Closing comment (optional)' },
          },
          required: ['repo', 'number', 'type'],
        },
        execute: async (input: {
          repo: string;
          number: number;
          type: 'issue' | 'pr';
          comment?: string;
        }): Promise<ToolResult<{ closed: boolean }>> => {
          try {
            const cmd = input.type === 'issue' ? 'issue' : 'pr';
            const args = [cmd, 'close', input.number.toString(), '-R', input.repo];

            if (input.comment) args.push('--comment', input.comment);

            await ghExec(args);
            return { success: true, data: { closed: true } };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        riskLevel: 'medium',
        tags: ['github', 'issues', 'pr', 'close'],
      })
    );
  }
}

/**
 * Create GitHubToolkit instance
 */
export function createGitHubToolkit(): GitHubToolkit {
  return new GitHubToolkit();
}
