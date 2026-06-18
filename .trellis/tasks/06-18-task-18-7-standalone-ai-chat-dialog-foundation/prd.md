# Task 18.7 Standalone AI Chat Dialog Foundation

## Goal
Build a real standalone AI chat dialog foundation for Jixia before reconnecting it to document-copilot workflows.

Task 18.6 failed at the product/data-model level: it kept treating AI as a document inspector with context/provider/safety controls, then tried to style that as a chat. Task 18.7 must reverse that. The primary object is a chat thread, not the current document.

## Source of Truth
- `doc/MVP_rule.md`
- `.trellis/spec/frontend/index.md`
- `.trellis/spec/guides/pre-implementation.md`
- `.trellis/spec/guides/cross-layer.md`
- `.trellis/spec/guides/code-reuse.md`
- Prior failure audit from Task 18.6 manual review
- `doc/Figures/copilot1.png`
- `doc/Figures/copilot2.png`
- ResearchClaw frontend chat patterns under `/home/zhurui/github_project/ResearchClaw`

## Problem Statement
Current Jixia AI UI is not a mature AI dialog. It is a document-side control console:

- The AI surface is mounted inside the document inspector rather than a first-class chat/dialog route or shell.
- The visible model is `Document + Context + Provider + Safety Labels`, not `Thread + Message Stream + Composer + Runtime State`.
- The composer is a form with title, provider selector, quick actions, labels, pills, and status text before the actual prompt.
- Context/source controls are visually co-equal with the conversation.
- Markdown, message rendering, auto-scroll, history, and composer behavior are hand-rolled instead of using mature chat primitives.
- Tests verify boundary safety but not whether the first impression is “this is a useful AI chat window”.

This is bad taste. The data model is wrong, so the UI keeps growing special cases.

## In Scope

### 1. Standalone Chat Shell
Create a reusable AI chat dialog/shell that can stand on its own without a current document.

Expected shape:
- `AIChatDialog` or equivalent entry component
- optional `ThreadSidebar` / history region
- `ThreadViewport` as the dominant center surface
- `MessageStream` with stable message rendering
- sticky `ChatComposer` at the bottom of the viewport
- empty state with greeting, capability cards, and input affordances

### 2. Document Decoupling
The default Task 18.7 chat must not automatically attach the current Jixia document.

Document context may appear later only as an explicit optional attachment/chip pattern, for example:
- `Attach current document`
- `@current-doc`
- compact source chips
- collapsed source drawer

No persistent source rail should dominate the first version of the standalone chat dialog.

### 3. Mature Composer
Replace the form-like composer model with a chat-native composer:
- autosizing input
- Enter to send, Shift+Enter for newline
- clear disabled/loading state
- compact controls for future attachments or commands
- command hints such as `/summarize` and `@source` only as affordances, not as stacked controls
- no large governance/status-copy wall around the input

### 4. Mature Message Rendering
Implement or adopt a proper message rendering layer:
- role-aware user/assistant/system/error rendering
- Markdown with GFM support
- tables, links, lists, code blocks, blockquotes
- copy behavior where appropriate
- source/tool/run display slots that do not overwhelm normal text chat

### 5. Reuse Mature Patterns
Evaluate reuse before hand-rolling.

Preferred order:
1. Evaluate `@assistant-ui/react` for Thread/Message/Composer/ThreadList primitives.
2. If too disruptive, implement Jixia-native primitives following assistant-ui anatomy and ResearchClaw frontend patterns.
3. Add focused dependencies only when justified, such as `react-markdown`, `remark-gfm`, `remark-breaks`, syntax highlighting, and autosize textarea support.

ResearchClaw patterns may be adapted as product/interaction reference, but do not copy its Electron/backend transport.

### 6. Server-First Boundary Preservation
Existing Jixia security boundaries remain non-negotiable:
- no browser provider calls
- no browser provider-key handling
- no local/session storage of prompts or responses
- no browser-side authorization logic
- no document writeback/apply/insert/rewrite/automerge controls
- no fake Stop/cancel/streaming controls without real server contract and tests

Existing `/ai/conversations` transport can be reused for a non-streaming first version if it keeps the standalone chat usable.

## Out of Scope
- Automatic current-document context attachment
- Document editing/writeback
- Apply/insert/rewrite/automerge actions
- Fake streaming/cancel controls
- Replacing Jixia backend auth/provider execution boundaries
- Copying ResearchClaw Electron IPC, local CLI spawning, cwd/path prompt injection, or local provider runtime
- Forking a full external chat application wholesale
- PR creation or git commit

## Functional Requirements
- A user can open a first-class AI chat dialog/shell without being inside a document-copilot mental model.
- The empty state looks like an AI chat home, not a document governance panel.
- The active state is dominated by message stream plus sticky composer.
- The composer behaves like modern AI chat input, not a settings form.
- Thread history is available without covering the conversation with control chrome.
- Message rendering supports rich Markdown/GFM enough for real AI answers.
- Existing server-first AI conversation data remains compatible unless a shared/API extension is explicitly justified and tested.
- Source/tool/run concepts are slots or compact chips/cards, not the main UI skeleton.
- The implementation is componentized enough that future document copilot integration can reuse the chat shell.

## Acceptance Criteria
- [ ] There is a reusable chat/dialog foundation separate from the old document-inspector control-console shape.
- [ ] The default chat does not automatically include current document context.
- [ ] The first empty view has greeting/capability cards/input affordances and does not lead with provider/context/safety administration.
- [ ] The active view has a durable thread viewport and sticky composer as the dominant anatomy.
- [ ] The composer supports chat-native keyboard behavior and compact controls.
- [ ] Markdown/GFM rendering is materially better than the old handcrafted renderer.
- [ ] No primary UI labels like `Thread viewport`, `Copilot surface anatomy`, or `Suggestion-only` are used as product-facing proof of architecture.
- [ ] No forbidden controls are introduced: Stop/cancel without endpoint, Apply/insert/rewrite/automerge, browser provider calls, browser key handling, local/session prompt storage, or browser auth shortcuts.
- [ ] Focused tests verify standalone chat behavior and absence of automatic document attachment.
- [ ] Existing Task 18.5/18.6 API and DTO behavior remains compatible unless deliberately extended with tests.

## Technical Notes
- This task is about fixing the data model first. The right model is `Thread + MessageStream + Composer + RuntimeState`.
- If `assistant-ui` fits, use it as a primitive layer rather than inventing another half-chat.
- If dependency risk is high, write small Jixia-native primitives, but copy the mature anatomy: viewport, messages, sticky footer composer, history/sidebar, compact source/tool slots.
- Keep document-copilot integration as a later adapter over this chat shell.
