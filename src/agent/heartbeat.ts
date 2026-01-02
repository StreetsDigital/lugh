/**
 * Agent Heartbeat
 * ================
 *
 * Sends periodic heartbeat messages to the orchestrator.
 * Allows orchestrator to detect dead agents.
 */

import os from 'os';
import { AGENT_CHANNELS, type RedisClient, type AgentHeartbeatMessage } from '../redis/client';

const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_INTERVAL_MS || '5000',
  10
);

type AgentStatus = 'idle' | 'busy' | 'stopping' | 'error';

type StatusGetter = () => {
    status: AgentStatus;
    currentTask?: {
      taskId: string;
      progress: number;
      currentStep: string;
    };
  };

/**
 * Heartbeat sender
 */
export class Heartbeat {
  private intervalId: Timer | null = null;
  private agentId: string;
  private redis: RedisClient;
  private getStatus: StatusGetter;

  constructor(agentId: string, redis: RedisClient, getStatus: StatusGetter) {
    this.agentId = agentId;
    this.redis = redis;
    this.getStatus = getStatus;
  }

  /**
   * Start sending heartbeats
   */
  start(): void {
    if (this.intervalId) return;

    console.log(
      `[Heartbeat] Starting for ${this.agentId} every ${HEARTBEAT_INTERVAL_MS}ms`
    );

    this.intervalId = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        console.error('[Heartbeat] Failed to send:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Send initial heartbeat immediately
    this.sendHeartbeat().catch((err) => {
      console.error('[Heartbeat] Failed to send initial:', err);
    });
  }

  /**
   * Stop sending heartbeats
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[Heartbeat] Stopped for ${this.agentId}`);
    }
  }

  /**
   * Send a heartbeat message
   */
  private async sendHeartbeat(): Promise<void> {
    const status = this.getStatus();

    const message: AgentHeartbeatMessage = {
      type: 'agent:heartbeat',
      agentId: this.agentId,
      status: status.status,
      currentTask: status.currentTask,
      resources: {
        memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuPercent: await this.getCpuPercent(),
      },
      timestamp: new Date().toISOString(),
    };

    await this.redis.publish(AGENT_CHANNELS.AGENT_HEARTBEAT, message);
  }

  /**
   * Get approximate CPU percentage
   */
  private async getCpuPercent(): Promise<number> {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idlePercent = (totalIdle / totalTick) * 100;
    return Math.round(100 - idlePercent);
  }
}
