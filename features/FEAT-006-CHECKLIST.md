# FEAT-006 Implementation Checklist

**Feature:** Phone Vibecoding V2
**Estimated Duration:** 6-8 days
**Started:** TBD
**Status:** Not Started

---

## Pre-Implementation Setup

- [ ] Create feature branch: `feat/phone-vibecoding-v2`
- [ ] Apply database migration `011_phone_vibecoding_v2.sql`
- [ ] Verify migration applied successfully
- [ ] Add environment variables to `.env.example`
- [ ] Obtain OpenAI API key for Whisper
- [ ] Test Claude Vision API access (should already work)

---

## Phase 1: Voice Commands (Days 1-2)

### Setup
- [ ] Install OpenAI SDK: `bun add openai`
- [ ] Add `OPENAI_API_KEY` to `.env`
- [ ] Configure voice command settings in env

### Core Implementation
- [ ] Create `src/services/voice-transcription.ts`
  - [ ] Implement `transcribeVoiceMessage()` function
  - [ ] Add audio file download helper
  - [ ] Handle Whisper API errors gracefully
  - [ ] Add timeout (max 30s audio)

- [ ] Create `src/services/voice-intent-parser.ts`
  - [ ] Implement regex patterns for common commands
  - [ ] Add `parseVoiceIntent()` function
  - [ ] Implement Claude fallback for unclear commands
  - [ ] Add confidence scoring

- [ ] Update `src/adapters/telegram.ts`
  - [ ] Add voice message handler (`bot.on('voice')`)
  - [ ] Integrate transcription service
  - [ ] Integrate intent parser
  - [ ] Handle voice command execution
  - [ ] Clean up temp audio files

### Database Operations
- [ ] Create `src/db/voice-commands.ts`
  - [ ] `createVoiceCommand()` - Store transcription
  - [ ] `getVoiceCommandsByConversation()` - History
  - [ ] `getVoiceCommandStats()` - Analytics

### Testing
- [ ] Unit tests for intent parser
  - [ ] Test approve/reject patterns
  - [ ] Test command parsing
  - [ ] Test confidence calculation
- [ ] Integration test: voice → transcription → execution
- [ ] Manual test with real voice notes

### Validation
- [ ] Voice transcription < 3s
- [ ] 90%+ accuracy on standard commands
- [ ] Fallback to Claude for complex commands works
- [ ] Audio files cleaned up after processing

---

## Phase 2: Inline Quick Actions (Day 2)

### Core Implementation
- [ ] Create `src/adapters/telegram/keyboards.ts`
  - [ ] `buildApprovalKeyboard()` - Approve/reject/diff buttons
  - [ ] `buildTaskActionKeyboard()` - Execute/edit/cancel
  - [ ] `buildPoolStatusKeyboard()` - Refresh/stats
  - [ ] `buildVisionTaskKeyboard()` - Task selection

- [ ] Update `src/adapters/telegram.ts`
  - [ ] Add callback query handler (`bot.on('callback_query')`)
  - [ ] Implement button action routing
  - [ ] Add `handleApprovalButton()`
  - [ ] Add `handleDiffRequest()`
  - [ ] Add `handlePauseAgent()`
  - [ ] Add `handlePoolAction()`
  - [ ] Answer callback queries (prevent "loading" state)

### Update Approvals
- [ ] Modify `src/handlers/approval-handler.ts`
  - [ ] Send approvals with inline keyboards
  - [ ] Update approval method tracking
  - [ ] Edit message on approval/rejection
  - [ ] Handle keyboard interactions

### Testing
- [ ] Unit tests for keyboard builders
- [ ] Integration test: button click → approval
- [ ] Manual test: verify buttons appear and work
- [ ] Test message editing after approval

### Validation
- [ ] All approval requests have inline keyboards
- [ ] Button clicks execute in < 1s
- [ ] Messages update to show result
- [ ] Approval method tracked correctly

---

## Phase 3: Rich Code Previews (Day 3)

### Core Implementation
- [ ] Install diff library: `bun add diff`
- [ ] Create `src/services/diff-formatter.ts`
  - [ ] `formatDiffPreview()` - Single file diff
  - [ ] `formatMultiFileDiff()` - Multiple files
  - [ ] `calculateDiffStats()` - +/- counts
  - [ ] Add syntax highlighting (optional)

- [ ] Create `src/services/code-preview.ts`
  - [ ] `formatToolPreview()` - Router for tool types
  - [ ] `formatEditPreview()` - Edit tool preview
  - [ ] `formatWritePreview()` - Write tool preview
  - [ ] `formatBashPreview()` - Bash command preview
  - [ ] `truncatePreview()` - Limit lines

### Update Approvals
- [ ] Modify approval message formatting
  - [ ] Include code preview in approval requests
  - [ ] Add diff stats (+X -Y)
  - [ ] Format with markdown code blocks
  - [ ] Add "View full diff" button

### Testing
- [ ] Unit tests for diff formatting
  - [ ] Test additions/deletions counting
  - [ ] Test truncation at line limit
  - [ ] Test multi-file diffs
- [ ] Integration test: approval with preview
- [ ] Manual test: verify previews render correctly

### Validation
- [ ] Diffs show +/- lines clearly
- [ ] Preview limited to 15 lines
- [ ] Full diff available on request
- [ ] Code formatting preserved

---

## Phase 4: Photo-to-Task (Days 3-4)

### Core Implementation
- [ ] Create `src/services/vision-analyzer.ts`
  - [ ] `analyzeImage()` - Claude Vision integration
  - [ ] Parse vision response
  - [ ] Extract structured data
  - [ ] Handle image download/cleanup

- [ ] Create `src/handlers/vision-handler.ts`
  - [ ] `formatVisionResponse()` - User-friendly output
  - [ ] `buildVisionTaskKeyboard()` - Task buttons
  - [ ] `executeVisionTask()` - Start task execution

- [ ] Update `src/adapters/telegram.ts`
  - [ ] Add photo handler (`bot.on('photo')`)
  - [ ] Download highest resolution image
  - [ ] Send "analyzing..." message
  - [ ] Call vision analyzer
  - [ ] Display results with keyboard
  - [ ] Handle task selection callbacks

### Database Operations
- [ ] Create `src/db/vision-tasks.ts`
  - [ ] `createVisionTask()` - Store analysis
  - [ ] `getVisionTasksByConversation()` - History
  - [ ] `markVisionTaskExecuted()` - Track execution
  - [ ] `getVisionTaskStats()` - Analytics

### Testing
- [ ] Unit tests for vision response formatting
- [ ] Integration test: photo → analysis → task creation
- [ ] Manual tests with different image types:
  - [ ] Whiteboard diagram
  - [ ] Code screenshot
  - [ ] Handwritten notes
  - [ ] Architecture diagram

### Validation
- [ ] Image analysis < 5s
- [ ] 80%+ accuracy on type classification
- [ ] Tasks suggested are relevant
- [ ] Integration with orchestrator works

---

## Phase 5: Reaction Shortcuts (Day 4)

### Core Implementation
- [ ] Add emoji action mapping
- [ ] Implement reply-to-message pattern
- [ ] Add quick approval via emoji response

- [ ] Update `src/adapters/telegram.ts`
  - [ ] Detect reply to approval message
  - [ ] Parse emoji shortcuts (👍/👎/👀/⏸️/▶️)
  - [ ] Execute corresponding actions
  - [ ] Maintain context from replied message

### Testing
- [ ] Unit tests for emoji parsing
- [ ] Integration test: reply with emoji → action
- [ ] Manual test: verify shortcuts work

### Validation
- [ ] Emoji responses execute correct actions
- [ ] Context maintained from original message
- [ ] Works alongside button interactions

---

## Phase 6: Smart Notifications (Day 5)

### Core Implementation
- [ ] Create `src/services/notifications.ts`
  - [ ] `sendSmartNotification()` - Main sender
  - [ ] `getPriorityEmoji()` - Priority indicators
  - [ ] `buildContextualKeyboard()` - Context-aware buttons
  - [ ] `formatNotificationMessage()` - Rich formatting

- [ ] Create `src/services/notification-templates.ts`
  - [ ] `notifyTaskComplete()` - Task completion
  - [ ] `notifyAgentError()` - Error notifications
  - [ ] `notifyHighRiskAction()` - Critical approvals

### Integration
- [ ] Update orchestrator to use smart notifications
- [ ] Update approval handler for rich contexts
- [ ] Add notification preferences support

### Testing
- [ ] Unit tests for notification formatting
- [ ] Test priority levels (critical/high/medium/low)
- [ ] Test disable_notification flag for low priority
- [ ] Manual test: verify rich previews appear

### Validation
- [ ] Priority levels respected
- [ ] Context-rich previews included
- [ ] Actionable notifications have buttons
- [ ] Notification sounds work correctly

---

## Documentation & Polish (Day 6)

### Documentation
- [ ] Create `docs/phone-vibecoding-v2.md`
  - [ ] Setup instructions
  - [ ] Feature overview with examples
  - [ ] Voice command reference
  - [ ] Photo task examples
  - [ ] Troubleshooting guide

- [ ] Update `docs/phone-vibecoding-v1.md`
  - [ ] Mark as superseded by V2
  - [ ] Add migration guide

- [ ] Update `README.md`
  - [ ] Add V2 features section
  - [ ] Add screenshots/GIFs (optional)

- [ ] Update `CLAUDE.md`
  - [ ] Add V2 architecture section
  - [ ] Document new services
  - [ ] Update environment variables

### Environment Variables
- [ ] Update `.env.example` with V2 vars
- [ ] Update `.env.staging.example`
- [ ] Update `.env.prod.example`
- [ ] Document each variable

### Configuration
- [ ] Add V2 feature flags to config
- [ ] Document defaults
- [ ] Add validation for settings

### Testing Cleanup
- [ ] Run full test suite
- [ ] Fix any breaking tests
- [ ] Add missing test coverage
- [ ] Update test documentation

---

## Integration & E2E Testing (Day 6-7)

### End-to-End Scenarios
- [ ] **Voice Command Flow**
  - [ ] Send voice note → transcribe → execute → respond
  - [ ] Test approval via voice
  - [ ] Test commands via voice
  - [ ] Test queries via voice

- [ ] **Photo Task Flow**
  - [ ] Send photo → analyze → suggest tasks → execute
  - [ ] Test whiteboard diagrams
  - [ ] Test code screenshots
  - [ ] Test handwritten notes

- [ ] **Inline Actions Flow**
  - [ ] Receive approval request → click button → proceed
  - [ ] Test all button types
  - [ ] Test concurrent approvals
  - [ ] Test timeout handling

- [ ] **Smart Notifications Flow**
  - [ ] Different priority levels
  - [ ] Rich previews
  - [ ] Contextual buttons
  - [ ] Silent vs. sound notifications

### Performance Testing
- [ ] Voice transcription speed (target: < 3s)
- [ ] Button response time (target: < 1s)
- [ ] Vision analysis speed (target: < 5s)
- [ ] Approval notification delivery (target: < 500ms)
- [ ] Code preview generation (target: < 2s)

### Error Handling
- [ ] Whisper API failures
- [ ] Vision API failures
- [ ] Invalid voice commands
- [ ] Corrupted images
- [ ] Timeout scenarios
- [ ] Network failures

---

## Deployment Preparation

### Database
- [ ] Run migration on staging
- [ ] Verify migration on staging
- [ ] Backup production database
- [ ] Run migration on production

### Environment Setup
- [ ] Add OpenAI API key to staging
- [ ] Add OpenAI API key to production
- [ ] Configure V2 feature flags
- [ ] Test API connectivity

### Rollout Plan
- [ ] Deploy to staging first
- [ ] Test all V2 features on staging
- [ ] Enable features incrementally:
  1. Voice commands only
  2. + Inline keyboards
  3. + Vision analysis
  4. + Smart notifications (full V2)
- [ ] Monitor logs and errors
- [ ] Deploy to production

---

## Post-Deployment

### Monitoring
- [ ] Monitor voice command success rate
- [ ] Monitor vision analysis accuracy
- [ ] Monitor approval response times
- [ ] Monitor error rates
- [ ] Track API costs (Whisper + Vision)

### Analytics Queries
- [ ] Voice command stats view
- [ ] Vision task stats view
- [ ] Approval method distribution
- [ ] Response time analysis

### User Feedback
- [ ] Collect feedback on voice commands
- [ ] Collect feedback on photo tasks
- [ ] Track feature adoption rates
- [ ] Identify pain points

---

## Success Metrics

**Voice Commands:**
- [ ] 90%+ transcription accuracy on standard commands
- [ ] < 3s average transcription time
- [ ] 50%+ of approvals use voice (adoption goal)

**Inline Actions:**
- [ ] < 1s average button response time
- [ ] 80%+ of approvals use buttons vs. text commands
- [ ] Zero timeout errors on button clicks

**Code Previews:**
- [ ] 100% of approval requests include preview
- [ ] < 2s average preview generation
- [ ] Diffs accurately show changes

**Photo Tasks:**
- [ ] 80%+ classification accuracy
- [ ] < 5s average analysis time
- [ ] 30%+ of tasks initiated via photo (adoption goal)

**Smart Notifications:**
- [ ] 100% of notifications have priority set
- [ ] Context-rich previews in all notifications
- [ ] Actionable items have appropriate buttons

---

## Rollback Plan

If critical issues found:

1. **Disable V2 features via env vars:**
   ```env
   VOICE_COMMANDS_ENABLED=false
   VISION_ENABLED=false
   INLINE_KEYBOARDS_ENABLED=false
   SMART_NOTIFICATIONS_ENABLED=false
   ```

2. **Revert to V1 behavior**
   - Keep migration in place (backwards compatible)
   - V1 still works with V2 database

3. **Fix issues and re-enable incrementally**

---

## Backlog / Future Enhancements

Items not in V2 scope:

- [ ] Multi-language voice support
- [ ] Voice streaming (real-time transcription)
- [ ] Photo annotation collaboration
- [ ] AR code preview overlays
- [ ] Gesture controls (shake to pause)
- [ ] Smart photo context (reference previous photos)
- [ ] Voice command customization
- [ ] Offline voice processing

---

## Notes & Learnings

*(Add notes during implementation)*

### Challenges Encountered:
-

### Optimizations Made:
-

### Things to Improve:
-

### Cost Analysis:
- Whisper API: $___/month
- Vision API: $___/month
- Total V2 overhead: $___/month

---

**Last Updated:** [Date]
**Implementation Status:** [Not Started | In Progress | Complete]
**Next Task:** [What to work on next]
