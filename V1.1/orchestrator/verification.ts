/**
 * Verification Engine
 * ===================
 *
 * Verifies agent claims EXTERNALLY. Does not trust agent self-reports.
 *
 * Checks:
 * - Did commits actually happen? (git log)
 * - Did files actually change? (git diff)
 * - Do tests pass? (npm test, pytest, etc.)
 * - Does code compile? (tsc, go build, etc.)
 */

import { $ } from 'bun';
import type { TaskResultMessage } from '../redis/client';

/**
 * Verification check result
 */
interface VerificationCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

/**
 * Overall verification result
 */
export interface VerificationResult {
  success: boolean;
  checks: VerificationCheck[];
  timestamp: Date;
  durationMs: number;
}

/**
 * Verification options
 */
interface VerifyOptions {
  workingDirectory: string;
  commitsBefore: number;
  expectedFiles?: string[];
  runTests?: boolean;
  testCommand?: string;
  runTypeCheck?: boolean;
  typeCheckCommand?: string;
}

/**
 * Verification Engine
 */
export class VerificationEngine {
  /**
   * Verify agent claims
   */
  async verify(
    agentResult: TaskResultMessage,
    options: VerifyOptions
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const checks: VerificationCheck[] = [];

    // 1. Verify commits
    if (agentResult.claims.commitsCreated > 0) {
      const commitCheck = await this.verifyCommits(
        options.workingDirectory,
        options.commitsBefore,
        agentResult.claims.commitsCreated
      );
      checks.push(commitCheck);
    }

    // 2. Verify file modifications
    if (agentResult.claims.filesModified.length > 0) {
      const fileCheck = await this.verifyFileChanges(
        options.workingDirectory,
        agentResult.claims.filesModified
      );
      checks.push(fileCheck);
    }

    // 3. Verify tests (if requested)
    if (options.runTests) {
      const testCheck = await this.verifyTests(
        options.workingDirectory,
        options.testCommand
      );
      checks.push(testCheck);
    }

    // 4. Verify type check (if requested)
    if (options.runTypeCheck) {
      const typeCheck = await this.verifyTypeCheck(
        options.workingDirectory,
        options.typeCheckCommand
      );
      checks.push(typeCheck);
    }

    const durationMs = Date.now() - startTime;

    return {
      success: checks.every((c) => c.passed),
      checks,
      timestamp: new Date(),
      durationMs,
    };
  }

  /**
   * Verify commits were created
   */
  private async verifyCommits(
    cwd: string,
    commitsBefore: number,
    claimedNew: number
  ): Promise<VerificationCheck> {
    try {
      const result = await $`git -C ${cwd} rev-list --count HEAD`.text();
      const commitsNow = parseInt(result.trim(), 10);
      const actualNew = commitsNow - commitsBefore;

      return {
        name: 'commits_created',
        passed: actualNew >= claimedNew,
        expected: `>= ${claimedNew} new commits`,
        actual: `${actualNew} new commits`,
        details:
          actualNew < claimedNew
            ? `Agent claimed ${claimedNew} commits but only ${actualNew} found`
            : undefined,
      };
    } catch (error) {
      return {
        name: 'commits_created',
        passed: false,
        expected: `>= ${claimedNew} new commits`,
        actual: 'Failed to check git',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verify files were modified
   */
  private async verifyFileChanges(
    cwd: string,
    claimedFiles: string[]
  ): Promise<VerificationCheck> {
    try {
      // Get actual changed files
      const result = await $`git -C ${cwd} diff --name-only HEAD~1 HEAD`.text();
      const actualFiles = result
        .trim()
        .split('\n')
        .filter((f) => f);

      // Check if claimed files are in actual files
      const foundFiles = claimedFiles.filter((f) =>
        actualFiles.some((a) => a.endsWith(f) || f.endsWith(a))
      );

      const allFound = foundFiles.length === claimedFiles.length;

      return {
        name: 'files_modified',
        passed: allFound,
        expected: `Files: ${claimedFiles.join(', ')}`,
        actual: `Found: ${foundFiles.join(', ')}`,
        details: allFound
          ? undefined
          : `Missing: ${claimedFiles.filter((f) => !foundFiles.includes(f)).join(', ')}`,
      };
    } catch (error) {
      return {
        name: 'files_modified',
        passed: false,
        expected: `Files: ${claimedFiles.join(', ')}`,
        actual: 'Failed to check git diff',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verify tests pass
   */
  private async verifyTests(
    cwd: string,
    command?: string
  ): Promise<VerificationCheck> {
    // Detect test command if not provided
    const testCommand = command || (await this.detectTestCommand(cwd));

    if (!testCommand) {
      return {
        name: 'tests_pass',
        passed: true, // Skip if no tests found
        expected: 'Tests pass',
        actual: 'No test command detected',
      };
    }

    try {
      const [cmd, ...args] = testCommand.split(' ');
      const proc = Bun.spawn([cmd, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();

      return {
        name: 'tests_pass',
        passed: exitCode === 0,
        expected: 'Exit code 0',
        actual: `Exit code ${exitCode}`,
        details: exitCode !== 0 ? stdout.slice(-500) : undefined,
      };
    } catch (error) {
      return {
        name: 'tests_pass',
        passed: false,
        expected: 'Tests pass',
        actual: 'Failed to run tests',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verify type check passes
   */
  private async verifyTypeCheck(
    cwd: string,
    command?: string
  ): Promise<VerificationCheck> {
    // Detect type check command if not provided
    const typeCommand = command || (await this.detectTypeCheckCommand(cwd));

    if (!typeCommand) {
      return {
        name: 'types_valid',
        passed: true, // Skip if no type check found
        expected: 'Types valid',
        actual: 'No type check command detected',
      };
    }

    try {
      const [cmd, ...args] = typeCommand.split(' ');
      const proc = Bun.spawn([cmd, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();

      return {
        name: 'types_valid',
        passed: exitCode === 0,
        expected: 'Exit code 0',
        actual: `Exit code ${exitCode}`,
        details: exitCode !== 0 ? stderr.slice(-500) : undefined,
      };
    } catch (error) {
      return {
        name: 'types_valid',
        passed: false,
        expected: 'Types valid',
        actual: 'Failed to run type check',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Detect test command from project
   */
  private async detectTestCommand(cwd: string): Promise<string | null> {
    try {
      // Check package.json
      const pkg = await Bun.file(`${cwd}/package.json`).json();
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "no test"') {
        return 'npm test';
      }

      // Check for pytest
      const pyprojectExists = await Bun.file(`${cwd}/pyproject.toml`).exists();
      if (pyprojectExists) {
        return 'pytest';
      }

      // Check for go
      const goModExists = await Bun.file(`${cwd}/go.mod`).exists();
      if (goModExists) {
        return 'go test ./...';
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  /**
   * Detect type check command from project
   */
  private async detectTypeCheckCommand(cwd: string): Promise<string | null> {
    try {
      // Check for TypeScript
      const tsconfigExists = await Bun.file(`${cwd}/tsconfig.json`).exists();
      if (tsconfigExists) {
        return 'npx tsc --noEmit';
      }

      // Check for Python with mypy
      const mypyExists = await Bun.file(`${cwd}/mypy.ini`).exists();
      const pyprojExists = await Bun.file(`${cwd}/pyproject.toml`).exists();
      if (mypyExists || pyprojExists) {
        return 'mypy .';
      }

      // Check for Go (compile check)
      const goModExists = await Bun.file(`${cwd}/go.mod`).exists();
      if (goModExists) {
        return 'go build ./...';
      }
    } catch {
      // Ignore errors
    }

    return null;
  }
}

// Singleton
let verificationEngine: VerificationEngine | null = null;

export function getVerificationEngine(): VerificationEngine {
  if (!verificationEngine) {
    verificationEngine = new VerificationEngine();
  }
  return verificationEngine;
}
