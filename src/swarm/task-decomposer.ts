/**
 * Task Decomposer
 * ===============
 *
 * Analyzes user requests and decomposes them into specialized sub-tasks
 * that can be executed by parallel agents.
 */

import { v4 as uuidv4 } from 'uuid';
import { isEnabled } from '../config/features';
import type { DecomposedTask, SubTask, AgentRole } from './types';

/**
 * System prompt for task decomposition
 */
const DECOMPOSITION_PROMPT = `You are a task decomposition expert. Your job is to analyze a user's project idea or request and break it down into specialized sub-tasks that can be executed by different AI agents in parallel.

Available agent roles:
- competitor-analysis: Research competitors, market positioning, pricing strategies
- tech-stack-research: Analyze technology options, frameworks, infrastructure
- architecture-design: Design system architecture, data models, APIs
- project-management: Create project plans, timelines, milestones, resource allocation
- market-research: Analyze target market, user personas, market size
- ux-design: Design user experience, wireframes, user flows
- security-audit: Identify security requirements, compliance needs, threat modeling
- cost-estimation: Estimate development costs, infrastructure costs, ROI
- legal-compliance: Identify legal requirements, licensing, data privacy needs
- implementation: Write actual code (requires tools)
- testing: Design test strategies, write test plans
- documentation: Create technical documentation, API docs

Rules:
1. Each sub-task should be independent enough to run in parallel when possible
2. Identify dependencies between tasks (e.g., architecture should inform implementation)
3. Assign appropriate priority based on the logical flow
4. Only use 'implementation' role if the user explicitly wants code written
5. Be specific in the prompt for each sub-task
6. Consider the project scope - don't over-engineer simple ideas

Respond with a JSON object (no markdown, just pure JSON):
{
  "projectName": "Short project name",
  "projectDescription": "One paragraph description",
  "subTasks": [
    {
      "role": "agent-role-here",
      "title": "Short task title",
      "description": "What this task will accomplish",
      "prompt": "Detailed prompt for the agent including context and specific questions to answer",
      "priority": "critical|high|medium|low",
      "dependencies": ["id-of-dependent-task"],
      "estimatedDuration": "short|medium|long",
      "requiredTools": false
    }
  ],
  "executionStrategy": "parallel|sequential|hybrid"
}`;

/**
 * TaskDecomposer class
 * Uses an LLM to analyze and decompose user requests
 */
export class TaskDecomposer {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = model;
  }

  /**
   * Decompose a user request into sub-tasks
   */
  async decompose(userRequest: string): Promise<DecomposedTask> {
    console.log('[TaskDecomposer] Analyzing request:', userRequest.substring(0, 100) + '...');

    try {
      // Call Claude API for decomposition
      const response = await this.callClaude(userRequest);
      const parsed = this.parseResponse(response);

      // Add IDs to sub-tasks
      const subTasks: SubTask[] = parsed.subTasks.map((task: Omit<SubTask, 'id'>, index: number) => ({
        ...task,
        id: `task-${index + 1}-${uuidv4().substring(0, 8)}`,
      }));

      // Update dependencies to use actual IDs
      const taskIdMap = new Map<number, string>();
      subTasks.forEach((task, index) => {
        taskIdMap.set(index, task.id);
      });

      // Resolve dependency references
      subTasks.forEach((task) => {
        task.dependencies = task.dependencies.map((dep) => {
          // If dep is a number reference, resolve it
          const numDep = parseInt(dep, 10);
          if (!isNaN(numDep) && taskIdMap.has(numDep)) {
            return taskIdMap.get(numDep)!;
          }
          return dep;
        });
      });

      const decomposedTask: DecomposedTask = {
        originalRequest: userRequest,
        projectName: parsed.projectName,
        projectDescription: parsed.projectDescription,
        subTasks,
        executionStrategy: parsed.executionStrategy || 'hybrid',
        estimatedTotalDuration: this.estimateTotalDuration(subTasks),
      };

      console.log(`[TaskDecomposer] Decomposed into ${subTasks.length} sub-tasks`);
      return decomposedTask;
    } catch (error) {
      console.error('[TaskDecomposer] Decomposition failed:', error);
      // Return a fallback single-task decomposition
      return this.createFallbackDecomposition(userRequest);
    }
  }

  /**
   * Call Claude API for decomposition
   */
  private async callClaude(userRequest: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `${DECOMPOSITION_PROMPT}\n\nUser's request:\n${userRequest}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    const content = data.content[0];
    if (content.type === 'text' && content.text) {
      return content.text;
    }
    throw new Error('Unexpected response format from Claude');
  }

  /**
   * Parse the JSON response from Claude
   */
  private parseResponse(response: string): {
    projectName: string;
    projectDescription: string;
    subTasks: Omit<SubTask, 'id'>[];
    executionStrategy: 'parallel' | 'sequential' | 'hybrid';
  } {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      console.error('[TaskDecomposer] Failed to parse JSON:', jsonStr.substring(0, 200));
      throw new Error('Failed to parse decomposition response');
    }
  }

  /**
   * Estimate total duration based on sub-tasks
   */
  private estimateTotalDuration(subTasks: SubTask[]): string {
    const durationMap = {
      short: 1,
      medium: 3,
      long: 7,
    };

    // Find critical path (tasks with dependencies)
    const criticalPathMinutes = subTasks.reduce((max, task) => {
      const taskDuration = durationMap[task.estimatedDuration];
      return Math.max(max, taskDuration);
    }, 0);

    // Parallel tasks run simultaneously, so we use max not sum
    const hasParallelTasks = subTasks.some((t) => t.dependencies.length === 0);
    const totalMinutes = hasParallelTasks
      ? criticalPathMinutes + 2 // Some overhead
      : subTasks.reduce((sum, t) => sum + durationMap[t.estimatedDuration], 0);

    if (totalMinutes < 2) return '1-2 minutes';
    if (totalMinutes < 5) return '2-5 minutes';
    if (totalMinutes < 10) return '5-10 minutes';
    return '10+ minutes';
  }

  /**
   * Create a fallback decomposition for when parsing fails
   */
  private createFallbackDecomposition(userRequest: string): DecomposedTask {
    const fallbackTask: SubTask = {
      id: `task-fallback-${uuidv4().substring(0, 8)}`,
      role: 'architecture-design',
      title: 'General Analysis',
      description: 'Analyze the request and provide comprehensive feedback',
      prompt: `Analyze the following request and provide a comprehensive response including:
1. Understanding of the core idea
2. Key considerations and challenges
3. Recommended next steps
4. Questions that need clarification

Request: ${userRequest}`,
      priority: 'high',
      dependencies: [],
      estimatedDuration: 'medium',
      requiredTools: false,
    };

    return {
      originalRequest: userRequest,
      projectName: 'Project Analysis',
      projectDescription: userRequest.substring(0, 200),
      subTasks: [fallbackTask],
      executionStrategy: 'sequential',
      estimatedTotalDuration: '2-5 minutes',
    };
  }

  /**
   * Get suggested roles based on keywords in the request
   */
  suggestRoles(userRequest: string): AgentRole[] {
    const request = userRequest.toLowerCase();
    const suggestedRoles: AgentRole[] = [];

    const roleKeywords: Record<AgentRole, string[]> = {
      'competitor-analysis': ['competitor', 'competition', 'market leader', 'alternative', 'vs'],
      'tech-stack-research': ['tech', 'stack', 'framework', 'language', 'database', 'infrastructure'],
      'architecture-design': ['architecture', 'design', 'system', 'scale', 'api', 'structure'],
      'project-management': ['plan', 'timeline', 'milestone', 'sprint', 'agile', 'team'],
      'market-research': ['market', 'user', 'customer', 'persona', 'target', 'audience'],
      'ux-design': ['ux', 'ui', 'design', 'wireframe', 'user experience', 'interface'],
      'security-audit': ['security', 'auth', 'privacy', 'gdpr', 'compliance', 'encrypt'],
      'cost-estimation': ['cost', 'budget', 'price', 'estimate', 'roi', 'investment'],
      'legal-compliance': ['legal', 'license', 'copyright', 'terms', 'privacy policy'],
      implementation: ['build', 'code', 'implement', 'create', 'develop'],
      testing: ['test', 'qa', 'quality', 'bug', 'validation'],
      documentation: ['document', 'docs', 'readme', 'api docs', 'guide'],
      custom: [],
    };

    for (const [role, keywords] of Object.entries(roleKeywords)) {
      if (keywords.some((kw) => request.includes(kw))) {
        suggestedRoles.push(role as AgentRole);
      }
    }

    // Always include some essential roles for new projects
    if (request.includes('idea') || request.includes('startup') || request.includes('app')) {
      if (!suggestedRoles.includes('competitor-analysis')) {
        suggestedRoles.push('competitor-analysis');
      }
      if (!suggestedRoles.includes('architecture-design')) {
        suggestedRoles.push('architecture-design');
      }
      if (!suggestedRoles.includes('market-research')) {
        suggestedRoles.push('market-research');
      }
    }

    return suggestedRoles;
  }
}

// Export singleton instance (only instantiate if feature is enabled)
export const taskDecomposer = isEnabled('SWARM_COORDINATION')
  ? new TaskDecomposer()
  : (null as unknown as TaskDecomposer);
