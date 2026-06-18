# Task 18.5 Research Notes

## Local Jixia Findings

The current Jixia copilot is safe but immature as a chat surface:

- `apps/web/src/features/ai/AIConversationPanel.tsx:42` is a single local-state component for collapsed/open state, history drawer, context drawer, provider selection, prompt state, send state, and active conversation.
- `apps/web/src/features/ai/AIConversationPanel.tsx:145` sends through one synchronous `POST /ai/conversations/:conversationId/messages` call and maps local state to queued/running/succeeded/failed.
- `apps/web/src/features/ai/AIConversationPanel.tsx:277` collapsed state is governance copy, not a launchpad.
- `apps/web/src/features/ai/AIConversationPanel.tsx:376` context UX is a raw form for source type/document ID/block IDs/content.
- `apps/web/src/features/ai/AIConversationPanel.tsx:469` renders plain role-based message articles.
- `apps/web/src/features/ai/AIConversationPanel.tsx:491` shows queued/running as a synthetic placeholder message.
- `apps/web/src/features/ai/AIConversationPanel.tsx:502` composer is a form with provider select, prompt textarea, retry, and send.
- `packages/shared/src/ai.ts:134` messages are still mostly `{ id, role, content, createdAt, runId?, runStatus? }`.
- `packages/shared/src/ai.ts:143` run DTO is minimal and append-only response scoped.
- `packages/db/prisma/schema.prisma:286` stores selected context and messages as JSON in one `AIConversation` row.

## ResearchClaw Patterns

ResearchClaw is closer to a mature copilot UI than current Jixia, but it is not a perfect source/citation model. Transferable patterns:

- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:290`: animated right-side drawer over backdrop.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:313`: collapsible session sidebar.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:323`: backend/model mode selector near chat history.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:450`: selected source count under chat title.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:553`: context chips above composer.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx:577`: rounded composer, Enter-to-send, Shift+Enter newline, IME guard, send/stop swap.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx:189`: split/chat-only/pdf-only reader modes.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx:1065`: reader composer with quick action, attached-paper chips, agent picker, attach picker, send/stop.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx:33`: message dedupe by `msgId`.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx:67`: grouped tool calls.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx:232`: stream renderer with messages, spinner, permission card, bottom anchor.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/TextMessage.tsx:12`: dense Markdown/table/code rendering for chat.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/ToolCallCard.tsx:17`: compact status-rich tool cards.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/PermissionCard.tsx:24`: approval card with explicit allow/deny actions.

Use these patterns only where backed by Jixia contracts. Do not add Stop without cancellation or Apply without server-approved document mutation.

## Local Figures

- `doc/Figures/copilot1.png`: empty-state copilot launchpad with greeting, capability cards, slash/model hints, compact rounded composer, attachment/context/model controls, and visible network/source status.
- `doc/Figures/copilot2.png`: active document-grounded chat with source chip, rich structured answer, table-like content, compact bottom composer, model selector, and quiet panel chrome.

## Mature External Patterns

### Vercel AI SDK UI

- Docs: `https://ai-sdk.dev/v7/docs/ai-sdk-ui/chatbot`
- Docs: `https://ai-sdk.dev/v7/docs/ai-sdk-ui/stream-protocol`
- Docs: `https://ai-sdk.dev/v7/docs/reference/ai-sdk-core/ui-message`
- Key pattern: render `message.parts`, not raw `content`.
- `UIMessage` is source of truth for UI state and has `id`, `role`, `metadata`, and `parts`.
- Parts include text, tool parts, source-url, source-document, file parts, data parts, step start/finish, error, tool approval request/response, and tool output.
- GitHub examples: `vercel/ai/examples/ai-e2e-next/app/chat/persistence/[id]/chat.tsx` and resilient persistence examples use `useChat`, `messages`, `status`, `sendMessage`, and optional `stop` only when the transport supports it.

Jixia implication: define Jixia-owned safe message parts and source parts instead of copying Vercel runtime wholesale. Do not expose provider internals.

### assistant-ui

- Docs: `https://www.assistant-ui.com/docs/primitives/thread`
- Docs: `https://www.assistant-ui.com/docs/primitives/composer`
- Docs: `https://www.assistant-ui.com/docs/api-reference/primitives/thread`
- Docs: `https://www.assistant-ui.com/docs/api-reference/primitives/composer`
- Key pattern: `ThreadPrimitive.Root`, `ThreadPrimitive.Viewport`, `ThreadPrimitive.Messages`, and sticky `ThreadPrimitive.ViewportFooter` for composer.
- Composer primitives handle submit behavior, keyboard shortcuts, focus, attachment state, and streaming status.
- Suggestions can either send or insert/replace composer text.
- GitHub example: `assistant-ui/assistant-ui/packages/core/src/react/primitives/thread/ThreadMessages.tsx` renders messages through a children function; docs example uses sticky footer composer.

Jixia implication: split thread/composer/launchpad components and make the composer sticky inside the inspector scroll model.

### CopilotKit

- Docs: `https://docs.copilotkit.ai/reference/components/CopilotSidebar`
- Docs: `https://docs.showcase.copilotkit.ai/reference/v2/components/CopilotChat`
- GitHub: `CopilotKit/CopilotKit/packages/react-core/src/v2/components/chat/CopilotSidebar.tsx`
- GitHub: `CopilotKit/CopilotKit/packages/react-core/src/v2/components/chat/CopilotSidebarView.tsx`
- Key pattern: sidebar variant wraps base chat, has header/close/toggle, welcome screen layout, suggestions at top, input fixed at bottom, slot overrides for message/input/scroll/disclaimer/suggestions.
- CopilotKit action hooks can render custom action UI and require explicit user responses.

Jixia implication: right panel should be a real sidebar/chat surface with slots/sections, but actions that mutate app state must be absent or disabled until Jixia has server-backed approval contracts.

## Requirements To Carry Forward

- Structured messages are mandatory. A plain `content` string is not enough.
- Sources/citations/context must be first-class UI data, not prose guessed from model output.
- Tool/run/action cards must be explicit and safe. If Jixia does not have real tools yet, only render server-run steps and future-disabled approval shapes.
- The composer must be chat-native: sticky, compact, IME-safe Enter handling, quick prompt suggestions, context chips, provider/model affordance.
- History must be more stable than an absolute popup.
- Preserve Jixia’s privacy advantage: server-owned provider execution, owner-only private history, explicit context, no hidden corpus, no writeback, no raw provider payloads.

## Additional Market Research From Completed Background Task

The final copilot-docs research pass reinforced that Task 18.5 must remain contract-led. Mature products do not treat chat as a textarea plus log; they model runs, threads, sources, citations, artifacts, approvals, and actions as durable UI data.

### ChatGPT Canvas and File Uploads

- Docs: `https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it`
- Docs: `https://help.openai.com/en/articles/8982896-how-does-the-new-file-uploads-capability-work`
- Docs: `https://help.openai.com/en/articles/8555545-file-uploads-faq`
- Pattern: long-form writing/code output becomes a separate canvas/artifact-like work surface with direct edits, selected-section prompts, inline suggestions, version history, show-changes, export/share/download, and explicit file upload handling.
- Jixia implication: AI outputs that become work products should not remain plain assistant messages. They need server-owned artifact records, provenance, explicit save/apply actions, and visibility rules.

### Claude Citations and Artifacts

- Docs: `https://platform.claude.com/docs/en/build-with-claude/citations`
- Docs: `https://platform.claude.com/cookbook/misc-using-citations`
- Docs: `https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them`
- Pattern: citations are structured metadata tied to source documents and locator types, not just markdown links. Artifacts are standalone reusable panes with version switching, copy/download, publishing, and approval-aware actions.
- Jixia implication: source/citation records must be first-class DTOs with source kind, locator, quoted text, and permission gates. Generated reports/tables/figures/drafts need artifact lineage, not message-only storage.

### GitHub Copilot and VS Code Chat

- Docs: `https://code.visualstudio.com/docs/agents/overview`
- Docs: `https://code.visualstudio.com/docs/chat/copilot-chat`
- Docs: `https://code.visualstudio.com/docs/chat/copilot-chat-context`
- Docs: `https://code.visualstudio.com/docs/agents/planning`
- Docs: `https://code.visualstudio.com/docs/agents/approvals`
- Docs: `https://docs.github.com/copilot/using-github-copilot/asking-github-copilot-questions-in-your-ide`
- Pattern: chat surfaces share sessions; context is implicit, mentioned, attached, fetched, or tool-provided; Ask/Agent/Plan modes separate read-only discussion from execution; approvals, checkpoints, rollback, parallel sessions, compaction, and context-window visibility are explicit.
- Jixia implication: future write-capable AI must split ask/inspect/research/plan/act modes. Plan mode must be read-only until approved, and execution needs checkpoints plus rollback.

### Notion Agent, Research, and Plan Mode

- Docs: `https://www.notion.com/help/notion-agent`
- Docs: `https://www.notion.com/help/research-mode`
- Docs: `https://www.notion.com/help/review-and-approve-plans-before-notion-ai-runs`
- Pattern: AI inherits workspace/page permissions, defaults to current page or selection, supports `@` mentions, source picker, file upload, connected apps, chat history, sidebar/floating modes, long-running research, visible sources, copy/save-as-page, and approval-before-action plans.
- Jixia implication: every run must inherit actor permissions and expose which sources were selected, searched, used, skipped, or unavailable. Multi-object or destructive actions require explicit read-only plans and approvals.

### Lobe Chat and Continue

- Lobe repo: `https://github.com/lobehub/lobehub`
- Lobe source examples: `https://github.com/lobehub/lobehub/blob/1d7fc18cdbc4ca6227ec73517db59d435899e32b/src/features/Conversation/ChatInput/index.tsx`
- Lobe source examples: `https://github.com/lobehub/lobehub/blob/1d7fc18cdbc4ca6227ec73517db59d435899e32b/src/features/ChatInput/Desktop/index.tsx`
- Continue docs: `https://docs.continue.dev/cli/tui-mode`
- Continue docs: `https://docs.continue.dev/cli/headless-mode`
- Continue docs: `https://docs.continue.dev/cli/tool-permissions`
- Continue source examples: `https://github.com/continuedev/continue/blob/18acf6fc26b098c1e11b3a099d4a42643d2c0794/extensions/cli/src/ui/hooks/useChat.ts`
- Continue source examples: `https://github.com/continuedev/continue/blob/18acf6fc26b098c1e11b3a099d4a42643d2c0794/extensions/cli/src/services/ChatHistoryService.ts`
- Continue source examples: `https://github.com/continuedev/continue/blob/18acf6fc26b098c1e11b3a099d4a42643d2c0794/extensions/cli/src/ui/hooks/useChat.compaction.ts`
- Pattern: production chat apps separate conversation shell, desktop/mobile composers, stores/services, hydration guards, action bars, model/tool/provider affordances, session history, compaction, queued messages, and tool permission managers.
- Jixia implication: do not keep thread/run state only in React. Server-owned thread/run records should support resume, queued follow-ups, compaction summaries, and safe capability loading before send.

### Data Structures To Encode Before UI Polish

- `AiRun`: durable server-owned run with mode, status, actor, scope, model/provider, selected sources, prompt snapshot, tool calls, approvals, artifacts, citations, token/cost data, errors, cancellation, and audit metadata.
- `AiThread`: object-scoped conversation with thread ID, anchor object, message metadata, compaction summaries, branch/fork lineage, archived state, and resume-stream cursor.
- `AiSourceRef`: explicit source selection/retrieval outcome for documents, blocks, attachments, literature assets, uploads, connectors, and web URLs, including version/checksum, extraction status, permission snapshot, and used/skipped/unavailable status.
- `AiCitation`: claim-linked citation span with source ID/kind, locator type, page/block/character range, selector, quoted text, confidence, and visibility gate.
- `AiArtifact`: durable generated output such as report, canvas, draft section, table, diagram, or generated file, with versions, export formats, permissions, provenance, restore/fork support.
- `AiSuggestion`: document-edit proposal anchored to block or selection ranges. Applying it must be explicit user action through normal draft/revision/audit paths.
- `AiPlan`: read-only plan object for multi-step or write-capable work with goal, assumptions, clarifying questions, affected objects, proposed steps, preview/diff, risks, required approvals, and approved plan version.

### Cross-Product Rules For Jixia

- Context must be visible and controllable: current object/selection can be implicit, but extra files, URLs, pages, literature assets, or connectors must be explicit chips or picker choices.
- Artifacts are not messages: canvases, reports, generated pages, diffs, charts, and tool UIs need durable IDs, versions, exports, restore points, and provenance.
- Citations are structured: source locators and quoted evidence must be data so Jixia can verify, highlight, dispute, and filter by permission.
- Runs are long-lived: research/agent work needs progress states, cancellation only when real, resume streams, queued follow-ups, notifications, and history.
- Approvals are granular: writes, external URLs, connector access, code execution, network egress, and long jobs need different approval scopes and policies.
- Execution is sandboxed: if Jixia adds code/data execution, it must be server-side with no secrets, bounded filesystem, network off by default, allowlisted egress, logs, and explicit approvals.
- Admin policy is required before broad agent behavior: workspace controls should govern web search, connectors, models/providers, execution, sharing, retention, quotas, audit export, and high-risk approval defaults.
