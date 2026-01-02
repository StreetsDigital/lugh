/**
 * File Operations Tracker
 *
 * Tracks all file operations (read, write, edit, search) during an AI response
 * Provides visibility into what files the agent is touching
 *
 * Phone Vibecoding V1: See exactly what files your agent is working with
 */

import { basename } from 'path';
import { FileOperation, FileOperationsSummary } from '../types';

/**
 * Tools that read files
 */
const READ_TOOLS = ['Read', 'read_file'];

/**
 * Tools that write new files
 */
const WRITE_TOOLS = ['Write', 'write_file', 'create_file', 'create'];

/**
 * Tools that edit existing files
 */
const EDIT_TOOLS = ['Edit', 'str_replace_editor', 'MultiEdit'];

/**
 * Tools that search files/content
 */
const SEARCH_TOOLS = ['Glob', 'Grep', 'grep', 'find'];

/**
 * Tools that delete files
 */
export const DELETE_TOOLS = ['rm', 'delete_file'];

/**
 * Tracks file operations during an AI response
 */
export class FileOperationsTracker {
  private operations: FileOperation[] = [];

  /**
   * Record a tool call and extract any file operations
   */
  recordToolCall(toolName: string, toolInput?: Record<string, unknown>): FileOperation | null {
    if (!toolInput) return null;

    const operation = this.extractFileOperation(toolName, toolInput);
    if (operation) {
      this.operations.push(operation);
    }
    return operation;
  }

  /**
   * Extract file operation from a tool call
   */
  private extractFileOperation(
    toolName: string,
    toolInput: Record<string, unknown>
  ): FileOperation | null {
    const timestamp = new Date();

    // Read operations
    if (READ_TOOLS.includes(toolName)) {
      const path = this.extractPath(toolInput);
      if (path) {
        return { type: 'read', path, toolName, timestamp };
      }
    }

    // Write operations
    if (WRITE_TOOLS.includes(toolName)) {
      const path = this.extractPath(toolInput);
      if (path) {
        return { type: 'write', path, toolName, timestamp };
      }
    }

    // Edit operations
    if (EDIT_TOOLS.includes(toolName)) {
      const path = this.extractPath(toolInput);
      if (path) {
        const oldStr = (toolInput.old_string as string) || '';
        const editSummary =
          oldStr.length > 50
            ? oldStr.substring(0, 50).replace(/\n/g, ' ') + '...'
            : oldStr.replace(/\n/g, ' ');
        return { type: 'edit', path, toolName, timestamp, editSummary };
      }
    }

    // Search operations
    if (SEARCH_TOOLS.includes(toolName)) {
      const pattern = (toolInput.pattern as string) || '';
      const path = this.extractPath(toolInput);
      if (pattern) {
        return {
          type: 'search',
          path: path || '*',
          toolName,
          timestamp,
          searchPattern: pattern,
        };
      }
    }

    // Delete operations (via Bash)
    if (toolName === 'Bash') {
      const cmd = (toolInput.command as string) || '';
      if (/^(rm|del|unlink)\s/.exec(cmd)) {
        // Extract file path from rm command (simplified)
        const match = /^(?:rm|del|unlink)\s+(?:-[rf]+\s+)?(.+)/.exec(cmd);
        if (match) {
          return { type: 'delete', path: match[1].trim(), toolName, timestamp };
        }
      }
    }

    return null;
  }

  /**
   * Extract file path from tool input
   */
  private extractPath(toolInput: Record<string, unknown>): string | null {
    const path =
      (toolInput.file_path as string) ??
      (toolInput.path as string) ??
      (toolInput.filename as string);
    return path && typeof path === 'string' ? path : null;
  }

  /**
   * Get all recorded operations
   */
  getOperations(): FileOperation[] {
    return [...this.operations];
  }

  /**
   * Get summary of all file operations
   */
  getSummary(): FileOperationsSummary {
    const filesRead = new Set<string>();
    const filesWritten = new Set<string>();
    const filesEdited = new Set<string>();
    const searchesPerformed: { pattern: string; path?: string }[] = [];

    for (const op of this.operations) {
      switch (op.type) {
        case 'read':
          filesRead.add(op.path);
          break;
        case 'write':
          filesWritten.add(op.path);
          break;
        case 'edit':
          filesEdited.add(op.path);
          break;
        case 'search':
          if (op.searchPattern) {
            searchesPerformed.push({
              pattern: op.searchPattern,
              path: op.path !== '*' ? op.path : undefined,
            });
          }
          break;
      }
    }

    return {
      filesRead: [...filesRead],
      filesWritten: [...filesWritten],
      filesEdited: [...filesEdited],
      searchesPerformed,
      totalOperations: this.operations.length,
    };
  }

  /**
   * Check if any file operations were recorded
   */
  hasOperations(): boolean {
    return this.operations.length > 0;
  }

  /**
   * Clear all recorded operations
   */
  clear(): void {
    this.operations = [];
  }
}

/**
 * Format file operations summary for display
 *
 * @param summary - The operations summary to format
 * @param options - Formatting options
 * @returns Formatted summary string
 */
export function formatFileOperationsSummary(
  summary: FileOperationsSummary,
  options: { verbose?: boolean; maxFiles?: number } = {}
): string {
  const { verbose = false, maxFiles = 5 } = options;
  const parts: string[] = [];

  // Only show summary if there were file operations
  const hasFileOps =
    summary.filesRead.length > 0 ||
    summary.filesWritten.length > 0 ||
    summary.filesEdited.length > 0;

  if (!hasFileOps && summary.searchesPerformed.length === 0) {
    return '';
  }

  parts.push('📊 **File Operations Summary**');

  // Files written (most important - what changed)
  if (summary.filesWritten.length > 0) {
    const files = formatFileList(summary.filesWritten, maxFiles, verbose);
    parts.push(`✏️ Created: ${files}`);
  }

  // Files edited
  if (summary.filesEdited.length > 0) {
    const files = formatFileList(summary.filesEdited, maxFiles, verbose);
    parts.push(`🔧 Modified: ${files}`);
  }

  // Files read (less prominent)
  if (summary.filesRead.length > 0) {
    const files = formatFileList(summary.filesRead, maxFiles, verbose);
    parts.push(`📖 Read: ${files}`);
  }

  // Searches performed (optional, verbose only)
  if (verbose && summary.searchesPerformed.length > 0) {
    const searchCount = summary.searchesPerformed.length;
    parts.push(`🔍 Searches: ${searchCount} pattern${searchCount > 1 ? 's' : ''}`);
  }

  return parts.join('\n');
}

/**
 * Format a list of file paths for display
 */
function formatFileList(files: string[], maxFiles: number, verbose: boolean): string {
  const displayFiles = files.slice(0, maxFiles).map(f => {
    // Show just filename unless verbose
    return verbose ? f : basename(f);
  });

  const remaining = files.length - maxFiles;
  const list = displayFiles.join(', ');

  if (remaining > 0) {
    return `${list} +${remaining} more`;
  }
  return list;
}

/**
 * Get a brief one-line summary of file operations
 * Good for batch mode where we want minimal noise
 */
export function getBriefFileOperationsSummary(summary: FileOperationsSummary): string {
  const counts: string[] = [];

  const totalModified = summary.filesWritten.length + summary.filesEdited.length;
  if (totalModified > 0) {
    counts.push(`${totalModified} file${totalModified > 1 ? 's' : ''} modified`);
  }

  if (summary.filesRead.length > 0) {
    counts.push(`${summary.filesRead.length} read`);
  }

  if (counts.length === 0) {
    return '';
  }

  return `📁 ${counts.join(', ')}`;
}
