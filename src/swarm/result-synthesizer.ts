/**
 * Result Synthesizer
 * ==================
 *
 * Aggregates and synthesizes results from multiple agents
 * into a cohesive, unified output.
 */

import type {
  DecomposedTask,
  AgentResult,
  SynthesizedResult,
  ResultSection,
} from './types';

/**
 * ResultSynthesizer class
 * Combines outputs from parallel agents into a unified result
 */
export class ResultSynthesizer {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Synthesize results from multiple agents
   */
  async synthesize(
    decomposedTask: DecomposedTask,
    results: AgentResult[]
  ): Promise<SynthesizedResult> {
    console.log(
      `[ResultSynthesizer] Synthesizing ${results.length} agent results`
    );

    // Calculate totals
    const totalTokensUsed = results.reduce((sum, r) => sum + r.tokensUsed, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    // Build sections from results
    const sections = this.buildSections(results);

    // Collect all recommendations
    const allRecommendations = this.collectRecommendations(results);

    // Collect all next steps
    const allNextSteps = this.collectNextSteps(results);

    // Generate executive summary
    const summary = await this.generateSummary(
      decomposedTask,
      results,
      sections
    );

    const synthesizedResult: SynthesizedResult = {
      summary,
      sections,
      combinedRecommendations: allRecommendations,
      nextSteps: allNextSteps,
      totalTokensUsed,
      totalDuration,
      agentResults: results,
    };

    console.log(`[ResultSynthesizer] Synthesis complete`);
    return synthesizedResult;
  }

  /**
   * Build sections from agent results
   */
  private buildSections(results: AgentResult[]): ResultSection[] {
    // Role display names
    const roleNames: Record<string, string> = {
      'competitor-analysis': 'Competitive Analysis',
      'tech-stack-research': 'Technology Stack',
      'architecture-design': 'System Architecture',
      'project-management': 'Project Plan',
      'market-research': 'Market Research',
      'ux-design': 'User Experience',
      'security-audit': 'Security Analysis',
      'cost-estimation': 'Cost Estimation',
      'legal-compliance': 'Legal & Compliance',
      implementation: 'Implementation',
      testing: 'Testing Strategy',
      documentation: 'Documentation',
      custom: 'Additional Analysis',
    };

    // Order for sections
    const sectionOrder = [
      'market-research',
      'competitor-analysis',
      'architecture-design',
      'tech-stack-research',
      'ux-design',
      'security-audit',
      'project-management',
      'cost-estimation',
      'legal-compliance',
      'implementation',
      'testing',
      'documentation',
      'custom',
    ];

    // Sort results by section order
    const sortedResults = [...results].sort((a, b) => {
      const indexA = sectionOrder.indexOf(a.role);
      const indexB = sectionOrder.indexOf(b.role);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return sortedResults.map((result) => ({
      title: roleNames[result.role] || result.role,
      role: result.role,
      content: result.details,
      artifacts: result.artifacts,
      confidence: result.confidence,
    }));
  }

  /**
   * Collect and deduplicate recommendations from all results
   */
  private collectRecommendations(results: AgentResult[]): string[] {
    const allRecs: string[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const rec of result.recommendations) {
        const normalized = rec.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          allRecs.push(rec);
        }
      }
    }

    // Sort by importance (heuristic: longer recommendations tend to be more specific)
    return allRecs.sort((a, b) => b.length - a.length).slice(0, 15);
  }

  /**
   * Collect and organize next steps from all results
   */
  private collectNextSteps(results: AgentResult[]): string[] {
    const allSteps: string[] = [];
    const seen = new Set<string>();

    // Prioritize steps by agent role
    const rolePriority: Record<string, number> = {
      'architecture-design': 1,
      'project-management': 2,
      'tech-stack-research': 3,
      implementation: 4,
      'security-audit': 5,
    };

    // Sort results by priority
    const sortedResults = [...results].sort((a, b) => {
      const prioA = rolePriority[a.role] || 10;
      const prioB = rolePriority[b.role] || 10;
      return prioA - prioB;
    });

    for (const result of sortedResults) {
      for (const step of result.nextSteps) {
        const normalized = step.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          allSteps.push(step);
        }
      }
    }

    return allSteps.slice(0, 10);
  }

  /**
   * Generate executive summary using Claude
   */
  private async generateSummary(
    decomposedTask: DecomposedTask,
    results: AgentResult[],
    _sections: ResultSection[]
  ): Promise<string> {
    // Build context from results
    const summaries = results
      .map((r) => `**${r.role}**: ${r.summary}`)
      .join('\n');

    const artifactCount = results.reduce(
      (sum, r) => sum + r.artifacts.length,
      0
    );

    const avgConfidence =
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    const prompt = `You are creating an executive summary for a project analysis.

Project: ${decomposedTask.projectName}
Description: ${decomposedTask.projectDescription}

The following analyses were performed by specialized agents:

${summaries}

Key metrics:
- ${results.length} analysis areas covered
- ${artifactCount} artifacts generated (diagrams, code, etc.)
- Average confidence: ${(avgConfidence * 100).toFixed(0)}%

Write a concise executive summary (2-3 paragraphs) that:
1. Captures the key findings across all analyses
2. Highlights the most important recommendations
3. Identifies critical decisions or risks
4. Provides a clear "what's next" direction

Be direct and actionable. Write for a technical founder or product manager.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string }>;
      };
      const content = data.content[0];

      if (content.type === 'text' && content.text) {
        return content.text;
      }

      throw new Error('Unexpected response format');
    } catch (error) {
      console.error('[ResultSynthesizer] Summary generation failed:', error);

      // Fallback to a template-based summary
      return this.generateFallbackSummary(decomposedTask, results);
    }
  }

  /**
   * Generate fallback summary without API call
   */
  private generateFallbackSummary(
    decomposedTask: DecomposedTask,
    results: AgentResult[]
  ): string {
    const successfulResults = results.filter((r) => r.confidence > 0);
    const topRecs = this.collectRecommendations(results).slice(0, 3);

    let summary = `## ${decomposedTask.projectName}\n\n`;
    summary += `${decomposedTask.projectDescription}\n\n`;
    summary += `### Analysis Summary\n\n`;
    summary += `Completed ${successfulResults.length} of ${results.length} analyses covering `;
    summary += results.map((r) => r.role.replace('-', ' ')).join(', ');
    summary += '.\n\n';

    if (topRecs.length > 0) {
      summary += `### Top Recommendations\n\n`;
      for (const rec of topRecs) {
        summary += `- ${rec}\n`;
      }
    }

    return summary;
  }

  /**
   * Format the synthesized result as markdown
   */
  formatAsMarkdown(result: SynthesizedResult): string {
    let md = '';

    // Executive Summary
    md += `# Executive Summary\n\n`;
    md += `${result.summary}\n\n`;

    // Table of Contents
    md += `## Table of Contents\n\n`;
    for (const section of result.sections) {
      md += `- [${section.title}](#${section.title.toLowerCase().replace(/\s+/g, '-')})\n`;
    }
    md += `- [Recommendations](#recommendations)\n`;
    md += `- [Next Steps](#next-steps)\n\n`;

    // Sections
    for (const section of result.sections) {
      md += `## ${section.title}\n\n`;
      md += `*Confidence: ${(section.confidence * 100).toFixed(0)}%*\n\n`;
      md += `${section.content}\n\n`;

      // Artifacts
      if (section.artifacts.length > 0) {
        md += `### Artifacts\n\n`;
        for (const artifact of section.artifacts) {
          if (artifact.type === 'diagram' || artifact.type === 'code') {
            md += `**${artifact.name}** (${artifact.format})\n\n`;
            md += `\`\`\`${artifact.format}\n${artifact.content}\n\`\`\`\n\n`;
          } else {
            md += `**${artifact.name}**: ${artifact.content}\n\n`;
          }
        }
      }
    }

    // Recommendations
    md += `## Recommendations\n\n`;
    for (const rec of result.combinedRecommendations) {
      md += `- ${rec}\n`;
    }
    md += '\n';

    // Next Steps
    md += `## Next Steps\n\n`;
    for (let i = 0; i < result.nextSteps.length; i++) {
      md += `${i + 1}. ${result.nextSteps[i]}\n`;
    }
    md += '\n';

    // Metadata
    md += `---\n\n`;
    md += `*Generated by AgentCommander Swarm*\n`;
    md += `*Total tokens used: ${result.totalTokensUsed.toLocaleString()}*\n`;
    md += `*Total duration: ${(result.totalDuration / 1000).toFixed(1)}s*\n`;

    return md;
  }

  /**
   * Format the synthesized result as JSON
   */
  formatAsJSON(result: SynthesizedResult): string {
    return JSON.stringify(result, null, 2);
  }
}

// Export singleton instance
export const resultSynthesizer = new ResultSynthesizer();
