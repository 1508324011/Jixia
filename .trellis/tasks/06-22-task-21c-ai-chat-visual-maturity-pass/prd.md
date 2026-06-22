# Task 21c AI Chat Visual Maturity Pass

## Goal

Turn Jixia's AI chat surfaces from a merely functional chat refactor into a visually mature product experience comparable in hierarchy and restraint to ResearchClaw and mature open-source AI chat products.

Task21b made the surfaces more chat-like, but human manual review after real local provider configuration and conversation still judged the result too ugly. Task21c must therefore attack the root cause: visible chrome, noisy status metadata, boxed control-panel composition, and weak conversational hierarchy.

## Requirements

1. Remove default-screen visual noise before adding decoration.
   - Reduce hard borders, status bars, dense meta rows, model bars, and message headers that compete with actual conversation content.
   - Keep state accessible, but move it into quiet chips, details, drawers, hover/focus subrows, or secondary rows.

2. Make the standalone AI workspace feel like a mature chat product.
   - Use a restrained three-zone shell: history/sidebar, centered transcript, sticky rounded composer.
   - Keep transcript width readable on desktop and avoid full-width answer sprawl.
   - Group history/actions with product-grade hierarchy instead of admin-table visual language.

3. Make the document copilot side panel a compact version of the same chat language.
   - Inspector-width layout must prioritize transcript and composer.
   - Context/provider/document metadata should be visible but subordinate.
   - Preserve no-writeback semantics: AI remains advisory/copyable and never mutates the document automatically.

4. Improve message rendering hierarchy.
   - User messages should be compact right-aligned bubbles.
   - Assistant messages should render as open prose with strong markdown/code/table readability.
   - Tool/run/source cards should not dominate the answer.
   - Copy/retry/cancel/error/cancelled states must remain usable but quieter.

5. Improve composer maturity.
   - Composer should read as one rounded control surface, not a configuration form.
   - Autosizing input, keyboard submit, send/stop, disabled reasons, provider/model visibility, and compact side-panel behavior must keep working.

6. Reuse design ideas, not dependencies.
   - Translate ResearchClaw palette/spacing/scroll/markdown/composer ideas into existing React/CSS.
   - Use mature OSS patterns from LobeChat, Open WebUI, Dify, AnythingLLM, LibreChat, and Chatbot UI as design references.
   - Do not add Tailwind, Framer Motion, Lucide, or rich editor stacks unless a dependency decision is explicitly justified.

## Acceptance Criteria

- [ ] Standalone AI first impression is a mature chat workspace, not a settings/control panel.
- [ ] Document copilot first impression is a mature chat side panel, not a metadata grid.
- [ ] User and assistant messages have clear, mature hierarchy across normal, long, code, table, source, streaming, error, copied, cancelled, retry, and missing-provider states.
- [ ] Composer is visually quiet, rounded, anchored, and usable in both standalone and side-panel layouts.
- [ ] Provider/model/context/safety state remains discoverable and accessible without dominating the default screen.
- [ ] Shared CSS/components reduce visual divergence between standalone chat and document copilot.
- [ ] Existing AI chat, document copilot, and document editor tests pass.
- [ ] Manual review records real visual observations for both surfaces after representative conversation flows.

## Non-goals

- No backend/API/DTO/provider-key ownership changes.
- No document writeback or auto-apply behavior.
- No broad document editor redesign outside AI chat/coplanar surfaces.
- No dependency churn for aesthetic imitation.
- No PR creation unless a later Trellis action explicitly requests it.

## Technical Notes

Primary files are under `apps/web/src/features/ai/chat/` plus `apps/web/src/features/documents/DocumentCopilotPanel.tsx`. Treat `apps/web/src/features/ai/chat/chat.css` as the shared visual system for the chat surfaces. Keep any `workbench.css` changes minimal and only for host layout integration.
