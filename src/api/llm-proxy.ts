/**
 * LLM Proxy API
 * =============
 *
 * Exposes Claude Code SDK as an HTTP API for LangGraph (Python) to use.
 * This allows LangGraph to use OAuth authentication through Lugh.
 */

import { Router, Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';

const router = Router();

interface CompletionRequest {
  messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * POST /api/llm/completion
 *
 * Generate a completion using Claude Code SDK.
 * Used by LangGraph Python service.
 */
router.post('/completion', async (req: Request, res: Response) => {
  const body = req.body as CompletionRequest;

  if (!body.messages || body.messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  try {
    // Build prompt from messages
    const prompt = body.messages
      .map(m => {
        if (m.role === 'system') return `<system>${m.content}</system>\n`;
        if (m.role === 'user') return `Human: ${m.content}\n`;
        return `Assistant: ${m.content}\n`;
      })
      .join('');

    console.log('[LLM Proxy] Completion request', {
      messageCount: body.messages.length,
      promptLength: prompt.length,
    });

    // Use Claude Code SDK query
    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const result = await query({
      prompt,
      options: {
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
      },
    });

    // Extract response from result
    if (typeof result === 'string') {
      fullResponse = result;
    } else if (result && typeof result === 'object') {
      // Handle structured result
      const r = result as { content?: string; text?: string };
      fullResponse = r.content || r.text || JSON.stringify(result);
    }

    // Estimate tokens (rough)
    inputTokens = Math.ceil(prompt.length / 4);
    outputTokens = Math.ceil(fullResponse.length / 4);

    const response: CompletionResponse = {
      content: fullResponse,
      model: body.model || 'claude-sonnet-4-20250514',
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };

    console.log('[LLM Proxy] Completion success', {
      responseLength: fullResponse.length,
      tokens: response.usage,
    });

    res.json(response);
  } catch (error) {
    console.error('[LLM Proxy] Completion failed', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/llm/stream
 *
 * Stream a completion using Claude Code SDK.
 * Returns Server-Sent Events.
 */
router.post('/stream', async (req: Request, res: Response) => {
  const body = req.body as CompletionRequest;

  if (!body.messages || body.messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Build prompt from messages
    const prompt = body.messages
      .map(m => {
        if (m.role === 'system') return `<system>${m.content}</system>\n`;
        if (m.role === 'user') return `Human: ${m.content}\n`;
        return `Assistant: ${m.content}\n`;
      })
      .join('');

    console.log('[LLM Proxy] Stream request', {
      messageCount: body.messages.length,
      promptLength: prompt.length,
    });

    const result = await query({
      prompt,
      options: {
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
      },
    });

    // Extract and stream the response
    let content = '';
    if (typeof result === 'string') {
      content = result;
    } else if (result && typeof result === 'object') {
      const r = result as { content?: string; text?: string };
      content = r.content || r.text || JSON.stringify(result);
    }

    // Send content as a single chunk (SDK doesn't support streaming callbacks)
    res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);

    // Send done event
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[LLM Proxy] Stream failed', error);
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
    );
    res.end();
  }
});

/**
 * GET /api/llm/health
 *
 * Health check for LLM proxy.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'llm-proxy',
    auth: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth' : 'api_key',
  });
});

export default router;
