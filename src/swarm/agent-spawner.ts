/**
 * Dynamic Agent Spawner
 * =====================
 *
 * Dynamically spawns Claude instances for specialized tasks.
 * Can spawn either Claude Code (with tools) or Claude API (without tools).
 */

import { v4 as uuidv4 } from 'uuid';
import type { SubTask, SpawnedAgent, AgentResult, Artifact } from './types';
import { getRoleConfig } from './role-configs';
import {
  LLMProvider,
  llmProviderFactory,
  type LLMProviderType,
  type LLMProviderConfig,
} from '../llm/providers';
import { isEnabled } from '../config/features';

/**
 * Agent execution handle for tracking and control
 */
interface AgentHandle {
  agent: SpawnedAgent;
  abortController: AbortController;
  promise: Promise<AgentResult>;
}

/**
 * DynamicAgentSpawner class
 * Spawns and manages Claude instances for parallel task execution
 */
export class DynamicAgentSpawner {
  private apiKey: string;
  private activeAgents: Map<string, AgentHandle> = new Map();
  private onProgress?: (agentId: string, progress: number, step: string) => void;
  private defaultProvider: LLMProviderType = 'claude';
  private providerOverrides: Map<string, LLMProviderType> = new Map();

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Set the default LLM provider for all agents
   */
  setDefaultProvider(provider: LLMProviderType): void {
    this.defaultProvider = provider;
  }

  /**
   * Override provider for a specific role
   */
  setRoleProvider(role: string, provider: LLMProviderType): void {
    this.providerOverrides.set(role, provider);
  }

  /**
   * Register a custom provider configuration
   */
  registerCustomProvider(configId: string, config: LLMProviderConfig): void {
    llmProviderFactory.registerCustomConfig(configId, config);
  }

  /**
   * Get the provider for a specific role
   */
  private getProviderForRole(role: string): LLMProvider {
    const providerType = this.providerOverrides.get(role) || this.defaultProvider;
    return llmProviderFactory.getProvider(providerType);
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (agentId: string, progress: number, step: string) => void): void {
    this.onProgress = callback;
  }

  /**
   * Spawn an agent for a sub-task
   */
  async spawn(subTask: SubTask, swarmId: string): Promise<AgentHandle> {
    const roleConfig = getRoleConfig(subTask.role);
    const agentId = `agent-${uuidv4().substring(0, 8)}`;

    const agent: SpawnedAgent = {
      id: agentId,
      swarmId,
      subTaskId: subTask.id,
      role: subTask.role,
      status: 'spawning',
      provider: subTask.requiredTools ? 'claude-code' : roleConfig.preferredProvider,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      progress: 0,
      currentStep: 'Initializing...',
    };

    console.log(`[AgentSpawner] Spawning agent ${agentId} for role: ${subTask.role}`);

    const abortController = new AbortController();

    // Create promise for agent execution
    const promise = this.executeAgent(agent, subTask, roleConfig, abortController.signal);

    const handle: AgentHandle = {
      agent,
      abortController,
      promise,
    };

    this.activeAgents.set(agentId, handle);

    return handle;
  }

  /**
   * Execute agent with the given task
   */
  private async executeAgent(
    agent: SpawnedAgent,
    subTask: SubTask,
    roleConfig: (typeof import('./role-configs').ROLE_CONFIGS)[keyof typeof import('./role-configs').ROLE_CONFIGS],
    signal: AbortSignal
  ): Promise<AgentResult> {
    agent.status = 'running';
    agent.startedAt = new Date();
    this.updateProgress(agent.id, 10, 'Starting analysis...');

    const startTime = Date.now();

    try {
      // Check for abort
      if (signal.aborted) {
        throw new Error('Agent execution aborted');
      }

      // Choose execution method based on whether tools are needed
      let response: string;
      let tokensUsed = 0;

      if (subTask.requiredTools) {
        // Use Claude Code SDK for tool-based execution
        const result = await this.executeWithClaudeCode(subTask, roleConfig, signal);
        response = result.response;
        tokensUsed = result.tokensUsed;
      } else {
        // Use Claude API directly for analysis tasks
        const result = await this.executeWithClaudeAPI(subTask, roleConfig, signal);
        response = result.response;
        tokensUsed = result.tokensUsed;
      }

      this.updateProgress(agent.id, 80, 'Processing results...');

      // Parse the response into structured result
      const parsedResult = this.parseAgentResponse(response, subTask);

      const result: AgentResult = {
        subTaskId: subTask.id,
        role: subTask.role,
        summary: parsedResult.summary,
        details: parsedResult.details,
        artifacts: parsedResult.artifacts,
        recommendations: parsedResult.recommendations,
        nextSteps: parsedResult.nextSteps,
        confidence: parsedResult.confidence,
        tokensUsed,
        duration: Date.now() - startTime,
      };

      agent.status = 'completed';
      agent.completedAt = new Date();
      agent.result = result;
      this.updateProgress(agent.id, 100, 'Completed');

      console.log(`[AgentSpawner] Agent ${agent.id} completed in ${result.duration}ms`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      agent.status = 'failed';
      agent.completedAt = new Date();
      agent.error = errorMessage;
      this.updateProgress(agent.id, 0, `Failed: ${errorMessage}`);

      console.error(`[AgentSpawner] Agent ${agent.id} failed:`, errorMessage);

      // Return a minimal result on failure
      return {
        subTaskId: subTask.id,
        role: subTask.role,
        summary: `Task failed: ${errorMessage}`,
        details: '',
        artifacts: [],
        recommendations: [],
        nextSteps: ['Retry the task', 'Check error logs'],
        confidence: 0,
        tokensUsed: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute using flexible LLM provider (supports Claude, OpenAI, Grok, Ollama, etc.)
   */
  private async executeWithLLMProvider(
    subTask: SubTask,
    roleConfig: (typeof import('./role-configs').ROLE_CONFIGS)[keyof typeof import('./role-configs').ROLE_CONFIGS],
    _signal: AbortSignal
  ): Promise<{ response: string; tokensUsed: number }> {
    const provider = this.getProviderForRole(subTask.role);
    const providerConfig = provider.getConfig();

    this.updateProgress(subTask.id, 20, `Calling ${providerConfig.type} API...`);

    try {
      const result = await provider.chat(
        [{ role: 'user', content: subTask.prompt }],
        roleConfig.systemPrompt
      );

      this.updateProgress(subTask.id, 60, 'Received response...');

      return {
        response: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      console.error(`[AgentSpawner] ${providerConfig.type} API error:`, error);
      throw error;
    }
  }

  /**
   * Execute using Claude API (legacy method for backwards compatibility)
   */
  private async executeWithClaudeAPI(
    subTask: SubTask,
    roleConfig: (typeof import('./role-configs').ROLE_CONFIGS)[keyof typeof import('./role-configs').ROLE_CONFIGS],
    signal: AbortSignal
  ): Promise<{ response: string; tokensUsed: number }> {
    // Use the new provider system
    return this.executeWithLLMProvider(subTask, roleConfig, signal);
  }

  /**
   * Execute using Claude Code SDK (for implementation tasks with tools)
   */
  private async executeWithClaudeCode(
    subTask: SubTask,
    roleConfig: (typeof import('./role-configs').ROLE_CONFIGS)[keyof typeof import('./role-configs').ROLE_CONFIGS],
    _signal: AbortSignal
  ): Promise<{ response: string; tokensUsed: number }> {
    this.updateProgress(subTask.id, 20, 'Starting Claude Code...');

    // For Claude Code, we use the CLI or SDK
    // This is a simplified version - in production, you'd use the full SDK
    const fullPrompt = `${roleConfig.systemPrompt}\n\n${subTask.prompt}`;

    try {
      // Try to use claude CLI if available
      const process = Bun.spawn(['claude', '--print', '-p', fullPrompt], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...Bun.env,
          ANTHROPIC_API_KEY: this.apiKey,
        },
      });

      const stdout = await new Response(process.stdout).text();
      const exitCode = await process.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(process.stderr).text();
        throw new Error(`Claude Code exited with code ${exitCode}: ${stderr}`);
      }

      this.updateProgress(subTask.id, 60, 'Claude Code completed...');

      return {
        response: stdout,
        tokensUsed: 0, // CLI doesn't report tokens
      };
    } catch (error) {
      // Fallback to API if CLI not available
      console.log('[AgentSpawner] Claude CLI not available, falling back to API');
      return this.executeWithClaudeAPI(subTask, roleConfig, _signal);
    }
  }

  /**
   * Parse agent response into structured result
   */
  private parseAgentResponse(
    response: string,
    subTask: SubTask
  ): {
    summary: string;
    details: string;
    artifacts: Artifact[];
    recommendations: string[];
    nextSteps: string[];
    confidence: number;
  } {
    // Extract summary (first paragraph or first few sentences)
    const paragraphs = response.split('\n\n').filter(p => p.trim());
    const summary = paragraphs[0]?.substring(0, 500) || 'Analysis completed';

    // Extract code blocks as artifacts
    const artifacts: Artifact[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      const format = match[1] || 'text';
      const content = match[2];
      artifacts.push({
        type: format === 'mermaid' ? 'diagram' : 'code',
        name: `${subTask.role}-${artifacts.length + 1}`,
        content,
        format,
      });
    }

    // Extract recommendations (lines starting with "- " or numbered items after "Recommendations" header)
    const recommendations: string[] = [];
    const recommendationsMatch = response.match(
      /(?:recommendations?|suggest(?:ion)?s?)[:\s]*\n((?:[-*\d.]\s*.+\n?)+)/i
    );
    if (recommendationsMatch) {
      const items = recommendationsMatch[1].match(/[-*\d.]\s*(.+)/g);
      if (items) {
        recommendations.push(...items.map(item => item.replace(/^[-*\d.]\s*/, '').trim()));
      }
    }

    // Extract next steps
    const nextSteps: string[] = [];
    const nextStepsMatch = response.match(
      /(?:next\s*steps?|action\s*items?)[:\s]*\n((?:[-*\d.]\s*.+\n?)+)/i
    );
    if (nextStepsMatch) {
      const items = nextStepsMatch[1].match(/[-*\d.]\s*(.+)/g);
      if (items) {
        nextSteps.push(...items.map(item => item.replace(/^[-*\d.]\s*/, '').trim()));
      }
    }

    // Estimate confidence based on response quality
    let confidence = 0.7; // Base confidence
    if (response.length > 2000) confidence += 0.1;
    if (artifacts.length > 0) confidence += 0.1;
    if (recommendations.length > 2) confidence += 0.05;
    if (nextSteps.length > 0) confidence += 0.05;
    confidence = Math.min(confidence, 0.95);

    return {
      summary,
      details: response,
      artifacts,
      recommendations: recommendations.slice(0, 10),
      nextSteps: nextSteps.slice(0, 5),
      confidence,
    };
  }

  /**
   * Update agent progress
   */
  private updateProgress(agentId: string, progress: number, step: string): void {
    const handle = this.activeAgents.get(agentId);
    if (handle) {
      handle.agent.progress = progress;
      handle.agent.currentStep = step;
    }

    if (this.onProgress) {
      this.onProgress(agentId, progress, step);
    }
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): SpawnedAgent | undefined {
    return this.activeAgents.get(agentId)?.agent;
  }

  /**
   * Abort an agent
   */
  abortAgent(agentId: string): boolean {
    const handle = this.activeAgents.get(agentId);
    if (handle && handle.agent.status === 'running') {
      handle.abortController.abort();
      handle.agent.status = 'cancelled';
      return true;
    }
    return false;
  }

  /**
   * Abort all agents
   */
  abortAll(): void {
    for (const [agentId] of this.activeAgents) {
      this.abortAgent(agentId);
    }
  }

  /**
   * Wait for agent to complete
   */
  async waitForAgent(agentId: string): Promise<AgentResult | undefined> {
    const handle = this.activeAgents.get(agentId);
    if (!handle) return undefined;
    return handle.promise;
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): SpawnedAgent[] {
    return Array.from(this.activeAgents.values()).map(h => h.agent);
  }

  /**
   * Clean up completed agents
   */
  cleanup(): void {
    for (const [agentId, handle] of this.activeAgents) {
      if (handle.agent.status === 'completed' || handle.agent.status === 'failed') {
        this.activeAgents.delete(agentId);
      }
    }
  }
}

// Export singleton instance (only instantiate if feature is enabled)
export const agentSpawner = isEnabled('SWARM_COORDINATION')
  ? new DynamicAgentSpawner()
  : (null as unknown as DynamicAgentSpawner);
