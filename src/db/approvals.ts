/**
 * Database operations for tool execution approvals
 * Phone Vibecoding V1 - Telegram inline button approvals
 */
import { pool } from './connection';
import { Approval } from '../types';

/**
 * Create a new approval request
 */
export async function createApproval(data: {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  risk_level?: 'low' | 'medium' | 'high';
}): Promise<Approval> {
  const result = await pool.query<Approval>(
    `INSERT INTO remote_agent_approvals
     (session_id, tool_name, tool_input, risk_level)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.session_id, data.tool_name, JSON.stringify(data.tool_input), data.risk_level ?? 'high']
  );
  return result.rows[0];
}

/**
 * Get an approval by ID
 */
export async function getApproval(id: string): Promise<Approval | null> {
  const result = await pool.query<Approval>('SELECT * FROM remote_agent_approvals WHERE id = $1', [
    id,
  ]);
  return result.rows[0] || null;
}

/**
 * Update approval status (approve/reject)
 */
export async function updateApprovalStatus(
  id: string,
  status: 'approved' | 'rejected',
  respondedBy: string
): Promise<Approval | null> {
  const result = await pool.query<Approval>(
    `UPDATE remote_agent_approvals
     SET status = $1, responded_by = $2, responded_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [status, respondedBy, id]
  );
  return result.rows[0] || null;
}

/**
 * Get pending approvals for a session
 */
export async function getPendingApprovals(sessionId: string): Promise<Approval[]> {
  const result = await pool.query<Approval>(
    `SELECT * FROM remote_agent_approvals
     WHERE session_id = $1 AND status = 'pending' AND expires_at > NOW()
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}

/**
 * Mark expired approvals as timed out
 */
export async function expireApprovals(): Promise<number> {
  const result = await pool.query(
    `UPDATE remote_agent_approvals
     SET status = 'timeout'
     WHERE status = 'pending' AND expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}

/**
 * Poll for approval status change
 * Returns when status changes or timeout reached
 */
export async function waitForApproval(
  id: string,
  timeoutMs = 300000 // 5 minutes default
): Promise<'approved' | 'rejected' | 'timeout'> {
  const pollInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const approval = await getApproval(id);

    if (!approval) {
      return 'timeout';
    }

    if (approval.status === 'approved') {
      return 'approved';
    }

    if (approval.status === 'rejected') {
      return 'rejected';
    }

    if (approval.status === 'timeout' || new Date() > approval.expires_at) {
      return 'timeout';
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Mark as timed out in database
  await pool.query(
    "UPDATE remote_agent_approvals SET status = 'timeout' WHERE id = $1 AND status = 'pending'",
    [id]
  );

  return 'timeout';
}
