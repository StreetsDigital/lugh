# Phone Vibecoding V2 - Quick Start

> **Next-generation mobile coding UX for Lugh**
>
> Voice commands • Photo tasks • Inline actions • Rich previews

---

## What You Get

### 🎤 Voice Commands

Send voice notes instead of typing:

- "Approve" → Instantly approve pending actions
- "Show me the diff" → See code changes
- "Plan adding dark mode" → Create implementation plan
- "Status" → Check system status

### 📸 Photo-to-Task

Take a photo, get structured tasks:

- **Whiteboard sketch** → Implementation plan
- **Bug screenshot** → Debugging task
- **Architecture diagram** → Code structure suggestions
- **Handwritten notes** → Structured todos

### ⚡ Inline Quick Actions

One-tap approvals with inline buttons:

```
┌─────────────────────────────────┐
│ Agent wants to edit auth.ts     │
│ + Add JWT validation            │
│ [✅ Approve] [❌ Reject] [👁️ Diff] │
└─────────────────────────────────┘
```

### 📄 Rich Code Previews

See diffs before approving:

```diff
// src/auth/validate.ts
- function validate(token) {
+ function validate(token: string): boolean {
    if (!token) return false;
+   return jwt.verify(token, SECRET);
  }
```

### 🔔 Smart Notifications

Priority-based alerts with context:

- 🚨 Critical = Sound + full preview
- ⚠️ High = Notification with diff
- 🔔 Medium = Silent with preview
- ℹ️ Low = Silent, collapsed

---

## Documentation

- **📋 Full Spec:** [FEAT-006-phone-vibecoding-v2.md](./FEAT-006-phone-vibecoding-v2.md)
- **✅ Implementation Checklist:** [FEAT-006-CHECKLIST.md](./FEAT-006-CHECKLIST.md)
- **🗄️ Database Migration:** [../migrations/011_phone_vibecoding_v2.sql](../migrations/011_phone_vibecoding_v2.sql)

---

## Quick Implementation Guide

### 1. Prerequisites

```bash
# Get OpenAI API key for Whisper
# Visit: https://platform.openai.com/api-keys

# Claude API key (should already have)
```

### 2. Setup

```bash
# Create branch
git checkout -b feat/phone-vibecoding-v2

# Install dependencies
bun add openai diff

# Apply migration
psql $DATABASE_URL < migrations/011_phone_vibecoding_v2.sql

# Add to .env
echo "OPENAI_API_KEY=sk-..." >> .env
echo "VOICE_COMMANDS_ENABLED=true" >> .env
echo "VISION_ENABLED=true" >> .env
echo "INLINE_KEYBOARDS_ENABLED=true" >> .env
```

### 3. Implementation Order

Follow the checklist in [FEAT-006-CHECKLIST.md](./FEAT-006-CHECKLIST.md):

1. **Phase 1:** Voice Commands (1.5 days)
2. **Phase 2:** Inline Quick Actions (1 day)
3. **Phase 3:** Rich Code Previews (1 day)
4. **Phase 4:** Photo-to-Task (1.5 days)
5. **Phase 5:** Reaction Shortcuts (0.5 days)
6. **Phase 6:** Smart Notifications (1 day)

**Total:** ~6-8 days

### 4. Testing

```bash
# Unit tests
bun test src/services/voice-intent-parser.test.ts
bun test src/services/vision-analyzer.test.ts

# Integration tests
bun test src/adapters/telegram.test.ts

# Manual testing with real Telegram bot
```

---

## User Experience Examples

### Voice Approval (Hands-Free Coding)

```
[User driving, gets notification]
User: *sends voice note* "approve"
    ↓ 2 seconds
Bot: ✅ Approved - Agent proceeding...
```

### Photo to Implementation

```
[User at whiteboard meeting]
User: *takes photo of architecture sketch*
User: *sends with caption* "implement this"
    ↓ 4 seconds
Bot: 📐 I see: System architecture diagram

     Suggested tasks:
     1. Create authentication service
     2. Add JWT validation
     3. Implement session management

     [1. Create auth...] [2. Add JWT...]

User: *taps button 1*
    ↓ 1 second
Bot: Creating implementation plan for authentication service...
```

### One-Tap Approval

```
Bot: 🔧 Agent needs approval

     Tool: Edit auth.ts
     🟢+ Add JWT validation
     🔴- Remove old session code

     [✅ Approve] [❌ Reject] [👁️ Diff]

User: *taps Approve*
    ↓ < 1 second
Bot: ✅ Approved - Agent proceeding...
```

---

## Cost Estimate

**Per Active User/Month:**

- Voice (Whisper): ~50 commands × 10s = **$0.05**
- Vision (Claude): ~20 photos = **$0.24**
- **Total: ~$0.30/user/month**

ROI: Time saved >>> costs

---

## Architecture Overview

```
Telegram Message
    ↓
Voice/Photo/Text Detection
    ↓
┌─────────┬──────────┬──────────┐
│ Voice   │ Photo    │ Button   │
│ Handler │ Handler  │ Handler  │
└─────────┴──────────┴──────────┘
    ↓           ↓          ↓
┌─────────┬──────────┬──────────┐
│ Whisper │ Claude   │ Callback │
│ API     │ Vision   │ Query    │
└─────────┴──────────┴──────────┘
    ↓           ↓          ↓
Intent Parser  Task Gen   Approval DB
    ↓           ↓          ↓
┌────────────────────────────────┐
│      Command Execution         │
│   (Orchestrator Integration)   │
└────────────────────────────────┘
    ↓
Response with Rich Formatting
```

---

## Performance Targets

| Feature               | Target  | Measurement          |
| --------------------- | ------- | -------------------- |
| Voice transcription   | < 3s    | Whisper API latency  |
| Button response       | < 1s    | Callback → DB update |
| Vision analysis       | < 5s    | Claude Vision API    |
| Code preview gen      | < 2s    | Diff calculation     |
| Notification delivery | < 500ms | Send to Telegram     |

---

## Rollout Plan

### Stage 1: Voice Only (Low Risk)

```env
VOICE_COMMANDS_ENABLED=true
```

Test with small user group.

### Stage 2: Add Inline Actions

```env
INLINE_KEYBOARDS_ENABLED=true
```

Expand to more users.

### Stage 3: Add Vision

```env
VISION_ENABLED=true
```

Monitor API costs closely.

### Stage 4: Full V2

```env
SMART_NOTIFICATIONS_ENABLED=true
```

All features enabled.

---

## Troubleshooting

**Voice transcription slow?**

- Check OpenAI API status
- Verify audio file < 30 seconds
- Check network latency

**Vision analysis failing?**

- Verify image size < 10MB
- Check supported format (jpg/png/webp)
- Confirm Claude API key has Vision access

**Buttons not working?**

- Check callback query handler registered
- Verify database approvals table has V2 columns
- Check Telegram bot permissions

**Previews not showing?**

- Verify diff library installed (`bun add diff`)
- Check file encoding (UTF-8)
- Test with smaller files

---

## Support & Feedback

- **Issues:** Create GitHub issue with `feat-006` label
- **Questions:** Check [FEAT-006-phone-vibecoding-v2.md](./FEAT-006-phone-vibecoding-v2.md) spec
- **Progress:** Track in [FEAT-006-CHECKLIST.md](./FEAT-006-CHECKLIST.md)

---

**Ready to build? Start with the checklist! 🚀**
