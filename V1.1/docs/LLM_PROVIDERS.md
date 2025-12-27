# LLM Providers Reference Guide

Complete reference for LLM API providers with authentication methods, free tiers, and integration details.

---

## Quick Reference Table

| Provider | Auth Method | Free Tier | Env Variable | Base URL |
|----------|-------------|-----------|--------------|----------|
| **Claude/Anthropic** | API Key OR OAuth | No (pay-as-you-go) | `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` | `https://api.anthropic.com/v1` |
| **OpenAI** | API Key (Bearer) | No (pay-as-you-go) | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| **Grok/xAI** | API Key (Bearer) | No (pay-as-you-go) | `XAI_API_KEY` | `https://api.x.ai/v1` |
| **Google Gemini** | API Key OR OAuth | Yes (limited) | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `https://generativelanguage.googleapis.com/v1beta` |
| **Mistral** | API Key (Bearer) | Yes (Experiment plan) | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` |
| **Groq** | API Key (Bearer) | Yes (14,400 req/day) | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| **Together AI** | API Key (Bearer) | Yes ($25-100 credits) | `TOGETHER_API_KEY` | `https://api.together.xyz/v1` |
| **Cohere** | API Key (Bearer) | Yes (1000 calls/month) | `COHERE_API_KEY` | `https://api.cohere.ai/v1` |
| **Perplexity** | API Key (Bearer) | Limited | `PERPLEXITY_API_KEY` | `https://api.perplexity.ai` |
| **OpenRouter** | API Key (Bearer) | No (aggregator) | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| **Ollama** | None (local) | Yes (local) | N/A | `http://localhost:11434/api` |

---

## Detailed Provider Documentation

### 1. Claude/Anthropic

**Authentication Methods:**
- **API Key**: Header `x-api-key: YOUR_API_KEY`
- **OAuth Token**: Header `Authorization: Bearer YOUR_OAUTH_TOKEN`

**Precedence Order:** `ANTHROPIC_API_KEY` > OAuth token > Subscription

**Environment Variables:**
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
# OR
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
CLAUDE_OAUTH_TOKEN=sk-ant-oat01-...  # Alternative
```

**OAuth Token Details:**
- Access tokens expire after 8 hours
- Refresh tokens allow indefinite renewal
- Recommended for enterprise deployments

**Free Tier:** No free tier, pay-as-you-go pricing

**API Format:** Custom Anthropic format (not OpenAI-compatible)

---

### 2. OpenAI

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-...
```

**2025 Updates:**
- Project-scoped API keys for better isolation
- Service accounts per project
- No general OAuth (only for GPT Actions)

**Free Tier:** No free tier, pay-as-you-go pricing

**API Format:** OpenAI Chat Completions format (industry standard)

---

### 3. Grok/xAI

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
XAI_API_KEY=xai-...
```

**Getting Access:**
1. Visit console.x.ai
2. Authenticate with X (Twitter), Google, or email
3. Add payment method (usage-based pricing)
4. Generate API key (shown only once!)

**Free Tier:** No free tier, usage-based pricing

**API Format:** OpenAI-compatible

---

### 4. Google Gemini

**Authentication Methods:**
- **API Key**: Header `x-goog-api-key: YOUR_API_KEY` (most common)
- **OAuth 2.0**: For tuning and semantic retrieval features

**Environment Variables:**
```bash
GEMINI_API_KEY=AIza...
# OR
GOOGLE_API_KEY=AIza...  # Takes precedence if both set
```

**Free Tier:** Yes, with rate limits (suitable for testing)

**API Format:** Custom Google format

**Notes:**
- Create API keys in Google AI Studio
- OAuth required for model tuning and semantic retrieval

---

### 5. Mistral AI

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
MISTRAL_API_KEY=...
```

**Free Tier:** Yes!
- **Experiment Plan**: Free with phone verification (no credit card)
- Limited rate limits suitable for prototyping
- Access to all models

**Getting Started:**
1. Register at console.mistral.ai
2. Verify phone number
3. Generate API key

**API Format:** OpenAI-compatible

---

### 6. Groq

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
GROQ_API_KEY=gsk_...
```

**Free Tier:** Yes!
- 14,400 requests/day
- No credit card required
- Access at console.groq.com

**Paid Tier (Developer):**
- 10x higher limits than free
- 25% discount on Batch API

**API Format:** OpenAI-compatible (`/openai/v1` endpoint)

**Notes:** Known for extremely fast inference speeds

---

### 7. Together AI

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
TOGETHER_API_KEY=...
```

**Free Tier:** Yes!
- $25-100 in free credits for new users
- Credits expire in 30-90 days
- Access at api.together.ai

**API Format:** OpenAI-compatible

**Notes:** Access to many open-source models (Llama, Mistral, etc.)

---

### 8. Cohere

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
COHERE_API_KEY=...
```

**Free Tier:** Yes!
- **Trial Key**: 1000 calls/month
- Access to all models and endpoints
- Not for production/commercial use

**Getting Started:**
1. Register at dashboard.cohere.com
2. Trial key auto-created on signup

**API Format:** Custom Cohere format

---

### 9. OpenRouter (Aggregator)

**What It Is:** Single API gateway to 400+ models from multiple providers

**Authentication Method:**
- API Key via Bearer token: `Authorization: Bearer YOUR_API_KEY`

**Environment Variables:**
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

**Required Headers:**
```
Authorization: Bearer YOUR_API_KEY
HTTP-Referer: https://your-app.com
X-Title: Your App Name
```

**Free Tier:** No free tier (charges per model usage)

**API Format:** OpenAI-compatible

**Benefits:**
- One API key for many providers
- Automatic fallback between providers
- Unified billing

---

### 10. Ollama (Local)

**Authentication Method:** None required (local execution)

**Environment Variables:**
```bash
OLLAMA_HOST=http://localhost:11434  # Optional, default
OLLAMA_MODEL=llama3.2              # Model to use
```

**Free Tier:** Completely free (runs locally)

**Setup:**
```bash
# Install
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2

# Run
ollama serve
```

**API Format:** Custom Ollama format (`/api/chat`)

**Notes:**
- No internet required after model download
- Privacy-first (data never leaves your machine)
- GPU acceleration supported

---

## Provider Categories

### OpenAI-Compatible APIs
These providers use the same API format as OpenAI:
- OpenAI
- Grok/xAI
- Mistral
- Groq
- Together AI
- OpenRouter (aggregator)

**Integration Pattern:**
```typescript
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'model-name',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 1000,
  }),
});
```

### Custom API Formats
These providers use their own API formats:
- **Claude/Anthropic**: Uses `x-api-key` header, different message structure
- **Google Gemini**: Uses `x-goog-api-key` header, different endpoints
- **Cohere**: Custom endpoints and response format
- **Ollama**: Local `/api/chat` endpoint

---

## Best Free Options for Testing

1. **Groq** - 14,400 req/day, extremely fast
2. **Mistral** - Free Experiment plan, all models
3. **Together AI** - $25-100 credits, many open-source models
4. **Cohere** - 1000 calls/month trial
5. **Ollama** - Unlimited local execution

---

## Environment Variables Template

```bash
# === Primary Providers ===
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...

# === Claude OAuth (alternative to API key) ===
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# === Free Tier Providers ===
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
TOGETHER_API_KEY=...
COHERE_API_KEY=...

# === Google ===
GEMINI_API_KEY=AIza...

# === Aggregator ===
OPENROUTER_API_KEY=sk-or-v1-...

# === Local ===
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

---

## Sources

- [OpenRouter API Documentation](https://openrouter.ai/docs/api/reference/authentication)
- [OpenRouter Models](https://openrouter.ai/docs/guides/overview/models)
- [Claude IAM Documentation](https://docs.claude.com/en/docs/claude-code/iam)
- [OpenAI API Authentication](https://platform.openai.com/docs/api-reference/authentication)
- [OpenAI Authentication 2025 Overview](https://www.datastudios.org/post/openai-authentication-in-2025-api-keys-service-accounts-and-secure-token-flows-for-developers-and)
- [xAI API Documentation](https://x.ai/api)
- [Grok API Guide](https://latenode.com/blog/complete-guide-to-xais-grok-api-documentation-and-implementation)
- [Gemini API Key Usage](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini OAuth Quickstart](https://ai.google.dev/gemini-api/docs/oauth)
- [Mistral Free Tier](https://help.mistral.ai/en/articles/455206-how-can-i-try-the-api-for-free-with-the-experiment-plan)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Groq Developer Tier](https://groq.com/blog/developer-tier-now-available-on-groqcloud)
- [Together AI Authentication](https://docs.together.ai/reference/authentication-1)
- [Cohere Rate Limits](https://docs.cohere.com/docs/rate-limits)
- [Cohere Free Tier Announcement](https://cohere.com/blog/free-developer-tier-announcement)
