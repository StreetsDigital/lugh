# FEAT-006: Phone Vibecoding V2 - Next-Gen Mobile Coding

**Status:** Ready for Implementation
**Priority:** P1 - High Value
**Depends On:** None
**Estimated Effort:** 5-6 days

---

## Summary

Extend the current approval workflow (Phone Vibecoding V1) with **next-generation mobile UX** that makes coding from your phone feel native and effortless. Voice commands, inline quick actions, rich code previews, and vision-based task creation transform Telegram into a first-class coding interface.

**Core Philosophy:** Mobile-first, friction-free, context-rich.

---

## What V1 Gave Us

**Current State (from `docs/phone-vibecoding-v1.md`):**

✅ **Blocking Approvals:**

```env
BLOCKING_APPROVALS=true          # Block on high-risk tools
APPROVAL_TIMEOUT_MS=300000       # 5 min to respond
NOTIFY_ON_RISK_TOOLS=true        # Send notifications
```

✅ **Basic Workflow:**

1. Agent needs to run risky tool (Write, Edit, Bash)
2. User gets notification with tool details
3. User types `/approve` or `/reject`
4. Agent proceeds or stops

**Limitations:**

- Text-only commands (slow on mobile)
- No code preview (hard to judge changes)
- Manual typing required (friction)
- No voice input (hands-free coding impossible)
- No visual context (photos, diagrams)

---

## What V2 Adds

### 1. Voice Commands 🎤

Send voice notes, Lugh transcribes and executes:

- "Approve" → Approves pending action
- "Reject" → Rejects pending action
- "Show me the diff" → Displays code changes
- "Create a plan for adding dark mode" → Spawns planning task
- "Status" → Pool status + active tasks

### 2. Inline Quick Actions ⚡

Telegram inline keyboards for one-tap actions:

```
┌─────────────────────────────────┐
│ Agent wants to edit auth.ts     │
│                                  │
│ + Add JWT validation            │
│ - Remove old session code       │
│                                  │
│ [✅ Approve] [❌ Reject] [👁️ Diff] │
└─────────────────────────────────┘
```

### 3. Rich Code Previews 📄

Visual diff rendering with syntax highlighting:

```diff
// src/auth/validate.ts
- function validate(token) {
+ function validate(token: string): boolean {
    if (!token) return false;
+   const decoded = jwt.verify(token, SECRET);
+   return decoded.exp > Date.now();
  }
```

### 4. Photo-to-Task 📸

Take a photo, Lugh creates tasks:

- **Whiteboard sketch** → Generates implementation plan
- **Screenshot of bug** → Creates debugging task
- **Handwritten notes** → Converts to structured todos
- **Architecture diagram** → Analyzes and suggests code structure

### 5. Swipe Gestures (Telegram-native) 👆

- **Reply to approval message** → Auto-context for approve/reject
- **React with 👍** → Quick approve
- **React with 👎** → Quick reject
- **React with 👀** → Request diff

### 6. Contextual Notifications 🔔

Smart notifications with rich context:

```
🔧 Agent-2 needs approval

Action: Write new file
File: src/services/payments.ts
Lines: 127
Risk: HIGH (new API integration)

Preview:
import Stripe from 'stripe';
...
[View Full Diff]

[✅ Approve] [❌ Reject] [⏸️ Pause]
```

---

## Architecture

### Voice Command Flow

```
User sends voice note
    ↓
Telegram API provides file_id
    ↓
Download audio via Bot API
    ↓
Send to OpenAI Whisper API
    ↓
Transcribe to text
    ↓
Parse intent (approve/reject/command/query)
    ↓
Execute action + respond
```

### Photo-to-Task Flow

```
User sends photo with caption
    ↓
Telegram API provides photo + text
    ↓
Download image via Bot API
    ↓
Send to Claude Vision API
    ↓
Extract: diagrams, code, text, sketches
    ↓
Generate structured task
    ↓
Create conversation + session
    ↓
Respond with plan + options
```

### Inline Keyboard Flow

```
Agent requests approval
    ↓
Generate inline keyboard markup
    ↓
Send via Telegram with buttons
    ↓
User taps button
    ↓
Telegram sends callback_query
    ↓
Update approval record
    ↓
Edit message to show result
    ↓
Agent proceeds/stops
```

---

## Database Schema Changes

### New Table: `voice_commands`

Track voice interactions for analytics:

```sql
CREATE TABLE voice_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES remote_agent_conversations(id),
  telegram_file_id VARCHAR(255) NOT NULL,
  audio_duration_seconds INT,
  transcription TEXT NOT NULL,
  intent VARCHAR(50), -- 'approve', 'reject', 'command', 'query'
  confidence FLOAT, -- 0-1 from speech recognition
  executed_command TEXT,
  success BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_commands_conversation ON voice_commands(conversation_id);
CREATE INDEX idx_voice_commands_intent ON voice_commands(intent);
```

### New Table: `vision_tasks`

Track photo-based task creation:

```sql
CREATE TABLE vision_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES remote_agent_conversations(id),
  telegram_file_id VARCHAR(255) NOT NULL,
  caption TEXT,
  vision_analysis JSONB NOT NULL, -- Claude Vision response
  extracted_content TEXT,
  task_type VARCHAR(50), -- 'plan', 'debug', 'implement', 'review'
  generated_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vision_tasks_conversation ON vision_tasks(conversation_id);
```

### Extend `remote_agent_approvals`

Add fields for V2 features:

```sql
ALTER TABLE remote_agent_approvals
  ADD COLUMN approval_method VARCHAR(50), -- 'command', 'voice', 'button', 'reaction'
  ADD COLUMN voice_command_id UUID REFERENCES voice_commands(id),
  ADD COLUMN response_time_ms INT; -- Time to approve/reject
```

---

## Implementation Plan

### Phase 1: Voice Commands (Days 1-2)

**1.1 Add Whisper Integration**

Install OpenAI SDK:

```bash
bun add openai
```

Create `src/services/voice-transcription.ts`:

```typescript
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface VoiceTranscription {
  text: string;
  duration: number;
  confidence?: number;
}

export async function transcribeVoiceMessage(audioFilePath: string): Promise<VoiceTranscription> {
  const audioFile = await fs.readFile(audioFilePath);

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'en', // Or detect automatically
    response_format: 'verbose_json', // Includes confidence
  });

  return {
    text: response.text,
    duration: response.duration,
    confidence: response.confidence,
  };
}
```

**1.2 Add Voice Message Handler**

Update `src/adapters/telegram.ts`:

```typescript
// Listen for voice messages
this.bot.on('voice', async msg => {
  const chatId = msg.chat.id;
  const conversationId = chatId.toString();

  // Download audio file
  const fileId = msg.voice.file_id;
  const file = await this.bot.getFile(fileId);
  const filePath = await this.bot.downloadFile(fileId, '/tmp');

  // Transcribe
  const transcription = await transcribeVoiceMessage(filePath);

  // Parse intent
  const intent = await parseVoiceIntent(transcription.text);

  // Execute
  await this.handleVoiceCommand(conversationId, intent, transcription);

  // Cleanup
  await fs.unlink(filePath);
});
```

**1.3 Create Intent Parser**

Create `src/services/voice-intent-parser.ts`:

```typescript
export interface VoiceIntent {
  type: 'approve' | 'reject' | 'command' | 'query' | 'unknown';
  command?: string;
  args?: string[];
  confidence: number;
}

const INTENT_PATTERNS = {
  approve: /^(approve|yes|okay|ok|do it|proceed|go ahead)$/i,
  reject: /^(reject|no|cancel|stop|don't|abort)$/i,
  status: /^(status|state|pool|agents|what's happening)$/i,
  diff: /^(diff|show|preview|changes|what changed)$/i,
  command: /^(plan|execute|commit|review|fix)\s+(.+)$/i,
};

export async function parseVoiceIntent(text: string): Promise<VoiceIntent> {
  const normalized = text.trim().toLowerCase();

  // Check patterns
  if (INTENT_PATTERNS.approve.test(normalized)) {
    return { type: 'approve', confidence: 0.95 };
  }

  if (INTENT_PATTERNS.reject.test(normalized)) {
    return { type: 'reject', confidence: 0.95 };
  }

  if (INTENT_PATTERNS.status.test(normalized)) {
    return { type: 'query', command: 'status', confidence: 0.9 };
  }

  if (INTENT_PATTERNS.diff.test(normalized)) {
    return { type: 'query', command: 'diff', confidence: 0.9 };
  }

  const commandMatch = normalized.match(INTENT_PATTERNS.command);
  if (commandMatch) {
    return {
      type: 'command',
      command: commandMatch[1],
      args: [commandMatch[2]],
      confidence: 0.85,
    };
  }

  // Fallback: Use Claude to interpret
  return await parseWithClaude(text);
}

async function parseWithClaude(text: string): Promise<VoiceIntent> {
  // Use Claude to interpret unclear voice commands
  const prompt = `Parse this voice command: "${text}"

  Intent types: approve, reject, command, query
  Commands: plan, execute, commit, review, fix, status

  Return JSON: { type, command?, args?, confidence }`;

  // ... call Claude API
}
```

---

### Phase 2: Inline Quick Actions (Day 2)

**2.1 Create Inline Keyboard Builder**

Create `src/adapters/telegram/keyboards.ts`:

```typescript
import { InlineKeyboardMarkup, InlineKeyboardButton } from 'node-telegram-bot-api';

export function buildApprovalKeyboard(approvalId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${approvalId}` },
        { text: '❌ Reject', callback_data: `reject:${approvalId}` },
      ],
      [
        { text: '👁️ Show Diff', callback_data: `diff:${approvalId}` },
        { text: '⏸️ Pause Agent', callback_data: `pause:${approvalId}` },
      ],
    ],
  };
}

export function buildTaskActionKeyboard(taskId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '▶️ Execute', callback_data: `task:execute:${taskId}` },
        { text: '📝 Edit', callback_data: `task:edit:${taskId}` },
      ],
      [{ text: '🗑️ Cancel', callback_data: `task:cancel:${taskId}` }],
    ],
  };
}

export function buildPoolStatusKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Refresh', callback_data: 'pool:refresh' },
        { text: '📊 Full Stats', callback_data: 'pool:stats' },
      ],
      [{ text: '⏹️ Stop All', callback_data: 'pool:stop_all' }],
    ],
  };
}
```

**2.2 Handle Callback Queries**

Update `src/adapters/telegram.ts`:

```typescript
// Listen for button clicks
this.bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!data || !chatId || !messageId) return;

  const [action, ...params] = data.split(':');

  try {
    switch (action) {
      case 'approve':
        await this.handleApprovalButton(chatId, messageId, params[0], true);
        break;
      case 'reject':
        await this.handleApprovalButton(chatId, messageId, params[0], false);
        break;
      case 'diff':
        await this.handleDiffRequest(chatId, params[0]);
        break;
      case 'pause':
        await this.handlePauseAgent(chatId, params[0]);
        break;
      case 'pool':
        await this.handlePoolAction(chatId, params[0]);
        break;
      default:
        await this.bot.answerCallbackQuery(query.id, {
          text: 'Unknown action'
        });
    }

    // Acknowledge button click
    await this.bot.answerCallbackQuery(query.id);

  } catch (error) {
    console.error('[Telegram] Callback error', { error, data });
    await this.bot.answerCallbackQuery(query.id, {
      text: '❌ Error processing action',
      show_alert: true
    });
  }
});

private async handleApprovalButton(
  chatId: number,
  messageId: number,
  approvalId: string,
  approved: boolean
): Promise<void> {
  // Update approval in database
  await updateApproval(approvalId, {
    approved,
    approvalMethod: 'button',
    respondedAt: new Date()
  });

  // Edit message to show result
  const text = approved
    ? '✅ Approved - Agent proceeding...'
    : '❌ Rejected - Agent stopped';

  await this.bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId
  });

  // Notify waiting agent
  await this.approvalEmitter.emit('approval', {
    approvalId,
    approved
  });
}
```

**2.3 Send Approvals with Keyboards**

Update approval request sending:

```typescript
async function requestApproval(
  conversationId: string,
  toolName: string,
  toolArgs: object
): Promise<ApprovalResponse> {
  const approval = await createApproval({
    conversationId,
    toolName,
    toolArgs,
  });

  const keyboard = buildApprovalKeyboard(approval.id);

  const message = `🔧 Agent needs approval

Tool: ${toolName}
${formatToolPreview(toolName, toolArgs)}

[Timeout: 5 minutes]`;

  await platform.sendMessage(conversationId, message, {
    reply_markup: keyboard,
  });

  return waitForApproval(approval.id);
}
```

---

### Phase 3: Rich Code Previews (Day 3)

**3.1 Create Diff Formatter**

Create `src/services/diff-formatter.ts`:

```typescript
import { diffLines } from 'diff';

export interface DiffPreview {
  summary: string;
  preview: string; // First 20 lines
  stats: {
    additions: number;
    deletions: number;
    files: number;
  };
}

export function formatDiffPreview(
  oldContent: string,
  newContent: string,
  maxLines: number = 20
): DiffPreview {
  const diff = diffLines(oldContent, newContent);

  let additions = 0;
  let deletions = 0;
  const lines: string[] = [];

  for (const part of diff) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' ';
    const color = part.added ? '🟢' : part.removed ? '🔴' : '';

    if (part.added) additions += part.count || 0;
    if (part.removed) deletions += part.count || 0;

    const partLines = part.value.split('\n').filter(l => l.length > 0);
    for (const line of partLines.slice(0, maxLines - lines.length)) {
      lines.push(`${color}${prefix} ${line}`);
    }

    if (lines.length >= maxLines) break;
  }

  return {
    summary: `+${additions} -${deletions}`,
    preview: lines.join('\n'),
    stats: { additions, deletions, files: 1 },
  };
}

export function formatMultiFileDiff(
  files: Array<{
    path: string;
    oldContent: string;
    newContent: string;
  }>
): string {
  const previews = files.map(file => {
    const diff = formatDiffPreview(file.oldContent, file.newContent, 10);
    return `📄 ${file.path}\n${diff.summary}\n\`\`\`\n${diff.preview}\n\`\`\``;
  });

  return previews.join('\n\n');
}
```

**3.2 Enhance Approval Previews**

Update approval message formatting:

```typescript
function formatToolPreview(toolName: string, toolArgs: object): string {
  switch (toolName) {
    case 'Write':
      return formatWritePreview(toolArgs as WriteArgs);
    case 'Edit':
      return formatEditPreview(toolArgs as EditArgs);
    case 'Bash':
      return formatBashPreview(toolArgs as BashArgs);
    default:
      return JSON.stringify(toolArgs, null, 2);
  }
}

function formatEditPreview(args: EditArgs): string {
  const { file_path, old_string, new_string } = args;
  const diff = formatDiffPreview(old_string, new_string, 10);

  return `File: ${file_path}
${diff.summary}

Preview:
\`\`\`diff
${diff.preview}
\`\`\`

[View full diff]`;
}

function formatWritePreview(args: WriteArgs): string {
  const { file_path, content } = args;
  const lines = content.split('\n');
  const preview = lines.slice(0, 15).join('\n');
  const truncated = lines.length > 15;

  return `File: ${file_path}
Lines: ${lines.length}
Risk: ${content.includes('password') || content.includes('secret') ? 'HIGH' : 'MEDIUM'}

Preview:
\`\`\`
${preview}
${truncated ? '\n... (truncated)' : ''}
\`\`\``;
}
```

---

### Phase 4: Photo-to-Task (Days 3-4)

**4.1 Add Vision API Integration**

Create `src/services/vision-analyzer.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export interface VisionAnalysis {
  type: 'diagram' | 'code' | 'screenshot' | 'notes' | 'unknown';
  description: string;
  extractedText: string;
  suggestedTasks: string[];
  confidence: number;
}

export async function analyzeImage(imagePath: string, caption?: string): Promise<VisionAnalysis> {
  const imageData = await fs.readFile(imagePath);
  const base64Image = imageData.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: `Analyze this image for software development context.
${caption ? `User says: "${caption}"` : ''}

Identify:
1. What is this? (diagram/code/screenshot/notes)
2. Extract any text, code, or key information
3. Suggest 3 actionable coding tasks based on this

Return JSON:
{
  "type": "diagram|code|screenshot|notes|unknown",
  "description": "What you see",
  "extractedText": "Any text/code found",
  "suggestedTasks": ["task1", "task2", "task3"],
  "confidence": 0.0-1.0
}`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  return JSON.parse(content.text);
}
```

**4.2 Add Photo Handler**

Update `src/adapters/telegram.ts`:

```typescript
// Listen for photos
this.bot.on('photo', async msg => {
  const chatId = msg.chat.id;
  const conversationId = chatId.toString();
  const caption = msg.caption || '';

  // Get highest resolution photo
  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;

  // Download image
  const filePath = await this.bot.downloadFile(fileId, '/tmp');

  // Send thinking message
  const thinkingMsg = await this.bot.sendMessage(chatId, '🔍 Analyzing image...');

  try {
    // Analyze with Claude Vision
    const analysis = await analyzeImage(filePath, caption);

    // Store in database
    await createVisionTask({
      conversationId,
      telegramFileId: fileId,
      caption,
      visionAnalysis: analysis,
    });

    // Generate response
    const response = formatVisionResponse(analysis);

    // Delete thinking message
    await this.bot.deleteMessage(chatId, thinkingMsg.message_id);

    // Send result with action buttons
    const keyboard = buildVisionTaskKeyboard(analysis);
    await this.bot.sendMessage(chatId, response, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('[Vision] Analysis failed', { error });
    await this.bot.editMessageText('❌ Failed to analyze image. Try again with a clearer photo.', {
      chat_id: chatId,
      message_id: thinkingMsg.message_id,
    });
  } finally {
    await fs.unlink(filePath);
  }
});
```

**4.3 Create Vision Task Actions**

Create `src/handlers/vision-handler.ts`:

```typescript
export function formatVisionResponse(analysis: VisionAnalysis): string {
  const emoji = {
    diagram: '📐',
    code: '💻',
    screenshot: '📸',
    notes: '📝',
    unknown: '❓',
  }[analysis.type];

  let response = `${emoji} I see: **${analysis.type}**\n\n`;
  response += `${analysis.description}\n\n`;

  if (analysis.extractedText) {
    response += `**Extracted:**\n\`\`\`\n${analysis.extractedText}\n\`\`\`\n\n`;
  }

  response += `**Suggested tasks:**\n`;
  analysis.suggestedTasks.forEach((task, i) => {
    response += `${i + 1}. ${task}\n`;
  });

  return response;
}

export function buildVisionTaskKeyboard(analysis: VisionAnalysis): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      analysis.suggestedTasks.slice(0, 2).map((task, i) => ({
        text: `${i + 1}. ${task.substring(0, 30)}...`,
        callback_data: `vision:task:${i}`,
      })),
      [
        { text: '📝 Custom Task', callback_data: 'vision:custom' },
        { text: '❌ Ignore', callback_data: 'vision:ignore' },
      ],
    ],
  };
}

export async function executeVisionTask(
  conversationId: string,
  taskIndex: number,
  analysis: VisionAnalysis
): Promise<void> {
  const task = analysis.suggestedTasks[taskIndex];

  // Create a new conversation session with this task
  const prompt = `Based on this image analysis:
${analysis.description}

${analysis.extractedText ? `Extracted content:\n${analysis.extractedText}\n\n` : ''}

Task: ${task}

Create an implementation plan.`;

  // Route to orchestrator
  await orchestrator.handleMessage({
    conversationId,
    message: `/command-invoke plan "${task}"`,
    metadata: {
      source: 'vision',
      visionAnalysis: analysis,
    },
  });
}
```

---

### Phase 5: Reaction-Based Quick Actions (Day 4)

**4.1 Handle Message Reactions**

Telegram doesn't support reactions via Bot API (yet), but we can use **reply-to-message** pattern:

```typescript
// Alternative: Quick reply parsing
this.bot.on('message', async msg => {
  if (msg.reply_to_message) {
    const replyTo = msg.reply_to_message;
    const text = msg.text?.toLowerCase();

    // Check if replying to approval request
    if (replyTo.text?.includes('Agent needs approval')) {
      if (text === '👍' || text === 'yes' || text === 'y') {
        await handleQuickApprove(msg.chat.id, replyTo);
      } else if (text === '👎' || text === 'no' || text === 'n') {
        await handleQuickReject(msg.chat.id, replyTo);
      }
    }
  }
});
```

**4.2 Emoji Shortcuts**

Support emoji-only responses:

```typescript
const EMOJI_ACTIONS: Record<string, string> = {
  '👍': 'approve',
  '✅': 'approve',
  '👎': 'reject',
  '❌': 'reject',
  '👀': 'show_diff',
  '⏸️': 'pause',
  '▶️': 'resume',
  '🔄': 'refresh',
};

function parseEmojiAction(text: string): string | null {
  return EMOJI_ACTIONS[text.trim()] || null;
}
```

---

### Phase 6: Smart Notifications (Day 5)

**6.1 Create Notification Service**

Create `src/services/notifications.ts`:

```typescript
export interface NotificationContext {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'approval' | 'task' | 'error' | 'info';
  actionable: boolean;
  preview?: string;
  metadata?: object;
}

export async function sendSmartNotification(
  conversationId: string,
  title: string,
  message: string,
  context: NotificationContext
): Promise<void> {
  const platform = getPlatform(conversationId);

  // Format based on priority and category
  const emoji = getPriorityEmoji(context.priority);
  const formattedTitle = `${emoji} ${title}`;

  let fullMessage = `**${formattedTitle}**\n\n${message}`;

  // Add preview if available
  if (context.preview) {
    fullMessage += `\n\n\`\`\`\n${context.preview}\n\`\`\``;
  }

  // Add action buttons if actionable
  const keyboard = context.actionable ? buildContextualKeyboard(context) : undefined;

  await platform.sendMessage(conversationId, fullMessage, {
    reply_markup: keyboard,
    parse_mode: 'Markdown',
    disable_notification: context.priority === 'low',
  });
}

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '🔔';
    case 'low':
      return 'ℹ️';
    default:
      return '📢';
  }
}
```

**6.2 Context-Aware Notification Templates**

Create `src/services/notification-templates.ts`:

```typescript
export function notifyTaskComplete(
  taskId: string,
  summary: string,
  stats: TaskStats
): NotificationContext {
  return {
    priority: 'medium',
    category: 'task',
    actionable: true,
    preview: summary,
    metadata: { taskId, stats },
  };
}

export function notifyAgentError(
  error: Error,
  agentId: string,
  context: string
): NotificationContext {
  return {
    priority: 'high',
    category: 'error',
    actionable: true,
    preview: error.message,
    metadata: { agentId, context, stack: error.stack },
  };
}

export function notifyHighRiskAction(
  toolName: string,
  impact: string,
  preview: string
): NotificationContext {
  return {
    priority: 'critical',
    category: 'approval',
    actionable: true,
    preview,
    metadata: { toolName, impact },
  };
}
```

---

## Environment Variables

Add to `.env`:

```env
# Voice Commands
OPENAI_API_KEY=sk-...                    # For Whisper transcription
VOICE_COMMANDS_ENABLED=true
VOICE_CONFIDENCE_THRESHOLD=0.7           # Min confidence to execute
VOICE_MAX_DURATION_SECONDS=30            # Reject longer voice notes

# Vision Analysis
VISION_ENABLED=true
VISION_MAX_IMAGE_SIZE_MB=10              # Max file size
VISION_SUPPORTED_FORMATS=jpg,png,webp

# Quick Actions
INLINE_KEYBOARDS_ENABLED=true
REACTION_SHORTCUTS_ENABLED=true

# Notifications
SMART_NOTIFICATIONS_ENABLED=true
NOTIFICATION_SOUND=true                  # Enable notification sounds
NOTIFICATION_PREVIEW_LINES=15            # Lines in code preview

# V1 Settings (keep existing)
BLOCKING_APPROVALS=true
APPROVAL_TIMEOUT_MS=300000
NOTIFY_ON_RISK_TOOLS=true
```

---

## Testing Strategy

### Unit Tests

**Voice Command Parsing:**

```typescript
describe('VoiceIntentParser', () => {
  it('should parse approve command', () => {
    expect(parseVoiceIntent('approve')).toEqual({
      type: 'approve',
      confidence: 0.95,
    });
  });

  it('should parse plan command with args', () => {
    expect(parseVoiceIntent('plan add dark mode')).toEqual({
      type: 'command',
      command: 'plan',
      args: ['add dark mode'],
      confidence: 0.85,
    });
  });
});
```

**Diff Formatting:**

```typescript
describe('DiffFormatter', () => {
  it('should format diff preview', () => {
    const diff = formatDiffPreview('old\ncode', 'new\ncode');
    expect(diff.stats.additions).toBe(1);
    expect(diff.stats.deletions).toBe(1);
  });
});
```

**Vision Analysis:**

```typescript
describe('VisionAnalyzer', () => {
  it('should identify diagram', async () => {
    const analysis = await analyzeImage('./test/fixtures/diagram.png');
    expect(analysis.type).toBe('diagram');
  });
});
```

### Integration Tests

**Voice → Execution Flow:**

```typescript
describe('Voice Command Flow', () => {
  it('should execute voice approval', async () => {
    // 1. Create pending approval
    const approval = await createApproval({ ... });

    // 2. Send voice note
    const voiceNote = createMockVoiceNote('approve');
    await telegram.handleVoiceMessage(voiceNote);

    // 3. Verify approval updated
    const updated = await getApproval(approval.id);
    expect(updated.approved).toBe(true);
    expect(updated.approvalMethod).toBe('voice');
  });
});
```

**Photo → Task Creation:**

```typescript
describe('Vision Task Flow', () => {
  it('should create task from whiteboard photo', async () => {
    const photo = './test/fixtures/whiteboard.jpg';
    const result = await handlePhotoMessage(photo, 'implement this');

    expect(result.visionAnalysis.type).toBe('diagram');
    expect(result.suggestedTasks.length).toBeGreaterThan(0);
  });
});
```

### Manual Testing

**Voice Commands:**

```bash
# 1. Start app with voice enabled
VOICE_COMMANDS_ENABLED=true bun run dev

# 2. In Telegram:
# - Send voice note: "approve"
# - Send voice note: "plan add authentication"
# - Send voice note: "status"

# 3. Verify transcription and execution in logs
```

**Photo Tasks:**

```bash
# 1. Take photo of whiteboard sketch
# 2. Send to Telegram bot with caption "implement this"
# 3. Verify:
#    - Vision analysis returned
#    - Tasks suggested
#    - Keyboard buttons appear
# 4. Click task button
# 5. Verify agent starts planning
```

**Inline Keyboards:**

```bash
# 1. Trigger approval request
# 2. Verify inline buttons appear
# 3. Click "Approve" button
# 4. Verify:
#    - Message updates immediately
#    - Agent proceeds
#    - Response time logged
```

---

## Migration Path

### V1 → V2 Upgrade

**Backwards Compatible:** All V1 features continue to work.

**Enable V2 Features Incrementally:**

```env
# Start with just voice
VOICE_COMMANDS_ENABLED=true

# Add inline keyboards
INLINE_KEYBOARDS_ENABLED=true

# Add vision (requires Claude API)
VISION_ENABLED=true

# Full V2
SMART_NOTIFICATIONS_ENABLED=true
```

**Database Migration:**

```bash
# Apply new tables
psql $DATABASE_URL < migrations/011_phone_vibecoding_v2.sql
```

---

## Files to Create/Modify

### New Services

- `src/services/voice-transcription.ts` - Whisper integration
- `src/services/voice-intent-parser.ts` - Parse voice commands
- `src/services/vision-analyzer.ts` - Claude Vision integration
- `src/services/diff-formatter.ts` - Code diff rendering
- `src/services/notifications.ts` - Smart notification system
- `src/services/notification-templates.ts` - Notification builders

### New Handlers

- `src/handlers/vision-handler.ts` - Photo-to-task logic
- `src/adapters/telegram/keyboards.ts` - Inline keyboard builders

### Modify Existing

- `src/adapters/telegram.ts` - Add voice/photo/callback handlers
- `src/handlers/approval-handler.ts` - Support new approval methods
- `src/db/approvals.ts` - Track approval methods and timing

### Database

- `migrations/011_phone_vibecoding_v2.sql` - New tables + columns

### Tests

- `src/services/voice-intent-parser.test.ts`
- `src/services/vision-analyzer.test.ts`
- `src/services/diff-formatter.test.ts`
- `src/handlers/vision-handler.test.ts`

### Documentation

- `docs/phone-vibecoding-v2.md` - Usage guide
- Update `docs/phone-vibecoding-v1.md` - Mark as superseded
- Update `README.md` - Add V2 features section

---

## Success Criteria

**Voice Commands:**

- [ ] Voice note transcribed and executed in < 3 seconds
- [ ] 90%+ accuracy on standard commands (approve/reject/status)
- [ ] Fallback to Claude interpretation for complex commands

**Inline Actions:**

- [ ] All approval requests have inline keyboards
- [ ] Button clicks execute in < 1 second
- [ ] Message updates show result immediately

**Code Previews:**

- [ ] Diffs render with syntax highlighting
- [ ] Preview shows first 15 lines with stats (+/-)
- [ ] Full diff available on request

**Photo Tasks:**

- [ ] Image analyzed and tasks suggested in < 5 seconds
- [ ] 80%+ accuracy on diagram/code/notes classification
- [ ] Task execution integrates with existing workflows

**Notifications:**

- [ ] Priority levels respected (critical = sound, low = silent)
- [ ] Context-rich previews in all notifications
- [ ] Actionable notifications have appropriate buttons

---

## User Experience Flows

### Flow 1: Voice Approval (Hands-Free)

```
User: *driving, gets notification*
User: *sends voice note* "approve"
    ↓
Agent: *transcribes* "approve"
Agent: *recognizes intent* approve (95% confidence)
Agent: *updates approval* ✅
Agent: *proceeds with task*
User: *receives confirmation* "✅ Approved - Agent proceeding"
```

**Time:** < 3 seconds from voice to execution

---

### Flow 2: Photo-to-Implementation

```
User: *at whiteboard meeting*
User: *takes photo of architecture sketch*
User: *sends to Telegram* "implement this"
    ↓
Agent: *analyzes image*
Agent: "📐 I see: diagram
       System architecture for auth flow

       Suggested tasks:
       1. Create authentication service
       2. Add JWT token validation
       3. Implement user session management"

       [1. Create auth...] [2. Add JWT...]
       [📝 Custom Task] [❌ Ignore]
User: *taps button 1*
    ↓
Agent: *starts planning* "Creating implementation plan for authentication service..."
```

**Time:** < 5 seconds from photo to plan start

---

### Flow 3: One-Tap Approval

```
Agent: "🔧 Agent-2 needs approval

       Tool: Edit
       File: src/api/auth.ts

       🟢+ Add JWT validation
       🔴- Remove session check

       [✅ Approve] [❌ Reject] [👁️ Diff]"

User: *taps Approve button*
    ↓
Message: *updates instantly* "✅ Approved - Agent proceeding..."
Agent: *executes edit*
Agent: *continues workflow*
```

**Time:** < 1 second from button click to execution

---

## Performance Targets

| Metric                         | Target  | Current (V1) |
| ------------------------------ | ------- | ------------ |
| Voice transcription            | < 3s    | N/A          |
| Button response                | < 1s    | N/A          |
| Vision analysis                | < 5s    | N/A          |
| Approval notification delivery | < 500ms | ~1s          |
| Code preview generation        | < 2s    | N/A          |

---

## Cost Analysis

### Per-Feature Costs (Monthly, Active User)

**Voice Commands:**

- Whisper API: ~$0.006/minute
- Average 50 voice commands/month × 10s each = ~$0.05/user/month

**Vision Analysis:**

- Claude Vision: ~$0.012 per image
- Average 20 photos/month = ~$0.24/user/month

**Total V2 Overhead:** ~$0.30/user/month

**ROI:** Time saved from faster approvals + hands-free coding >>> costs

---

## Future Enhancements (Post-V2)

### V3 Ideas

**1. Multi-Language Voice:**

- Support Spanish, French, German, Chinese
- Auto-detect language per voice note

**2. Collaborative Photo Tasks:**

- Multiple users annotate same photo
- Real-time collaboration on whiteboard designs

**3. Voice Streaming:**

- Real-time transcription as you speak
- Interrupt with "stop" or "cancel"

**4. Smart Photo Context:**

- Remember previous photos in conversation
- "Implement the left part of that diagram I sent earlier"

**5. AR Code Preview:**

- Overlay diffs on actual code (mobile AR)
- Point phone at screen, see suggested changes

**6. Gesture Controls:**

- Shake phone to pause all agents
- Swipe notification to quick-approve

---

## Risks & Mitigations

| Risk                    | Impact                | Mitigation                               |
| ----------------------- | --------------------- | ---------------------------------------- |
| Whisper API latency     | Slow voice commands   | Cache common phrases, timeout at 5s      |
| Vision API cost         | High for power users  | Rate limit: 50 photos/day                |
| Inline keyboard spam    | Too many buttons      | Max 2 rows, collapse after timeout       |
| Voice misinterpretation | Wrong action executed | Require confirmation for destructive ops |
| Image upload failures   | Poor UX               | Retry with exponential backoff           |

---

## Dependencies

### New Packages

```bash
bun add openai          # Whisper transcription
bun add diff            # Diff generation
# @anthropic-ai/sdk already installed (for Vision)
```

### API Requirements

- OpenAI API key (Whisper)
- Claude API key (Vision - already have)
- Telegram Bot API (already have)

---

## Timeline Estimate

| Phase                   | Duration | Cumulative |
| ----------------------- | -------- | ---------- |
| 1. Voice Commands       | 1.5 days | 1.5 days   |
| 2. Inline Quick Actions | 1 day    | 2.5 days   |
| 3. Rich Code Previews   | 1 day    | 3.5 days   |
| 4. Photo-to-Task        | 1.5 days | 5 days     |
| 5. Reaction Shortcuts   | 0.5 days | 5.5 days   |
| 6. Smart Notifications  | 1 day    | 6.5 days   |
| Testing & Polish        | 1 day    | 7.5 days   |

**Total:** ~6-8 days for complete V2 implementation

---

## Next Steps

1. **Create branch:** `feat/phone-vibecoding-v2`
2. **Apply database migration** (add new tables)
3. **Implement Phase 1** (voice commands)
4. **Test with real voice notes**
5. **Iterate through remaining phases**

---

**Let's make mobile coding feel native! 📱💻**
